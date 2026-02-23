import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Square, Clock, Zap, Upload, ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTransmitter } from '../hooks/useTransmitter';
import { FSK_FREQUENCIES, MAX_PAYLOAD_BYTES, MAX_FILE_BYTES } from '../services/protocol';

function fmtDuration(s: number): string {
    if (s < 60) return `${Math.round(s)}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
    return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
}

function SoundWave({ active }: { active: boolean }) {
    const heights = [0.3, 0.55, 0.8, 1.0, 0.8, 0.55, 0.3];
    return (
        <div className="flex items-center gap-[4px]" style={{ height: 28 }}>
            {heights.map((scale, i) => (
                <motion.span
                    key={i}
                    style={{ width: 3, borderRadius: 2, background: 'var(--color-primary)' }}
                    animate={active
                        ? { height: [4, 26 * scale, 4], opacity: [0.5, 1, 0.5] }
                        : { height: 3, opacity: 0.3 }}
                    transition={active
                        ? { duration: 1.0, repeat: Infinity, ease: 'easeInOut', delay: i * 0.11 }
                        : { duration: 0.3 }}
                />
            ))}
        </div>
    );
}

export default function Transmitter() {
    const location = useLocation();
    const navigate = useNavigate();
    const mode = location.state?.mode || 'simple';

    const [textInput, setTextInput] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const { start, startFile, stop, status, logs, progress, isTransmitting, estimateSeconds } = useTransmitter();

    const byteCount = new TextEncoder().encode(textInput).length;
    const chunkCount = Math.ceil(byteCount / MAX_PAYLOAD_BYTES);
    const estSecs = textInput.length > 0 ? estimateSeconds(byteCount) : null;

    const handleStart = () => {
        if (mode === 'advanced' && selectedFile) startFile(selectedFile);
        else start(textInput);
    };

    const txLabel =
        status.type === 'handshake' ? 'HANDSHAKE' :
            status.type === 'transmitting' ? `TX ${status.chunk + 1}/${status.totalChunks}` :
                status.type === 'complete' ? 'DONE' :
                    status.type === 'error' ? 'ERROR' : 'IDLE';

    const txDesc =
        status.type === 'handshake' ? 'Broadcasting handshake tones...' :
            status.type === 'transmitting' ? `Transmitting chunk ${status.chunk + 1} of ${status.totalChunks}` :
                status.type === 'complete' ? 'Transmission complete — all packets sent.' :
                    status.type === 'error' ? 'Transmission error.' : 'Ready to transmit.';

    return (
        <div className="w-full max-w-6xl flex flex-col gap-5">

            {/* ── Header bar ──────────────────────────── */}
            <div className="panel px-4 py-3" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center', justifyContent: 'space-between' }}>
                {/* Left: back + divider + title */}
                <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
                    <button
                        onClick={() => navigate('/')}
                        className="btn btn-ghost"
                        style={{ padding: '0.35rem 0.7rem', fontFamily: "'IBM Plex Mono', monospace", flexShrink: 0 }}
                    >
                        <ArrowLeft size={14} /> Back
                    </button>
                    <div style={{ width: 1, height: 28, background: 'var(--color-border)', flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                        <div className="flex items-center gap-2">
                            {/* Live TX indicator */}
                            <span className="relative flex h-2 w-2" style={{ flexShrink: 0 }}>
                                {isTransmitting && <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: 'var(--color-primary)' }} />}
                                <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: isTransmitting ? 'var(--color-primary)' : 'var(--color-border)' }} />
                            </span>
                            <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: '1.2rem', fontWeight: 400, lineHeight: 1, color: 'var(--color-text)', whiteSpace: 'nowrap' }}>
                                Transmitter Node
                            </h1>
                        </div>
                        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.55rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-faint)', marginTop: 3 }}>
                            {mode} · 8-FSK · Web Audio
                        </p>
                    </div>
                </div>

                {/* Right: status badge — wraps below on narrow screens */}
                <AnimatePresence mode="wait">
                    <motion.span
                        key={txLabel}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="badge"
                        style={{
                            fontFamily: "'IBM Plex Mono', monospace",
                            fontSize: '0.58rem',
                            flexShrink: 0,
                            background: isTransmitting ? 'var(--color-primary-glow)' :
                                status.type === 'complete' ? 'rgba(46,125,50,0.1)' : 'transparent',
                            color: isTransmitting ? 'var(--color-primary)' :
                                status.type === 'complete' ? 'var(--color-success)' : 'var(--color-text-faint)',
                            borderColor: isTransmitting ? 'rgba(200,90,0,0.3)' :
                                status.type === 'complete' ? 'rgba(46,125,50,0.3)' : 'var(--color-border)',
                        }}
                    >
                        {txLabel}
                    </motion.span>
                </AnimatePresence>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* ── Left column ─────────────────────── */}
                <div className="lg:col-span-2 flex flex-col gap-5">

                    {/* Payload input panel */}
                    <div className="panel p-5 flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <span className="label" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                                <Zap size={12} style={{ color: 'var(--color-primary)' }} /> Payload Input
                            </span>
                            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.62rem', color: 'var(--color-text-faint)' }}>
                                mode/{mode}
                            </span>
                        </div>

                        {mode === 'simple' ? (
                            <>
                                <textarea
                                    value={textInput}
                                    onChange={e => setTextInput(e.target.value)}
                                    disabled={isTransmitting}
                                    placeholder="Enter text payload to transmit..."
                                    className="field"
                                    style={{ height: 120, resize: 'none', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.8rem' }}
                                />
                                {textInput.length > 0 && (
                                    <div className="flex flex-wrap gap-4" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
                                        <span><span style={{ color: 'var(--color-primary)' }}>{byteCount}</span> bytes</span>
                                        <span><span style={{ color: 'var(--color-primary)' }}>{chunkCount}</span> packets</span>
                                        {estSecs !== null && (
                                            <span className="flex items-center gap-1">
                                                <Clock size={10} />
                                                ~<span style={{ color: 'var(--color-primary)' }}>{fmtDuration(estSecs)}</span>
                                            </span>
                                        )}
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <label className={`flex flex-col items-center justify-center rounded-sm transition-colors ${isTransmitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                    style={{ height: 130, border: '2px dashed var(--color-border)', background: 'var(--color-surface-deep)' }}>
                                    <input type="file" accept="image/*" disabled={isTransmitting} className="sr-only"
                                        onChange={e => { setSelectedFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
                                    {selectedFile ? (
                                        <div className="text-center space-y-1 px-4">
                                            <ImageIcon size={24} style={{ color: 'var(--color-primary)', margin: '0 auto 4px' }} />
                                            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.75rem', color: 'var(--color-text)' }}>{selectedFile.name}</p>
                                            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.62rem', color: 'var(--color-text-muted)' }}>
                                                {(selectedFile.size / 1024).toFixed(1)} KB · {selectedFile.type || 'unknown'}
                                            </p>
                                            {selectedFile.size > MAX_FILE_BYTES && (
                                                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.62rem', color: 'var(--color-danger)' }}>
                                                    Exceeds {MAX_FILE_BYTES / 1024} KB limit
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <>
                                            <Upload size={24} style={{ color: 'var(--color-text-faint)', marginBottom: 8 }} />
                                            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>Click to select an image</p>
                                            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.6rem', color: 'var(--color-text-faint)', marginTop: 4 }}>
                                                Max {MAX_FILE_BYTES / 1024} KB · image/*
                                            </p>
                                        </>
                                    )}
                                </label>
                                {selectedFile && selectedFile.size <= MAX_FILE_BYTES && (
                                    <div className="flex flex-wrap gap-4" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
                                        <span><span style={{ color: 'var(--color-primary)' }}>{selectedFile.size}</span> bytes</span>
                                        <span><span style={{ color: 'var(--color-primary)' }}>{Math.ceil(selectedFile.size / MAX_PAYLOAD_BYTES) + 1}</span> packets</span>
                                        <span className="flex items-center gap-1">
                                            <Clock size={10} />~<span style={{ color: 'var(--color-primary)' }}>{fmtDuration(estimateSeconds(selectedFile.size))}</span>
                                        </span>
                                    </div>
                                )}
                            </>
                        )}

                        {/* FSK map */}
                        <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--color-border-subtle)' }}>
                            <p className="label mb-2" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>8-FSK Symbol Map — 3 bits / symbol</p>
                            <div className="flex gap-1 flex-wrap">
                                {FSK_FREQUENCIES.map((freq, i) => (
                                    <span key={freq} className="badge" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.55rem', background: 'var(--color-surface-deep)', color: 'var(--color-text-muted)', borderColor: 'var(--color-border-subtle)' }}>
                                        {i.toString(2).padStart(3, '0')}={freq}Hz
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-end">
                            {!isTransmitting ? (
                                <button
                                    onClick={handleStart}
                                    disabled={mode === 'advanced' ? !selectedFile || selectedFile.size > MAX_FILE_BYTES : !textInput.trim()}
                                    className="btn btn-primary"
                                    style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                                >
                                    <Play size={14} fill="currentColor" /> INITIALIZE TX
                                </button>
                            ) : (
                                <button onClick={stop} className="btn btn-danger" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                                    <Square size={14} fill="currentColor" /> ABORT
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Signal Output panel */}
                    <div className="panel p-5 flex flex-col gap-5">
                        <div className="flex items-center justify-between">
                            <span className="label" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>Signal Output</span>
                            <SoundWave active={isTransmitting} />
                        </div>

                        {/* Icon with pulsing rings */}
                        <div className="flex flex-col items-center py-4 gap-3">
                            <div className="relative flex items-center justify-center">
                                {isTransmitting && (
                                    <>
                                        <motion.div
                                            className="absolute rounded-full"
                                            style={{ width: 64, height: 64, border: '1px solid var(--color-primary)', opacity: 0.4 }}
                                            animate={{ scale: [1, 1.7], opacity: [0.4, 0] }}
                                            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
                                        />
                                        <motion.div
                                            className="absolute rounded-full"
                                            style={{ width: 64, height: 64, border: '1px solid var(--color-primary)', opacity: 0.25 }}
                                            animate={{ scale: [1, 2.2], opacity: [0.25, 0] }}
                                            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut', delay: 0.55 }}
                                        />
                                    </>
                                )}
                                <div
                                    className="flex items-center justify-center rounded-full"
                                    style={{
                                        width: 64, height: 64,
                                        background: isTransmitting ? 'var(--color-primary-glow)' :
                                            status.type === 'complete' ? 'rgba(46,125,50,0.1)' : 'var(--color-surface-deep)',
                                        border: `1px solid ${isTransmitting ? 'rgba(200,90,0,0.35)' : 'var(--color-border)'}`,
                                        transition: 'all 0.4s',
                                    }}
                                >
                                    {/* SVG antenna icon */}
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                                        strokeLinecap="round" strokeLinejoin="round"
                                        style={{ color: isTransmitting ? 'var(--color-primary)' : status.type === 'complete' ? 'var(--color-success)' : 'var(--color-text-faint)' }}>
                                        <path d="M2 12a10 10 0 0 1 20 0" />
                                        <path d="M6 12a6 6 0 0 1 12 0" />
                                        <path d="M12 12v8" />
                                        <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
                                    </svg>
                                </div>
                            </div>

                            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                                {txDesc}
                            </p>
                        </div>

                        {/* Progress */}
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.65rem' }}>
                                <span style={{ color: 'var(--color-primary)' }}>{Math.floor(progress)}%</span>
                                <span style={{ color: 'var(--color-text-faint)' }}>
                                    {status.type === 'transmitting' && `Chunk ${status.chunk + 1}/${status.totalChunks}`}
                                    {status.type === 'handshake' && 'Handshaking...'}
                                    {status.type === 'complete' && 'Complete ✓'}
                                    {status.type === 'idle' && 'Awaiting payload'}
                                    {status.type === 'error' && 'Error'}
                                </span>
                            </div>
                            <div className="progress-track">
                                <motion.div
                                    className="progress-fill-tx"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    transition={{ ease: 'linear' }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Right column ─────────────────────── */}
                <div className="flex flex-col gap-5">

                    {/* Telemetry panel */}
                    <div className="panel p-5 flex flex-col gap-4">
                        <span className="label" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>Telemetry</span>
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                { label: 'Modulation', value: '8-FSK' },
                                { label: 'Symbol Rate', value: '80ms/sym' },
                                { label: 'Freq. Range', value: '1.4–4.2kHz' },
                                { label: 'Bitrate', value: '~37bps' },
                            ].map(({ label, value }) => (
                                <div key={label} className="stat-tile">
                                    <p className="stat-label">{label}</p>
                                    <p className="stat-value" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.85rem' }}>{value}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Log panel */}
                    <div className="panel p-4 flex flex-col gap-3 flex-grow" style={{ minHeight: 320 }}>
                        <span className="label" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>Output Log</span>
                        <div className="console-area flex-grow" style={{ minHeight: 260 }}>
                            <AnimatePresence>
                                {logs.length === 0 ? (
                                    <p style={{ color: 'rgba(138,128,112,0.4)', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.65rem', paddingTop: '2rem', textAlign: 'center' }}>
                                        Awaiting runtime commands...
                                    </p>
                                ) : logs.map(log => (
                                    <motion.div
                                        key={log.id}
                                        initial={{ opacity: 0, x: -6 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className={`flex gap-2 ${log.type === 'error' ? 'log-error' : log.type === 'warning' ? 'log-warning' : log.type === 'success' ? 'log-success' : 'log-default'}`}
                                        style={{ marginBottom: '0.3rem', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.65rem' }}
                                    >
                                        <span style={{ opacity: 0.45, flexShrink: 0 }}>[{log.time}]</span>
                                        <span>{log.msg}</span>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
