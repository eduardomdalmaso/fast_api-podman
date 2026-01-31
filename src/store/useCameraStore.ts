import { create } from 'zustand';
import api from '@/lib/api';

export interface Camera {
    id: string;
    name: string;
    ip: string;
    location: string;
    platformId?: string;
    status: 'online' | 'offline';
    protocol?: string;
    cameraType?: 'RTSP' | 'RTMP' | 'HTTP' | 'ONVIF' | 'WEBCAM';
}

interface CameraState {
    cameras: Camera[];
    isLoading: boolean;
    error: string | null;
    fetchCameras: () => Promise<void>;
    addCamera: (camera: Camera) => Promise<void>;
    updateCamera: (id: string, updates: Partial<Camera>) => Promise<void>;
    deleteCamera: (id: string) => Promise<void>;
}



export const useCameraStore = create<CameraState>((set, get) => ({
    cameras: [],
    isLoading: false,
    error: null,
    fetchCameras: async () => {
        set({ isLoading: true, error: null });
        try {
            const response = await api.get('/api/v1/cameras');
            // Response format: { platforms: [...], total: n }
            const platforms = response.data.platforms || [];
            const normalizePlatform = (raw: any) => {
                const str = String(raw || '');
                const m = str.match(/(\d+)$/);
                if (m) return m[1];
                return str || '';
            };
            const formattedCameras = platforms.map((p: any) => {
                const raw = p.platform || p.id || '';
                const pid = normalizePlatform(raw);
                return {
                    id: raw || `${Date.now()}`,
                    name: p.name || `Camera ${pid || raw}`,
                    ip: p.url,
                    location: pid || raw,
                    platformId: pid || raw,
                    // Treat both backend statuses 'online' and 'live' as online for UI
                    status: (p.status === 'online' || p.status === 'live') ? 'online' : 'offline',
                    protocol: 'RTSP',
                    cameraType: p.camera_type || 'RTSP'
                };
            });
            set({ cameras: formattedCameras, isLoading: false });
        } catch (err: any) {
            set({ error: err.message, isLoading: false });
        }
    },
    addCamera: async (camera: Camera): Promise<any> => {
        try {
            const platformKey = camera.platformId ? `platform${camera.platformId}` : (camera.id || camera.location || `platform_${Date.now()}`);
            // Ensure we always send a non-empty name to avoid backend 400 validation errors
            let name = (camera.name || '').toString().trim();
            if (!name) {
                // try to infer from URL (last path segment) or fallback to Platform label
                let inferred = '';
                try {
                    const parsed = new URL(String(camera.ip || ''));
                    const parts = parsed.pathname.split('/').filter(Boolean);
                    inferred = parts.length ? parts[parts.length - 1] : '';
                } catch (e) {
                    // ignore invalid URL parsing
                }
                name = inferred || `Camera P${camera.platformId || ''}`.trim() || `Camera ${Date.now()}`;
            }

            // Ensure platform key is unique among existing cameras to avoid backend 400
            const storeState = get();
            const existingKeys = (storeState.cameras || []).map((c: any) => (c.id || (c.platformId ? `platform${c.platformId}` : ''))).filter(Boolean);

            const makeUnique = (base: string) => {
                if (!existingKeys.includes(base)) return base;
                // If base ends with a number, increment it; otherwise append _1, _2...
                const m = base.match(/^(.*?)(\d+)$/);
                if (m) {
                    const prefix = m[1];
                    let n = parseInt(m[2], 10) || 1;
                    let candidate = `${prefix}${n}`;
                    while (existingKeys.includes(candidate)) {
                        n += 1;
                        candidate = `${prefix}${n}`;
                    }
                    return candidate;
                } else {
                    let i = 1;
                    let candidate = `${base}_${i}`;
                    while (existingKeys.includes(candidate)) {
                        i += 1;
                        candidate = `${base}_${i}`;
                    }
                    return candidate;
                }
            };

            const uniquePlatformKey = makeUnique(platformKey);

            const payload = {
                name,
                url: camera.ip,
                platform: uniquePlatformKey,
                camera_type: camera.cameraType || camera.protocol || 'RTSP'
            };
            const response = await api.post('/api/v1/add_camera', payload);
            // Refetch cameras to get the updated list
            await get().fetchCameras();
            return response.data;  // Return response to show warnings
        } catch (err: any) {
            console.error('Failed to add camera:', err);
            throw err;
        }
    },
    updateCamera: async (id: string, updates: Partial<Camera>): Promise<void> => {
        try {
            // Find existing camera so we can supply required fields if updates are partial
            const state = get();
            const existing: Partial<Camera> = state.cameras.find((c: Camera) => c.id === id) || {};
            const payload = {
                platform: id,
                // Backend expects both name and url; fall back to existing values when absent
                name: updates.name ?? existing.name ?? '',
                url: updates.ip ?? ((updates as any).url) ?? existing.ip ?? '',
                camera_type: updates.cameraType || updates.protocol || existing.cameraType || existing.protocol || 'RTSP'
            };

            // Basic client-side validation to avoid sending empty required fields
            if (!payload.name || !String(payload.name).trim() || !payload.url || !String(payload.url).trim()) {
                throw new Error('Missing required camera fields (name or url)');
            }

            await api.post('/api/v1/update_camera', payload);
            set((s) => ({
                cameras: s.cameras.map((c) => (c.id === id ? { ...c, ...updates } : c)),
            }));
        } catch (err: any) {
            console.error('Failed to update camera:', err);
            throw err;
        }
    },
    deleteCamera: async (id: string): Promise<void> => {
        try {
            await api.post('/api/v1/delete_camera', { id });
            set((state) => ({
                cameras: state.cameras.filter((c) => c.id !== id),
            }));
        } catch (err: any) {
            console.error('Failed to delete camera:', err);
            throw err;
        }
    },
}));
