import React from 'react';
import { Outlet } from 'react-router-dom';
import Aurora from '../Background/Aurora';
import { Footer } from './Footer';
import { APIOverrideModal } from './APIOverrideModal';
import { useAppStore } from '../../hooks/useAppStore';

export const Layout: React.FC = () => {
    const { reducedMotion } = useAppStore();

    return (
        <div className="relative min-h-screen w-full overflow-hidden bg-background text-text flex flex-col items-center">
            {/* Immersive Background Layer */}
            <div className="fixed inset-0 z-0 pointer-events-none opacity-60">
                {!reducedMotion ? (
                    <Aurora colorStops={['#5227FF', '#2A1A5E', '#1D0F3F']} amplitude={0.8} blend={0.6} />
                ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-[#121216] to-[#0a0a0c]" />
                )}
            </div>

            {/* Subtle Noise Texture Overlay */}
            <div className="fixed inset-0 z-[1] pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}></div>

            {/* Main Content Render */}
            <main className="relative z-10 w-full max-w-7xl mx-auto px-4 md:px-8 py-10 md:py-20 flex-grow flex flex-col h-full items-center justify-center">
                <Outlet />
            </main>

            {/* Global Elements */}
            <Footer />
            <APIOverrideModal />
        </div>
    );
};
