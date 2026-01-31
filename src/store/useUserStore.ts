import { create } from 'zustand';
import api from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';

export interface User {
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'viewer';
    status: 'active' | 'inactive';
    password?: string;
    page_permissions?: string[];
}

const initialUsers: User[] = [
    { id: '1', name: 'Admin User', email: 'admin', role: 'admin', status: 'active', password: 'admin' },
];

interface UserState {
    users: User[];
    isLoading: boolean;
    error: string | null;
    fetchUsers: () => Promise<void>;
    addUser: (user: Partial<User>) => Promise<void>;
    updateUser: (id: string, updates: Partial<User>) => Promise<void>;
    deleteUser: (id: string) => Promise<void>;
    loginUser: (username: string, password: string) => Promise<{ token: string, user: any }>;
    getUserByEmail: (email: string) => User | undefined;
}

export const useUserStore = create<UserState>((set, get) => ({
    users: initialUsers,
    isLoading: false,
    error: null,
    fetchUsers: async () => {
        set({ isLoading: true, error: null });
        try {
            const authUser = useAuthStore.getState().user;
            const isViewer = authUser?.role === 'viewer';
            const response = isViewer
                ? await api.get('/api/v1/viewer_users')
                : await api.get('/api/v1/users');
            // Response format: { users: [...], total: n }
            const users = response.data.users || [];
            const formattedUsers = users.map((u: any) => ({
                id: String(u.id),
                name: u.name || u.username,
                email: u.username,
                role: u.role as 'admin' | 'viewer',
                status: u.active ? 'active' : 'inactive',
                page_permissions: Array.isArray(u.page_permissions) ? u.page_permissions : []
            }));
            set({ users: formattedUsers, isLoading: false });
        } catch (err: any) {
            // Return defaults if API fails or not yet implemented
            set({ error: err.message, isLoading: false });
        }
    },
    addUser: async (user) => {
        try {
            const payload = {
                username: user.email,
                password: user.password || '',
                role: user.role,
                active: user.status === 'active',
                page_permissions: user.page_permissions || []
            };
            const authUser = useAuthStore.getState().user;
            const isViewer = authUser?.role === 'viewer';
            if (isViewer) {
                // viewers must use viewer-specific endpoint
                await api.post('/api/v1/viewer_users/add', {
                    username: payload.username,
                    password: payload.password,
                    page_permissions: payload.page_permissions
                });
            } else {
                await api.post('/api/v1/add_user', payload);
            }
            // Always refresh from backend to keep IDs and roles consistent
            await get().fetchUsers();
        } catch (err) {
            console.error('Add user failed', err);
            throw err;
        }
    },
    updateUser: async (id, updates) => {
        try {
            const payload = {
                id: parseInt(id),
                password: updates.password,
                role: updates.role,
                active: updates.status === 'active',
                page_permissions: updates.page_permissions !== undefined ? updates.page_permissions : undefined
            };
            const authUser = useAuthStore.getState().user;
            const isViewer = authUser?.role === 'viewer';
            if (isViewer) {
                // viewer update endpoint expects POST to /api/v1/viewer_users/<id>
                await api.post(`/api/v1/viewer_users/${payload.id}`, {
                    password: payload.password,
                    active: payload.active,
                    page_permissions: payload.page_permissions
                });
            } else {
                await api.post('/api/v1/update_user', payload);
            }
            await get().fetchUsers();
        } catch (err) {
            console.error('Update user failed', err);
            throw err;
        }
    },
    deleteUser: async (id) => {
        try {
            const authUser = useAuthStore.getState().user;
            const isViewer = authUser?.role === 'viewer';
            if (isViewer) {
                await api.post(`/api/v1/viewer_users/${id}/delete`);
            } else {
                await api.post('/api/v1/delete_user', { id });
            }
            await get().fetchUsers();
        } catch (err) {
            console.error('Delete user failed', err);
            throw err;
        }
    },
    loginUser: async (username, password) => {
        try {
            const response = await api.post('/api/auth/login', { username, password });
            // Return a mock token since we're using session cookies
            return {
                token: 'session-cookie',
                user: response.data.user
            };
        } catch (err: any) {
            console.error('Login failed', err);
            throw err;
        }
    },
    getUserByEmail: (email) => get().users.find((u) => u.email === email),
}));
