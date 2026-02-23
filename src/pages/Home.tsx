import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import DecryptedText from '../components/TextAnimations/DecryptedText';

type AppMode = 'simple' | 'advanced';

// Per-element fade-up — explicit props are more reliable than stagger variants across React Router remounts
const fadeUp = (delay = 0) => ({
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, ease: 'easeOut' as const, delay },
});

export default function Home() {
    const navigate = useNavigate();
    const [selectedMode, setSelectedMode] = useState<AppMode>('simple');

    return (
        <div className="w-full max-w-3xl flex flex-col gap-10">

            {/* ── Masthead ─────────────────────────────── */}
            <motion.div {...fadeUp(0.05)} className="space-y-3">
                <p className="label" style={{ fontFamily: "'IBM Plex Mono', monospace", color: 'var(--color-primary)', letterSpacing: '0.16em' }}>
                    ◈ AIR-GAPPED ACOUSTIC LINK
                </p>
                <h1
                    style={{
                        fontFamily: "'DM Serif Display', Georgia, serif",
                        fontSize: 'clamp(2.4rem, 6vw, 4.5rem)',
                        fontWeight: 400,
                        lineHeight: 1.05,
                        letterSpacing: '-0.01em',
                        color: 'var(--color-text)',
                    }}
                >
                    <DecryptedText
                        text="Acoustic Data Link"
                        speed={40}
                        maxIterations={12}
                        animateOn="view"
                        revealDirection="start"
                    />
                </h1>
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.82rem', color: 'var(--color-text-muted)', maxWidth: '36ch' }}>
                    Establish peer-to-peer transmission across an air gap — no network required.
                </p>
            </motion.div>

            {/* ── Divider rule ─────────────────────────── */}
            <motion.div {...fadeUp(0.15)} style={{ height: 1, background: 'var(--color-border)' }} />

            {/* ── Mode selector ────────────────────────── */}
            <motion.div {...fadeUp(0.2)} className="flex flex-col gap-2">
                <span className="label" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>Transmission Mode</span>
                <div className="flex gap-2">
                    {(['simple', 'advanced'] as AppMode[]).map(m => (
                        <button
                            key={m}
                            onClick={() => setSelectedMode(m)}
                            className="btn"
                            style={{
                                fontFamily: "'IBM Plex Mono', monospace",
                                background: selectedMode === m ? 'var(--color-text)' : 'transparent',
                                color: selectedMode === m ? 'var(--color-background)' : 'var(--color-text-muted)',
                                borderColor: selectedMode === m ? 'var(--color-text)' : 'var(--color-border)',
                                transition: 'all 0.2s',
                            }}
                        >
                            {m === 'simple' ? '01 / SIMPLE' : '02 / ADVANCED'}
                        </button>
                    ))}
                </div>
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: 'var(--color-text-faint)', marginTop: '0.25rem' }}>
                    {selectedMode === 'simple'
                        ? 'Text payload only. Ideal for short messages.'
                        : 'Image file transfer. Supports up to 100 KB.'}
                </p>
            </motion.div>

            {/* ── Node cards ───────────────────────────── */}
            <motion.div {...fadeUp(0.3)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* TX Card */}
                <motion.button
                    whileHover={{ y: -3, boxShadow: '0 8px 32px var(--color-primary-glow)' }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate('/transmit', { state: { mode: selectedMode } })}
                    className="panel text-left p-6 flex flex-col gap-6 relative overflow-hidden group"
                    style={{ cursor: 'pointer', minHeight: 200 }}
                >
                    <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: 'var(--color-primary)' }} />

                    <div className="flex items-start justify-between pl-4">
                        <div>
                            <p className="label mb-2" style={{ fontFamily: "'IBM Plex Mono', monospace", color: 'var(--color-primary)' }}>
                                NODE / TX
                            </p>
                            <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: '2rem', lineHeight: 1, color: 'var(--color-text)', fontWeight: 400 }}>
                                Transmit
                            </h2>
                        </div>
                        <span
                            style={{
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontSize: '4rem',
                                fontWeight: 700,
                                color: 'var(--color-primary)',
                                opacity: 0.08,
                                lineHeight: 1,
                                userSelect: 'none',
                                transition: 'opacity 0.3s',
                            }}
                            className="group-hover:opacity-[0.16]"
                        >
                            TX
                        </span>
                    </div>

                    <p className="pl-4" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.72rem', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                        Broadcast data from this device via multi-frequency FSK audio signals.
                    </p>

                    <div className="pl-4 flex items-center gap-2">
                        <span className="badge" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.55rem', background: 'var(--color-primary-glow)', color: 'var(--color-primary)', borderColor: 'rgba(200,90,0,0.25)' }}>
                            ENCODE → AUDIO
                        </span>
                    </div>
                </motion.button>

                {/* RX Card */}
                <motion.button
                    whileHover={{ y: -3, boxShadow: '0 8px 32px var(--color-accent-glow)' }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate('/receive', { state: { mode: selectedMode } })}
                    className="panel text-left p-6 flex flex-col gap-6 relative overflow-hidden group"
                    style={{ cursor: 'pointer', minHeight: 200 }}
                >
                    <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: 'var(--color-accent)' }} />

                    <div className="flex items-start justify-between pl-4">
                        <div>
                            <p className="label mb-2" style={{ fontFamily: "'IBM Plex Mono', monospace", color: 'var(--color-accent)' }}>
                                NODE / RX
                            </p>
                            <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: '2rem', lineHeight: 1, color: 'var(--color-text)', fontWeight: 400 }}>
                                Receive
                            </h2>
                        </div>
                        <span
                            style={{
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontSize: '4rem',
                                fontWeight: 700,
                                color: 'var(--color-accent)',
                                opacity: 0.08,
                                lineHeight: 1,
                                userSelect: 'none',
                                transition: 'opacity 0.3s',
                            }}
                            className="group-hover:opacity-[0.16]"
                        >
                            RX
                        </span>
                    </div>

                    <p className="pl-4" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.72rem', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                        Listen for incoming FSK sequences and reconstruct the transmitted payload.
                    </p>

                    <div className="pl-4 flex items-center gap-2">
                        <span className="badge" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.55rem', background: 'var(--color-accent-glow)', color: 'var(--color-accent)', borderColor: 'rgba(0,122,107,0.25)' }}>
                            AUDIO → DECODE
                        </span>
                    </div>
                </motion.button>
            </motion.div>

            {/* ── Info strip ───────────────────────────── */}
            <motion.div
                {...fadeUp(0.4)}
                className="panel-inset flex items-start gap-4 p-4"
            >
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '1rem', color: 'var(--color-primary)', marginTop: '0.1rem' }}>!</span>
                <div>
                    <p className="label mb-1" style={{ fontFamily: "'IBM Plex Mono',monospace" }}>System Limitations</p>
                    <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: 'var(--color-text-muted)', lineHeight: 1.7 }}>
                        Acoustic link operates at 37–200 bps. Keep devices close and ensure a quiet environment. Bit errors are normal at distance.
                    </p>
                </div>
            </motion.div>
        </div>
    );
}
