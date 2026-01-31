import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    FileText,
    Settings,
    LogOut,
    HelpCircle,
    Moon,
    Sun,
    Code
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/useAuthStore';
import { useSettingsStore } from '@/store/useSettingsStore';

const Sidebar = () => {
    const location = useLocation();
    const { logout, user } = useAuthStore();
    const { whatsapp, phone, theme, brandName, brandSubtitle, logoUrl, updateSettings } = useSettingsStore();

    // Sync theme with document class
    useEffect(() => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [theme]);

    const { t } = useTranslation();

    const navItems = [
        { label: t('sidebar.dashboard'), icon: LayoutDashboard, path: '/' },
        { label: t('sidebar.reports'), icon: FileText, path: '/reports', permissionKey: 'reports' },
        { label: t('sidebar.settings'), icon: Settings, path: '/cadastros', permissionKey: 'registrations' },
        { label: t('sidebar.api_docs'), icon: Code, path: '/api-docs', permissionKey: 'api_docs' },
    ];

    const toggleTheme = () => {
        updateSettings({ theme: theme === 'light' ? 'dark' : 'light' });
    };

    return (
        <aside className="w-64 bg-slate-800 dark:bg-slate-950 text-slate-300 dark:text-slate-400 flex flex-col h-full shrink-0 border-r border-slate-200 dark:border-slate-800 transition-colors duration-300">
            {/* Logo */}
            <div className="p-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                        {logoUrl ? (
                            <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
                        ) : (
                            <span className="text-[#1e293b] font-bold text-xl">{brandName.charAt(0)}</span>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-white font-bold leading-tight truncate">{brandName}</h1>
                        <p className="text-xs text-slate-400 truncate">{brandSubtitle}</p>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 space-y-1">
                {navItems.map((item) => {
                    // Page-permissions check: Admins see all, viewers need explicit permission
                    if (user?.role === 'viewer' && item.permissionKey) {
                        const perms = (user?.page_permissions || []) as string[];
                        if (!perms.includes(item.permissionKey)) return null;
                    }

                    const isActive = location.pathname === item.path;
                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={cn(
                                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                                isActive
                                    ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20"
                                    : "text-slate-300 dark:text-slate-400 hover:bg-slate-700 dark:hover:bg-slate-800 hover:text-white"
                            )}
                        >
                            <item.icon className="h-4 w-4" />
                            {item.label}
                        </Link>
                    );
                })}
            </nav>

            {/* Bottom Section */}
            <div className="p-4 border-t border-slate-800 dark:border-slate-900 space-y-4">
                {/* Theme Toggle */}
                <button
                    onClick={toggleTheme}
                    className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
                >
                    {theme === 'light' ? (
                        <>
                            <Sun className="h-4 w-4 text-amber-400" />
                            {t('sidebar.light_mode')}
                        </>
                    ) : (
                        <>
                            <Moon className="h-4 w-4 text-blue-400" />
                            {t('sidebar.dark_mode')}
                        </>
                    )}
                </button>

                {/* Support Button */}
                <div className="bg-slate-800/50 dark:bg-slate-900/50 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        <HelpCircle className="h-3 w-3" />
                        {t('sidebar.need_help')}
                    </div>
                    <div className="grid gap-2">
                        <a
                            href={`https://wa.me/${whatsapp}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs bg-green-600 hover:bg-green-700 text-white py-2 px-3 rounded text-center transition-colors font-semibold"
                        >
                            {t('sidebar.whatsapp')}
                        </a>
                        <a
                            href={`tel:${phone}`}
                            className="text-[10px] text-center text-slate-400 hover:text-slate-200"
                        >
                            {phone}
                        </a>
                    </div>
                </div>

                {/* Logout */}
                    <button
                    onClick={logout}
                    className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                >
                    <LogOut className="h-4 w-4" />
                    {t('sidebar.logout')}
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
