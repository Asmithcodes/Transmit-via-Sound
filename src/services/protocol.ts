/**
 * Acoustic Data Link — Protocol Definitions
 *
 * This module is the single source of truth for every protocol constant.
 * Changing a value here affects both the encoder and decoder simultaneously,
 * which prevents silent mismatches.
 *
 * Modulation scheme: 8-FSK (8 distinct frequencies → 3 bits per symbol)
 *
 * Frequency map:
 *   freq[0..7] represent 3-bit values 000..111.
 *   They sit in the 1400–4600 Hz range so they survive most consumer
 *   speakers/microphones which typically roll off below 200 Hz and
 *   above 18 kHz.
 */

// --- FSK Symbol Frequencies (Hz) ---
// 3 bits encoded per symbol (8 frequencies).
export const FSK_FREQUENCIES = [
    1400, // 000
    1800, // 001
    2200, // 010
    2600, // 011
    3000, // 100
    3400, // 101
    3800, // 110
    4200, // 111
] as const;

// Duration of each FSK symbol in seconds.
// 100 ms → ~30 bps at 3 bits/symbol.
//
// Timing math (must stay in sync with RX_POLL_INTERVAL_MS below):
//   pollsPerSymbol = SYMBOL_DURATION_S * 1000 / RX_POLL_INTERVAL_MS
//                 = 100 / 20 = 5
//
// With 5 polls per symbol, a ±20ms phase offset causes at most 1 poll to
// straddle the boundary. The remaining 4 always win the majority vote.
export const SYMBOL_DURATION_S = 0.10;

// --- Handshake Tones ---
// Transmitted before the data to synchronise the receiver.
// Two distinct tones that are NOT in the FSK set, so they can't
// be confused with data symbols.
export const HANDSHAKE_FREQ_A = 900;  // Hz
export const HANDSHAKE_FREQ_B = 1050; // Hz

// Duration (seconds) of each handshake tone burst.
// 350 ms gives the receiver ~8-9 polls to confirm the tone (robust over acoustic path).
export const HANDSHAKE_TONE_DURATION_S = 0.35;

// Silence gap between handshake tones and before preamble (seconds).
export const HANDSHAKE_SILENCE_S = 0.25;

// --- Sync Preamble ---
// Sent immediately after the handshake, before actual data.
// The receiver scans for this alternating max/min pattern to self-synchronize
// its symbol vote windows with the transmitter's symbol boundaries.
// This is the standard technique used in real FSK protocols (UART start bits,
// modem training sequences, etc.).
export const SYNC_PREAMBLE: readonly number[] = [1, 5, 1, 5, 1, 5, 1, 5];

// --- End-of-Transmission Tone ---
export const EOT_FREQ = 700; // Hz  (below FSK range — unambiguous)
export const EOT_DURATION_S = 0.3;

// --- Chunk / Packet Layout ---
// Each transmitted "packet" is a flat byte array with this structure:
//   [chunkIndex: 2 bytes] [totalChunks: 2 bytes] [payloadLen: 2 bytes]
//   [payload: 0..MAX_PAYLOAD_BYTES] [crc32: 4 bytes]
export const PACKET_HEADER_BYTES = 6;   // chunkIndex + totalChunks + payloadLen
export const PACKET_CRC_BYTES = 4;
export const MAX_PAYLOAD_BYTES = 32;  // Payload per chunk (simple mode, text only)

// Total maximum packet size in bytes.
export const MAX_PACKET_BYTES = PACKET_HEADER_BYTES + MAX_PAYLOAD_BYTES + PACKET_CRC_BYTES;

// --- Audio Engine Parameters ---
// OscillatorNode amplitude (0..1).  0.7 avoids speaker clipping.
export const TX_AMPLITUDE = 0.7;

// Minimum FFT magnitude (0..255) to consider a frequency "detected".
// Tune this upward in noisy environments.
export const RX_DETECTION_THRESHOLD = 60;

// Web Audio FFT size — must be a power of 2.
// Larger = better frequency resolution but more CPU.
export const FFT_SIZE = 8192;

// How often (ms) the receiver polls the AnalyserNode for a new symbol.
// Should be ≤ SYMBOL_DURATION_S * 1000 to avoid missing symbols.
export const RX_POLL_INTERVAL_MS = 20;

// --- Utility: Text ↔ Binary ↔ Trits (3-bit groups) ---

/** Converts a UTF-8 string to a Uint8Array. */
export function textToBytes(text: string): Uint8Array {
    return new TextEncoder().encode(text);
}

/** Converts a Uint8Array back to a UTF-8 string. */
export function bytesToText(bytes: Uint8Array): string {
    return new TextDecoder().decode(bytes);
}

/**
 * Converts a Uint8Array to an array of 3-bit nibbles (0..7).
 * The last nibble is zero-padded if the bit stream is not a multiple of 3.
 */
export function bytesToTrits(bytes: Uint8Array): number[] {
    // Build a flat bit string: MSB of each byte first.
    let bits = '';
    for (const byte of bytes) {
        bits += byte.toString(2).padStart(8, '0');
    }
    // Pad to multiple of 3.
    while (bits.length % 3 !== 0) bits += '0';

    const trits: number[] = [];
    for (let i = 0; i < bits.length; i += 3) {
        trits.push(parseInt(bits.slice(i, i + 3), 2));
    }
    return trits;
}

/**
 * Converts an array of 3-bit nibbles back to a Uint8Array.
 * @param trits  Array of values 0..7.
 * @param byteCount  Expected number of bytes (trims padding bits).
 */
export function tritsToBytes(trits: number[], byteCount: number): Uint8Array {
    let bits = trits.map(t => t.toString(2).padStart(3, '0')).join('');
    // Trim to exact byte count.
    bits = bits.slice(0, byteCount * 8);
    const bytes = new Uint8Array(byteCount);
    for (let i = 0; i < byteCount; i++) {
        bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
    }
    return bytes;
}

// --- Packet Builder / Parser ---

import { crc32, crc32ToBytes, bytesToCrc32 } from './crc32';

export interface Packet {
    chunkIndex: number;   // 0-based
    totalChunks: number;
    payload: Uint8Array;  // Raw bytes of this chunk's data
    crcValid: boolean;    // Only meaningful on the RX side
}

/**
 * Builds a flat Uint8Array packet ready for FSK encoding.
 */
export function buildPacket(chunkIndex: number, totalChunks: number, payload: Uint8Array): Uint8Array {
    const header = new Uint8Array(PACKET_HEADER_BYTES);
    header[0] = (chunkIndex >>> 8) & 0xff;
    header[1] = chunkIndex & 0xff;
    header[2] = (totalChunks >>> 8) & 0xff;
    header[3] = totalChunks & 0xff;
    header[4] = (payload.length >>> 8) & 0xff;
    header[5] = payload.length & 0xff;

    const checksum = crc32ToBytes(crc32(new Uint8Array([...header, ...payload])));

    const packet = new Uint8Array(PACKET_HEADER_BYTES + payload.length + PACKET_CRC_BYTES);
    packet.set(header, 0);
    packet.set(payload, PACKET_HEADER_BYTES);
    packet.set(checksum, PACKET_HEADER_BYTES + payload.length);
    return packet;
}

/**
 * Parses a flat Uint8Array packet.  Sets crcValid = false if the checksum fails.
 */
export function parsePacket(raw: Uint8Array): Packet | null {
    if (raw.length < PACKET_HEADER_BYTES + PACKET_CRC_BYTES) return null;

    const chunkIndex = (raw[0] << 8) | raw[1];
    const totalChunks = (raw[2] << 8) | raw[3];
    const payloadLen = (raw[4] << 8) | raw[5];

    if (raw.length < PACKET_HEADER_BYTES + payloadLen + PACKET_CRC_BYTES) return null;

    const payload = raw.slice(PACKET_HEADER_BYTES, PACKET_HEADER_BYTES + payloadLen);
    const storedCrc = bytesToCrc32(raw, PACKET_HEADER_BYTES + payloadLen);
    const computedCrc = crc32(raw.slice(0, PACKET_HEADER_BYTES + payloadLen));

    return {
        chunkIndex,
        totalChunks,
        payload,
        crcValid: storedCrc === computedCrc,
    };
}

/**
 * Splits a Uint8Array data buffer into ordered chunks of MAX_PAYLOAD_BYTES each,
 * and wraps each into a Packet byte stream.
 */
export function chunkData(data: Uint8Array): Uint8Array[] {
    const chunks: Uint8Array[] = [];
    const totalChunks = Math.ceil(data.length / MAX_PAYLOAD_BYTES);
    for (let i = 0; i < totalChunks; i++) {
        const payload = data.slice(i * MAX_PAYLOAD_BYTES, (i + 1) * MAX_PAYLOAD_BYTES);
        chunks.push(buildPacket(i, totalChunks, payload));
    }
    return chunks;
}
