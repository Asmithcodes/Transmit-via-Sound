/**
 * CRC32 checksum utility.
 * Uses a standard 32-bit lookup table for fast computation.
 * Every transmitted chunk has its payload hashed via CRC32 so
 * the receiver can detect corruption without a network round-trip.
 */

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[i] = c;
    }
    return table;
})();

/**
 * Computes a CRC32 hash of a Uint8Array buffer.
 * @returns a 32-bit unsigned integer checksum
 */
export function crc32(data: Uint8Array): number {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
        crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Serialises a CRC32 value into a 4-byte big-endian Uint8Array.
 */
export function crc32ToBytes(value: number): Uint8Array {
    const buf = new Uint8Array(4);
    buf[0] = (value >>> 24) & 0xff;
    buf[1] = (value >>> 16) & 0xff;
    buf[2] = (value >>> 8) & 0xff;
    buf[3] = value & 0xff;
    return buf;
}

/**
 * Reads a 4-byte big-endian Uint8Array as a CRC32 value.
 */
export function bytesToCrc32(buf: Uint8Array, offset = 0): number {
    return (
        ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0
    );
}
