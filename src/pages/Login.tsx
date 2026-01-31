import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useUserStore } from '@/store/useUserStore';
import { useAuditStore } from '@/store/useAuditStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { Lock, User } from 'lucide-react';

const Login = () => {
    const { t, i18n } = useTranslation();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const login = useAuthStore((state) => state.login);
    const loginUser = useUserStore((state) => state.loginUser);
    const navigate = useNavigate();
    const whatsapp = useSettingsStore((s) => s.whatsapp);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        const addLog = useAuditStore.getState().addLog;

        try {
            const result = await loginUser(username, password);
            const normalizedUser = {
                id: String(result.user.id),
                name: result.user.name || result.user.username,
                role: result.user.role as 'admin' | 'viewer',
                username: result.user.username,
                page_permissions: Array.isArray(result.user.page_permissions) ? result.user.page_permissions : []
            };

            login(result.token, normalizedUser);
            addLog({
                userId: normalizedUser.id,
                userName: normalizedUser.name,
                action: 'Login Success',
                details: `User ${normalizedUser.name} logged into the system`,
                category: 'auth'
            });
            navigate('/');
        } catch (error: any) {
            addLog({
                userId: 'unknown',
                userName: username,
                action: 'Login Failure',
                details: `Failed login attempt for: ${username}`,
                category: 'auth'
            });
            alert(error.response?.data?.error || 'Error logging in. Check your credentials.');
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-gray-100">
            <div className="w-full max-w-md space-y-8 rounded-xl bg-white dark:bg-white p-10 shadow-lg">
                <div className="flex items-center justify-between">
                    <div className="text-center w-full">
                        <h2 className="text-3xl font-extrabold text-gray-900 dark:text-gray-900">{t('login.title')}</h2>
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-600">{t('login.subtitle')}</p>
                    </div>
                    {/* language selector moved to bottom-right */}
                </div>
                <form className="mt-8 space-y-6" onSubmit={handleLogin}>
                    <div className="-space-y-px rounded-md shadow-sm">
                        <div className="relative">
                            <User className="absolute left-3 top-3 h-5 w-5 text-gray-400 dark:text-gray-400" />
                            <input
                                type="text"
                                required
                                className="block w-full rounded-t-md border-0 py-2.5 pl-10 text-gray-900 dark:text-gray-900 ring-1 ring-inset ring-gray-300 dark:ring-gray-300 placeholder:text-gray-400 dark:placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                                placeholder={t('login.placeholder.username')}
                                autoComplete="username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </div>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400 dark:text-gray-400" />
                            <input
                                type="password"
                                required
                                className="block w-full rounded-b-md border-0 py-2.5 pl-10 text-gray-900 dark:text-gray-900 ring-1 ring-inset ring-gray-300 dark:ring-gray-300 placeholder:text-gray-400 dark:placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                                placeholder={t('login.placeholder.password')}
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="mt-4 text-center">
                            <a
                                className="text-xs text-blue-600 dark:text-blue-600 hover:text-blue-700 underline"
                                href={`https://wa.me/${whatsapp}?text=Suporte%20-%20Esqueci%20senha%20ou%20usu%C3%A1rio`}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {t('login.forgot')}
                            </a>
                    </div>

                    <div>
                            <button
                            type="submit"
                            className="flex w-full justify-center rounded-md border border-transparent bg-blue-600 dark:bg-blue-600 px-4 py-2 text-sm font-medium text-white dark:text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        >
                            {t('login.signin')}
                        </button>
                    </div>
                </form>
            </div>
            {/* Fixed language selector bottom-right */}
            <div className="fixed bottom-4 right-4 z-50">
                <div className="w-56 rounded-md bg-white dark:bg-slate-800 border border-border shadow-sm p-3">
                    <label className="block text-xs text-slate-600 dark:text-slate-300 mb-2">{t('login.language')}</label>
                    <select
                        value={i18n.language}
                        onChange={(e) => i18n.changeLanguage(e.target.value)}
                        className="w-full text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1"
                    >
                        <option value="pt-BR">PT-BR - {t('login.lang_names.pt')}</option>
                        <option value="en-US">EN - {t('login.lang_names.en')}</option>
                    </select>
                </div>
            </div>
        </div>
    );
};

export default Login;
