import React from 'react';

export const Footer: React.FC = () => {
    return (
        <footer className="relative z-20 w-full border-t flex items-center justify-between px-6 md:px-10 py-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
            {/* Left — system tag */}
            <span className="label text-[10px]" style={{ fontFamily: "'IBM Plex Mono', monospace", color: 'var(--color-text-faint)' }}>
                ADL-8FSK / v1.0
            </span>

            {/* Centre — attribution */}
            <a
                href="mailto:asmyth@duck.com"
                className="label hover:opacity-80 transition-opacity"
                style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.62rem', color: 'var(--color-text-muted)', textDecoration: 'none' }}
            >
                Developed by Asmith&nbsp;—&nbsp;asmyth@duck.com
            </a>

            {/* Right — status dot */}
            <span className="flex items-center gap-1.5 label" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.58rem', color: 'var(--color-text-faint)' }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-success)' }} />
                SYS OK
            </span>
        </footer>
    );
};
