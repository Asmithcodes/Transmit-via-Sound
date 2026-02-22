import React from 'react';
import { Mail } from 'lucide-react';

export const Footer: React.FC = () => {
    return (
        <footer className="fixed bottom-0 left-0 w-full z-50 p-6 flex justify-between items-center pointer-events-none">
            <div className="flex-1"></div>
            <div className="pointer-events-auto bg-surface/30 backdrop-blur-sm border border-white/5 rounded-full px-4 py-2 flex items-center gap-2 transition-all hover:bg-surface/50 hover:border-white/10">
                <a
                    href="mailto:asmyth@duck.com"
                    className="text-xs text-textMuted hover:text-white transition-colors flex items-center gap-2 group"
                >
                    <span>Developed by Asmith</span>
                    <span className="opacity-50 group-hover:opacity-100 transition-opacity">—</span>
                    <Mail className="w-3 h-3 group-hover:text-primary transition-colors" />
                    <span className="group-hover:text-primary transition-colors">asmyth@duck.com</span>
                </a>
            </div>
        </footer>
    );
};
