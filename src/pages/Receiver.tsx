import { useLocation, useNavigate } from 'react-router-dom';
import {
    Mic, ArrowLeft, Download, CheckCircle, ShieldAlert,
    Activity, FileText, Settings, Terminal, Copy
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useReceiver } from '../hooks/useReceiver';
import { FSK_FREQUENCIES } from '../services/protocol';

export default function Receiver() {
    const location = useLocation();
    const navigate = useNavigate();
    const mode = location.state?.mode || 'simple';

    const {
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
    } = useReceiver();

    const toggleListen = () => {
        if (isListening) {
            stop();
        } else {
            start();
        }
    };

    const copyToClipboard = () => {
        if (decodedText) navigator.clipboard.writeText(decodedText);
    };

    const downloadAsText = () => {
        const blob = new Blob([decodedText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `acoustic-payload-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const downloadAsFile = () => {
        if (!fileResult) return;
        const a = document.createElement('a');
        a.href = fileResult.url;
        // Don't revoke the URL here: the image preview still needs it
        a.download = fileResult.name || `acoustic-file-${Date.now()}`;
        a.click();
    };

    // Current microphone permission / status label text
    const getStatusLabel = () => {
        switch (status.type) {
            case 'listening': return 'LISTENING';
            case 'syncing': return 'SYNCING';
            case 'receiving': return 'DECODING';
            case 'complete': return 'DONE';
            case 'error': return 'ERROR';
            default: return 'IDLE';
        }
    };
    const statusColor = isDecoding ? 'text-primary' : isListening ? 'text-accent' : 'text-textMuted';
    const dotColor = isDecoding ? 'bg-primary' : isListening ? 'bg-accent' : 'bg-textMuted';

    return (
        <div className="w-full max-w-6xl flex flex-col gap-6 relative">
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
                            <Mic className="text-accent" size={20} />
                            Receiver Node
                        </h1>
                        <p className="text-xs text-textMuted font-mono opacity-80 uppercase tracking-widest">
                            Mode: {mode} · 8-FSK Decoder · Web Audio API
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className={`flex items-center gap-2 text-xs font-mono ${statusColor}`}>
                        <span className="relative flex h-2 w-2">
                            {(isListening || isDecoding) && (
                                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dotColor} opacity-75`} />
                            )}
                            <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor}`} />
                        </span>
                        {getStatusLabel()}
                    </div>
                    <button
                        onClick={toggleListen}
                        className={`glass-button text-xs py-1.5 px-4 font-bold border ${isListening
                            ? 'bg-danger/10 text-danger border-danger/30 hover:bg-danger/20'
                            : 'bg-accent/20 text-accent border-accent/30 hover:bg-accent/30'
                            }`}
                    >
                        {isListening ? 'STOP LISTENING' : 'ACTIVATE NODE'}
                    </button>
                </div>
            </div>

            {/* Error banner */}
            {status.type === 'error' && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="glass-panel p-4 border-danger/30 bg-danger/5 flex items-center gap-4"
                >
                    <ShieldAlert className="text-danger shrink-0" size={24} />
                    <div>
                        <p className="text-sm font-medium text-danger">Audio Engine Error</p>
                        <p className="text-xs text-textMuted">{status.message}</p>
                    </div>
                </motion.div>
            )}

            {/* Success banner — adapts for text vs binary file */}
            {isComplete && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="glass-panel p-6 border-primary/30 bg-primary/5 space-y-4"
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-primary/20 text-primary rounded-full flex items-center justify-center">
                                <CheckCircle size={24} />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white">
                                    {fileResult ? 'File Reconstructed' : 'Payload Reconstructed'}
                                </h2>
                                <p className="text-sm text-textMuted">
                                    {fileResult
                                        ? `CRC32 verified · ${(fileResult.size / 1024).toFixed(1)} KB · ${fileResult.mime}`
                                        : `CRC32 integrity verified. ${decodedText.length} characters decoded.`}
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            {!fileResult && (
                                <button
                                    onClick={copyToClipboard}
                                    className="glass-button text-xs py-1.5 px-3 flex items-center gap-1"
                                >
                                    <Copy size={14} /> Copy
                                </button>
                            )}
                            <button
                                onClick={fileResult ? downloadAsFile : downloadAsText}
                                className="glass-button bg-white text-black hover:bg-white/90 flex items-center gap-2 font-bold text-xs"
                            >
                                <Download size={14} /> Download
                            </button>
                        </div>
                    </div>
                    {fileResult ? (
                        fileResult.mime.startsWith('image/') ? (
                            <img
                                src={fileResult.url}
                                alt={fileResult.name}
                                className="max-h-64 max-w-full rounded-xl border border-white/10 mx-auto block object-contain"
                            />
                        ) : (
                            <div className="bg-black/40 rounded-xl border border-white/10 p-4 font-mono text-sm text-textMuted text-center">
                                {fileResult.name} · {(fileResult.size / 1024).toFixed(1)} KB
                            </div>
                        )
                    ) : (
                        <div className="bg-black/40 rounded-xl border border-white/10 p-4 font-mono text-sm text-primary/90 max-h-32 overflow-y-auto">
                            {decodedText}
                        </div>
                    )}
                </motion.div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Spectrum Visualizer */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="glass-panel p-6 border-white/5 space-y-6 relative min-h-[300px] flex flex-col justify-end overflow-hidden">
                        <div className="absolute top-6 left-6 text-sm font-bold tracking-widest text-textMuted uppercase flex items-center gap-2">
                            <Activity size={16} /> Microphone Spectrum
                            {isListening && !isDecoding && <span className="text-accent/70">(Scanning...)</span>}
                            {isDecoding && <span className="text-primary/70">(Decoding FSK Symbols...)</span>}
                        </div>

                        {/* FSK frequency markers — shows which bins are "active" for 8-FSK */}
                        <div className="absolute top-12 right-6 flex flex-col gap-1">
                            {FSK_FREQUENCIES.slice(0, 4).map((f) => (
                                <span key={f} className="text-[9px] font-mono text-textMuted/50">{f}Hz</span>
                            ))}
                        </div>

                        {/* Animated spectrum bars */}
                        <div className="h-40 w-full flex items-end justify-between gap-[2px] opacity-80">
                            {Array.from({ length: 80 }).map((_, i) => {
                                const isCenter = i > 30 && i < 50; // approximates FSK band
                                return (
                                    <motion.div
                                        key={i}
                                        animate={{
                                            height: isListening
                                                ? (isDecoding && isCenter)
                                                    ? `${Math.random() * 60 + 40}%`
                                                    : `${Math.random() * 20 + 5}%`
                                                : '5%',
                                            backgroundColor: isDecoding && isCenter
                                                ? '#7cff67'
                                                : isListening
                                                    ? '#5227FF'
                                                    : '#333',
                                        }}
                                        transition={{
                                            duration: 0.15,
                                            repeat: isListening ? Infinity : 0,
                                            repeatType: 'reverse',
                                            delay: i * 0.01,
                                        }}
                                        className="w-full rounded-t-sm"
                                    />
                                );
                            })}
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between text-xs font-mono">
                                <span className="text-accent">{Math.floor(progress)}% reconstructed</span>
                                <span className="text-textMuted">
                                    {isDecoding && status.type === 'receiving'
                                        ? `Packet ${status.chunk} / ${status.totalChunks}`
                                        : isListening
                                            ? 'Awaiting handshake tones...'
                                            : 'Requires Signal'}
                                </span>
                            </div>
                            <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden border border-white/10">
                                <motion.div
                                    className="h-full bg-accent shadow-[0_0_10px_rgba(82,39,255,0.8)]"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    transition={{ ease: 'linear' }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Payload preview / waiting panel */}
                    <div className="glass-panel p-6 border-white/5 h-48 overflow-hidden relative">
                        <div className="absolute inset-0 flex items-center justify-center opacity-10">
                            <FileText size={120} />
                        </div>
                        <div className="relative z-10 flex flex-col items-center justify-center h-full text-center space-y-2">
                            {isComplete ? (
                                <>
                                    <FileText size={40} className="text-primary" />
                                    <p className="text-lg font-medium">
                                        {fileResult ? 'File Ready' : 'Payload Ready'}
                                    </p>
                                    <p className="text-xs text-textMuted font-mono">
                                        {fileResult
                                            ? `${fileResult.name} · ${(fileResult.size / 1024).toFixed(1)} KB · CRC32 OK`
                                            : `${decodedText.length} chars · text/plain · CRC32 OK`}
                                    </p>
                                </>
                            ) : (
                                <>
                                    <ShieldAlert size={40} className="text-warning/50 mb-2" />
                                    <p className="text-textMuted font-mono text-sm">
                                        {isListening
                                            ? status.type === 'syncing'
                                                ? 'Handshake A detected — locking on B...'
                                                : 'Listening for FSK handshake (900Hz / 1050Hz)...'
                                            : 'Waiting for full payload verification...'}
                                    </p>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Telemetry & Logs */}
                <div className="space-y-6 flex flex-col h-full">
                    <div className="glass-panel p-6 border-white/5 space-y-4">
                        <h2 className="text-sm font-bold tracking-widest text-textMuted uppercase flex items-center gap-2 mb-4">
                            <Settings size={16} /> Signal Integrity
                        </h2>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 bg-black/30 rounded-xl border border-white/5">
                                <p className="text-[10px] text-textMuted uppercase tracking-wider mb-1">State</p>
                                <p className={`text-sm font-mono ${isDecoding ? 'text-primary' : 'text-white'}`}>
                                    {getStatusLabel()}
                                </p>
                            </div>
                            <div className="p-3 bg-black/30 rounded-xl border border-white/5">
                                <p className="text-[10px] text-textMuted uppercase tracking-wider mb-1">FFT Size</p>
                                <p className="text-lg font-mono text-white">8192</p>
                            </div>
                            <div className="p-3 bg-black/30 rounded-xl border border-white/5">
                                <p className="text-[10px] text-textMuted uppercase tracking-wider mb-1">Poll Rate</p>
                                <p className="text-lg font-mono text-white">
                                    40 <span className="text-xs text-textMuted">ms</span>
                                </p>
                            </div>
                            <div className="p-3 bg-black/30 rounded-xl border border-white/5">
                                <p className="text-[10px] text-textMuted uppercase tracking-wider mb-1">Packets RX</p>
                                <p className={`text-lg font-mono ${isDecoding ? 'text-primary' : 'text-white'}`}>
                                    {status.type === 'receiving' ? status.chunk : isComplete ? '✓' : '--'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Console Log */}
                    <div className="glass-panel p-4 border-white/5 flex-grow flex flex-col overflow-hidden min-h-[300px]">
                        <h2 className="text-sm font-bold tracking-widest text-textMuted uppercase flex items-center gap-2 mb-4 shrink-0">
                            <Terminal size={16} /> Console
                        </h2>
                        <div className="flex-grow bg-black/40 rounded-xl border border-white/5 p-3 overflow-y-auto space-y-2 font-mono text-[11px]">
                            <AnimatePresence>
                                {logs.length === 0 ? (
                                    <p className="text-textMuted/50 text-center pt-10 pb-10">
                                        Microphone offline. Awaiting activation...
                                    </p>
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
