import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export interface DashboardSocketData {
    platforms: {
        [key: string]: {
            zones: {
                [key: string]: {
                    loaded: number;
                    unloaded: number;
                };
            };
            total_loaded: number;
            total_unloaded: number;
            status: 'live' | 'offline';
        };
    };
    total: {
        loaded: number;
        unloaded: number;
        balance: number;
    };
    hourly?: {
        labels: string[];
        total: {
            loaded: number[];
            unloaded: number[];
        };
    };
}

interface UseDashboardSocketOptions {
    serverUrl?: string;
    autoConnect?: boolean;
}

/**
 * Custom hook for real-time dashboard data via Socket.io
 * Connects to Flask backend and listens for dashboard_update events
 * 
 * Usage:
 *   const { data, isConnected, error } = useDashboardSocket();
 *   if (isConnected) {
 *     // Use data.platforms, data.total, data.hourly
 *   }
 */
export function useDashboardSocket(options: UseDashboardSocketOptions = {}) {
    const {
        serverUrl = import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin,
        autoConnect = true,
    } = options;

    const [data, setData] = useState<DashboardSocketData | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        if (!autoConnect) return;

        // Initialize Socket.io connection
        const socket = io(serverUrl, {
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 5,
            transports: ['websocket', 'polling'],
            withCredentials: true, // Send cookies for Flask-Login session
        });

        socketRef.current = socket;

        // Connection handlers
        socket.on('connect', () => {
            console.log('[Socket.io] Connected to Flask server');
            setIsConnected(true);
            setError(null);
        });

        socket.on('disconnect', () => {
            console.log('[Socket.io] Disconnected from Flask server');
            setIsConnected(false);
        });

        socket.on('connect_error', (err: Error) => {
            console.error('[Socket.io] Connection error:', err);
            setError(err.message || 'Connection error');
        });

        // Listen for dashboard_update events from backend
        socket.on('dashboard_update', (payload: DashboardSocketData) => {
            console.log('[Socket.io] Received dashboard_update:', payload);
            setData(payload);
            setError(null);
        });

        // Cleanup on unmount
        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, [serverUrl, autoConnect]);

    // Manual connection control
    const connect = useCallback(() => {
        if (socketRef.current && !socketRef.current.connected) {
            socketRef.current.connect();
        }
    }, []);

    const disconnect = useCallback(() => {
        if (socketRef.current && socketRef.current.connected) {
            socketRef.current.disconnect();
        }
    }, []);

    return {
        data,
        isConnected,
        error,
        connect,
        disconnect,
        socket: socketRef.current,
    };
}
