import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    Radio, ArrowLeft, Play, Square,
    Settings, FileBox as FileBoxIcon, Activity, Terminal, Clock, Zap, Upload, ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTransmitter } from '../hooks/useTransmitter';
import { FSK_FREQUENCIES, MAX_PAYLOAD_BYTES, MAX_FILE_BYTES } from '../services/protocol';

/** Human-friendly duration string: “8s” / “3m 12s” / “1h 4m” */
function fmtDuration(s: number): string {
    if (s < 60) return `${Math.round(s)}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
    return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
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
        if (mode === 'advanced' && selectedFile) {
            startFile(selectedFile);
        } else {
            start(textInput);
        }
    };

    return (
        <div className="w-full max-w-6xl flex flex-col gap-6">
            {/* Header */}
            <div className="flex items-center justify-between glass-panel p-4 px-6 border-white/5 bg-black/40">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/')}
                        className="p-2 rounded-full hover:bg-white/10 text-textMuted hover:text-white transition-colors"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold flex items-center gap-2">
                            <Radio className="text-primary" size={20} />
                            Transmitter Node
                        </h1>
                        <p className="text-xs text-textMuted font-mono opacity-80 uppercase tracking-widest">
                            Mode: {mode} · 8-FSK · Real Audio Engine
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono text-primary/80">
                    <span className="relative flex h-2 w-2">
                        {isTransmitting && (
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                        )}
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${isTransmitting ? 'bg-primary' : 'bg-textMuted'}`} />
                    </span>
                    {status.type === 'handshake' ? 'HANDSHAKE' : isTransmitting ? 'ACTIVE' : status.type === 'complete' ? 'DONE' : 'IDLE'}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Input & Actions */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="glass-panel p-6 border-white/5 space-y-4">
                        <h2 className="text-sm font-bold tracking-widest text-textMuted uppercase flex items-center gap-2">
                            <FileBoxIcon size={16} /> Payload Input
                        </h2>

                        {mode === 'simple' ? (
                            <>
                                <textarea
                                    value={textInput}
                                    onChange={e => setTextInput(e.target.value)}
                                    disabled={isTransmitting}
                                    placeholder="Enter text payload to transmit via acoustic FSK..."
                                    className="w-full h-32 glass-input resize-none font-mono text-sm disabled:opacity-50"
                                />
                                {textInput.length > 0 && (
                                    <div className="flex flex-wrap gap-4 text-xs font-mono text-textMuted">
                                        <span><span className="text-primary">{byteCount}</span> bytes</span>
                                        <span><span className="text-primary">{chunkCount}</span> packets</span>
                                        {estSecs !== null && (
                                            <span className="flex items-center gap-1">
                                                <Clock size={12} />
                                                ~<span className="text-primary">{fmtDuration(estSecs)}</span> estimated
                                            </span>
                                        )}
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                {/* File picker — drag & drop or click to browse */}
                                <label
                                    className={`flex flex-col items-center justify-center h-36 rounded-xl border-2 border-dashed transition-colors ${
                                        isTransmitting
                                            ? 'opacity-50 cursor-not-allowed border-white/10'
                                            : 'border-white/20 hover:border-primary/60 hover:bg-primary/5 cursor-pointer'
                                    }`}
                                >
                                    <input
                                        type="file"
                                        accept="image/*"
                                        disabled={isTransmitting}
                                        className="sr-only"
                                        onChange={e => {
                                            setSelectedFile(e.target.files?.[0] ?? null);
                                            e.target.value = '';
                                        }}
                                    />
                                    {selectedFile ? (
                                        <div className="text-center space-y-1 px-4">
                                            <ImageIcon size={28} className="text-primary mx-auto mb-1" />
                                            <p className="text-sm font-mono text-white truncate max-w-xs">{selectedFile.name}</p>
                                            <p className="text-xs text-textMuted">
                                                {(selectedFile.size / 1024).toFixed(1)} KB &middot; {selectedFile.type || 'unknown'}
                                            </p>
                                            {selectedFile.size > MAX_FILE_BYTES && (
                                                <p className="text-xs text-danger">Exceeds {MAX_FILE_BYTES / 1024} KB limit</p>
                                            )}
                                        </div>
                                    ) : (
                                        <>
                                            <Upload size={28} className="text-textMuted mb-2" />
                                            <p className="text-sm text-textMuted">Click to select an image</p>
                                            <p className="text-[11px] text-textMuted/50 mt-1">Max {MAX_FILE_BYTES / 1024} KB &middot; image/*</p>
                                        </>
                                    )}
                                </label>

                                {selectedFile && selectedFile.size <= MAX_FILE_BYTES && (
                                    <div className="flex flex-wrap gap-4 text-xs font-mono text-textMuted">
                                        <span><span className="text-primary">{selectedFile.size}</span> bytes</span>
                                        <span><span className="text-primary">{Math.ceil(selectedFile.size / MAX_PAYLOAD_BYTES) + 1}</span> packets (incl. metadata)</span>
                                        <span className="flex items-center gap-1">
                                            <Clock size={12} />
                                            ~<span className="text-primary">{fmtDuration(estimateSeconds(selectedFile.size))}</span> estimated
                                        </span>
                                    </div>
                                )}
                            </>
                        )}

                        {/* FSK frequency legend */}
                        <div className="pt-2 border-t border-white/5">
                            <p className="text-[10px] text-textMuted uppercase tracking-widest mb-2">
                                <Zap size={10} className="inline mr-1" />
                                8-FSK Symbol Map (3 bits / symbol)
                            </p>
                            <div className="flex gap-1 flex-wrap">
                                {FSK_FREQUENCIES.map((freq, i) => (
                                    <span
                                        key={freq}
                                        className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/40 border border-white/10 text-textMuted"
                                    >
                                        {i.toString(2).padStart(3, '0')} = {freq}Hz
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-end pt-2">
                            {!isTransmitting ? (
                                <button
                                    onClick={handleStart}
                                    disabled={
                                        mode === 'advanced'
                                            ? !selectedFile || selectedFile.size > MAX_FILE_BYTES
                                            : !textInput.trim()
                                    }
                                    className="glass-button bg-primary text-black hover:bg-primary/90 flex items-center gap-2 font-bold shadow-[0_0_15px_rgba(124,255,103,0.2)] disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <Play size={18} fill="currentColor" /> Initialize Transmission
                                </button>
                            ) : (
                                <button
                                    onClick={stop}
                                    className="glass-button bg-danger/20 text-danger border-danger/30 hover:bg-danger/30 flex items-center gap-2 font-bold"
                                >
                                    <Square size={18} fill="currentColor" /> Abort Transfer
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Visualizer & Progress */}
                    <div className="glass-panel p-6 border-white/5 space-y-6 overflow-hidden relative min-h-[200px] flex flex-col justify-end">
                        <div className="absolute top-6 left-6 text-sm font-bold tracking-widest text-textMuted uppercase flex items-center gap-2">
                            <Activity size={16} /> Signal Output
                        </div>

                        {/* Animated waveform — driven by real isTransmitting state */}
                        <div className="h-24 w-full flex items-end justify-between gap-[2px] opacity-80">
                            {Array.from({ length: 60 }).map((_, i) => (
                                <motion.div
                                    key={i}
                                    animate={{
                                        height: isTransmitting ? `${Math.random() * 80 + 20}%` : '5%',
                                        backgroundColor: isTransmitting ? '#7cff67' : (status.type === 'complete' ? '#7cff67' : '#333'),
                                    }}
                                    transition={{
                                        duration: 0.2,
                                        repeat: isTransmitting ? Infinity : 0,
                                        repeatType: 'reverse',
                                        delay: i * 0.02,
                                    }}
                                    className="w-full rounded-t-sm"
                                />
                            ))}
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between text-xs font-mono">
                                <span className="text-primary">{Math.floor(progress)}%</span>
                                <span className="text-textMuted">
                                    {status.type === 'handshake' && 'Broadcasting handshake...'}
                                    {status.type === 'transmitting' && `Chunk ${status.chunk + 1} / ${status.totalChunks}`}
                                    {status.type === 'complete' && 'Transmission Complete ✓'}
                                    {status.type === 'idle' && 'Idle'}
                                    {status.type === 'error' && 'Error'}
                                </span>
                            </div>
                            <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden border border-white/10">
                                <motion.div
                                    className="h-full bg-primary shadow-[0_0_10px_rgba(124,255,103,0.8)]"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    transition={{ ease: 'linear' }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Telemetry & Logs */}
                <div className="space-y-6 flex flex-col h-full">
                    <div className="glass-panel p-6 border-white/5 space-y-4">
                        <h2 className="text-sm font-bold tracking-widest text-textMuted uppercase flex items-center gap-2 mb-4">
                            <Settings size={16} /> Telemetry
                        </h2>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 bg-black/30 rounded-xl border border-white/5">
                                <p className="text-[10px] text-textMuted uppercase tracking-wider mb-1">Modulation</p>
                                <p className="text-sm font-mono text-white">8-FSK</p>
                            </div>
                            <div className="p-3 bg-black/30 rounded-xl border border-white/5">
                                <p className="text-[10px] text-textMuted uppercase tracking-wider mb-1">Symbol Rate</p>
                                <p className="text-lg font-mono text-white">
                                    80 <span className="text-xs text-textMuted">ms/sym</span>
                                </p>
                            </div>
                            <div className="p-3 bg-black/30 rounded-xl border border-white/5">
                                <p className="text-[10px] text-textMuted uppercase tracking-wider mb-1">Freq. Range</p>
                                <p className="text-lg font-mono text-white">
                                    1.4–4.2 <span className="text-xs text-textMuted">kHz</span>
                                </p>
                            </div>
                            <div className="p-3 bg-black/30 rounded-xl border border-white/5">
                                <p className="text-[10px] text-textMuted uppercase tracking-wider mb-1">Bitrate</p>
                                <p className="text-lg font-mono text-white">
                                    ~37 <span className="text-xs text-textMuted">bps</span>
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Output Log */}
                    <div className="glass-panel p-4 border-white/5 flex-grow flex flex-col overflow-hidden min-h-[300px]">
                        <h2 className="text-sm font-bold tracking-widest text-textMuted uppercase flex items-center gap-2 mb-4 shrink-0">
                            <Terminal size={16} /> Output Log
                        </h2>
                        <div className="flex-grow bg-black/40 rounded-xl border border-white/5 p-3 overflow-y-auto space-y-2 font-mono text-[11px]">
                            <AnimatePresence>
                                {logs.length === 0 ? (
                                    <p className="text-textMuted/50 text-center pt-10 pb-10">Awaiting runtime commands...</p>
                                ) : (
                                    logs.map(log => (
                                        <motion.div
                                            key={log.id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            className={`flex gap-2 ${log.type === 'error' ? 'text-danger' :
                                                log.type === 'warning' ? 'text-warning' :
                                                    log.type === 'success' ? 'text-primary' :
                                                        'text-textMuted'
                                                }`}
                                        >
                                            <span className="opacity-50 shrink-0">[{log.time}]</span>
                                            <span>{log.msg}</span>
                                        </motion.div>
                                    ))
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
