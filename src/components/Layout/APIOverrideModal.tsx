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
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md"
                >
                    <motion.div
                        initial={{ scale: 0.95, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.95, y: 20 }}
                        className="w-full max-w-md glass-panel overflow-hidden border border-white/10 shadow-2xl relative"
                    >
                        <button
                            onClick={() => setApiOverrideModalOpen(false)}
                            className="absolute top-4 right-4 text-textMuted hover:text-white transition-colors"
                        >
                            <X size={20} />
                        </button>
                        <div className="p-6 border-b border-white/5 space-y-2">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-warning/20 text-warning flex items-center justify-center">
                                    <AlertTriangle size={20} />
                                </div>
                                <h2 className="text-xl font-bold tracking-tight">System Limit Reached</h2>
                            </div>
                            <p className="text-sm text-textMuted leading-relaxed pt-2">
                                The system API key has expired or reached its limit. Please enter your own Google API Key to continue.
                            </p>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-mono text-textMuted flex items-center gap-2">
                                    <Key size={12} />
                                    GOOGLE GEMINI API KEY
                                </label>
                                <input
                                    type="password"
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    placeholder="AIzaSy..."
                                    className="glass-input font-mono text-sm tracking-widest placeholder:opacity-50"
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div className="p-6 pt-0 flex justify-end gap-3">
                            <button
                                onClick={() => setApiOverrideModalOpen(false)}
                                className="px-4 py-2 rounded-lg text-sm text-textMuted hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                className="px-6 py-2 rounded-lg text-sm font-medium bg-primary text-black hover:bg-primary/90 transition-colors shadow-[0_0_15px_rgba(124,255,103,0.3)] hover:shadow-[0_0_25px_rgba(124,255,103,0.5)]"
                            >
                                Override System
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
