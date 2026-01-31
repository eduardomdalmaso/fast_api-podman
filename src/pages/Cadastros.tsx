import { useState } from 'react';
import { Video as VideoIcon, Users as UsersIcon, Settings, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import Cameras from './Cameras';
import Users from './Users';
import AuditLogs from './AuditLogs';
import { hasPagePermission } from '@/lib/permissions';
import { useAuthStore } from '@/store/useAuthStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useAuditStore } from '@/store/useAuditStore';
import { useTranslation } from 'react-i18next';

export default function Cadastros() {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<'cameras' | 'users' | 'settings' | 'audit'>('cameras');
    const user = useAuthStore((state) => state.user);
    const { whatsapp, phone, brandName, brandSubtitle, logoUrl, updateSettings } = useSettingsStore();

    // Local state for form inputs
    const [localWhatsapp, setLocalWhatsapp] = useState(whatsapp);
    const [localPhone, setLocalPhone] = useState(phone);
    const [localBrandName, setLocalBrandName] = useState(brandName);
    const [localBrandSubtitle, setLocalBrandSubtitle] = useState(brandSubtitle);
    const [localLogoUrl, setLocalLogoUrl] = useState(logoUrl);

    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setLocalLogoUrl(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-foreground">{t('cadastros.title')}</h1>

            {/* Tab Navigation */}
            <div className="flex border-b border-border">
                <button
                    onClick={() => setActiveTab('cameras')}
                    className={cn(
                        "flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors",
                        activeTab === 'cameras'
                            ? "border-blue-600 text-blue-600"
                            : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                    )}
                >
                    <VideoIcon className="h-4 w-4" />
                    {t('cadastros.tabs.cameras')}
                </button>
                <button
                    onClick={() => setActiveTab('users')}
                    className={cn(
                        "flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors",
                        activeTab === 'users'
                            ? "border-blue-600 text-blue-600"
                            : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                    )}
                >
                    <UsersIcon className="h-4 w-4" />
                    {t('cadastros.tabs.users')}
                </button>
                {hasPagePermission(user, 'registrations') && (
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={cn(
                            "flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors",
                            activeTab === 'settings'
                                ? "border-blue-600 text-blue-600"
                                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                        )}
                    >
                        <Settings className="h-4 w-4" />
                        {t('cadastros.tabs.settings')}
                    </button>
                )}

                {hasPagePermission(user, 'audit') && (
                    <button
                        onClick={() => setActiveTab('audit')}
                        className={cn(
                            "flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors",
                            activeTab === 'audit'
                                ? "border-blue-600 text-blue-600"
                                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                        )}
                    >
                        <History className="h-4 w-4" />
                        {t('cadastros.tabs.audit')}
                    </button>
                )}
            </div>

            {/* Tab Content */}
            <div className="mt-6">
                {activeTab === 'cameras' && <Cameras />}
                {activeTab === 'users' && <Users />}
                {activeTab === 'audit' && hasPagePermission(user, 'audit') && <AuditLogs />}
                {activeTab === 'settings' && hasPagePermission(user, 'registrations') && (
                    <div className="max-w-2xl bg-card p-6 rounded-xl shadow-sm border border-border space-y-6">
                        <div>
                            <h3 className="text-lg font-medium text-foreground">{t('cadastros.settings.supportTitle')}</h3>
                            <p className="text-sm text-muted-foreground">{t('cadastros.settings.supportDesc')}</p>
                        </div>

                        <div className="grid gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">{t('cadastros.settings.whatsapp')}</label>
                                <input
                                    type="text"
                                    value={localWhatsapp}
                                    onChange={(e) => setLocalWhatsapp(e.target.value)}
                                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-foreground"
                                    placeholder="559999999999"
                                />
                                <p className="text-xs text-slate-500 mt-1">{t('cadastros.settings.whatsappHint')}</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">{t('cadastros.settings.phone')}</label>
                                <input
                                    type="text"
                                    value={localPhone}
                                    onChange={(e) => setLocalPhone(e.target.value)}
                                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-foreground"
                                    placeholder="+55 99 9999-9999"
                                />
                            </div>
                        </div>

                        <div className="grid gap-4 mt-8 pt-8 border-t border-border">
                            <div>
                                <h3 className="text-lg font-medium text-foreground">{t('cadastros.settings.brandTitle')}</h3>
                                    <p className="text-sm text-muted-foreground">{t('cadastros.settings.brandDesc')}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">{t('cadastros.settings.brandName')}</label>
                                    <input
                                        type="text"
                                        value={localBrandName}
                                        onChange={(e) => setLocalBrandName(e.target.value)}
                                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-foreground"
                                        placeholder="Gases"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">{t('cadastros.settings.subtitle')}</label>
                                    <input
                                        type="text"
                                        value={localBrandSubtitle}
                                        onChange={(e) => setLocalBrandSubtitle(e.target.value)}
                                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-foreground"
                                        placeholder="Distribution"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">{t('cadastros.settings.brandLogo')}</label>
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 bg-secondary rounded-lg flex items-center justify-center border border-dashed border-border overflow-hidden shrink-0">
                                        {localLogoUrl ? (
                                            <img src={localLogoUrl} alt="Logo Preview" className="w-full h-full object-contain" />
                                        ) : (
                                            <span className="text-xs text-slate-400">{t('cadastros.settings.noLogo')}</span>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleLogoChange}
                                            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-colors"
                                        />
                                        <p className="text-xs text-slate-500 mt-1">{t('cadastros.settings.supportedFormats')}</p>
                                    </div>
                                    {localLogoUrl && (
                                        <button
                                            onClick={() => setLocalLogoUrl(null)}
                                            className="text-xs text-red-500 hover:text-red-700"
                                        >
                                            {t('cadastros.settings.remove')}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end pt-4">
                            <button
                                    onClick={() => {
                                    updateSettings({
                                        whatsapp: localWhatsapp,
                                        phone: localPhone,
                                        brandName: localBrandName,
                                        brandSubtitle: localBrandSubtitle,
                                        logoUrl: localLogoUrl
                                    });
                                    useAuditStore.getState().addLog({
                                        userId: user?.id || 'unknown',
                                        userName: user?.name || 'Unknown',
                                        action: 'Settings Updated',
                                        details: `Support numbers updated (Tel: ${localPhone})`,
                                        category: 'settings'
                                    });
                                    alert(t('cadastros.settings.saved'));
                                }}
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                            >
                                {t('cadastros.settings.saveChanges')}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
