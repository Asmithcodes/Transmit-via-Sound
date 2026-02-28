import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import DecryptedText from '../components/TextAnimations/DecryptedText';

const fadeUp = (delay = 0) => ({
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, ease: 'easeOut' as const, delay },
});

export default function Landing() {
    const navigate = useNavigate();

    return (
        <div className="w-full max-w-4xl flex flex-col gap-16 items-center text-center mt-10">
            {/* ── Hero Section ─────────────────────────────── */}
            <motion.div {...fadeUp(0.05)} className="space-y-8">
                <p className="label" style={{ fontFamily: "'IBM Plex Mono', monospace", color: 'var(--color-primary)', letterSpacing: '0.16em' }}>
                    ◈ INITIATE TRANSMISSION
                </p>

                <h1
                    style={{
                        fontFamily: "'DM Serif Display', Georgia, serif",
                        fontSize: 'clamp(3rem, 6vw, 6rem)',
                        fontWeight: 400,
                        lineHeight: 1.05,
                        letterSpacing: '-0.01em',
                        color: 'var(--color-text)',
                    }}
                >
                    <DecryptedText
                        text="Data transmission without the network."
                        speed={35}
                        maxIterations={12}
                        animateOn="view"
                        revealDirection="center"
                    />
                </h1>

                <p
                    style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: '1rem',
                        color: 'var(--color-text-muted)',
                        maxWidth: '56ch',
                        margin: '0 auto',
                        lineHeight: 1.6
                    }}
                >
                    Establish a secure, air-gapped peer-to-peer connection using purely acoustic FSK (Frequency-Shift Keying). No Wi-Fi. No Bluetooth. Just sound.
                </p>
            </motion.div>

            {/* ── Launch CTA ─────────────────────────────── */}
            <motion.div {...fadeUp(0.2)}>
                <button
                    onClick={() => navigate('/dashboard')}
                    className="btn group relative overflow-hidden flex items-center justify-center"
                    style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: '1rem',
                        padding: '1.25rem 3rem',
                        background: 'var(--color-primary)',
                        color: 'var(--color-background)',
                        border: 'none',
                        boxShadow: '0 8px 32px var(--color-primary-glow)',
                        cursor: 'pointer',
                        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 12px 48px var(--color-primary-glow)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 8px 32px var(--color-primary-glow)';
                    }}
                >
                    <span className="relative z-10 font-semibold tracking-wider flex items-center gap-2">
                        ENTER DASHBOARD
                        <motion.span
                            initial={{ x: 0 }}
                            whileHover={{ x: 5 }}
                            transition={{ duration: 0.2 }}
                        >
                            →
                        </motion.span>
                    </span>
                    <div
                        className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-300"
                    />
                </button>
            </motion.div>

            {/* ── Features Grid ───────────────────────────── */}
            <motion.div {...fadeUp(0.3)} className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10 w-full text-left">
                {[
                    { title: "AIR-GAPPED", desc: "True physical isolation. Data crosses only the acoustic space between devices.", color: "var(--color-primary)" },
                    { title: "STEALTHY P2P", desc: "Leaves no digital footprint. Secure and purely peer-to-peer audio transmission.", color: "var(--color-accent)" },
                    { title: "AUDIO FSK", desc: "Leverages multi-frequency shifting to encode payloads directly into soundwaves.", color: "var(--color-text)" },
                ].map((feature, i) => (
                    <div key={i} className="panel p-6 flex flex-col gap-3 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-[2px]" style={{ background: feature.color, opacity: 0.6 }} />
                        <h3 className="label" style={{ fontFamily: "'IBM Plex Mono', monospace", color: feature.color, letterSpacing: '0.05em' }}>
                            {feature.title}
                        </h3>
                        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.8rem', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                            {feature.desc}
                        </p>
                    </div>
                ))}
            </motion.div>
        </div>
    );
}
