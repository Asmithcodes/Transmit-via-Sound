import React from 'react';
import { Outlet } from 'react-router-dom';
import { Footer } from './Footer';
import { APIOverrideModal } from './APIOverrideModal';
import { useAppStore } from '../../hooks/useAppStore';

export const Layout: React.FC = () => {
    const { reducedMotion } = useAppStore();

    return (
        <div className="relative min-h-screen w-full overflow-hidden flex flex-col" style={{ background: 'var(--color-background)' }}>

            {/* Grid texture pattern — fills the page with a subtle ruled-paper feel */}
            <div
                className="fixed inset-0 z-0 pointer-events-none grid-texture"
                aria-hidden="true"
            />

            {/* Top-left corner accent — decorative signal mark */}
            {!reducedMotion && (
                <div className="fixed top-0 left-0 z-0 pointer-events-none" aria-hidden="true">
                    <svg width="320" height="320" viewBox="0 0 320 320" fill="none" xmlns="http://www.w3.org/2000/svg" opacity="0.07">
                        {/* Concentric quarter-circles — signal antenna motif */}
                        {[60, 110, 160, 210, 260].map((r, i) => (
                            <path key={i} d={`M 0 0 A ${r} ${r} 0 0 1 ${r} 0`} stroke="var(--color-primary)" strokeWidth="1" fill="none" />
                        ))}
                    </svg>
                </div>
            )}

            {/* Bottom-right mirror accent */}
            {!reducedMotion && (
                <div className="fixed bottom-0 right-0 z-0 pointer-events-none rotate-180" aria-hidden="true">
                    <svg width="240" height="240" viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg" opacity="0.05">
                        {[50, 90, 130, 170, 210].map((r, i) => (
                            <path key={i} d={`M 0 0 A ${r} ${r} 0 0 1 ${r} 0`} stroke="var(--color-accent)" strokeWidth="1" fill="none" />
                        ))}
                    </svg>
                </div>
            )}

            {/* Main content */}
            <main className="relative z-10 w-full max-w-7xl mx-auto px-4 md:px-8 py-10 md:py-16 flex-grow flex flex-col items-center justify-center">
                <Outlet />
            </main>

            <Footer />
            <APIOverrideModal />
        </div>
    );
};
