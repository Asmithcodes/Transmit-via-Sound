/**
 * FSK Encoder — Transmitter Audio Engine
 *
 * Converts a sequence of Packet byte arrays into actual audio tones
 * played through the device's speakers via the Web Audio API.
 *
 * Flow:
 *   text → bytes → chunks/packets → trits → OscillatorNode tones
 *
 * Each packet is preceded by a handshake burst so the receiver can
 * lock its timing before the data symbols begin.
 */

import {
    FSK_FREQUENCIES,
    SYMBOL_DURATION_S,
    HANDSHAKE_FREQ_A,
    HANDSHAKE_FREQ_B,
    HANDSHAKE_TONE_DURATION_S,
    HANDSHAKE_SILENCE_S,
    EOT_FREQ,
    EOT_DURATION_S,
    TX_AMPLITUDE,
    SYNC_PREAMBLE,
    textToBytes,
    bytesToTrits,
    chunkData,
    buildPacket,
    METADATA_CHUNK_INDEX,
} from './protocol';

export type TxStatus =
    | { type: 'idle' }
    | { type: 'handshake' }
    | { type: 'transmitting'; chunk: number; totalChunks: number }
    | { type: 'complete' }
    | { type: 'error'; message: string };

export type TxStatusCallback = (status: TxStatus) => void;

/**
 * Plays a single pure tone using a GainNode + OscillatorNode.
 * Resolves after `durationS` seconds (when the tone ends).
 */
function playTone(
    ctx: AudioContext,
    gainNode: GainNode,
    frequency: number,
    startTime: number,
    durationS: number
): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, startTime);
    osc.connect(gainNode);
    osc.start(startTime);
    osc.stop(startTime + durationS);
}

/**
 * Schedules the full handshake sequence:
 *   tone A → silence → tone B → silence
 * and returns the AudioContext time after the handshake ends.
 */
function scheduleHandshake(ctx: AudioContext, gainNode: GainNode, startTime: number): number {
    playTone(ctx, gainNode, HANDSHAKE_FREQ_A, startTime, HANDSHAKE_TONE_DURATION_S);
    startTime += HANDSHAKE_TONE_DURATION_S + HANDSHAKE_SILENCE_S;
    playTone(ctx, gainNode, HANDSHAKE_FREQ_B, startTime, HANDSHAKE_TONE_DURATION_S);
    startTime += HANDSHAKE_TONE_DURATION_S + HANDSHAKE_SILENCE_S;
    return startTime;
}

/**
 * Schedules the FSK symbols for a single packet byte array.
 * Returns the AudioContext timestamp after the last symbol ends.
 */
function schedulePacket(
    ctx: AudioContext,
    gainNode: GainNode,
    packetBytes: Uint8Array,
    startTime: number
): number {
    const trits = bytesToTrits(packetBytes);
    for (const trit of trits) {
        const freq = FSK_FREQUENCIES[trit];
        playTone(ctx, gainNode, freq, startTime, SYMBOL_DURATION_S);
        startTime += SYMBOL_DURATION_S;
    }
    return startTime;
}

// Inter-chunk silence: 200 ms = 2× symbol duration (100 ms).
// Must be noticeably longer than the FFT window (46 ms) so the decoder
// sees clear baseline between packets with no residual tone energy.
const INTER_CHUNK_SILENCE_S = 0.20;

/**
 * Main FSK transmitter.
 *
 * @param text     The UTF-8 text to transmit.
 * @param onStatus Callback invoked at each stage of the transmission.
 * @returns        A function that, when called, immediately stops playback (abort).
 */
export function transmitText(text: string, onStatus: TxStatusCallback): () => void {
    let ctx: AudioContext | null = null;
    let aborted = false;
    let ctxClosed = false; // Tracks whether we already closed the AudioContext

    const safeClose = () => {
        if (ctx && !ctxClosed && ctx.state !== 'closed') {
            ctxClosed = true;
            ctx.close();
        }
    };

    // We schedule everything ahead of time using AudioContext.currentTime,
    // then use real-time callbacks (setTimeout) to update UI progress.
    (async () => {
        try {
            ctx = new AudioContext();

            // Soft clip protection: master gain capped at TX_AMPLITUDE.
            const gainNode = ctx.createGain();
            gainNode.gain.setValueAtTime(TX_AMPLITUDE, ctx.currentTime);
            gainNode.connect(ctx.destination);

            const data = textToBytes(text);
            const packets = chunkData(data);
            const totalChunks = packets.length;

            onStatus({ type: 'handshake' });

            // Schedule everything into the AudioContext timeline.
            // This runs ahead of real time so there's never a gap in playback.
            let cursor = ctx.currentTime + 0.05; // tiny lead-in

            // Global handshake at the very start.
            cursor = scheduleHandshake(ctx, gainNode, cursor);

            // Sync preamble: alternating max/min tones that the receiver
            // scans for to self-synchronize its symbol vote windows.
            for (const trit of SYNC_PREAMBLE) {
                playTone(ctx, gainNode, FSK_FREQUENCIES[trit], cursor, SYMBOL_DURATION_S);
                cursor += SYMBOL_DURATION_S;
            }

            // Schedule each packet with UI callback timing.
            for (let i = 0; i < packets.length; i++) {
                if (aborted) break;

                const chunkStartAudioTime = cursor;

                cursor = schedulePacket(ctx, gainNode, packets[i], cursor);
                cursor += INTER_CHUNK_SILENCE_S;

                // Schedule a real-time UI update for when this chunk starts playing.
                const chunkStartWallDelayMs = (chunkStartAudioTime - ctx.currentTime) * 1000;
                setTimeout(() => {
                    if (!aborted) {
                        onStatus({ type: 'transmitting', chunk: i, totalChunks });
                    }
                }, Math.max(0, chunkStartWallDelayMs));
            }

            // End-of-transmission tone.
            playTone(ctx, gainNode, EOT_FREQ, cursor, EOT_DURATION_S);
            cursor += EOT_DURATION_S;

            // Wait until the timeline finishes, then close the context.
            // Add a larger buffer now that symbols are faster, to guarantee the final tone plays.
            const totalWallTimeMs = (cursor - ctx.currentTime) * 1000;
            setTimeout(() => {
                if (!aborted) {
                    onStatus({ type: 'complete' });
                }
                safeClose();
            }, totalWallTimeMs + 500);

        } catch (err) {
            onStatus({ type: 'error', message: String(err) });
            safeClose();
        }
    })();

    return () => {
        aborted = true;
        safeClose();
    };
}

/**
 * File FSK transmitter.
 *
 * Reads the File as raw bytes, prepends a metadata sentinel packet
 * (chunkIndex = METADATA_CHUNK_INDEX) carrying JSON {n, m, s} so the
 * receiver knows the filename and MIME type, then transmits all data
 * chunks using the same handshake / preamble / 8-FSK encoding as
 * transmitText.
 *
 * @param file      The File object to transmit.
 * @param onStatus  Callback invoked at each stage.
 * @returns         Abort function.
 */
export function transmitFile(file: File, onStatus: TxStatusCallback): () => void {
    let ctx: AudioContext | null = null;
    let aborted = false;
    let ctxClosed = false;
    let schedulerTimer: ReturnType<typeof setInterval> | null = null;

    const safeClose = () => {
        if (schedulerTimer !== null) {
            clearInterval(schedulerTimer);
            schedulerTimer = null;
        }
        if (ctx && !ctxClosed && ctx.state !== 'closed') {
            ctxClosed = true;
            ctx.close();
        }
    };

    (async () => {
        try {
            // ── Step 1: Create AudioContext synchronously (user-gesture still active) ──
            // Must happen before any await so the browser grants autoplay permission.
            ctx = new AudioContext();
            const gainNode = ctx.createGain();
            gainNode.gain.setValueAtTime(TX_AMPLITUDE, ctx.currentTime);
            gainNode.connect(ctx.destination);

            // ── Step 2: Read file bytes (async — yields the event loop) ──
            // Some browsers auto-suspend the AudioContext during this await.
            // ctx.resume() re-activates it afterwards.
            const data = new Uint8Array(await file.arrayBuffer());
            if (aborted) { safeClose(); return; }
            await ctx.resume();
            if (aborted) { safeClose(); return; }

            // ── Step 3: Build packet data ──
            const dataPackets = chunkData(data);
            const totalChunks = dataPackets.length;

            const metaJson = JSON.stringify({
                n: file.name.slice(0, 40),
                m: file.type || 'application/octet-stream',
                s: data.length,
            });
            const metaPacket = buildPacket(METADATA_CHUNK_INDEX, totalChunks, textToBytes(metaJson));

            // ── Step 4: Pre-compute the full tone timeline as plain data ──
            //
            // For a real image the naive "schedule everything at once" approach creates
            // thousands of OscillatorNode objects simultaneously (e.g. a 4 KB image →
            // ~12 800 nodes), which hits Chrome's internal AudioNode quota, throws
            // QuotaExceededError mid-loop, and silences everything after the first tone.
            //
            // Instead, we build a flat array of { freq, relStart, dur } records here
            // (cheap — plain objects, no AudioNodes), then feed them to a look-ahead
            // scheduler that only creates oscillators for the next 500 ms of audio at
            // a time, keeping the live node count to ~5 at any moment.
            interface ToneEvent { freq: number; relStart: number; dur: number; }
            interface StatusTrigger { relStart: number; chunk: number; }

            const tones: ToneEvent[] = [];
            const statusTriggers: StatusTrigger[] = [];
            let t = 0; // relative timeline cursor (seconds from t0)

            // Handshake
            tones.push({ freq: HANDSHAKE_FREQ_A, relStart: t, dur: HANDSHAKE_TONE_DURATION_S });
            t += HANDSHAKE_TONE_DURATION_S + HANDSHAKE_SILENCE_S;
            tones.push({ freq: HANDSHAKE_FREQ_B, relStart: t, dur: HANDSHAKE_TONE_DURATION_S });
            t += HANDSHAKE_TONE_DURATION_S + HANDSHAKE_SILENCE_S;

            // Sync preamble
            for (const trit of SYNC_PREAMBLE) {
                tones.push({ freq: FSK_FREQUENCIES[trit], relStart: t, dur: SYMBOL_DURATION_S });
                t += SYMBOL_DURATION_S;
            }

            // Metadata packet
            for (const trit of bytesToTrits(metaPacket)) {
                tones.push({ freq: FSK_FREQUENCIES[trit], relStart: t, dur: SYMBOL_DURATION_S });
                t += SYMBOL_DURATION_S;
            }
            t += INTER_CHUNK_SILENCE_S;

            // Data packets
            for (let i = 0; i < dataPackets.length; i++) {
                statusTriggers.push({ relStart: t, chunk: i });
                for (const trit of bytesToTrits(dataPackets[i])) {
                    tones.push({ freq: FSK_FREQUENCIES[trit], relStart: t, dur: SYMBOL_DURATION_S });
                    t += SYMBOL_DURATION_S;
                }
                t += INTER_CHUNK_SILENCE_S;
            }

            // EOT
            tones.push({ freq: EOT_FREQ, relStart: t, dur: EOT_DURATION_S });
            const totalRelDuration = t + EOT_DURATION_S;

            onStatus({ type: 'handshake' });

            // ── Step 5: Look-ahead scheduler ──
            // Only OscillatorNodes within the next SCHEDULE_AHEAD_S are created at
            // any given time. The setInterval keeps filling the window as playback
            // advances, so memory pressure stays flat no matter the file size.
            const SCHEDULE_AHEAD_S = 0.5;
            const t0 = ctx.currentTime + 0.05; // absolute AudioContext start time
            let nextToneIdx = 0;
            let nextStatusIdx = 0;

            const scheduleWindow = () => {
                if (!ctx || aborted) return;
                const horizon = ctx.currentTime + SCHEDULE_AHEAD_S;

                // Schedule status callbacks for upcoming chunks
                while (nextStatusIdx < statusTriggers.length) {
                    const st = statusTriggers[nextStatusIdx];
                    const absStart = t0 + st.relStart;
                    if (absStart > horizon) break;
                    const delayMs = Math.max(0, (absStart - ctx.currentTime) * 1000);
                    const ci = st.chunk;
                    setTimeout(() => {
                        if (!aborted) onStatus({ type: 'transmitting', chunk: ci, totalChunks });
                    }, delayMs);
                    nextStatusIdx++;
                }

                // Schedule oscillators
                while (nextToneIdx < tones.length) {
                    const ev = tones[nextToneIdx];
                    const absStart = t0 + ev.relStart;
                    if (absStart > horizon) break;
                    playTone(ctx, gainNode, ev.freq, absStart, ev.dur);
                    nextToneIdx++;
                }
            };

            scheduleWindow(); // immediate first fill

            schedulerTimer = setInterval(() => {
                if (aborted || !ctx) { safeClose(); return; }
                scheduleWindow();
                if (nextToneIdx >= tones.length) {
                    clearInterval(schedulerTimer!);
                    schedulerTimer = null;
                }
            }, 100); // refill every 100 ms

            // When the full timeline has played, close and report complete.
            const totalWallMs = (t0 - ctx.currentTime + totalRelDuration) * 1000;
            setTimeout(() => {
                if (!aborted) onStatus({ type: 'complete' });
                safeClose();
            }, totalWallMs + 500);

        } catch (err) {
            onStatus({ type: 'error', message: String(err) });
            safeClose();
        }
    })();

    return () => {
        aborted = true;
        safeClose();
    };
}
