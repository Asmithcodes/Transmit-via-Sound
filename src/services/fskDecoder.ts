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
    METADATA_CHUNK_INDEX,
} from './protocol';

/** Decoded file result delivered when the receiver reconstructs a binary transfer. */
export interface FileResult {
    /** Object URL pointing to the in-memory Blob — revoke after use. */
    url: string;
    name: string;
    mime: string;
    /** Original byte length reported by the transmitter. */
    size: number;
}

export type RxStatus =
    | { type: 'idle' }
    | { type: 'listening' }             // Microphone open, waiting for handshake
    | { type: 'syncing' }               // Handshake A received, waiting for B
    | { type: 'receiving'; chunk: number; totalChunks: number }
    /** Text transfer complete. */
    | { type: 'complete'; text: string; fileResult: null }
    /** Binary file transfer complete. */
    | { type: 'complete'; text: null; fileResult: FileResult }
    | { type: 'error'; message: string };

export type RxStatusCallback = (status: RxStatus) => void;

/** Returns the index (0..7) of the FSK frequency that dominates in the FFT data,
 *  or -1 if no frequency exceeds the detection threshold.
 *
 *  We average across ±2 bins (5 bins total) instead of ±1 to tolerate minor
 *  pitch drift from speaker/mic hardware variances without needing a perfect
 *  frequency match to the nearest FFT bin. */
function detectFSKSymbol(fftData: Uint8Array, sampleRate: number): number {
    const binSize = sampleRate / FFT_SIZE; // Hz per FFT bin

    let bestIndex = -1;
    let bestMag = RX_DETECTION_THRESHOLD; // Anything below threshold is ignored

    for (let fi = 0; fi < FSK_FREQUENCIES.length; fi++) {
        const targetBin = Math.round(FSK_FREQUENCIES[fi] / binSize);
        // Average across ±2 bins to handle speaker/mic pitch drift.
        const mag = (
            (fftData[targetBin - 2] ?? 0) +
            (fftData[targetBin - 1] ?? 0) +
            (fftData[targetBin] ?? 0) +
            (fftData[targetBin + 1] ?? 0) +
            (fftData[targetBin + 2] ?? 0)
        ) / 5;

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
 *  3. Require the target to be >= SNR_RATIO × noise floor AND above a
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
        analyser.smoothingTimeConstant = 0.0; // Zero smoothing: each frame is independent.
        // This eliminates inter-symbol energy bleed-through — the previous symbol's
        // tone cannot contaminate the FFT magnitude of the current symbol.
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
        // File transfer metadata — populated from the METADATA_CHUNK_INDEX sentinel.
        // Null for plain-text transmissions.
        let fileMetadata: { n: string; m: string; s: number } | null = null;

        // Handshake gating
        let handshakeADetectedAt = 0;
        const MIN_HANDSHAKE_HOLD_MS = 80;
        let handshakeAHoldStart = 0;
        let handshakeBHoldStart = 0; // Hold confirmation for tone B, same as A

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
         * Sweeps the acoustic timestamps in 5ms steps (half the poll interval)
         * across the raw poll buffer to find the exact start time (t0) where
         * the preamble symbols align.
         *
         * Using 5ms steps instead of 10ms halves the worst-case t0 quantisation
         * error, which directly improves symbol boundary alignment in COLLECTING.
         */
        function findPreambleStartTime(): number {
            if (syncPolls.length === 0) return -1;

            const pLen = SYNC_PREAMBLE.length;
            const pDuration = pLen * SYMBOL_DURATION_S;
            const firstTime = syncPolls[0].time;
            const lastTime = syncPolls[syncPolls.length - 1].time;

            // Wait until we have enough duration to contain the full preamble.
            if (lastTime - firstTime < pDuration) return -1;

            let bestT0 = -1;
            let bestScore = -1;

            // Sweep t0 across all possible start times in the buffer.
            // Step size = 5ms (half the 20ms poll interval).
            for (let t0 = firstTime; t0 <= lastTime - pDuration; t0 += 0.005) {
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
                // Allow scanning up to 3× a max packet's worth of offsets.
                // This tolerates systematic timing drift (early t0, late correlator
                // lock) that places a few garbage trits before the real packet data.
                const maxScanOffset = maxTritsPerPacket * 3;
                const scanLimit = Math.min(allTrits.length - minTritsForMinPacket + 1, maxScanOffset);

                for (let offset = 0; offset < scanLimit; offset++) {
                    const slicedTrits = allTrits.slice(offset);
                    const byteCount = Math.floor((slicedTrits.length * 3) / 8);
                    if (byteCount < PACKET_HEADER_BYTES + 1 + PACKET_CRC_BYTES) break;

                    const raw = tritsToBytes(slicedTrits, byteCount);
                    const packet = parsePacket(raw);

                    if (packet && packet.crcValid) {
                        const tritsConsumed = offset + Math.ceil(
                            ((PACKET_HEADER_BYTES + packet.payload.length + PACKET_CRC_BYTES) * 8) / 3
                        );

                        if (packet.chunkIndex === METADATA_CHUNK_INDEX) {
                            // Metadata sentinel: parse JSON, don't add to data buffer.
                            try {
                                fileMetadata = JSON.parse(bytesToText(packet.payload));
                            } catch { /* malformed JSON — fall back to text mode */ }
                            totalExpectedChunks = packet.totalChunks;
                            console.log(`[RX] 📋 Metadata: ${JSON.stringify(fileMetadata)}, expecting ${totalExpectedChunks} data chunks.`);
                        } else {
                            // Normal data chunk.
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
                        }

                        allTrits.splice(0, tritsConsumed);
                        foundPacket = true;

                        if (totalExpectedChunks > 0 && receivedPackets.size >= totalExpectedChunks) {
                            phase = 'DONE';
                            const reconstructed = reassemble(receivedPackets, totalExpectedChunks);
                            if (fileMetadata) {
                                // Copy into a plain ArrayBuffer-backed Uint8Array so the
                                // Blob constructor's strict TS5.9 type check is satisfied.
                                const blob = new Blob([new Uint8Array(reconstructed)], { type: fileMetadata.m });
                                const url = URL.createObjectURL(blob);
                                console.log(`[RX] ✅ File complete! "${fileMetadata.n}" (${fileMetadata.s} bytes, ${fileMetadata.m})`);
                                onStatus({ type: 'complete', text: null, fileResult: { url, name: fileMetadata.n, mime: fileMetadata.m, size: fileMetadata.s } });
                            } else {
                                const text = bytesToText(reconstructed);
                                console.log(`[RX] ✅ Complete! Decoded: "${text}"`);
                                onStatus({ type: 'complete', text, fileResult: null });
                            }
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
                const windowMs = (HANDSHAKE_TONE_DURATION_S + HANDSHAKE_SILENCE_S + HANDSHAKE_TONE_DURATION_S) * 1000 + 800;

                if (detectHandshakeTone(fftData, sampleRate, HANDSHAKE_FREQ_B)) {
                    // Require a minimum hold duration for B, just like A, to reject
                    // brief acoustic reflections / single-frame false positives.
                    if (handshakeBHoldStart === 0) {
                        handshakeBHoldStart = Date.now();
                    } else if (Date.now() - handshakeBHoldStart >= MIN_HANDSHAKE_HOLD_MS) {
                        phase = 'SYNCING';
                        handshakeBHoldStart = 0;
                        syncStartedAt = Date.now();
                        syncPolls.length = 0;
                        allTrits.length = 0;
                        console.log('[RX] Handshake B confirmed (1050 Hz). Scanning for sync preamble...');
                        onStatus({ type: 'receiving', chunk: 0, totalChunks: 0 });
                    }
                } else {
                    handshakeBHoldStart = 0; // reset hold if tone disappears
                    if (elapsed > windowMs) {
                        console.log(`[RX] Handshake B timeout after ${elapsed}ms. Resetting.`);
                        phase = 'WAITING_A';
                        onStatus({ type: 'listening' });
                    }
                }

            } else if (phase === 'SYNCING') {
                const trit = detectFSKSymbol(fftData, sampleRate);
                syncPolls.push({ time: now, trit });

                // Run the correlator every 10 polls (~200ms) and only once the buffer
                // is long enough to contain the full preamble.  Calling it less often
                // reduces main-thread load without sacrificing lock-on speed.
                const preambleDuration = SYNC_PREAMBLE.length * SYMBOL_DURATION_S;
                const bufferDuration = syncPolls.length > 0
                    ? syncPolls[syncPolls.length - 1].time - syncPolls[0].time
                    : 0;
                if (bufferDuration >= preambleDuration && syncPolls.length % 10 === 0) {
                    const t0 = findPreambleStartTime();
                    if (t0 >= 0) {
                        const rawDataStart = t0 + preambleDuration;
                        // If JS/event-loop lag caused us to miss the very start of data,
                        // advance currentSymbolIndex to the current real-time position
                        // rather than trying to commit empty-vote symbols for the past.
                        const missedSymbols = Math.max(0, Math.floor((now - rawDataStart) / SYMBOL_DURATION_S));
                        dataStartTime = rawDataStart;
                        currentSymbolIndex = missedSymbols;
                        // Pad allTrits with 0 placeholders for missed symbols so the
                        // CRC offset-scan can still locate the packet correctly.
                        for (let m = 0; m < missedSymbols; m++) allTrits.push(0);
                        if (missedSymbols > 0) {
                            console.log(`[RX] Preamble aligned late; skipped ${missedSymbols} already-elapsed symbol(s).`);
                        }
                        console.log(`[RX] ✅ Preamble aligned! t0=${t0.toFixed(3)}, dataStart=${rawDataStart.toFixed(3)}, symIdx=${missedSymbols}. COLLECTING.`);
                        phase = 'COLLECTING';
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
                        // Clamp -1 (no-signal / empty bucket) to 0 so the trit stream
                        // stays byte-aligned.  CRC scanning will reject wrong-byte runs.
                        allTrits.push(winner >= 0 ? winner : 0);
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
