import React, { useState } from 'react';
import { Key, X, AlertTriangle } from 'lucide-react';
import { useAppStore } from '../../hooks/useAppStore';
import { motion, AnimatePresence } from 'framer-motion';

export const APIOverrideModal: React.FC = () => {
    const { isApiOverrideModalOpen, setApiOverrideModalOpen, apiKey, setApiKey } = useAppStore();
    const [inputValue, setInputValue] = useState(apiKey || '');

    const handleSave = () => {
        setApiKey(inputValue);
        setApiOverrideModalOpen(false);
    };

    return (
        <AnimatePresence>
            {isApiOverrideModalOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                    style={{ background: 'rgba(242, 237, 228, 0.85)', backdropFilter: 'blur(6px)' }}
                >
                    <motion.div
                        initial={{ scale: 0.95, y: 16 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.95, y: 16 }}
                        className="panel w-full max-w-md relative overflow-hidden"
                    >
                        {/* Accent strip */}
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--color-warning)' }} />

                        <button
                            onClick={() => setApiOverrideModalOpen(false)}
                            style={{ position: 'absolute', top: 14, right: 14, color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                        >
                            <X size={18} />
                        </button>

                        <div className="p-6 flex flex-col gap-5" style={{ paddingTop: '1.75rem' }}>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center justify-center rounded-full"
                                    style={{ width: 40, height: 40, background: 'rgba(230, 81, 0, 0.12)', color: 'var(--color-warning)' }}>
                                    <AlertTriangle size={18} />
                                </div>
                                <div>
                                    <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: '1.25rem', fontWeight: 400, color: 'var(--color-text)' }}>
                                        System Limit Reached
                                    </h2>
                                </div>
                            </div>

                            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: 'var(--color-text-muted)', lineHeight: 1.7 }}>
                                The system API key has expired or reached its limit.
                                Enter your own Google API Key to continue.
                            </p>

                            <div className="flex flex-col gap-2">
                                <label className="label" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                                    <Key size={11} /> Google Gemini API Key
                                </label>
                                <input
                                    type="password"
                                    value={inputValue}
                                    onChange={e => setInputValue(e.target.value)}
                                    placeholder="AIzaSy..."
                                    className="field"
                                    style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.08em' }}
                                    autoFocus
                                />
                            </div>

                            <div style={{ paddingTop: '0.5rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                <button onClick={() => setApiOverrideModalOpen(false)} className="btn btn-ghost"
                                    style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                                    Cancel
                                </button>
                                <button onClick={handleSave} className="btn btn-primary"
                                    style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                                    Override System
                                </button>
                            </div>

                            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.6rem', color: 'var(--color-text-faint)', textAlign: 'center' }}>
                                System Error? Contact Asmith —{' '}
                                <a href="mailto:asmyth@duck.com" style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>
                                    asmyth@duck.com
                                </a>
                            </p>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
