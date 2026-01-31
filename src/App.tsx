import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Suspense, lazy, useEffect, ReactNode } from 'react';
import { useSettingsStore } from '@/store/useSettingsStore';
import { Layout } from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Login from '@/pages/Login';
import { useAuthStore } from '@/store/useAuthStore';
import api from '@/lib/api';

// Lazy load pages that aren't critical
const Cadastros = lazy(() => import('@/pages/Cadastros'));
const Reports = lazy(() => import('@/pages/Reports'));
const ApiDocs = lazy(() => import('@/pages/ApiDocs'));

// Loading fallback component
const PageLoader = () => (
    <div className="flex items-center justify-center h-screen">
        <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-slate-600 font-medium">Carregando página...</p>
        </div>
    </div>
);

const ProtectedRoute = () => {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

// Component to protect routes based on page permissions
const ProtectedPageRoute = ({ children, pageKey }: { children: ReactNode, pageKey: string }) => {
    const user = useAuthStore((state) => state.user);
    
    // Admin has access to everything
    if (user?.role === 'admin') {
        return <>{children}</>;
    }
    
    // Check if user has permission for this page
    const perms = user?.page_permissions || [];
    if (perms.includes(pageKey)) {
        return <>{children}</>;
    }
    
    // No permission, redirect to dashboard
    return <Navigate to="/" replace />;
};

function App() {
    
    const theme = useSettingsStore((s: any) => s.theme);

    // Ensure theme is applied globally (also on Login page where Sidebar isn't mounted)
    useEffect(() => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [theme]);

    // On app start, if we have an authenticated user persisted, refresh
    // the user data from the server (to ensure page_permissions are up-to-date).
    useEffect(() => {
        const isAuthenticated = useAuthStore.getState().isAuthenticated;
        const user = useAuthStore.getState().user;

        if (isAuthenticated) {
            // If user has no page_permissions (old persisted state), fetch fresh
            if (!user || !Array.isArray(user.page_permissions) || user.page_permissions.length === 0) {
                api.get('/api/auth/me')
                    .then((resp) => {
                        const u = resp.data.user;
                        if (u) {
                            const normalizedUser = {
                                id: String(u.id),
                                name: u.name || u.username,
                                role: u.role as 'admin' | 'viewer',
                                username: u.username,
                                page_permissions: Array.isArray(u.page_permissions) ? u.page_permissions : []
                            };
                            useAuthStore.getState().login('session-cookie', normalizedUser as any);
                        }
                    })
                    .catch(() => {
                        // ignore - user may not be authenticated server-side
                    });
            }
        }
    }, []);

    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={<Login />} />

                {/* Protected Routes */}
                <Route element={<ProtectedRoute />}>
                    <Route element={<Layout />}>
                        <Route path="/" element={<Dashboard />} />
                        <Route
                            path="/cadastros"
                            element={
                                <ProtectedPageRoute pageKey="registrations">
                                    <Suspense fallback={<PageLoader />}><Cadastros /></Suspense>
                                </ProtectedPageRoute>
                            }
                        />
                        <Route 
                            path="/reports" 
                            element={
                                <ProtectedPageRoute pageKey="reports">
                                    <Suspense fallback={<PageLoader />}><Reports /></Suspense>
                                </ProtectedPageRoute>
                            } 
                        />
                        <Route
                            path="/api-docs"
                            element={
                                <ProtectedPageRoute pageKey="api_docs">
                                    <Suspense fallback={<PageLoader />}><ApiDocs /></Suspense>
                                </ProtectedPageRoute>
                            }
                        />
                    </Route>
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
