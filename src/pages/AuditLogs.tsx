import { useState } from 'react';
import { useAuditStore, AuditLog } from '@/store/useAuditStore';
import { Search, History, Filter, User, Shield, Info, Smartphone, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

const AuditLogs = () => {
    const { t } = useTranslation();
    const logs = useAuditStore((state) => state.logs);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');

    const filteredLogs = logs.filter(log => {
        const matchesSearch =
            log.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.details.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesCategory = categoryFilter === 'all' || log.category === categoryFilter;

        return matchesSearch && matchesCategory;
    });

    const getCategoryIcon = (category: AuditLog['category']) => {
        switch (category) {
            case 'auth': return <Shield className="h-4 w-4" />;
            case 'camera': return <Smartphone className="h-4 w-4" />;
            case 'user': return <User className="h-4 w-4" />;
            case 'settings': return <Settings className="h-4 w-4" />;
            default: return <Info className="h-4 w-4" />;
        }
    };

    const getCategoryColor = (category: AuditLog['category']) => {
        switch (category) {
            case 'auth': return 'bg-purple-100 text-purple-700';
            case 'camera': return 'bg-blue-100 text-blue-700';
            case 'user': return 'bg-green-100 text-green-700';
            case 'settings': return 'bg-amber-100 text-amber-700';
            default: return 'bg-gray-100 text-gray-700';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('audit.title')}</h1>
                    <p className="text-muted-foreground">{t('audit.subtitle')}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center rounded-lg border border-border bg-card px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-blue-600">
                    <Search className="h-5 w-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder={t('audit.search.placeholder')}
                            className="ml-2 flex-1 border-none bg-transparent outline-none placeholder:text-gray-400 text-foreground"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                </div>
                <div className="flex items-center rounded-lg border border-border bg-card px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-blue-600">
                    <Filter className="h-5 w-5 text-gray-400" />
                        <select
                        className="ml-2 flex-1 border-none bg-transparent outline-none text-foreground"
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                    >
                        <option value="all">{t('audit.filter.allCategories')}</option>
                        <option value="auth">{t('audit.categories.auth')}</option>
                        <option value="camera">{t('audit.categories.camera')}</option>
                        <option value="user">{t('audit.categories.user')}</option>
                        <option value="settings">{t('audit.categories.settings')}</option>
                    </select>
                </div>
            </div>

            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-secondary/50">
                                <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">{t('audit.table.date')}</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">{t('audit.table.user')}</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">{t('audit.table.action')}</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">{t('audit.table.category')}</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">{t('audit.table.details')}</th>
                            </tr>
                        </thead>
                        <tbody className="bg-card divide-y divide-border">
                            {filteredLogs.length > 0 ? (
                                filteredLogs.map((log) => (
                                    <tr key={log.id} className="hover:bg-muted/50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                                            {log.timestamp}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-foreground">{log.userName}</span>
                                                <span className="text-xs text-slate-400">ID: {log.userId}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-foreground">
                                            {log.action}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={cn(
                                                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                                                getCategoryColor(log.category)
                                            )}>
                                                {getCategoryIcon(log.category)}
                                                {t(`audit.categories.${log.category}`)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-muted-foreground max-w-xs truncate">
                                            {log.details}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                        <History className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                                        <p className="text-lg font-medium">{t('audit.empty.noLogs')}</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AuditLogs;
