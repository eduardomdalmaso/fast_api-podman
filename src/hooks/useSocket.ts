import { useEffect } from 'react';
import { io } from 'socket.io-client';
import api from '@/lib/api';

// Resolve socket URL with the following priority:
// 1. VITE_SOCKET_URL env var (explicit)
// 2. api.defaults.baseURL (when set to a non-empty value)
// 3. In development, default to http://localhost:5000 (Flask socket server)
// 4. Fallback to `window.location.origin` (production same-origin)
const SOCKET_URL = (import.meta.env as any).VITE_SOCKET_URL
    || (api.defaults.baseURL && api.defaults.baseURL !== '' ? api.defaults.baseURL : (import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin));

export function useSocket(onUpdate: (data: any) => void) {
    useEffect(() => {
        const socket = io(SOCKET_URL, {
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 5,
            autoConnect: true,
            forceNew: false,
            // Ensure cookies (Flask-Login session) are sent with polling requests
            withCredentials: true,
            // Force long-polling only. Flask-SocketIO on gevent/threading can
            // intermittently fail websocket upgrades; polling is reliable for
            // dashboard updates and avoids the 400/timeout seen in Firefox.
            transports: ['polling'],
            upgrade: false,
        });

        socket.on('connect', () => {
            console.log('Connected to Socket.io server at', SOCKET_URL, 'socket id=', (socket as any).id);
        });

        socket.on('dashboard_update', (data) => {
            console.debug('Received dashboard_update event', data);
            try {
                onUpdate(data);
            } catch (err) {
                console.error('Error handling dashboard_update:', err);
            }
        });

        socket.on('disconnect', (reason) => {
            console.warn('Disconnected from Socket.io:', reason);
        });

        socket.on('connect_error', (error) => {
            console.error('Socket.io connection error:', error);
        });

        return () => {
            socket.disconnect();
        };
    }, [onUpdate]);
}
