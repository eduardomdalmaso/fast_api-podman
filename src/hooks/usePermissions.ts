import { useAuthStore } from '@/store/useAuthStore';
import { hasPagePermission, canManageViewers } from '@/lib/permissions';
import type { PagePermission } from '@/lib/permissions';

/**
 * Hook to check if current user has access to a specific page
 */
export function usePageAccess(page: PagePermission): boolean {
    const user = useAuthStore((state) => state.user);
    return hasPagePermission(
        user ? {
            role: user.role,
            page_permissions: user.page_permissions || []
        } : null,
        page
    );
}

/**
 * Hook to check if current user can manage viewers
 */
export function useCanManageViewers(): boolean {
    const user = useAuthStore((state) => state.user);
    return canManageViewers(
        user ? {
            role: user.role,
            page_permissions: user.page_permissions || []
        } : null
    );
}

/**
 * Hook to check if user is admin
 */
export function useIsAdmin(): boolean {
    const user = useAuthStore((state) => state.user);
    return user?.role === 'admin' || false;
}
