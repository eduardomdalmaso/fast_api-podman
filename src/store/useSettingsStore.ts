import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
    whatsapp: string;
    phone: string;
    theme: 'light' | 'dark';
    logoUrl: string | null;
    brandName: string;
    brandSubtitle: string;
    updateSettings: (settings: Partial<Omit<SettingsState, 'updateSettings'>>) => void;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            whatsapp: '559999999999',
            phone: '+55 99 9999-9999',
            theme: 'light',
            logoUrl: null,
            brandName: 'Gases',
            brandSubtitle: 'Distribuição',
            updateSettings: (newSettings) => set((state) => ({ ...state, ...newSettings })),
        }),
        {
            name: 'settings-storage',
        }
    )
);
