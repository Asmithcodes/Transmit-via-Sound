/**
 * useReceiver — React hook for the FSK receiver.
 *
 * Wraps fskDecoder.ts with React state.  Handles:
 * - getUserMedia permission request and error surfacing
 * - Real-time FFT magnitude data for the spectrum visualiser
 * - State machine phase → human-readable labels
 * - Decoded text result delivery
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { startReceiver } from '../services/fskDecoder';
import type { RxStatus, FileResult } from '../services/fskDecoder';
import { FFT_SIZE } from '../services/protocol';

export interface ReceiverLog {
    id: number;
    time: string;
    msg: string;
    type: 'info' | 'success' | 'warning' | 'error';
}

export interface UseReceiverReturn {
    /** Begin listening.  Triggers microphone permission prompt. */
    start: () => void;
    /** Stop listening and close the AudioContext. */
    stop: () => void;
    /** Current engine status. */
    status: RxStatus;
    /** Structured log entries. */
    logs: ReceiverLog[];
    /** 0..100 decode progress percentage. */
    progress: number;
    /** True while the microphone is open. */
    isListening: boolean;
    /** True while the decoder is actively receiving packets. */
    isDecoding: boolean;
    /** True when decoding finished successfully. */
    isComplete: boolean;
    /** The decoded text (available when isComplete = true and fileResult = null). */
    decodedText: string;
    /** Decoded file result (available when isComplete = true and fileResult != null). */
    fileResult: FileResult | null;
    /**
     * Live FFT magnitude spectrum [0..255] for the visualiser bar chart.
     * Updated at RX_POLL_INTERVAL_MS cadence.
     * Length = FFT_SIZE / 2 (only positive frequencies).
     */
    spectrumData: Uint8Array;
}

export function useReceiver(): UseReceiverReturn {
    const [status, setStatus] = useState<RxStatus>({ type: 'idle' });
    const [logs, setLogs] = useState<ReceiverLog[]>([]);
    const [progress, setProgress] = useState(0);
    const [decodedText, setDecodedText] = useState('');
    const [fileResult, setFileResult] = useState<FileResult | null>(null);
    const [spectrumData, setSpectrumData] = useState<Uint8Array>(new Uint8Array(FFT_SIZE / 2));

    const stopFnRef = useRef<(() => void) | null>(null);
    const spectrumTickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // Track blob URL so we can revoke it on cleanup / new transmission.
    const blobUrlRef = useRef<string | null>(null);

    // Cleanup on unmount.
    useEffect(() => {
        return () => {
            stopFnRef.current?.();
            if (spectrumTickerRef.current) clearInterval(spectrumTickerRef.current);
            if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        };
    }, []);

    const addLog = useCallback((msg: string, type: ReceiverLog['type'] = 'info') => {
        setLogs(prev => [{
            id: Date.now() + Math.random(),
            time: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            msg,
            type,
        }, ...prev].slice(0, 100));
    }, []);

    const handleStatus = useCallback((s: RxStatus) => {
        setStatus(s);
        switch (s.type) {
            case 'listening':
                addLog('Listening for handshake on 900Hz / 1050Hz...', 'info');
                break;
            case 'syncing':
                addLog('Handshake tone A (900Hz) detected! Waiting for tone B (1050Hz)...', 'success');
                break;
            case 'receiving':
                if (s.chunk === 0) {
                    addLog('Handshake complete. FSK data stream incoming. Decoding 8-FSK symbols...', 'success');
                } else {
                    const pct = s.totalChunks > 0 ? Math.round((s.chunk / s.totalChunks) * 100) : 0;
                    setProgress(pct);
                    addLog(`Packet ${s.chunk}/${s.totalChunks} validated via CRC32. (${pct}%)`, 'info');
                }
                break;
            case 'complete':
                setProgress(100);
                if (s.fileResult) {
                    blobUrlRef.current = s.fileResult.url;
                    setFileResult(s.fileResult);
                    addLog(`File received: “${s.fileResult.name}” (${(s.fileResult.size / 1024).toFixed(1)} KB, ${s.fileResult.mime}). Ready to download.`, 'success');
                } else if (s.text) {
                    setDecodedText(s.text);
                    addLog(`Payload fully reconstructed. Decoded: "${s.text.slice(0, 60)}${s.text.length > 60 ? '...' : ''}"`, 'success');
                }
                break;
            case 'error':
                addLog(`Error: ${s.message}`, 'error');
                break;
        }
    }, [addLog]);

    const start = useCallback(async () => {
        setLogs([]);
        setProgress(0);
        setDecodedText('');
        setFileResult(null);
        // Revoke any lingering blob URL from a previous transfer.
        if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = null;
        }
        setSpectrumData(new Uint8Array(FFT_SIZE / 2));
        addLog('Requesting microphone permission from browser...', 'info');

        const stopFn = await startReceiver(handleStatus);
        stopFnRef.current = stopFn;
    }, [handleStatus, addLog]);

    const stop = useCallback(() => {
        stopFnRef.current?.();
        stopFnRef.current = null;
        if (spectrumTickerRef.current) clearInterval(spectrumTickerRef.current);
        setStatus({ type: 'idle' });
        addLog('Receiver suspended. Microphone closed.', 'warning');
    }, [addLog]);

    const isListening = status.type === 'listening' || status.type === 'syncing' || status.type === 'receiving';
    const isDecoding = status.type === 'receiving';
    const isComplete = status.type === 'complete';

    return {
        start,
        stop,
        status,
        logs,
        progress,
        isListening,
        isDecoding,
        isComplete,
        decodedText,
        fileResult,
        spectrumData,
    };
}
