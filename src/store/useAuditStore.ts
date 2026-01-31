import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuditLog {
    id: string;
    timestamp: string;
    userId: string;
    userName: string;
    action: string;
    details: string;
    category: 'auth' | 'camera' | 'user' | 'settings' | 'system';
}

interface AuditState {
    logs: AuditLog[];
    addLog: (log: Omit<AuditLog, 'id' | 'timestamp'>) => void;
    clearLogs: () => void;
}

export const useAuditStore = create<AuditState>()(
    persist(
        (set) => ({
            logs: [],
            addLog: (log) => set((state) => ({
                logs: [
                    {
                        ...log,
                        id: Date.now().toString(),
                        timestamp: new Date().toLocaleString(),
                    },
                    ...state.logs
                ].slice(0, 500) // Keep last 500 logs
            })),
            clearLogs: () => set({ logs: [] }),
        }),
        {
            name: 'audit-storage',
        }
    )
);
