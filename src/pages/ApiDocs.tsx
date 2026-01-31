import { useState, useEffect } from 'react';
import {
    Lock,
    Code,
    Terminal,
    Copy,
    RefreshCcw,
    Trash2,
    CheckCircle2,
    XCircle,
    Clock,
    Plus,
    Activity,
    Layers,
    Loader2
} from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface ApiKey {
    id: string;
    name: string;
    key: string;
    status?: string;
    active?: boolean;
}

interface IntegrationLog {
    id: string;
    system: string;
    status?: string;
    date: string;
    message: string;
}

export default function ApiDocs() {
    const { t } = useTranslation();
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
    const [integrationLogs, setIntegrationLogs] = useState<IntegrationLog[]>([]);
    const [isLoadingKeys, setIsLoadingKeys] = useState(false);
    const [isLoadingLogs, setIsLoadingLogs] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setIsLoadingKeys(true);
        setIsLoadingLogs(true);
        try {
            // Fetch integration logs from Flask backend
            // Using /get_report_data endpoint which returns count logs
            const [, reportsRes] = await Promise.all([
                api.get('/api/v1/platforms'),
                api.get('/get_report_data')
            ]);

            // Generate mock API keys for demonstration
            // In production, you would fetch these from a dedicated endpoint
            const mockKeys: ApiKey[] = [
                {
                    id: 'key_1',
                    name: 'Production Key',
                    key: 'sk_prod_abc123def456ghi789',
                    status: 'active',
                    active: true
                },
                {
                    id: 'key_2',
                    name: 'Staging Key',
                    key: 'sk_stage_xyz789uvw456rst',
                    status: 'active',
                    active: true
                }
            ];

            // Transform report data into integration logs
            const reportsData = reportsRes && reportsRes.data;
            let reportsArray: any[] = [];
            if (Array.isArray(reportsData)) {
                reportsArray = reportsData;
            } else {
                console.warn('Unexpected /get_report_data response type:', typeof reportsData, reportsData);
                reportsArray = [];
            }

            const normalizedLogs: IntegrationLog[] = reportsArray
                .slice(0, 10) // Get last 10 records
                .map((report: any, index: number) => ({
                    id: `log_${index}`,
                    system: `${report.platform}_${report.zone}`,
                    status: 'success',
                    date: report.date || new Date().toISOString(),
                    message: `${report.direction} +${report.count} cylinder(s)`
                }));

            setApiKeys(mockKeys);
            setIntegrationLogs(normalizedLogs);
        } catch (error) {
            console.error('Failed to fetch API data:', error);
            // Set empty arrays on error to prevent blank page
            setApiKeys([]);
            setIntegrationLogs([]);
        } finally {
            setIsLoadingKeys(false);
            setIsLoadingLogs(false);
        }
    };

    const handleGenerateKey = async () => {
        // In production, this would call an endpoint like POST /api-keys
        // For now, it's a demonstration that shows how to generate a key
        const newKey: ApiKey = {
            id: String(Date.now()),
            name: `KEY_${Math.floor(Math.random() * 1000)}`,
            key: `sk_prod_${Math.random().toString(36).substring(7)}${Math.random().toString(36).substring(7)}`,
            status: 'active'
        };
        try {
            // This endpoint doesn't exist in current Flask app
            // Uncomment when API key management is implemented
            // await api.post('/api/api-keys', newKey);
            setApiKeys(prev => [...prev, newKey]);
            console.log('Generated demo API key:', newKey);
        } catch (error) {
            console.error('Failed to generate key:', error);
        }
    };

    const handleRevokeKey = async (id: string) => {
        try {
            // This endpoint doesn't exist in current Flask app
            // Uncomment when API key management is implemented
            // await api.patch(`/api/api-keys/${id}`, { status: 'revoked' });
            setApiKeys(prev => prev.map(k => k.id === id ? { ...k, status: 'revoked' } : k));
            console.log('Revoked API key:', id);
        } catch (error) {
            console.error('Failed to revoke key:', error);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    return (
        <div className="space-y-6 pb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('apiDocs.title')}</h1>
                    <p className="text-muted-foreground">{t('apiDocs.subtitle')}</p>
                </div>
                <a
                    href="/api-docs"
                    target="_blank"
                    rel="noopener"
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all shadow-sm text-sm font-semibold"
                >
                    <Code className="h-4 w-4" />
                    {t('apiDocs.openSwagger')}
                </a>
            </div>

            <div className="grid gap-6 lg:grid-cols-12">
                {/* Left: Documentation (Main) */}
                <div className="lg:col-span-8 space-y-6">
                    {/* REST Consumption Section */}
                    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="rounded-lg bg-indigo-100 dark:bg-indigo-900/30 p-2 text-indigo-600 dark:text-indigo-400">
                                <Terminal className="h-5 w-5" />
                            </div>
                                <h3 className="font-semibold text-foreground">{t('apiDocs.rest.title')}</h3>
                        </div>
                            <p className="text-sm text-muted-foreground mb-4">{t('apiDocs.rest.description')}</p>
                        <div className="bg-secondary rounded-lg p-4 font-mono text-xs border border-border">
                            <span className="text-muted-foreground">// Base header for all requests</span><br />
                            Authorization: Bearer {'<your_jwt_token>'}<br />
                            X-API-Key: cylinder-api-secret-2026
                        </div>
                        <div className="mt-4 p-3 bg-accent rounded-lg border border-border">
                            <h4 className="text-xs font-bold text-accent-foreground mb-1">{t('apiDocs.rest.securityTitle')}</h4>
                            <p className="text-[10px] text-accent-foreground/80 leading-relaxed">{t('apiDocs.rest.securityDesc')}</p>
                        </div>
                    </div>

                    {/* Endpoints Reference */}
                    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="rounded-lg bg-green-100 dark:bg-green-900/30 p-2 text-green-600 dark:text-green-400">
                                <Code className="h-5 w-5" />
                            </div>
                            <h3 className="font-semibold text-foreground">{t('apiDocs.endpoints.title')}</h3>
                        </div>

                        <div className="space-y-8">
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 text-xs font-bold font-mono">GET</span>
                                        <code className="text-sm font-mono text-foreground">/api/v1/today-summary</code>
                                    </div>
                                        <span className="text-[10px] text-muted-foreground font-medium tracking-wider uppercase">{t('apiDocs.endpoints.analytics')}</span>
                                </div>
                                <p className="text-xs text-muted-foreground">{t('apiDocs.endpoints.todaySummaryDesc')}</p>
                                <pre className="bg-secondary/50 dark:bg-slate-800/50 p-3 rounded-lg border border-border text-[11px] font-mono text-foreground overflow-x-auto">
                                    {`{
  "platforms": {
    "platform1": { "loaded": 10, "unloaded": 5, "status": "live" },
    ...
  },
  "total": { "loaded": 45, "unloaded": 20, "balance": 25 }
}`}
                                </pre>
                            </div>

                            <div className="border-t border-border"></div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 text-xs font-bold font-mono">GET</span>
                                        <code className="text-sm font-mono text-foreground">/video_feed/{'{platform}'}</code>
                                    </div>
                                    <span className="text-[10px] text-muted-foreground font-medium tracking-wider uppercase">{t('apiDocs.endpoints.streaming')}</span>
                                </div>
                                <p className="text-xs text-muted-foreground">{t('apiDocs.endpoints.videoFeedDesc')}</p>
                            </div>

                            <div className="border-t border-border"></div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 text-xs font-bold font-mono">POST</span>
                                        <code className="text-sm font-mono text-foreground">/set_zones/{'{platform}'}</code>
                                    </div>
                                    <span className="text-[10px] text-muted-foreground font-medium tracking-wider uppercase">{t('apiDocs.endpoints.configuration')}</span>
                                </div>
                                <p className="text-xs text-muted-foreground">{t('apiDocs.endpoints.setZonesDesc')}</p>
                                <pre className="bg-secondary/50 dark:bg-slate-800/50 p-3 rounded-lg border border-border text-[11px] font-mono text-foreground overflow-x-auto">
                                    {`{
  "A": { "p1": [120, 340], "p2": [450, 340] },
  "B": { "p1": [10, 100], "p2": [200, 150] },
  "C": { "p1": [300, 50], "p2": [500, 80] }
}`}
                                </pre>
                            </div>
                        </div>
                    </div>

                    {/* Socket.io Documentation */}
                    <div className="rounded-xl border border-blue-100 dark:border-blue-900/30 bg-card p-6 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="rounded-lg bg-blue-100 dark:bg-blue-900/30 p-2 text-blue-600 dark:text-blue-400">
                                <Activity className="h-5 w-5" />
                            </div>
                            <h3 className="font-semibold text-foreground">{t('apiDocs.socket.title')}</h3>
                        </div>
                        <p className="text-sm text-muted-foreground mb-4">{t('apiDocs.socket.description')}</p>
                        <div className="space-y-4">
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Event: dashboard_update</span>
                                <pre className="mt-2 bg-slate-900 text-blue-300 p-4 rounded-lg text-xs font-mono overflow-x-auto">
                                    {`{
  "platforms": {
    "platform1": {
      "zones": {
        "A": { "loaded": 5, "unloaded": 2 },
        "B": { "loaded": 10, "unloaded": 0 },
        "C": { "loaded": 2, "unloaded": 8 }
      },
      "total_loaded": 17,
      "total_unloaded": 10,
      "status": "live"
    }
  },
  "total": { "loaded": 150, "unloaded": 120, "balance": 30 },
  "hourly": {
    "labels": ["08:00", "09:00", "10:00"],
    "total": { "loaded": [10, 15, 8], "unloaded": [5, 2, 12] }
  }
}`}
                                </pre>
                            </div>
                        </div>
                    </div>

                    {/* Deployment & Production Section */}
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-card p-6 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="rounded-lg bg-slate-200 dark:bg-slate-800 p-2 text-slate-600 dark:text-slate-400">
                                <Layers className="h-5 w-5" />
                            </div>
                            <h3 className="font-semibold text-foreground">{t('apiDocs.deploy.title')}</h3>
                        </div>
                        <div className="space-y-4 text-sm text-muted-foreground">
                            <p>{t('apiDocs.deploy.description')}</p>
                            <ul className="list-disc list-inside space-y-2 ml-2">
                                <li>{t('apiDocs.deploy.devNote')}</li>
                                <li>{t('apiDocs.deploy.buildNote')}</li>
                            </ul>
                            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-900/30">
                                <p className="text-xs leading-relaxed text-blue-700 dark:text-blue-400">
                                    <span className="font-bold">{t('apiDocs.deploy.backendTipLabel')}</span> {t('apiDocs.deploy.backendTip')}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Integration Logs Section */}
                    <div className="rounded-xl border border-border bg-card p-6 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between mb-6 px-1">
                                <div className="flex items-center gap-3">
                                <div className="rounded-lg bg-orange-100 dark:bg-orange-900/30 p-2 text-orange-600 dark:text-orange-400">
                                    <Clock className="h-5 w-5" />
                                </div>
                                <h3 className="font-semibold text-foreground">{t('apiDocs.logs.title')}</h3>
                            </div>
                            <button
                                onClick={fetchData}
                                className="p-2 hover:bg-muted rounded-lg transition-colors"
                            >
                                <RefreshCcw className={cn("h-4 w-4 text-muted-foreground", isLoadingLogs && "animate-spin")} />
                            </button>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-muted border-y border-border">
                                    <tr>
                                        <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase">{t('apiDocs.logs.table.status')}</th>
                                        <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase">{t('apiDocs.logs.table.system')}</th>
                                        <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase">{t('apiDocs.logs.table.dateTime')}</th>
                                        <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase">{t('apiDocs.logs.table.returnMessage')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {isLoadingLogs ? (
                                        <tr>
                                            <td colSpan={4} className="px-4 py-8 text-center">
                                                <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground mb-2" />
                                                <p className="text-sm text-muted-foreground">Loading logs...</p>
                                            </td>
                                        </tr>
                                    ) : integrationLogs.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-4 py-8 text-center">
                                                <p className="text-sm text-muted-foreground">No integration logs found.</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        integrationLogs.map(log => {
                                            const statusValue = (log.status || 'unknown').toLowerCase();
                                            const isSuccess = statusValue === 'success';
                                            const statusLabel = statusValue === 'unknown' ? 'UNKNOWN' : statusValue.toUpperCase();

                                            return (
                                                <tr key={log.id} className="text-sm hover:bg-muted/30 transition-colors">
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        {isSuccess ? (
                                                            <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 font-medium text-xs">
                                                                <CheckCircle2 className="h-3 w-3" /> {t('apiDocs.status.success')}
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium text-xs">
                                                                <XCircle className="h-3 w-3" /> {t('apiDocs.status.unknown', { label: statusLabel })}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 font-semibold text-foreground">{log.system}</td>
                                                    <td className="px-4 py-3 text-muted-foreground text-xs">{log.date}</td>
                                                    <td className="px-4 py-3 text-muted-foreground text-xs italic">"{log.message}"</td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Right: Management */}
                <div className="lg:col-span-4 space-y-6">
                    {/* API Key Management */}
                    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="rounded-lg bg-blue-100 dark:bg-blue-900/30 p-2 text-blue-600 dark:text-blue-400">
                                    <Lock className="h-5 w-5" />
                                </div>
                                <h3 className="font-semibold text-foreground">Key Management</h3>
                            </div>
                            <button
                                onClick={handleGenerateKey}
                                className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                <Plus className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {apiKeys.map(key => (
                                <div key={key.id} className="p-4 rounded-xl border border-border bg-muted/30 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-foreground">{key.name}</span>
                                        <span className={cn(
                                            "text-[9px] px-2 py-0.5 rounded-full font-bold",
                                            (key.status === 'active') ? "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400" : "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                                        )}>
                                            {(key.status || 'unknown').toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <code className="flex-1 bg-background border border-border p-1.5 rounded text-[10px] font-mono text-muted-foreground truncate">
                                            {key.key}
                                        </code>
                                        <button
                                            onClick={() => copyToClipboard(key.key)}
                                            className="p-1.5 hover:bg-muted rounded transition-colors text-muted-foreground"
                                        >
                                            <Copy className="h-3.5 w-3.5" />
                                        </button>
                                        {key.status === 'active' && (
                                            <button
                                                onClick={() => handleRevokeKey(key.id)}
                                                className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-500 rounded transition-colors text-muted-foreground"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {apiKeys.length === 0 && !isLoadingKeys && (
                                <p className="text-center text-xs text-muted-foreground py-4">No keys found.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
