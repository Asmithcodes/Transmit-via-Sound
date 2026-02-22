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
    textToBytes,
    bytesToTrits,
    chunkData,
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

/** Short inter-chunk silence to let the receiver's FFT settle between packets. */
const INTER_CHUNK_SILENCE_S = 0.1;

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
            const totalWallTimeMs = (cursor - ctx.currentTime) * 1000;
            setTimeout(async () => {
                if (!aborted) {
                    onStatus({ type: 'complete' });
                }
                await ctx?.close();
            }, totalWallTimeMs + 200);

        } catch (err) {
            onStatus({ type: 'error', message: String(err) });
            await ctx?.close();
        }
    })();

    return () => {
        aborted = true;
        ctx?.close();
    };
}
