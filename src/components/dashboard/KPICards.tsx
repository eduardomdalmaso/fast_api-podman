
import { useState, useEffect, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp, ArrowDown, AlertTriangle, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

interface KPICardsProps {
    realtimeData?: any;
    platformFilter: string;
    timeFilter: 'hour' | 'day' | 'week' | 'month' | 'all' | 'custom';
    timeRange?: { start?: string | null; end?: string | null };
}

function KPICardsComponent({ realtimeData, platformFilter, timeFilter, timeRange }: KPICardsProps) {
    const { t } = useTranslation();
    const [stats, setStats] = useState({ loaded: 0, unloaded: 0, balance: 0 });
    const [isLoading, setIsLoading] = useState(true);

    // Fetch dashboard stats from charts API for the selected timeframe and sum buckets
    const timeRangeKey = JSON.stringify(timeRange || {});

    const fetchStats = async () => {
        setIsLoading(true);
        try {
            const platformKey = platformFilter === 'all' ? 'all' : platformFilter;
            // map custom ranges to a sensible aggregation endpoint
            const computeEndpoint = () => {
                // If a custom filter was selected but no start/end set yet,
                // avoid returning 'custom' (which is invalid for backend).
                if (timeFilter === 'custom' && !timeRange?.start && !timeRange?.end) {
                    return 'day';
                }

                if (timeRange?.start || timeRange?.end) {
                    if (!timeRange?.start || !timeRange?.end) return 'day';
                    const s = new Date(timeRange.start).getTime();
                    const e = new Date(timeRange.end).getTime();
                    const diffMs = Math.max(0, e - s);
                    const diffDays = diffMs / (1000 * 60 * 60 * 24);
                    if (diffMs <= 1000 * 60 * 60 * 24) return 'hour';
                    if (diffDays <= 7) return 'day';
                    if (diffDays <= 60) return 'week';
                    return 'month';
                }

                return timeFilter === 'all' ? 'month' : timeFilter;
            };

            const endpoint = computeEndpoint();
            const params: any = {};
            if (timeRange?.start) params.start = timeRange.start;
            if (timeRange?.end) params.end = timeRange.end;
            const search = new URLSearchParams(params).toString();
            const url = `/api/v1/charts/${platformKey}-${endpoint}` + (search ? `?${search}` : '');
            const response = await api.get(url);
            const buckets = response.data?.data || [];

            const totals = buckets.reduce(
                (acc: any, b: any) => ({
                    loaded: acc.loaded + (b.carregados || 0),
                    unloaded: acc.unloaded + (b.descarregados || 0),
                }),
                { loaded: 0, unloaded: 0 }
            );

            // Only update stats if we have meaningful data; keep previous stats if API returns empty
            // (This handles the case where a platform is deleted but data is persisted in the DB)
            const newStats = {
                loaded: totals.loaded,
                unloaded: totals.unloaded,
                balance: totals.loaded - totals.unloaded,
            };
            const hasData = totals.loaded > 0 || totals.unloaded > 0;
            setStats((prev) => {
                // If new data is empty but we have previous data, keep the previous data
                if (!hasData && (prev.loaded > 0 || prev.unloaded > 0)) return prev;
                return newStats;
            });
        } catch (error) {
            console.error('Failed to fetch stats:', error);
            // On error, keep previous stats (don't reset to 0)
            // This prevents data from disappearing when platform/camera is deleted
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        // initial fetch and when filters change
        fetchStats();

        const handler = (ev: Event) => {
            // @ts-ignore
            const detail = (ev as CustomEvent)?.detail || {};
            // If zones update pertains to a different platform we still want to refresh totals
            fetchStats();
        };

        window.addEventListener('zones:updated', handler as EventListener);
        return () => window.removeEventListener('zones:updated', handler as EventListener);
    }, [platformFilter, timeFilter, timeRangeKey]);

    // If realtimeData exists and timeframe is "now" (hour/all with no custom range), prefer realtime snapshot
    useEffect(() => {
        if (!realtimeData) return;
        if (timeRange && (timeRange.start || timeRange.end)) return;
        if (timeFilter !== 'hour' && timeFilter !== 'all') return;

        if (platformFilter === 'all') {
            const newStats = {
                loaded: realtimeData?.total?.loaded || 0,
                unloaded: realtimeData?.total?.unloaded || 0,
                balance: realtimeData?.total?.balance || 0
            };
            const hasLive = (newStats.loaded || newStats.unloaded);
            setStats((prev) => {
                if (!hasLive && (prev.loaded || prev.unloaded)) return prev; // keep fetched values when live payload is empty
                if (prev.loaded === newStats.loaded && prev.unloaded === newStats.unloaded && prev.balance === newStats.balance) return prev;
                return newStats;
            });
        } else {
            const platData = realtimeData?.platforms?.[platformFilter];
            if (platData) {
                const newStats = {
                    loaded: platData.total_loaded || 0,
                    unloaded: platData.total_unloaded || 0,
                    balance: (platData.total_loaded || 0) - (platData.total_unloaded || 0)
                };
                const hasLive = (newStats.loaded || newStats.unloaded);
                setStats((prev) => {
                    if (!hasLive && (prev.loaded || prev.unloaded)) return prev;
                    if (prev.loaded === newStats.loaded && prev.unloaded === newStats.unloaded && prev.balance === newStats.balance) return prev;
                    return newStats;
                });
            }
        }
    }, [realtimeData, platformFilter, timeFilter, timeRange?.start, timeRange?.end]);

    const platformLabel = platformFilter === 'all'
        ? t('dashboard.all_platforms')
        : `${t('dashboard.platform_label_prefix')}${platformFilter.replace('platform', '')}`;

    return (
        <>
            <div className={cn("grid gap-4 md:grid-cols-2 lg:grid-cols-4", isLoading && "opacity-60 pointer-events-none")}>
                {/* Card 1: Loaded */}
                <div className="rounded-xl bg-card p-4 shadow-sm border border-border flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="bg-green-500/10 p-3 rounded-full">
                            <ArrowUp className="h-8 w-8 text-green-600" />
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-foreground">{isLoading ? '...' : stats.loaded.toLocaleString()}</p>
                            <p className="text-sm font-medium text-muted-foreground">{
                                timeFilter === 'hour' ? t('dashboard.last_24') :
                                timeFilter === 'day' ? t('dashboard.last_7') :
                                timeFilter === 'week' ? t('dashboard.last_8_weeks') :
                                timeFilter === 'month' ? t('dashboard.last_6_months') :
                                t('dashboard.all')
                            }</p>
                        </div>
                    </div>
                </div>

                {/* Card 2: Unloaded */}
                <div className="rounded-xl bg-card p-4 shadow-sm border border-border flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="bg-red-500/10 p-3 rounded-full">
                            <ArrowDown className="h-8 w-8 text-red-600" />
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-foreground">{isLoading ? '...' : stats.unloaded.toLocaleString()}</p>
                            <p className="text-sm font-medium text-muted-foreground">{
                                timeFilter === 'hour' ? t('dashboard.last_24') :
                                timeFilter === 'day' ? t('dashboard.last_7') :
                                timeFilter === 'week' ? t('dashboard.last_8_weeks') :
                                timeFilter === 'month' ? t('dashboard.last_6_months') :
                                t('dashboard.all')
                            }</p>
                        </div>
                    </div>
                </div>

                {/* Card 3: Balance */}
                <div className={cn(
                    "rounded-xl p-4 shadow-sm border flex items-center justify-between transition-colors",
                    (isLoading ? 0 : stats.balance) >= 0
                        ? "bg-card dark:bg-blue-500/10 border-border dark:border-blue-500/20"
                        : "bg-card dark:bg-yellow-500/10 border-border dark:border-yellow-500/20"
                )}>
                    <div className="flex items-center gap-4">
                        <div className={cn(
                            "p-3 rounded-full",
                            (isLoading ? 0 : stats.balance) >= 0 ? "bg-blue-200/50" : "bg-yellow-200/50"
                        )}>
                            <AlertTriangle className={cn("h-8 w-8", (isLoading ? 0 : stats.balance) >= 0 ? "text-blue-600" : "text-yellow-600")} />
                        </div>
                        <div>
                            <p className="text-xl font-bold text-foreground">{t('dashboard.balance')} {isLoading ? '...' : (stats.balance > 0 ? '+' : '') + stats.balance}</p>
                            <p className="text-sm font-medium text-muted-foreground">{t('dashboard.cylinders')}</p>
                        </div>
                    </div>
                </div>

                {/* Card 4: Plataforma selecionada (sem status) */}
                <div
                    className="rounded-xl bg-card dark:bg-blue-500/10 p-4 shadow-sm border border-border dark:border-blue-500/20 flex items-center justify-between text-foreground"
                >
                    <div className="flex items-center gap-4">
                        <div className="bg-blue-200/50 p-3 rounded-full">
                            <Layers className="h-8 w-8 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-lg font-bold text-foreground">{platformLabel}</p>
                            <p className="text-sm font-medium text-muted-foreground">
                                {t('dashboard.filter_applied')}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export const KPICards = memo(KPICardsComponent);
