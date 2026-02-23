# Acoustic Data Link

A browser-based acoustic data link for air-gapped, peer-to-peer transmission using device audio hardware. Built with React and the Web Audio API, it encodes text and files into 8-FSK audio signals to transmit data wirelessly over sound waves.

## What This Does

This project allows two devices to communicate with each other completely offline and without any RF network (Wi-Fi, Bluetooth, Cellular). It uses the device's built-in speaker to emit a sequence of musical tones (Frequency-Shift Keying) and the receiving device's microphone to listen to and decode those tones back into digital data. It is capable of transmitting both short text payloads and small files across an air gap.

## Features

- **8-FSK Modulation**: Encodes 3 bits of data per audio symbol using 8 distinct frequencies.
- **True Sync Preamble**: Uses a robust synchronization protocol to lock onto the transmission perfectly, discarding Javascript timer drift.
- **SNR-Based Handshake Detection**: Analyzes Signal-to-Noise Ratio to prevent false triggers from ambient room noise.
- **Data Integrity**: All payloads are verified upon receipt using CRC32 checksums.
- **"Dead Frequency" UI**: A custom, vintage signal intelligence aesthetic with a warm parchment/amber/teal palette, `DM Serif Display` typography, and kinetic CSS animations. 

## Tech Stack

- **Frontend Framework**: React 18 + Vite
- **Styling & Motion**: Tailwind CSS + Framer Motion (for kinetic elements and page transitions)
- **Audio Processing**: Native Web Audio API (`AudioContext`, `AnalyserNode`, `OscillatorNode`)
- **Icons**: Lucide React

## Getting Started

### Prerequisites
- Node.js (v18+)
- npm or yarn

### Installation
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

*Note: For the acoustic link to work, the transmitting device needs a functioning speaker, and the receiving device needs a functioning microphone and must grant microphone permissions in the browser.*

## How It Works

1. **Encoding**: The application takes a text string or a file buffer and chunks it into smaller packets. Each packet calculates a CRC32 checksum. The binary data is then mapped to 8 specific audio frequencies (8-FSK).
2. **Transmission**: The transmitter broadcasts a dual-tone handshake to wake up any nearby receivers, followed by a known Sync Preamble, and then the actual payload frequencies using precisely scheduled Web Audio API `OscillatorNodes` (Look-Ahead scheduling).
3. **Decoding**: The receiver continuously polls audio data via an `AnalyserNode` performing Fast Fourier Transforms (FFT). It detects the handshake using SNR, precisely aligns itself using the Sync Preamble, and then records the strongest frequencies over time to rebuild the packet.
4. **Verification**: Once a packet is received, its CRC32 is checked. If it matches, the data is pushed to the final payload.

### Acoustic Packet Structure

Each transmission is stripped into 64-byte maximum payloads and wrapped in a 10-byte protocol envelope before being sent over the air as FSK audio:

| Segment | Size | Description |
|---|---|---|
| `chunkIndex` | 2 bytes | The 0-based index of the current chunk |
| `totalChunks`| 2 bytes | Total count of chunks in the transmission |
| `payloadLen` | 2 bytes | Length of the data payload in this packet |
| `payload`    | 0-64 bytes | The raw data payload slice |
| `crc32`      | 4 bytes | 32-bit checksum of the header and payload |

### FSK Frequency Map

| Symbol (Trit) | 3-bit Value | Frequency (Hz) | Notes |
|:---:|:---:|:---:|---|
| 0 | `000` | **1400 Hz** | Lowest data frequency |
| 1 | `001` | **1800 Hz** | Also used in Sync Preamble |
| 2 | `010` | **2200 Hz** | |
| 3 | `011` | **2600 Hz** | |
| 4 | `100` | **3000 Hz** | |
| 5 | `101` | **3400 Hz** | Also used in Sync Preamble |
| 6 | `110` | **3800 Hz** | |
| 7 | `111` | **4200 Hz** | Highest data frequency |
| — | Handshake A | **900 Hz** | Outside FSK range, wake-up tone |
| — | Handshake B | **1050 Hz** | Outside FSK range, wake-up tone |
| — | EOT | **700 Hz** | End-of-transmission, below FSK range |

## Limitations & Future Ideas

- **Bitrate**: Current speeds are around ~37 bps. Future versions will optimize the DSP loop to increase throughput.
- **Distance**: Environmental noise heavily impacts reliability. Devices must be relatively close in a quiet room for uncorrupted transmission. Error correction coding (like Reed-Solomon) is planned to recover flipped bits automatically.

## Deployment

This repository includes a GitHub Action for deploying natively to GitHub Pages (`.github/workflows/deploy.yml`).

---
*Developed by Asmith — asmyth@duck.com*
