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
    SYNC_PREAMBLE,
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
        // WAITING_A  → handshake tone A detected (hold-confirmed)
        // WAITING_B  → handshake tone B first detected
        // SYNCING    → collecting trits and scanning for preamble pattern [7,0,7,0,7,0,7,0]
        // COLLECTING → preamble found; all subsequent trits are data; packet assembly
        // DONE       → all packets received
        type Phase = 'WAITING_A' | 'WAITING_B' | 'SYNCING' | 'COLLECTING' | 'DONE';
        let phase: Phase = 'WAITING_A';

        // Symbol accumulation (shared by SYNCING and COLLECTING)
        const allTrits: number[] = [];

        // Packet reassembly
        const receivedPackets = new Map<number, Uint8Array>();
        let totalExpectedChunks = -1;

        // Handshake gating
        let handshakeADetectedAt = 0;
        const MIN_HANDSHAKE_HOLD_MS = 80;
        let handshakeAHoldStart = 0;

        // --- Time-domain Preamble Correlator ---
        interface PollData {
            time: number;
            trit: number;
        }
        const syncPolls: PollData[] = [];
        let syncStartedAt = 0;
        const SYNC_TIMEOUT_MS = 15000;

        // --- Time-based Data Collection ---
        let dataStartTime = 0;
        let currentSymbolIndex = 0;
        const voteBucket: number[] = [];

        /**
         * Sweeps the acoustic timestamps in 10ms steps across the raw poll buffer
         * to find the exact start time (t0) where the 8 preamble symbols align.
         */
        function findPreambleStartTime(): number {
            if (syncPolls.length === 0) return -1;

            const pLen = SYNC_PREAMBLE.length;
            const pDuration = pLen * SYMBOL_DURATION_S;
            const firstTime = syncPolls[0].time;
            const lastTime = syncPolls[syncPolls.length - 1].time;

            // Wait until we have enough duration to contain the preamble
            if (lastTime - firstTime < pDuration) return -1;

            let bestT0 = -1;
            let bestScore = -1;

            // Sweep t0 across all possible start times in the buffer
            for (let t0 = firstTime; t0 <= lastTime - pDuration; t0 += 0.01) {
                let allMatched = true;
                let score = 0;

                for (let sym = 0; sym < pLen; sym++) {
                    const symStart = t0 + sym * SYMBOL_DURATION_S;
                    const symEnd = symStart + SYMBOL_DURATION_S;

                    let matchCount = 0;
                    let validCount = 0;
                    const freq: Record<number, number> = {};

                    for (const p of syncPolls) {
                        if (p.time >= symStart && p.time < symEnd && p.trit >= 0) {
                            freq[p.trit] = (freq[p.trit] ?? 0) + 1;
                            validCount++;
                            if (p.trit === SYNC_PREAMBLE[sym]) matchCount++;
                        }
                    }

                    if (validCount === 0) {
                        allMatched = false;
                        break;
                    }

                    const majorityTrit = Number(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);

                    if (majorityTrit !== SYNC_PREAMBLE[sym]) {
                        allMatched = false;
                        break;
                    }

                    // Score based on how clean the votes were
                    score += (matchCount / validCount);
                }

                if (allMatched && score > bestScore) {
                    bestScore = score;
                    bestT0 = t0;
                }
            }
            return bestT0;
        }

        /** Majority-vote a symbol from the current vote bucket (used in COLLECTING). */
        function commitSymbol(): number {
            const valid = voteBucket.filter(t => t >= 0);
            voteBucket.length = 0;
            if (valid.length === 0) return -1;
            const freq: Record<number, number> = {};
            for (const v of valid) freq[v] = (freq[v] ?? 0) + 1;
            return Number(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);
        }

        function checkAndParsePackets() {
            const minTritsForMinPacket = Math.ceil(((PACKET_HEADER_BYTES + 1 + PACKET_CRC_BYTES) * 8) / 3);
            const maxTritsPerPacket = Math.ceil(((PACKET_HEADER_BYTES + MAX_PAYLOAD_BYTES + PACKET_CRC_BYTES) * 8) / 3);

            if (allTrits.length >= minTritsForMinPacket) {
                let foundPacket = false;
                const scanLimit = Math.min(allTrits.length - minTritsForMinPacket + 1, maxTritsPerPacket);

                for (let offset = 0; offset < scanLimit; offset++) {
                    const slicedTrits = allTrits.slice(offset);
                    const byteCount = Math.floor((slicedTrits.length * 3) / 8);
                    if (byteCount < PACKET_HEADER_BYTES + 1 + PACKET_CRC_BYTES) break;

                    const raw = tritsToBytes(slicedTrits, byteCount);
                    const packet = parsePacket(raw);

                    if (packet && packet.crcValid) {
                        console.log(`[RX] ✅ Valid packet at offset ${offset}: chunk ${packet.chunkIndex + 1}/${packet.totalChunks}, ${packet.payload.length}B`);

                        if (!receivedPackets.has(packet.chunkIndex)) {
                            totalExpectedChunks = packet.totalChunks;
                            receivedPackets.set(packet.chunkIndex, packet.payload);
                            onStatus({
                                type: 'receiving',
                                chunk: receivedPackets.size,
                                totalChunks: totalExpectedChunks,
                            });
                        }

                        const tritsConsumed = offset + Math.ceil(
                            ((PACKET_HEADER_BYTES + packet.payload.length + PACKET_CRC_BYTES) * 8) / 3
                        );
                        allTrits.splice(0, tritsConsumed);
                        foundPacket = true;

                        if (totalExpectedChunks > 0 && receivedPackets.size >= totalExpectedChunks) {
                            phase = 'DONE';
                            const reconstructed = reassemble(receivedPackets, totalExpectedChunks);
                            const text = bytesToText(reconstructed);
                            console.log(`[RX] ✅ Complete! Decoded: "${text}"`);
                            onStatus({ type: 'complete', text });
                            stop();
                        }
                        break;
                    }
                }

                if (!foundPacket && allTrits.length > maxTritsPerPacket * 2) {
                    console.log(`[RX] Buffer overflow (${allTrits.length} trits), dropping 1.`);
                    allTrits.shift();
                }
            }
        }

        onStatus({ type: 'listening' });

        // --- Main polling loop ---
        pollTimer = setInterval(() => {
            if (stopped || !ctx) return;
            analyser.getByteFrequencyData(fftData);
            const now = ctx.currentTime;

            if (phase === 'WAITING_A') {
                if (detectHandshakeTone(fftData, sampleRate, HANDSHAKE_FREQ_A)) {
                    if (handshakeAHoldStart === 0) {
                        handshakeAHoldStart = Date.now();
                    } else if (Date.now() - handshakeAHoldStart >= MIN_HANDSHAKE_HOLD_MS) {
                        phase = 'WAITING_B';
                        handshakeADetectedAt = Date.now();
                        handshakeAHoldStart = 0;
                        console.log('[RX] Handshake A confirmed (900 Hz). Waiting for B...');
                        onStatus({ type: 'syncing' });
                    }
                } else {
                    handshakeAHoldStart = 0;
                }

            } else if (phase === 'WAITING_B') {
                const elapsed = Date.now() - handshakeADetectedAt;
                const windowMs = (HANDSHAKE_TONE_DURATION_S + HANDSHAKE_SILENCE_S + HANDSHAKE_TONE_DURATION_S) * 1000 + 500;

                if (detectHandshakeTone(fftData, sampleRate, HANDSHAKE_FREQ_B)) {
                    phase = 'SYNCING';
                    syncStartedAt = Date.now();
                    syncPolls.length = 0;
                    allTrits.length = 0;
                    console.log('[RX] Handshake B detected. Scanning for sync preamble (time-domain)...');
                    onStatus({ type: 'receiving', chunk: 0, totalChunks: 0 });
                } else if (elapsed > windowMs) {
                    console.log(`[RX] Handshake B timeout after ${elapsed}ms. Resetting.`);
                    phase = 'WAITING_A';
                    onStatus({ type: 'listening' });
                }

            } else if (phase === 'SYNCING') {
                const trit = detectFSKSymbol(fftData, sampleRate);
                syncPolls.push({ time: now, trit });

                // Try to map the preamble onto the acoustic timeline every few polls
                if (syncPolls.length > 0 && syncPolls.length % 5 === 0) {
                    const t0 = findPreambleStartTime();
                    if (t0 >= 0) {
                        console.log(`[RX] ✅ Preamble aligned! Start time t0=${t0.toFixed(3)}. Transitioning to COLLECTING.`);
                        dataStartTime = t0 + (SYNC_PREAMBLE.length * SYMBOL_DURATION_S);
                        phase = 'COLLECTING';
                        currentSymbolIndex = 0;
                        voteBucket.length = 0;
                        syncPolls.length = 0; // free memory
                    }
                }

                if (Date.now() - syncStartedAt > SYNC_TIMEOUT_MS) {
                    console.log('[RX] Sync preamble timeout. Resetting.');
                    phase = 'WAITING_A';
                    syncPolls.length = 0;
                    allTrits.length = 0;
                    onStatus({ type: 'listening' });
                }

            } else if (phase === 'COLLECTING') {
                const trit = detectFSKSymbol(fftData, sampleRate);

                // Ignore late reverberations from the preamble before data starts
                if (now < dataStartTime) return;

                // Determine exactly which symbol this poll belongs to mathematically
                const symIndex = Math.floor((now - dataStartTime) / SYMBOL_DURATION_S);

                // Have we crossed a symbol boundary? (Or multiple, if JS lagged!)
                if (symIndex > currentSymbolIndex) {
                    // Catch up to current time, committing any pending symbols
                    while (currentSymbolIndex < symIndex) {
                        const winner = commitSymbol();
                        allTrits.push(winner);
                        console.log(`[RX] Symbol ${currentSymbolIndex}: trit=${winner} (Total=${allTrits.length})`);
                        currentSymbolIndex++;

                        // Parse immediately to detect End Of Packet
                        checkAndParsePackets();
                        if (stopped) return; // Stop if checkAndParsePackets() called stop() and finished phase
                    }
                }

                // Only push valid signal into the vote bucket
                if (trit >= 0) {
                    voteBucket.push(trit);
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
