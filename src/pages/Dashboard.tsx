import { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useCameraStore } from '@/store/useCameraStore';

import { KPICards } from '@/components/dashboard/KPICards';
import { PlatformGrid } from '@/components/dashboard/PlatformGrid';
import { DashboardCharts } from '@/components/dashboard/DashboardCharts';
import { RefreshCcw, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSocket } from '@/hooks/useSocket';

const Dashboard = () => {
    const [timeFilter, setTimeFilter] = useState<'hour' | 'day' | 'week' | 'month' | 'all' | 'custom'>('all');
    const [platformFilter, setPlatformFilter] = useState('all');
        const [timeRangeStart, setTimeRangeStart] = useState<string | null>(null);
        const [timeRangeEnd, setTimeRangeEnd] = useState<string | null>(null);
        const [showCustomModal, setShowCustomModal] = useState(false);
        const [unsavedStart, setUnsavedStart] = useState<string | null>(null);
        const [unsavedEnd, setUnsavedEnd] = useState<string | null>(null);
    const cameras = useCameraStore((state: any) => state.cameras);
    const { t } = useTranslation();
    const [isReloading, setIsReloading] = useState(false);

    const [realtimeData, setRealtimeData] = useState<any>(null);

    const handleSocketUpdate = useCallback((data: any) => {
        setRealtimeData(data);
    }, []);

    useSocket(handleSocketUpdate);

    // Function to simulate data reloading without page refresh (preventing logout)
    const handleReload = () => {
        setIsReloading(true);
        window.location.reload(); // Actually reloading might be better if we want to refresh everything
    };

    // If cameras change and there's exactly one platform, default the filter to it
    useEffect(() => {
        const platformKeys = Array.from(new Set(cameras.map((c: any) => c.id || `platform${c.platformId || ''}`)));
        if (platformKeys.length === 1) {
            setPlatformFilter(String(platformKeys[0]));
        } else if (platformKeys.length > 1 && platformFilter !== 'all') {
            // keep existing selection if user changed it; otherwise default to 'all'
        }
    }, [cameras]);

    return (

        <div className="space-y-6">
            <div className="flex justify-start">
                <button
                    onClick={handleReload}
                    className={cn(
                        "flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors shadow-sm",
                        isReloading && "opacity-50 cursor-not-allowed bg-accent"
                    )}
                    disabled={isReloading}
                >
                    <RefreshCcw className={cn("h-4 w-4", isReloading && "animate-spin")} />
                    {isReloading ? t('dashboard.refreshing') : t('dashboard.refreshData')}
                </button>
            </div>

            {/* KPI Cards */}
            <KPICards realtimeData={realtimeData} platformFilter={platformFilter} timeFilter={timeFilter} timeRange={{ start: timeRangeStart, end: timeRangeEnd }} />

            {/* Filter Bar */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center justify-between rounded-xl bg-card dark:bg-slate-800 p-3 shadow-sm border border-border dark:border-slate-700">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{t('dashboard.timeframe')}</span>
                    <div className="relative">
                        <select
                            value={timeFilter}
                            onChange={(e) => {
                                const v = e.target.value as any;
                                if (v === 'custom') {
                                    setTimeFilter('custom');
                                    setUnsavedStart(timeRangeStart);
                                    setUnsavedEnd(timeRangeEnd);
                                    setShowCustomModal(true);
                                } else {
                                    setTimeFilter(v);
                                }
                            }}
                            className="flex items-center gap-2 rounded-lg bg-secondary dark:bg-slate-700 px-3 py-2 text-sm font-medium text-secondary-foreground dark:text-slate-300 hover:bg-accent dark:hover:bg-slate-600 min-w-[180px] appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 border border-border dark:border-slate-600"
                        >
                            <option value="all">{t('dashboard.all')}</option>
                            <option value="hour">{t('dashboard.last_24')}</option>
                            <option value="day">{t('dashboard.last_7')}</option>
                            <option value="week">{t('dashboard.last_8_weeks')}</option>
                            <option value="month">{t('dashboard.last_6_months')}</option>
                            <option value="custom">{t('dashboard.custom_range') || 'Custom range'}</option>
                        </select>
                    </div>

                    {/* custom range now opened from TimeFrame select; quick inputs removed */}
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{t('dashboard.platform')}</span>
                    <div className="relative">
                        <select
                            value={platformFilter}
                            onChange={(e) => setPlatformFilter(e.target.value)}
                            className="flex items-center gap-2 rounded-lg bg-secondary dark:bg-slate-700 px-3 py-2 text-sm font-medium text-secondary-foreground dark:text-slate-300 hover:bg-accent dark:hover:bg-slate-600 min-w-[140px] appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 border border-border dark:border-slate-600"
                        >
                            {(() => {
                                const platformKeys = Array.from(new Set(cameras.map((c: any) => c.id || `platform${c.platformId || ''}`))).filter(Boolean);
                                const list = [] as JSX.Element[];
                                if (platformKeys.length > 1) {
                                    list.push(<option key="all" value="all">{t('dashboard.all')}</option>);
                                }

                                // Sort by numeric suffix when possible
                                platformKeys.sort((a, b) => {
                                    const na = parseInt(String(a).match(/(\d+)$/)?.[1] || '0');
                                    const nb = parseInt(String(b).match(/(\d+)$/)?.[1] || '0');
                                    return na - nb;
                                });

                                platformKeys.forEach((p: any) => {
                                    const num = String(p).match(/(\d+)$/)?.[1] || p;
                                    list.push(<option key={String(p)} value={String(p)}>{t('dashboard.platform_label_prefix')}{num}</option>);
                                });

                                return list;
                            })()}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500 dark:text-slate-400 pointer-events-none" />
                    </div>
                </div>
            </div>

            {/* Platform Camera/Mosaic Grid */}
            <div className="overflow-x-auto pb-3 -mx-3 px-3">
                <div className="w-max">
                    <PlatformGrid platformFilter={platformFilter} realtimeData={realtimeData} />
                </div>
            </div>

            {/* Main Chart */}
            <DashboardCharts
                timeFilter={timeFilter}
                onTimeFilterChange={setTimeFilter}
                platformFilter={platformFilter}
                timeRange={{ start: timeRangeStart, end: timeRangeEnd }}
            />

            {showCustomModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setShowCustomModal(false)} />
                    <div className="relative bg-card rounded-lg p-6 w-[520px] shadow-lg border border-border">
                        <h3 className="text-lg font-bold mb-4">{t('dashboard.custom_range_modal_title') || 'Custom date & time range'}</h3>
                        <div className="flex flex-col gap-3">
                            <label className="text-sm text-muted-foreground">{t('dashboard.start') || 'Start'}</label>
                            <input
                                type="datetime-local"
                                value={unsavedStart || ''}
                                onChange={(e) => setUnsavedStart(e.target.value || null)}
                                className="rounded-lg bg-secondary dark:bg-slate-700 px-3 py-2 text-sm text-secondary-foreground dark:text-slate-300 border border-border dark:border-slate-600"
                            />
                            <label className="text-sm text-muted-foreground">{t('dashboard.end') || 'End'}</label>
                            <input
                                type="datetime-local"
                                value={unsavedEnd || ''}
                                onChange={(e) => setUnsavedEnd(e.target.value || null)}
                                className="rounded-lg bg-secondary dark:bg-slate-700 px-3 py-2 text-sm text-secondary-foreground dark:text-slate-300 border border-border dark:border-slate-600"
                            />
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                onClick={() => setShowCustomModal(false)}
                                className="px-3 py-1 rounded-lg border border-border text-sm"
                            >
                                {t('dashboard.cancel') || 'Cancel'}
                            </button>
                            <button
                                onClick={() => {
                                    // basic validation
                                    if (unsavedStart && unsavedEnd && new Date(unsavedStart) <= new Date(unsavedEnd)) {
                                        setTimeRangeStart(unsavedStart);
                                        setTimeRangeEnd(unsavedEnd);
                                        setTimeFilter('custom');
                                        setShowCustomModal(false);
                                    } else {
                                        // simple alert for invalid range
                                        // eslint-disable-next-line no-alert
                                        alert(t('dashboard.invalid_range') || 'Invalid range: start must be before end.');
                                    }
                                }}
                                className="px-3 py-1 rounded-lg bg-blue-600 text-white text-sm"
                            >
                                {t('dashboard.apply') || 'Apply'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
