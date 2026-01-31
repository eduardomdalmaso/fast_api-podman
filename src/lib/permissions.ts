/**
 * Frontend Permission System
 * This module handles all permission logic on the client side
 * The backend (api.py) remains unchanged and just stores the data
 */

export type PagePermission = 
    | 'dashboard' 
    | 'reports' 
    | 'api_docs' 
    | 'audit' 
    | 'cameras' 
    | 'registrations' 
    | 'users';

export interface UserPermissions {
    page_permissions: PagePermission[];
    role: 'admin' | 'viewer';
}

// Available pages that can be restricted
export const AVAILABLE_PAGES: { key: PagePermission; label: string }[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'reports', label: 'Reports' },
    { key: 'api_docs', label: 'API Docs' },
    { key: 'audit', label: 'Audit' },
    { key: 'cameras', label: 'Cameras' },
    { key: 'registrations', label: 'Registrations' },
    { key: 'users', label: 'Users' }
];

/**
 * Check if a user has permission to access a specific page
 */
/**
 * Normalize incoming user-like objects into `UserPermissions` or `null`.
 * Accepts backend `User` shapes where `page_permissions` can be `string[]`.
 */
export function normalizeUserPermissions(user: any | null): UserPermissions | null {
    if (!user) return null;

    const raw = user.page_permissions || [];
    const filtered = Array.isArray(raw)
        ? raw.filter((p: any) => AVAILABLE_PAGES.some(ap => ap.key === p))
        : [];

    return {
        role: user.role,
        page_permissions: filtered as PagePermission[],
    };
}

export function hasPagePermission(
    userOrPermissions: any | null,
    page: PagePermission
): boolean {
    const userPermissions = normalizeUserPermissions(userOrPermissions);

    // Admins always have access to all pages
    if (userPermissions?.role === 'admin') {
        return true;
    }

    // Viewers need explicit permission
    return userPermissions?.page_permissions?.includes(page) || false;
}

/**
 * Check if a user can manage other viewers
 */
export function canManageViewers(userOrPermissions: any | null): boolean {
    const userPermissions = normalizeUserPermissions(userOrPermissions);

    // Admins can always manage viewers
    if (userPermissions?.role === 'admin') {
        return true;
    }

    // Viewers can manage viewer users if they have the 'users' page permission
    return userPermissions?.page_permissions?.includes('users') || false;
}

/**
 * Get all pages a user has access to
 */
export function getAccessiblePages(userOrPermissions: any | null): PagePermission[] {
    const userPermissions = normalizeUserPermissions(userOrPermissions);

    // Admins have access to all pages
    if (userPermissions?.role === 'admin') {
        return AVAILABLE_PAGES.map(p => p.key);
    }

    // Return only the permitted pages for viewers
    return userPermissions?.page_permissions || [];
}

/**
 * Check if user has any page permissions (used for showing page permission section)
 * This is shown for admin users creating/editing other users
 */
export function shouldShowPagePermissionsUI(editorRole: 'admin' | 'viewer'): boolean {
    return editorRole === 'admin';
}

/**
 * Validate permissions object
 */
export function validatePermissions(permissions: Partial<UserPermissions>): boolean {
    if (permissions.page_permissions && !Array.isArray(permissions.page_permissions)) {
        return false;
    }

    if (permissions.page_permissions) {
        return permissions.page_permissions.every(p => 
            AVAILABLE_PAGES.some(ap => ap.key === p)
        );
    }

    return true;
}

/**
 * Get default permissions for a new user based on role
 */
export function getDefaultPermissions(role: 'admin' | 'viewer'): Pick<UserPermissions, 'page_permissions'> {
    if (role === 'admin') {
        // Admins get all permissions by default
        return {
            page_permissions: AVAILABLE_PAGES.map(p => p.key)
        };
    }

    // Viewers get no permissions by default
    return {
        page_permissions: []
    };
}
