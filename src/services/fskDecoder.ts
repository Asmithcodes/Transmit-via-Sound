/**
 * FSK Decoder — Receiver Audio Engine
 *
 * Uses the Web Audio API's AnalyserNode to perform real-time FFT on microphone
 * input, detects which FSK frequency is currently dominant, and accumulates
 * symbols into packets.
 *
 * Flow:
 *   Microphone → AnalyserNode (FFT) → dominant frequency detection
 *   → trit identification → packet byte accumulation → CRC32 validation
 *   → payload reconstruction → UTF-8 text
 *
 * Timing strategy:
 *   We poll the analyser every RX_POLL_INTERVAL_MS ms.  Each symbol lasts
 *   SYMBOL_DURATION_S seconds.  We count how many polls fall within one
 *   symbol window and take the majority-vote frequency to resist brief
 *   noise spikes.
 */

import {
    FSK_FREQUENCIES,
    SYMBOL_DURATION_S,
    HANDSHAKE_FREQ_A,
    HANDSHAKE_FREQ_B,
    HANDSHAKE_TONE_DURATION_S,
    HANDSHAKE_SILENCE_S,
    RX_DETECTION_THRESHOLD,
    FFT_SIZE,
    RX_POLL_INTERVAL_MS,
    tritsToBytes,
    bytesToText,
    parsePacket,
    MAX_PAYLOAD_BYTES,
    PACKET_HEADER_BYTES,
    PACKET_CRC_BYTES,
} from './protocol';

export type RxStatus =
    | { type: 'idle' }
    | { type: 'listening' }             // Microphone open, waiting for handshake
    | { type: 'syncing' }               // Handshake A received, waiting for B
    | { type: 'receiving'; chunk: number; totalChunks: number }
    | { type: 'complete'; text: string }
    | { type: 'error'; message: string };

export type RxStatusCallback = (status: RxStatus) => void;

/** Returns the index (0..7) of the FSK frequency that dominates in the FFT data,
 *  or -1 if no frequency exceeds the detection threshold. */
function detectFSKSymbol(fftData: Uint8Array, sampleRate: number): number {
    const binSize = sampleRate / FFT_SIZE; // Hz per FFT bin

    let bestIndex = -1;
    let bestMag = RX_DETECTION_THRESHOLD; // Anything below threshold is ignored

    for (let fi = 0; fi < FSK_FREQUENCIES.length; fi++) {
        const targetBin = Math.round(FSK_FREQUENCIES[fi] / binSize);
        // Average across ±1 bin to handle minor pitch drift.
        const mag = (
            (fftData[targetBin - 1] ?? 0) +
            (fftData[targetBin] ?? 0) +
            (fftData[targetBin + 1] ?? 0)
        ) / 3;

        if (mag > bestMag) {
            bestMag = mag;
            bestIndex = fi;
        }
    }
    return bestIndex;
}

/**
 * Checks whether a handshake tone is the **dominant peak** at the target
 * frequency, relative to the local noise floor.
 *
 * A simple threshold (mag > 60) fails in real rooms because broadband noise
 * (voices, fans, music) raises all FFT bins together — the ratio stays the
 * same, but the absolute level exceeds 60 everywhere.
 *
 * Instead we:
 *  1. Measure the target bin's magnitude.
 *  2. Compute a local "noise floor" from bins ±30 around the target
 *     (excluding a ±4-bin guard zone so the tone itself isn't averaged in).
 *  3. Require the target to be ≥ SNR_RATIO × noise floor AND above a
 *     minimum absolute floor (so silence never falsely qualifies).
 */
const HANDSHAKE_SNR_RATIO = 2.8;   // Target must be 2.8× louder than local noise
const HANDSHAKE_NOISE_WINDOW = 30; // Bins on each side sampled for noise floor
const HANDSHAKE_GUARD_BINS = 4;    // Bins around target excluded from noise floor

function detectHandshakeTone(
    fftData: Uint8Array,
    sampleRate: number,
    handshakeFreq: number
): boolean {
    const binSize = sampleRate / FFT_SIZE;
    const bin = Math.round(handshakeFreq / binSize);

    // Target magnitude (average ±1 bin for pitch drift tolerance).
    const targetMag = (
        (fftData[bin - 1] ?? 0) +
        (fftData[bin] ?? 0) +
        (fftData[bin + 1] ?? 0)
    ) / 3;

    // Absolute floor: don't trigger if the room is nearly silent (avoids
    // random 0-magnitude bins dividing to huge SNR).
    if (targetMag < RX_DETECTION_THRESHOLD) return false;

    // Local noise floor: sample surrounding bins, skip the guard zone.
    let noiseSum = 0;
    let noiseSamples = 0;
    for (let i = bin - HANDSHAKE_NOISE_WINDOW; i <= bin + HANDSHAKE_NOISE_WINDOW; i++) {
        if (i < 0 || i >= fftData.length) continue;
        if (Math.abs(i - bin) <= HANDSHAKE_GUARD_BINS) continue; // guard zone
        noiseSum += fftData[i];
        noiseSamples++;
    }
    const noiseFloor = noiseSamples > 0 ? noiseSum / noiseSamples : 1;

    // Only accept if the tone is clearly above the surrounding noise floor.
    return targetMag > noiseFloor * HANDSHAKE_SNR_RATIO;
}

/**
 * Starts the receiver.  Requests microphone access, opens an AnalyserNode,
 * and continuously processes incoming audio.
 *
 * @param onStatus  Callback delivering state updates to the UI.
 * @returns         A stop function that cleanly tears down audio resources.
 */
export async function startReceiver(onStatus: RxStatusCallback): Promise<() => void> {
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    const stop = () => {
        if (stopped) return; // Guard: prevent double-stop
        stopped = true;
        if (pollTimer !== null) { clearInterval(pollTimer); pollTimer = null; }
        stream?.getTracks().forEach(t => t.stop());
        // Only close if not already closed — prevents InvalidStateError
        if (ctx && ctx.state !== 'closed') ctx.close();
        ctx = null;
    };

    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        ctx = new AudioContext({ sampleRate: 44100 });

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = 0.1; // Low smoothing for fast symbol detection
        source.connect(analyser);

        const fftData = new Uint8Array(analyser.frequencyBinCount);
        const sampleRate = ctx.sampleRate;

        // --- State machine ---
        // WAITING_A  → tone A confirmed
        // WAITING_B  → tone B first detected
        // LOCKING    → waiting for tone B to DISAPPEAR (so we know when data actually starts)
        // ALIGNING   → silence gap: a setTimeout will flip us to COLLECTING at the right moment
        // COLLECTING → voting on FSK symbols
        // DONE       → all packets received
        type Phase = 'WAITING_A' | 'WAITING_B' | 'LOCKING' | 'ALIGNING' | 'COLLECTING' | 'DONE';
        let phase: Phase = 'WAITING_A';

        // Symbol accumulation
        const pollsPerSymbol = Math.round((SYMBOL_DURATION_S * 1000) / RX_POLL_INTERVAL_MS);
        const voteBucket: number[] = []; // accumulated trit votes within one symbol window
        const allTrits: number[] = [];   // ordered trits for the full transmission

        // Packet reassembly
        const receivedPackets = new Map<number, Uint8Array>(); // chunkIndex → payload
        let totalExpectedChunks = -1;

        // Handshake phase gating variables.
        let handshakeADetectedAt = 0;
        const MIN_HANDSHAKE_HOLD_MS = 80; // Require tone A for ≥2 polls before accepting
        let handshakeAHoldStart = 0;
        let lockingAbsentRuns = 0;        // Consecutive polls where tone B is absent (LOCKING phase)

        onStatus({ type: 'listening' });

        // --- Main polling loop ---
        pollTimer = setInterval(() => {
            if (stopped) return;
            analyser.getByteFrequencyData(fftData);

            if (phase === 'WAITING_A') {
                if (detectHandshakeTone(fftData, sampleRate, HANDSHAKE_FREQ_A)) {
                    if (handshakeAHoldStart === 0) {
                        handshakeAHoldStart = Date.now();
                    } else if (Date.now() - handshakeAHoldStart >= MIN_HANDSHAKE_HOLD_MS) {
                        phase = 'WAITING_B';
                        handshakeADetectedAt = Date.now();
                        handshakeAHoldStart = 0;
                        console.debug('[RX] Handshake A confirmed (900 Hz). Waiting for B (1050 Hz)...');
                        onStatus({ type: 'syncing' });
                    }
                } else {
                    handshakeAHoldStart = 0;
                }

            } else if (phase === 'WAITING_B') {
                // Window: generous enough to span the full A+silence+B duration.
                const elapsed = Date.now() - handshakeADetectedAt;
                const windowMs = (HANDSHAKE_TONE_DURATION_S + HANDSHAKE_SILENCE_S + HANDSHAKE_TONE_DURATION_S) * 1000 + 400;

                if (detectHandshakeTone(fftData, sampleRate, HANDSHAKE_FREQ_B)) {
                    // Tone B is now audible. Move to LOCKING so we can detect
                    // when it ENDS — that's when we know data is about to start.
                    phase = 'LOCKING';
                    lockingAbsentRuns = 0;
                    console.debug('[RX] Handshake B detected (1050 Hz). Locking on tone end...');
                } else if (elapsed > windowMs) {
                    console.debug(`[RX] Handshake B timeout after ${elapsed}ms. Resetting.`);
                    phase = 'WAITING_A';
                    onStatus({ type: 'listening' });
                }

            } else if (phase === 'LOCKING') {
                // Wait for tone B to disappear, then arm a timed delay equal to
                // the post-handshake silence gap.  When that fires, collection
                // starts phase-locked to the first data symbol boundary.
                const elapsed = Date.now() - handshakeADetectedAt;

                if (!detectHandshakeTone(fftData, sampleRate, HANDSHAKE_FREQ_B)) {
                    lockingAbsentRuns++;
                    if (lockingAbsentRuns >= 2) {
                        // Tone B has definitely ended.  Schedule COLLECTING to
                        // start after the encoder's silence gap.
                        phase = 'ALIGNING';
                        console.debug(`[RX] Tone B ended. Waiting ${Math.round(HANDSHAKE_SILENCE_S * 1000)}ms silence gap then collecting...`);
                        setTimeout(() => {
                            if (stopped || phase !== 'ALIGNING') return;
                            voteBucket.length = 0;
                            allTrits.length = 0;
                            phase = 'COLLECTING';
                            console.debug('[RX] Phase-locked! Data collection started.');
                            onStatus({ type: 'receiving', chunk: 0, totalChunks: 0 });
                        }, HANDSHAKE_SILENCE_S * 1000);
                    }
                } else {
                    lockingAbsentRuns = 0; // Still hearing B — keep waiting
                }

                // Global safety: if something went wrong, reset after 5 s
                if (elapsed > 5000) {
                    phase = 'WAITING_A';
                    onStatus({ type: 'listening' });
                }

            } else if (phase === 'ALIGNING') {
                // Waiting for the setTimeout to fire — do nothing.

            } else if (phase === 'COLLECTING') {
                const trit = detectFSKSymbol(fftData, sampleRate);
                voteBucket.push(trit); // -1 = silence/noise counts as no signal

                // Once we have enough votes for one symbol window, commit.
                if (voteBucket.length >= pollsPerSymbol) {
                    // Majority vote among non-negative results.
                    const valid = voteBucket.filter(t => t >= 0);
                    if (valid.length > 0) {
                        const freq: Record<number, number> = {};
                        for (const v of valid) freq[v] = (freq[v] ?? 0) + 1;
                        const winner = Number(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);
                        allTrits.push(winner);
                        console.debug(`[RX] Symbol committed: trit=${winner} (${valid.length}/${voteBucket.length} valid votes). Total trits: ${allTrits.length}`);
                    } else {
                        console.debug(`[RX] Symbol window: no valid votes (all silence/noise). Total trits: ${allTrits.length}`);
                    }
                    voteBucket.length = 0;

                    // Minimum trits needed for the smallest possible packet
                    // (header + 1 payload byte + CRC).
                    const minTritsForMinPacket = Math.ceil(
                        ((PACKET_HEADER_BYTES + 1 + PACKET_CRC_BYTES) * 8) / 3
                    );
                    // Maximum trits for a full-size packet.
                    const maxTritsPerPacket = Math.ceil(
                        ((PACKET_HEADER_BYTES + MAX_PAYLOAD_BYTES + PACKET_CRC_BYTES) * 8) / 3
                    );

                    if (allTrits.length >= minTritsForMinPacket) {
                        // Sliding-window scan: try parsing from offset 0; on CRC failure,
                        // advance by 1 trit and retry until we find a valid packet or
                        // exhaust the reasonable search window.
                        //
                        // This handles timing drift and minor bit errors by discarding
                        // corrupted leading trits rather than deadlocking.
                        let foundPacket = false;

                        // Only scan up to maxTritsPerPacket ahead from the start
                        // to avoid re-scanning a packet we already consumed.
                        const scanLimit = Math.min(
                            allTrits.length - minTritsForMinPacket + 1,
                            maxTritsPerPacket
                        );

                        for (let offset = 0; offset < scanLimit; offset++) {
                            const slicedTrits = allTrits.slice(offset);
                            const byteCount = Math.floor((slicedTrits.length * 3) / 8);
                            if (byteCount < PACKET_HEADER_BYTES + 1 + PACKET_CRC_BYTES) break;

                            const raw = tritsToBytes(slicedTrits, byteCount);
                            const packet = parsePacket(raw);

                            if (packet && packet.crcValid) {
                                console.debug(`[RX] Valid packet found at trit offset ${offset}: chunk ${packet.chunkIndex + 1}/${packet.totalChunks}, payload=${packet.payload.length}B`);

                                if (!receivedPackets.has(packet.chunkIndex)) {
                                    totalExpectedChunks = packet.totalChunks;
                                    receivedPackets.set(packet.chunkIndex, packet.payload);

                                    onStatus({
                                        type: 'receiving',
                                        chunk: receivedPackets.size,
                                        totalChunks: totalExpectedChunks,
                                    });
                                }

                                // Discard all trits up to and including this packet.
                                const tritsConsumed = offset + Math.ceil(
                                    ((PACKET_HEADER_BYTES + packet.payload.length + PACKET_CRC_BYTES) * 8) / 3
                                );
                                allTrits.splice(0, tritsConsumed);
                                foundPacket = true;

                                // Check if we have all chunks.
                                if (
                                    totalExpectedChunks > 0 &&
                                    receivedPackets.size >= totalExpectedChunks
                                ) {
                                    phase = 'DONE';
                                    const reconstructed = reassemble(receivedPackets, totalExpectedChunks);
                                    const text = bytesToText(reconstructed);
                                    onStatus({ type: 'complete', text });
                                    stop();
                                }
                                break;
                            }
                        }

                        if (!foundPacket && allTrits.length > maxTritsPerPacket * 2) {
                            // We've accumulated way more trits than one packet needs
                            // and still no valid parse — drop the oldest trit to avoid
                            // an ever-growing buffer (graceful degradation).
                            console.debug(`[RX] Buffer too large (${allTrits.length} trits), discarding 1 leading trit.`);
                            allTrits.shift();
                        }
                    }
                }
            }
        }, RX_POLL_INTERVAL_MS);

    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onStatus({
            type: 'error',
            message: message.includes('Permission') || message.includes('NotAllowed')
                ? 'Microphone permission denied. Please allow microphone access and try again.'
                : `Audio engine error: ${message}`,
        });
        stop();
    }

    return stop;
}

/**
 * Reassembles chunk payloads into the original data buffer in order.
 */
function reassemble(packets: Map<number, Uint8Array>, totalChunks: number): Uint8Array {
    const parts: Uint8Array[] = [];
    for (let i = 0; i < totalChunks; i++) {
        const payload = packets.get(i);
        if (payload) parts.push(payload);
    }
    const total = parts.reduce((acc, p) => acc + p.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.length;
    }
    return result;
}
