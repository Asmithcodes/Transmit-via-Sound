/**
 * useTransmitter — React hook for the FSK transmitter.
 *
 * Wraps fskEncoder.ts with React state so Transmitter.tsx can stay declarative.
 * All AudioContext lifecycle management (resume on user gesture, cleanup on unmount)
 * is handled here so the UI never needs to think about it.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { transmitText } from '../services/fskEncoder';
import type { TxStatus } from '../services/fskEncoder';
import {
    MAX_PAYLOAD_BYTES,
    PACKET_HEADER_BYTES,
    PACKET_CRC_BYTES,
    SYMBOL_DURATION_S,
    HANDSHAKE_TONE_DURATION_S,
    HANDSHAKE_SILENCE_S,
    EOT_DURATION_S,
} from '../services/protocol';

export interface TransmitterLog {
    id: number;
    time: string;
    msg: string;
    type: 'info' | 'success' | 'warning' | 'error';
}

export interface UseTransmitterReturn {
    /** Start transmitting the given text. */
    start: (text: string) => void;
    /** Abort an in-progress transmission. */
    stop: () => void;
    /** Current status from the FSK engine. */
    status: TxStatus;
    /** Structured log entries for the output panel. */
    logs: TransmitterLog[];
    /** 0..100 progress percentage. */
    progress: number;
    /** True while audio is actively playing. */
    isTransmitting: boolean;
    /** Computed estimated transmission time in seconds for a given byte count. */
    estimateSeconds: (byteCount: number) => number;
}

export function useTransmitter(): UseTransmitterReturn {
    const [status, setStatus] = useState<TxStatus>({ type: 'idle' });
    const [logs, setLogs] = useState<TransmitterLog[]>([]);
    const [progress, setProgress] = useState(0);
    const abortRef = useRef<(() => void) | null>(null);

    // Cleanup: if component unmounts during transmission, stop audio.
    useEffect(() => {
        return () => {
            abortRef.current?.();
        };
    }, []);

    const addLog = useCallback((msg: string, type: TransmitterLog['type'] = 'info') => {
        setLogs(prev => [{
            id: Date.now() + Math.random(),
            time: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            msg,
            type,
        }, ...prev].slice(0, 100));
    }, []);

    const handleStatus = useCallback((s: TxStatus) => {
        setStatus(s);
        switch (s.type) {
            case 'handshake':
                addLog('AudioContext initialized. Broadcasting handshake tones...', 'info');
                setProgress(0);
                break;
            case 'transmitting': {
                const pct = Math.round(((s.chunk + 1) / s.totalChunks) * 100);
                setProgress(pct);
                addLog(`Chunk ${s.chunk + 1}/${s.totalChunks} dispatched. (${pct}%)`, 'info');
                break;
            }
            case 'complete':
                setProgress(100);
                addLog('Transmission complete. EOT tone sent. All chunks verified.', 'success');
                break;
            case 'error':
                addLog(`Engine error: ${s.message}`, 'error');
                break;
        }
    }, [addLog]);

    const start = useCallback((text: string) => {
        if (!text.trim()) {
            addLog('No payload provided. Aborting.', 'warning');
            return;
        }
        setLogs([]);
        setProgress(0);
        addLog(`Encoding ${text.length} characters via 8-FSK...`, 'info');
        addLog(`Chunking into ${Math.ceil(new TextEncoder().encode(text).length / MAX_PAYLOAD_BYTES)} packets of ≤${MAX_PAYLOAD_BYTES} bytes.`, 'info');

        const stopFn = transmitText(text, handleStatus);
        abortRef.current = stopFn;
    }, [handleStatus, addLog]);

    const stop = useCallback(() => {
        abortRef.current?.();
        abortRef.current = null;
        setStatus({ type: 'idle' });
        addLog('Transmission manually aborted by user.', 'warning');
    }, [addLog]);

    /**
     * Rough estimate:
     *   handshake + (trits per packet × packets × symbol duration) + EOT
     * Uses the same constants as the encoder so the estimate stays accurate
     * if protocol constants change.
     */
    const estimateSeconds = useCallback((byteCount: number): number => {
        const totalChunks = Math.ceil(byteCount / MAX_PAYLOAD_BYTES);
        const packetBytes = PACKET_HEADER_BYTES + MAX_PAYLOAD_BYTES + PACKET_CRC_BYTES;
        const tritsPerPacket = Math.ceil((packetBytes * 8) / 3);
        const symbolsTotal = tritsPerPacket * totalChunks;
        const handshakeTime = 2 * (HANDSHAKE_TONE_DURATION_S + HANDSHAKE_SILENCE_S);
        return handshakeTime + symbolsTotal * SYMBOL_DURATION_S + EOT_DURATION_S;
    }, []);

    return {
        start,
        stop,
        status,
        logs,
        progress,
        isTransmitting: status.type === 'handshake' || status.type === 'transmitting',
        estimateSeconds,
    };
}
