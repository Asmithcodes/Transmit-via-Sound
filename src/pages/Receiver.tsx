import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, CheckCircle, ShieldAlert, FileText, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useReceiver } from '../hooks/useReceiver';

function SoundWave({ active, color }: { active: boolean; color: string }) {
    const heights = [0.3, 0.55, 0.8, 1.0, 0.8, 0.55, 0.3];
    return (
        <div className="flex items-center gap-[4px]" style={{ height: 28 }}>
            {heights.map((scale, i) => (
                <motion.span
                    key={i}
                    style={{ width: 3, borderRadius: 2, background: color }}
                    animate={active
                        ? { height: [4, 26 * scale, 4], opacity: [0.5, 1, 0.5] }
                        : { height: 3, opacity: 0.25 }}
                    transition={active
                        ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.13 }
                        : { duration: 0.3 }}
                />
            ))}
        </div>
    );
}

export default function Receiver() {
    const location = useLocation();
    const navigate = useNavigate();
    const mode = location.state?.mode || 'simple';

    const {
        start, stop, status, logs, progress,
        isListening, isDecoding, isComplete, decodedText, fileResult,
    } = useReceiver();

    const toggleListen = () => isListening ? stop() : start();

    const copyToClipboard = () => { if (decodedText) navigator.clipboard.writeText(decodedText); };

    const downloadAsText = () => {
        const blob = new Blob([decodedText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `acoustic-payload-${Date.now()}.txt`; a.click();
        URL.revokeObjectURL(url);
    };

    const downloadAsFile = () => {
        if (!fileResult) return;
        const a = document.createElement('a');
        a.href = fileResult.url; a.download = fileResult.name || `acoustic-file-${Date.now()}`; a.click();
    };

    const rxLabel =
        status.type === 'listening' ? 'LISTENING' :
            status.type === 'syncing' ? 'SYNCING' :
                status.type === 'receiving' ? 'DECODING' :
                    status.type === 'complete' ? 'DONE' :
                        status.type === 'error' ? 'ERROR' : 'IDLE';

    const rxDesc =
        isDecoding && status.type === 'receiving' ? `Packet ${status.chunk} / ${status.totalChunks}` :
            status.type === 'syncing' ? 'Handshake detected — locking preamble...' :
                isListening ? 'Scanning for FSK handshake tones...' :
                    'Microphone offline. Activate to begin.';

    // accent colour switches from teal (listening) to amber (decoding)
    const accentColor = isDecoding ? 'var(--color-primary)' : 'var(--color-accent)';
    const accentGlow = isDecoding ? 'var(--color-primary-glow)' : 'var(--color-accent-glow)';

    return (
        <div className="w-full max-w-6xl flex flex-col gap-5">

            {/* ── Header bar ──────────────────────────── */}
            <div className="panel flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/')} className="btn btn-ghost"
                        style={{ padding: '0.35rem 0.7rem', fontFamily: "'IBM Plex Mono', monospace" }}>
                        <ArrowLeft size={14} /> Back
                    </button>
                    <div style={{ width: 1, height: 32, background: 'var(--color-border)' }} />
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                                {(isListening || isDecoding) && <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: accentColor }} />}
                                <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: (isListening || isDecoding) ? accentColor : 'var(--color-border)' }} />
                            </span>
                            <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: '1.35rem', fontWeight: 400, lineHeight: 1, color: 'var(--color-text)' }}>
                                Receiver Node
                            </h1>
                        </div>
                        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.58rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-faint)', marginTop: 3 }}>
                            {mode} mode · 8-FSK Decoder · Web Audio API
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <AnimatePresence mode="wait">
                        <motion.span
                            key={rxLabel}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="badge"
                            style={{
                                fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.6rem',
                                background: (isListening || isDecoding) ? accentGlow : 'transparent',
                                color: (isListening || isDecoding) ? accentColor : 'var(--color-text-faint)',
                                borderColor: (isListening || isDecoding) ? (isDecoding ? 'rgba(200,90,0,0.3)' : 'rgba(0,122,107,0.3)') : 'var(--color-border)',
                            }}
                        >
                            {rxLabel}
                        </motion.span>
                    </AnimatePresence>

                    <button
                        onClick={toggleListen}
                        className={`btn ${isListening ? 'btn-danger' : 'btn-accent'}`}
                        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                    >
                        {isListening ? 'STOP' : 'ACTIVATE NODE'}
                    </button>
                </div>
            </div>

            {/* ── Error banner ─────────────────────────── */}
            {status.type === 'error' && (
                <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
                    className="panel flex items-center gap-4 p-4"
                    style={{ borderColor: 'rgba(183,28,28,0.4)', background: 'rgba(183,28,28,0.05)' }}>
                    <ShieldAlert style={{ color: 'var(--color-danger)', flexShrink: 0 }} size={22} />
                    <div>
                        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-danger)' }}>
                            Audio Engine Error
                        </p>
                        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{status.message}</p>
                    </div>
                </motion.div>
            )}

            {/* ── Success banner ───────────────────────── */}
            {isComplete && (
                <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
                    className="panel p-5 flex flex-col gap-4"
                    style={{ borderColor: 'rgba(46,125,50,0.4)', background: 'rgba(46,125,50,0.04)' }}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center justify-center rounded-full" style={{ width: 44, height: 44, background: 'rgba(46,125,50,0.12)', color: 'var(--color-success)' }}>
                                <CheckCircle size={22} />
                            </div>
                            <div>
                                <p style={{ fontFamily: "'DM Serif Display', serif", fontSize: '1.1rem', fontWeight: 400, color: 'var(--color-text)' }}>
                                    {fileResult ? 'File Reconstructed' : 'Payload Reconstructed'}
                                </p>
                                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
                                    {fileResult
                                        ? `CRC32 verified · ${(fileResult.size / 1024).toFixed(1)} KB · ${fileResult.mime}`
                                        : `CRC32 verified · ${decodedText.length} chars decoded`}
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            {!fileResult && (
                                <button onClick={copyToClipboard} className="btn btn-ghost" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.62rem' }}>
                                    <Copy size={12} /> COPY
                                </button>
                            )}
                            <button onClick={fileResult ? downloadAsFile : downloadAsText}
                                className="btn"
                                style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.62rem', background: 'var(--color-text)', color: 'var(--color-background)', borderColor: 'var(--color-text)' }}>
                                <Download size={12} /> DOWNLOAD
                            </button>
                        </div>
                    </div>

                    {fileResult ? (
                        fileResult.mime.startsWith('image/') ? (
                            <img src={fileResult.url} alt={fileResult.name}
                                className="max-h-64 max-w-full rounded mx-auto block object-contain"
                                style={{ border: '1px solid var(--color-border)' }} />
                        ) : (
                            <div className="panel-inset p-4 text-center" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                                {fileResult.name} · {(fileResult.size / 1024).toFixed(1)} KB
                            </div>
                        )
                    ) : (
                        <div className="panel-inset p-4 max-h-32 overflow-y-auto" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.8rem', color: 'var(--color-text)' }}>
                            {decodedText}
                        </div>
                    )}
                </motion.div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* ── Left column ─────────────────────── */}
                <div className="lg:col-span-2 flex flex-col gap-5">

                    {/* Audio Reception panel */}
                    <div className="panel p-5 flex flex-col gap-5">
                        <div className="flex items-center justify-between">
                            <span className="label" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>Audio Reception</span>
                            <SoundWave active={isListening || isDecoding} color={accentColor} />
                        </div>

                        {/* Mic icon with rings */}
                        <div className="flex flex-col items-center py-4 gap-3">
                            <div className="relative flex items-center justify-center">
                                {(isListening || isDecoding) && (
                                    <>
                                        <motion.div className="absolute rounded-full"
                                            style={{ width: 64, height: 64, border: `1px solid ${accentColor}`, opacity: 0.4 }}
                                            animate={{ scale: [1, 1.7], opacity: [0.4, 0] }}
                                            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }} />
                                        <motion.div className="absolute rounded-full"
                                            style={{ width: 64, height: 64, border: `1px solid ${accentColor}`, opacity: 0.25 }}
                                            animate={{ scale: [1, 2.3], opacity: [0.25, 0] }}
                                            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut', delay: 0.6 }} />
                                    </>
                                )}
                                <div className="flex items-center justify-center rounded-full"
                                    style={{
                                        width: 64, height: 64,
                                        background: (isListening || isDecoding) ? accentGlow : 'var(--color-surface-deep)',
                                        border: `1px solid ${(isListening || isDecoding) ? (isDecoding ? 'rgba(200,90,0,0.35)' : 'rgba(0,122,107,0.35)') : 'var(--color-border)'}`,
                                        transition: 'all 0.4s',
                                    }}>
                                    {/* Microphone SVG */}
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                                        strokeLinecap="round" strokeLinejoin="round"
                                        style={{ color: (isListening || isDecoding) ? accentColor : 'var(--color-text-faint)' }}>
                                        <rect x="9" y="2" width="6" height="11" rx="3" />
                                        <path d="M5 10a7 7 0 0 0 14 0" />
                                        <line x1="12" y1="19" x2="12" y2="22" />
                                        <line x1="8" y1="22" x2="16" y2="22" />
                                    </svg>
                                </div>
                            </div>
                            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                                {rxDesc}
                            </p>
                        </div>

                        {/* Progress */}
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.65rem' }}>
                                <span style={{ color: accentColor }}>{Math.floor(progress)}% reconstructed</span>
                                <span style={{ color: 'var(--color-text-faint)' }}>
                                    {isDecoding && status.type === 'receiving' ? `Packet ${status.chunk}/${status.totalChunks}` :
                                        isListening ? 'Awaiting handshake...' : 'Offline'}
                                </span>
                            </div>
                            <div className="progress-track">
                                <motion.div
                                    className={isDecoding ? 'progress-fill-tx' : 'progress-fill-rx'}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    transition={{ ease: 'linear' }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Payload waiting panel */}
                    <div className="panel p-6 flex flex-col items-center justify-center text-center relative overflow-hidden" style={{ minHeight: 180 }}>
                        <div className="absolute inset-0 flex items-center justify-center" style={{ opacity: 0.04 }}>
                            <FileText size={120} style={{ color: 'var(--color-text)' }} />
                        </div>
                        <div className="relative z-10 flex flex-col items-center gap-3">
                            {isComplete ? (
                                <>
                                    <FileText size={36} style={{ color: 'var(--color-success)' }} />
                                    <p style={{ fontFamily: "'DM Serif Display', serif", fontSize: '1.2rem', fontWeight: 400, color: 'var(--color-text)' }}>
                                        {fileResult ? 'File Ready' : 'Payload Ready'}
                                    </p>
                                    <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
                                        {fileResult
                                            ? `${fileResult.name} · ${(fileResult.size / 1024).toFixed(1)} KB · CRC32 OK`
                                            : `${decodedText.length} chars · text/plain · CRC32 OK`}
                                    </p>
                                </>
                            ) : (
                                <>
                                    <ShieldAlert size={36} style={{ color: isListening ? accentColor : 'var(--color-text-faint)', opacity: isListening ? 1 : 0.4 }} />
                                    <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                                        {isListening
                                            ? status.type === 'syncing'
                                                ? 'Handshake detected — syncing preamble...'
                                                : 'Listening · 900Hz / 1050Hz handshake tones'
                                            : 'Awaiting full payload verification'}
                                    </p>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Right column ─────────────────────── */}
                <div className="flex flex-col gap-5">

                    {/* Signal Integrity panel */}
                    <div className="panel p-5 flex flex-col gap-4">
                        <span className="label" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>Signal Integrity</span>
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                { label: 'State', value: rxLabel, accent: isDecoding || isListening },
                                { label: 'FFT Size', value: '8192' },
                                { label: 'Poll Rate', value: '40ms' },
                                { label: 'Packets RX', value: status.type === 'receiving' ? String(status.chunk) : isComplete ? '✓' : '--', accent: isDecoding },
                            ].map(({ label, value, accent }) => (
                                <div key={label} className="stat-tile">
                                    <p className="stat-label">{label}</p>
                                    <p className="stat-value" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.85rem', color: accent ? accentColor : 'var(--color-text)' }}>{value}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Console Log */}
                    <div className="panel p-4 flex flex-col gap-3 flex-grow" style={{ minHeight: 320 }}>
                        <span className="label" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>Console</span>
                        <div className="console-area flex-grow" style={{ minHeight: 260 }}>
                            <AnimatePresence>
                                {logs.length === 0 ? (
                                    <p style={{ color: 'rgba(138,128,112,0.4)', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.65rem', paddingTop: '2rem', textAlign: 'center' }}>
                                        Microphone offline. Awaiting activation...
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
