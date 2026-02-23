/**
 * Utility functions for compressing an image into a 32-byte payload,
 * and decompressing the payload back into a canvas representation.
 * 
 * Target specification: 16x16 pixel black & white grid (256 bits = 32 bytes).
 */

export const IMAGE_DIMENSION = 16;
export const IMAGE_PAYLOAD_BYTES = (IMAGE_DIMENSION * IMAGE_DIMENSION) / 8; // 32 bytes

/**
 * Compresses an image file down to a 32-byte Uint8Array.
 * Uses a 16x16 grid and 1-bit monochrome thresholding.
 */
export async function compressImageToBytes(file: File): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
            URL.revokeObjectURL(url);

            // Draw image to a tiny 16x16 hidden canvas
            const canvas = document.createElement('canvas');
            canvas.width = IMAGE_DIMENSION;
            canvas.height = IMAGE_DIMENSION;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            if (!ctx) {
                return reject(new Error('Canvas 2D context not supported'));
            }

            // Draw white background in case image is transparent
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, IMAGE_DIMENSION, IMAGE_DIMENSION);

            // Draw and scale the image onto the 16x16 canvas
            // We use standard drawImage which handles downscaling natively
            ctx.drawImage(img, 0, 0, IMAGE_DIMENSION, IMAGE_DIMENSION);

            // Extract the RGBA pixel array (16 * 16 * 4 = 1024 values)
            const imageData = ctx.getImageData(0, 0, IMAGE_DIMENSION, IMAGE_DIMENSION);
            const pixels = imageData.data;

            const bytes = new Uint8Array(IMAGE_PAYLOAD_BYTES); // 32 bytes

            // Convert to 1-bit monochrome and pack bits into bytes
            for (let i = 0; i < pixels.length; i += 4) {
                const r = pixels[i];
                const g = pixels[i + 1];
                const b = pixels[i + 2];
                // Ignore alpha (i+3), handled by white background

                // Standard luminance formula
                const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

                // Simple thresholding: > 127 is White (1), <= 127 is Black (0)
                const isWhite = luminance > 127 ? 1 : 0;

                // Determine which byte and bit we are writing to
                // Every 4 elements in 'pixels' array represents 1 pixel
                const pixelIndex = i / 4;
                const byteIndex = Math.floor(pixelIndex / 8);
                const bitIndex = pixelIndex % 8;

                if (isWhite) {
                    // Set the specific bit in the byte (using bitwise OR)
                    // We pack bits from most-significant to least-significant
                    bytes[byteIndex] |= (1 << (7 - bitIndex));
                }
            }

            resolve(bytes);
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image file.'));
        };

        img.src = url;
    });
}

/**
 * Reads a 32-byte payload and visually paints the 16x16 monochrome
 * representation onto the provided CanvasRenderingContext2D.
 */
export function decodeBytesToImage(bytes: Uint8Array, ctx: CanvasRenderingContext2D, sizeX: number, sizeY: number): void {
    if (bytes.length !== IMAGE_PAYLOAD_BYTES) {
        throw new Error(`Invalid payload length: Expected ${IMAGE_PAYLOAD_BYTES}, got ${bytes.length}`);
    }

    // Set canvas dimensions
    ctx.canvas.width = sizeX;
    ctx.canvas.height = sizeY;

    // Scale pixel width depending on target output dimensions
    const pixelWidth = sizeX / IMAGE_DIMENSION;
    const pixelHeight = sizeY / IMAGE_DIMENSION;

    // Iterate over every bit in the 32 bytes
    for (let byteIndex = 0; byteIndex < bytes.length; byteIndex++) {
        const byte = bytes[byteIndex];

        for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
            // Check if the bit is set (White) or unset (Black)
            // Mask against the bit position (from 7 down to 0)
            const isWhite = (byte & (1 << (7 - bitIndex))) !== 0;

            // Calculate Grid Row and Column
            const pixelIndex = (byteIndex * 8) + bitIndex;
            const col = pixelIndex % IMAGE_DIMENSION;
            const row = Math.floor(pixelIndex / IMAGE_DIMENSION);

            // Paint the "pixel" as a rectangle scaled to canvas size
            ctx.fillStyle = isWhite ? '#FFFFFF' : '#000000';
            ctx.fillRect(col * pixelWidth, row * pixelHeight, Math.ceil(pixelWidth), Math.ceil(pixelHeight));
        }
    }
}
