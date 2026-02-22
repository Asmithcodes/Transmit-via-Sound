import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
    apiKey: string | null;
    setApiKey: (key: string) => void;

    theme: 'dark' | 'light';
    toggleTheme: () => void;

    reducedMotion: boolean;
    toggleReducedMotion: () => void;

    isApiOverrideModalOpen: boolean;
    setApiOverrideModalOpen: (isOpen: boolean) => void;
}

export const useAppStore = create<AppState>()(
    persist(
        (set) => ({
            apiKey: null,
            setApiKey: (key) => set({ apiKey: key }),

            theme: 'dark',
            toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),

            reducedMotion: false,
            toggleReducedMotion: () => set((state) => ({ reducedMotion: !state.reducedMotion })),

            isApiOverrideModalOpen: false,
            setApiOverrideModalOpen: (isOpen: boolean) => set({ isApiOverrideModalOpen: isOpen }),
        }),
        {
            name: 'asmith-app-storage',
            partialize: (state) => ({
                apiKey: state.apiKey,
                theme: state.theme,
                reducedMotion: state.reducedMotion
            }),
        }
    )
);
