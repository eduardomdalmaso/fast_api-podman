import { useEffect, useState, useMemo, memo } from 'react';
import { useDashboardSocket } from '../../hooks/useDashboardSocket';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { Loader2 } from 'lucide-react';

interface DashboardChartsProps {
    timeFilter: 'hour' | 'day' | 'week' | 'month' | 'all' | 'custom';
    onTimeFilterChange: (filter: 'hour' | 'day' | 'week' | 'month' | 'all') => void;
    platformFilter: string;
    timeRange?: { start?: string | null; end?: string | null };
}

export const DashboardCharts = memo(DashboardChartsComponent);

function DashboardChartsComponent({ timeFilter, onTimeFilterChange, platformFilter, timeRange }: DashboardChartsProps) {
    const { t } = useTranslation();
    const [data, setData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const { data: socketData, isConnected } = useDashboardSocket();

    const fetchChartData = async () => {
        setIsLoading(true);
        try {
            const platformKey = platformFilter === 'all' ? 'all' : platformFilter;
            // choose aggregation endpoint; if a custom timeRange is provided, infer aggregation
            const computeEndpoint = () => {
                // If the user selected 'custom' but hasn't applied a range yet,
                // default to 'day' to avoid requesting an invalid 'custom' period.
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

            const endpointFilter = computeEndpoint();
            // include optional start/end datetime as query params if provided
            const params: any = {};
            if (timeRange?.start) params.start = timeRange.start;
            if (timeRange?.end) params.end = timeRange.end;
            const search = new URLSearchParams(params).toString();
            const url = `/api/v1/charts/${platformKey}-${endpointFilter}` + (search ? `?${search}` : '');
            const response = await api.get(url);
            const newData = response.data.data || [];
            // Only update chart data if we have meaningful data; keep previous data if API returns empty
            // (This handles the case where a platform is deleted but data is persisted in the DB)
            setData((prev) => {
                // If new data is empty but we have previous data, keep the previous data
                if (newData.length === 0 && prev.length > 0) return prev;
                return newData;
            });
        } catch (error) {
            console.error('Failed to fetch chart data:', error);
            // On error, keep previous chart data (don't reset to empty)
            // This prevents charts from disappearing when platform/camera is deleted
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        // initial fetch when filters change
        fetchChartData();

        const handler = (ev: Event) => {
            // When zones change, re-fetch chart data so new zone D contributions appear
            // @ts-ignore
            const detail = (ev as CustomEvent)?.detail || {};
            fetchChartData();
        };

        window.addEventListener('zones:updated', handler as EventListener);
        return () => window.removeEventListener('zones:updated', handler as EventListener);
    }, [timeFilter, platformFilter, JSON.stringify(timeRange || {})]);

    // Real-time update from WebSocket (use for live views when no custom range)
    useEffect(() => {
        if (!socketData?.hourly || !isConnected) return;
        // Only apply live overlay when user is looking at "now" scopes (all/hour) and not a custom range
        if (timeRange?.start || timeRange?.end) return;
        if (timeFilter !== 'all' && timeFilter !== 'hour') return;

        const { labels, total, platforms } = socketData.hourly as any;
        const source = platformFilter === 'all' ? total : platforms?.[platformFilter];
        if (!source) return;

        // Ensure source has arrays before overwriting
        const isArray = (v: any) => Array.isArray(v);
        if (!isArray(source.loaded) || !isArray(source.unloaded)) return;

        const realTimeData = labels.map((label: string, index: number) => ({
            time: label,
            carregados: source.loaded[index] || 0,
            descarregados: source.unloaded[index] || 0,
        }));

        // Avoid wiping fetched historical data when the live payload is empty/zero
        const hasLiveValues = realTimeData.some((d: any) => (d.carregados || d.descarregados));
        if (!hasLiveValues && (data?.length || 0) > 0) return;

        setData(realTimeData);
    }, [socketData, isConnected, timeFilter, platformFilter, timeRange?.start, timeRange?.end]);

    const platformLabel = platformFilter === 'all'
        ? t('dashboard.all')
        : `${t('dashboard.platform_label_prefix')}${platformFilter.replace('platform', '')}`;

    const chartData = useMemo(() => data || [], [data]);

    return (
        <div className="rounded-xl bg-card dark:bg-slate-800 p-6 shadow-sm border border-border dark:border-slate-700">
            <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="font-bold text-lg text-foreground">
                    {t('dashboard.title')} ({platformLabel})
                </h3>
                <div className="flex gap-2">
                    <div className="flex bg-secondary dark:bg-slate-700 rounded-lg p-1 border border-border dark:border-slate-600">
                        <button
                            onClick={() => onTimeFilterChange('hour')}
                            className={cn("px-3 py-1 text-xs font-medium rounded shadow-sm transition-all", timeFilter === 'hour' ? "bg-blue-600 text-white" : "text-muted-foreground hover:text-foreground")}
                        >
                            {t('dashboard.hourly')}
                        </button>
                        <button
                            onClick={() => onTimeFilterChange('day')}
                            className={cn("px-3 py-1 text-xs font-medium rounded shadow-sm transition-all", timeFilter === 'day' ? "bg-blue-600 text-white" : "text-muted-foreground hover:text-foreground")}
                        >
                            {t('dashboard.daily')}
                        </button>
                        <button
                            onClick={() => onTimeFilterChange('week')}
                            className={cn("px-3 py-1 text-xs font-medium rounded shadow-sm transition-all", timeFilter === 'week' ? "bg-blue-600 text-white" : "text-muted-foreground hover:text-foreground")}
                        >
                            {t('dashboard.weekly')}
                        </button>
                        <button
                            onClick={() => onTimeFilterChange('month')}
                            className={cn("px-3 py-1 text-xs font-medium rounded shadow-sm transition-all", timeFilter === 'month' ? "bg-blue-600 text-white" : "text-muted-foreground hover:text-foreground")}
                        >
                            {t('dashboard.monthly')}
                        </button>
                    </div>
                </div>
            </div>

            <div className="h-[350px] w-full relative">
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-[1px] z-10 rounded-lg">
                        <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
                    </div>
                )}
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                        data={chartData}
                        margin={{
                            top: 10,
                            right: 30,
                            left: 0,
                            bottom: 0,
                        }}
                    >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border opacity-50" />
                        <XAxis
                            dataKey="time"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: 'currentColor', fontSize: 12 }}
                            className="text-muted-foreground"
                            dy={10}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: 'currentColor', fontSize: 12 }}
                            className="text-muted-foreground"
                            domain={[0, 'auto']}
                            allowDecimals={false}
                            minTickGap={10}
                        />
                        <Tooltip
                            contentStyle={{ borderRadius: '8px', backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                            itemStyle={{ color: 'inherit' }}
                        />
                        <Legend
                            verticalAlign="top"
                            align="right"
                            wrapperStyle={{ paddingBottom: '20px' }}
                            iconType="circle"
                        />
                        <Area
                            type="monotone"
                            dataKey="carregados"
                            name={t('dashboard.loaded')}
                            stackId="1"
                            stroke="#22c55e"
                            fill="transparent"
                            strokeWidth={3}
                            dot={{ fill: '#22c55e', r: 0 }}
                            activeDot={{ r: 6 }}
                        />
                        <Area
                            type="monotone"
                            dataKey="descarregados"
                            name={t('dashboard.unloaded')}
                            stackId="2"
                            stroke="#ef4444"
                            fill="transparent"
                            strokeWidth={3}
                            dot={{ fill: '#ef4444', r: 0 }}
                            activeDot={{ r: 6 }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
