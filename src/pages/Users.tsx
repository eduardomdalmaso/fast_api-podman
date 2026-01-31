import { useState, useEffect } from 'react';
import { Plus, Search, User as UserIcon, Shield, Mail, Edit, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUserStore, User } from '@/store/useUserStore';
import { useAuditStore } from '@/store/useAuditStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useTranslation } from 'react-i18next';
import { useCanManageViewers } from '@/hooks/usePermissions';
import { 
    AVAILABLE_PAGES, 
    getDefaultPermissions
} from '@/lib/permissions';

// Removed local User interface and initialUsers constant

const Users = () => {
    const { t } = useTranslation();
    const { users, fetchUsers, addUser, updateUser, deleteUser } = useUserStore();
    const { addLog } = useAuditStore();
    const { user: currentUser } = useAuthStore();
    const viewerCanManage = useCanManageViewers();
    const canManage = currentUser?.role === 'admin' || viewerCanManage;
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchUsers();
    }, []);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newUser, setNewUser] = useState<Partial<User>>({ name: '', email: '', role: 'viewer', status: 'active', password: '', page_permissions: [] });
    const [username, setUsername] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);

    const filteredUsers = users.filter(user =>
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSaveUser = async () => {
        try {
                if (!canManage) {
                    alert(t('users.messages.onlyAdmins'));
                return;
            }

            if (editingId) {
                await updateUser(editingId, newUser);
                addLog({
                    userId: currentUser?.id || 'unknown',
                    userName: currentUser?.name || 'Unknown',
                    action: 'User Updated',
                    details: `User ${newUser.name} / ${newUser.email} (ID: ${editingId}) updated`,
                    category: 'user'
                });
                setEditingId(null);
            } else {
                const finalPassword = newUser.password || '';
                await addUser({ ...newUser, email: username, password: finalPassword } as User);
                addLog({
                    userId: currentUser?.id || 'unknown',
                    userName: currentUser?.name || 'Unknown',
                    action: 'User Created',
                    details: `User ${username} / ${newUser.email} created (password: ${finalPassword})`,
                    category: 'user'
                });
            }
            setIsModalOpen(false);
            setNewUser({ name: '', email: '', role: 'viewer', status: 'active', password: '' });
            setUsername('');
        } catch (err: any) {
            console.error(err);
            alert(t('users.messages.saveError'));
        }
    };

    const handleEditUser = (user: User) => {
        // Ensure all expected fields exist so inputs remain controlled
        setNewUser({
            name: user.name ?? '',
            email: user.email ?? '',
            role: (user.role as 'admin' | 'viewer') ?? 'viewer',
            status: (user.status as 'active' | 'inactive') ?? 'active',
            password: (user as any).password ?? '',
            page_permissions: Array.isArray((user as any).page_permissions) ? (user as any).page_permissions : []
        });
        setEditingId(user.id);
        setUsername(user.email || '');
        setIsModalOpen(true);
    };

    const handleDeleteUser = async (id: string) => {
        if (!canManage) {
            alert(t('users.messages.onlyAdmins'));
            return;
        }
        const target = users.find(u => u.id === id);
        if (target?.email === 'admin') {
            alert(t('users.messages.cannotDeleteAdmin'));
            return;
        }
        if (!confirm(t('users.messages.confirmDelete'))) return;
        try {
            const userDeleted = users.find(u => u.id === id);
            await deleteUser(id);
            addLog({
                userId: currentUser?.id || 'unknown',
                userName: currentUser?.name || 'Unknown',
                action: 'User Deleted',
                details: `User ${userDeleted?.name || id} (ID: ${id}) deleted`,
                category: 'user'
            });
        } catch (err) {
            console.error(err);
            alert(t('users.messages.deleteError'));
        }
    };

    const handleToggleStatus = async (id: string, currentStatus: 'active' | 'inactive') => {
        if (!canManage) {
            alert(t('users.messages.onlyAdmins'));
            return;
        }
        const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
        try {
            await updateUser(id, { status: nextStatus });
            const targetUser = users.find(u => u.id === id);
            addLog({
                userId: currentUser?.id || 'unknown',
                userName: currentUser?.name || 'Unknown',
                action: 'Status Changed',
                details: `User ${targetUser?.name || id}: Status changed to ${nextStatus}`,
                category: 'user'
            });
        } catch (err) {
            console.error(err);
            alert(t('users.messages.statusError'));
        }
    };

    const openNewUserModal = () => {
        setEditingId(null);
        // Set default permissions based on role
        const defaultPerms = getDefaultPermissions('viewer');
        setNewUser({ 
            name: '', 
            email: '', 
            role: 'viewer', 
            status: 'active', 
            password: '', 
            page_permissions: defaultPerms.page_permissions
        });
        setUsername('');
        setIsModalOpen(true);
    }

    return (
        <div className="space-y-6 relative">
            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-2xl border border-border">
                        <h2 className="text-xl font-bold text-foreground mb-4">{editingId ? t('users.modal.edit') : t('users.modal.new')}</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700">{t('users.form.username')}</label>
                                <input
                                    type="text"
                                    className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder={t('users.form.placeholder.username')}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700">{t('users.form.email')}</label>
                                <input
                                    type="text"
                                    className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground"
                                    value={newUser.email}
                                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                                    placeholder={t('users.form.placeholder.email')}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700">{t('users.form.password')}</label>
                                <input
                                    type="password"
                                    autoComplete="new-password"
                                    className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground"
                                    value={newUser.password}
                                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                                    placeholder={t('users.form.placeholder.password')}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700">{t('users.form.role')}</label>
                                <select
                                    className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground"
                                    value={newUser.role}
                                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value as 'admin' | 'viewer' })}
                                >
                                    <option value="viewer">{t('users.roles.viewer')}</option>
                                    <option value="admin">{t('users.roles.admin')}</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700">{t('users.form.page_permissions')}</label>
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                        {AVAILABLE_PAGES.map((p) => {
                                            const perms = (newUser.page_permissions || []) as string[];
                                            const checked = perms.includes(p.key);
                                            return (
                                                <label key={p.key} className="inline-flex items-center gap-2">
                                                    <input type="checkbox" className="form-checkbox" checked={checked} onChange={(e) => {
                                                        const next = new Set(perms);
                                                        if (e.target.checked) next.add(p.key); else next.delete(p.key);
                                                        setNewUser({ ...newUser, page_permissions: Array.from(next) });
                                                    }} />
                                                    <span className="text-sm">{t(`users.pages.${p.key}`) || p.label}</span>
                                                </label>
                                            )
                                        })}
                                </div>
                            </div>

                            {/* 'Can manage viewers' option removed; viewer management is controlled by 'users' page permission */}

                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent rounded-lg transition-colors"
                                >
                                    {t('users.modal.cancel')}
                                </button>
                                <button
                                    onClick={handleSaveUser}
                                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                                >
                                    {editingId ? t('users.modal.save') : t('users.modal.create')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('users.title')}</h1>
                    <p className="text-muted-foreground">{t('users.subtitle')}</p>
                </div>
                <button
                    onClick={openNewUserModal}
                    disabled={!canManage}
                    className={cn(
                        "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors",
                        canManage
                            ? "bg-blue-600 hover:bg-blue-700"
                            : "bg-gray-400 cursor-not-allowed"
                    )}
                >
                    <Plus className="h-4 w-4" />
                    {t('users.actions.new')}
                </button>
            </div>

            <div className="flex items-center rounded-lg border border-border bg-card px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-blue-600">
                <Search className="h-5 w-5 text-gray-400" />
                <input
                    type="text"
                    placeholder={t('users.search.placeholder')}
                    className="ml-2 flex-1 border-none bg-transparent outline-none placeholder:text-gray-400"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                <table className="min-w-full divide-y divide-border">
                    <thead className="bg-secondary/50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">{t('users.table.user')}</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">{t('users.table.login')}</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">{t('users.table.role')}</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">{t('users.table.status')}</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider align-middle">{t('users.table.actions')}</th>
                        </tr>
                    </thead>
                    <tbody className="bg-card divide-y divide-border">
                        {filteredUsers.map((user) => (
                            <tr key={user.id} className="hover:bg-muted/50 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center">
                                        <div className="h-10 w-10 flex-shrink-0 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                                            <UserIcon className="h-5 w-5" />
                                        </div>
                                        <div className="ml-4">
                                            <div className="text-sm font-medium text-foreground">{user.name}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    <div className="flex items-center gap-2">
                                        <Mail className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-muted-foreground">{user.email}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center gap-1.5 text-sm text-foreground">
                                        <Shield className="h-4 w-4 text-blue-500" />
                                        {user.role === 'admin' ? t('users.roles.admin') : t('users.roles.viewer')}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <button
                                        onClick={() => handleToggleStatus(user.id, user.status)}
                                        disabled={!canManage}
                                        className={cn(
                                            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                                            canManage
                                                ? "cursor-pointer hover:opacity-80"
                                                : "cursor-not-allowed opacity-60",
                                            user.status === 'active' ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                                        )}
                                    >
                                        {user.status === 'active' ? t('users.status.active') : t('users.status.inactive')}
                                    </button>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button
                                        onClick={() => handleEditUser(user)}
                                        disabled={!canManage}
                                        className={cn(
                                            "mr-4",
                                            canManage
                                                ? "text-blue-600 hover:text-blue-900"
                                                : "text-gray-400 cursor-not-allowed"
                                        )}
                                    >
                                        <Edit className="h-4 w-4" />
                                    </button>
                                    {user.email !== 'admin' && (
                                        <button
                                            onClick={() => handleDeleteUser(user.id)}
                                            disabled={!canManage}
                                            className={cn(
                                                canManage
                                                    ? "text-red-600 hover:text-red-900"
                                                    : "text-gray-400 cursor-not-allowed"
                                                )}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Users;
