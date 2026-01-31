import React from 'react';
import { usePageAccess } from '@/hooks/usePermissions';
import type { PagePermission } from '@/lib/permissions';

interface ProtectedPageProps {
    page: PagePermission;
    fallback?: React.ReactNode;
    children: React.ReactNode;
}

/**
 * Component that only renders content if user has permission to access a specific page
 */
export const ProtectedPage: React.FC<ProtectedPageProps> = ({
    page,
    fallback = <div className="p-6 text-center text-muted-foreground">You don't have permission to access this page.</div>,
    children
}) => {
    const hasAccess = usePageAccess(page);

    if (!hasAccess) {
        return <>{fallback}</>;
    }

    return <>{children}</>;
};

export default ProtectedPage;
