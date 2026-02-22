import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, Mic, Info, Settings2 } from 'lucide-react';
import { motion } from 'framer-motion';
import DecryptedText from '../components/TextAnimations/DecryptedText';

type AppMode = 'simple' | 'advanced';

export default function Home() {
    const navigate = useNavigate();
    const [selectedMode, setSelectedMode] = useState<AppMode>('simple');

    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-4xl flex flex-col items-center gap-12"
        >
            <div className="text-center space-y-4">
                <h1 className="text-4xl md:text-6xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60">
                    <DecryptedText
                        text="Acoustic Data Link"
                        speed={50}
                        maxIterations={15}
                        animateOn="view"
                        revealDirection="start"
                    />
                </h1>
                <p className="text-textMuted text-lg md:text-xl font-mono">
                    Establish an air-gapped peer-to-peer transmission.
                </p>
            </div>

            <div className="glass-panel p-2 flex bg-black/40 rounded-full border border-white/5 relative">
                <motion.div
                    layoutId="mode-selector"
                    className="absolute inset-y-2 rounded-full bg-surfaceHighlight border border-white/10"
                    style={{
                        width: 'calc(50% - 8px)',
                        left: selectedMode === 'simple' ? '8px' : 'calc(50%)'
                    }}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
                <button
                    onClick={() => setSelectedMode('simple')}
                    className={`relative z-10 px-8 py-3 text-sm font-medium rounded-full transition-colors flex items-center gap-2 ${selectedMode === 'simple' ? 'text-white' : 'text-textMuted hover:text-white/80'}`}
                >
                    <Settings2 size={16} /> Simple Mode
                </button>
                <button
                    onClick={() => setSelectedMode('advanced')}
                    className={`relative z-10 px-8 py-3 text-sm font-medium rounded-full transition-colors flex items-center gap-2 ${selectedMode === 'advanced' ? 'text-white' : 'text-textMuted hover:text-white/80'}`}
                >
                    <Settings2 size={16} /> Advanced Mode
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                {/* Transmitter Card */}
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate('/transmit', { state: { mode: selectedMode } })}
                    className="glass-panel p-8 text-left group border border-white/5 hover:border-primary/50 transition-colors flex flex-col justify-between min-h-[280px] bg-gradient-to-br from-surface to-black/60 relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-700">
                        <Radio size={120} />
                    </div>
                    <div className="space-y-4 relative z-10">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-6">
                            <Radio size={24} />
                        </div>
                        <h2 className="text-3xl font-semibold tracking-tight">Transmit</h2>
                        <p className="text-textMuted leading-relaxed">
                            Broadcast data from this device. Generates multi-frequency FSK audio signals to encode your payload.
                        </p>
                    </div>
                </motion.button>

                {/* Receiver Card */}
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate('/receive', { state: { mode: selectedMode } })}
                    className="glass-panel p-8 text-left group border border-white/5 hover:border-accent/50 transition-colors flex flex-col justify-between min-h-[280px] bg-gradient-to-bl from-surface to-black/60 relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-700">
                        <Mic size={120} />
                    </div>
                    <div className="space-y-4 relative z-10">
                        <div className="w-12 h-12 rounded-2xl bg-accent/20 text-accent flex items-center justify-center mb-6">
                            <Mic size={24} />
                        </div>
                        <h2 className="text-3xl font-semibold tracking-tight">Receive</h2>
                        <p className="text-textMuted leading-relaxed">
                            Listen for incoming data. Processes ambient audio to decode FSK sequences and reconstruct the payload.
                        </p>
                    </div>
                </motion.button>
            </div>

            <div className="glass-panel w-full p-4 flex items-start gap-4 border border-white/5 bg-black/40">
                <Info className="text-primary mt-0.5 shrink-0" size={20} />
                <div className="space-y-1">
                    <h4 className="text-sm font-medium text-white">System Limitations</h4>
                    <p className="text-xs text-textMuted leading-relaxed">
                        Acoustic data transmission operates at very low bandwidths. Expect roughly 50-200 bps.
                        Keep devices in close proximity and ensure a quiet environment for optimal reliability.
                    </p>
                </div>
            </div>
        </motion.div>
    );
}
