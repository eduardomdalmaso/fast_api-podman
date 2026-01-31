import { useState, useMemo, useEffect } from 'react';
import {
    FileText,
    Download,
    Filter,
    Loader2,
    CheckCircle2,
    XCircle,
    Activity,
    ClipboardList,
    RefreshCcw,
    Search
} from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { ReportItem } from '@/utils/mockData';
import { useCameraStore } from '@/store/useCameraStore';
import { useTranslation } from 'react-i18next';

interface IntegrationLog {
    id: string;
    system: string;
    status: 'success' | 'error';
    date: string;
    message: string;
}

const Reports = () => {
    const { t, i18n } = useTranslation();
    // Page State
    const [activeTab, setActiveTab] = useState<'operations' | 'integrations'>('operations');

    // Operations States
    const [platformFilter, setPlatformFilter] = useState('all');
    const cameras = useCameraStore((state: any) => state.cameras);
    const [zoneFilter, setZoneFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [includeTime, setIncludeTime] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 25;

    const [allData, setAllData] = useState<ReportItem[]>([]);
    const [integrationLogs, setIntegrationLogs] = useState<IntegrationLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    // Fetch data from API
    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const params: any = {};
            if (startDate) params.start = startDate;
            if (endDate) params.end = endDate;
            if (platformFilter !== 'all') params.platform = platformFilter;
            if (zoneFilter && zoneFilter !== 'all') params.zone = zoneFilter;
                if (typeFilter && typeFilter !== 'all') params.dir = typeFilter;

            const [reportsRes, logsRes] = await Promise.all([
                api.get('/api/v1/reports', { params }),
                api.get('/api/v1/integration-logs')
            ]);
            // API returns { data: [...], total: n }
            setAllData(reportsRes.data.data || []);
            setIntegrationLogs(logsRes.data.data || []);
        } catch (error) {
            console.error('Failed to fetch data:', error);
            // Set empty arrays on error to prevent blank page
            setAllData([]);
            setIntegrationLogs([]);
        } finally {
            setIsLoading(false);
        }
    };

    // Refetch when filters that should be server-side change
    useEffect(() => {
        fetchData();
    }, [platformFilter, zoneFilter, startDate, endDate]);

    // Filter Logic for Operations (Local filtering for Type, as it's quick)
    // Helper: map a returned label/value to internal direction key ('loaded'|'unloaded')
    const toInternalDirection = (item: any) => {
        const raw = (item.direction || item.operation || '').toString().trim();
        const v = raw.toLowerCase();
        const dashLoaded = t('dashboard.loaded')?.toString().toLowerCase() || 'loaded';
        const dashUnloaded = t('dashboard.unloaded')?.toString().toLowerCase() || 'unloaded';
        const repEmbark = t('reports.filters.embark')?.toString().toLowerCase() || 'embark';
        const repDisembark = t('reports.filters.disembark')?.toString().toLowerCase() || 'disembark';
        if (v === 'loaded' || v === dashLoaded || v === repEmbark || v === 'embark') return 'loaded';
        if (v === 'unloaded' || v === dashUnloaded || v === repDisembark || v === 'disembark') return 'unloaded';
        return v;
    };

    const filteredData = useMemo(() => {
        return allData.filter(item => {
            const matchesType = typeFilter === 'all' || toInternalDirection(item) === typeFilter;
            return matchesType;
        });
    }, [allData, typeFilter, t]);

    // Sorting + Pagination Logic
    const defaultDirectionForKey = (key: string) => {
        if (key === 'quantity') return 'desc';
        if (key === 'timestamp') return 'asc';
        return 'asc';
    };

    const handleSort = (key: string) => {
        if (sortKey === key) {
            setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDirection(defaultDirectionForKey(key));
        }
        setCurrentPage(1);
    };

    const sortedData = useMemo(() => {
        const dataCopy = filteredData.slice();
        if (!sortKey) return dataCopy;

        const getValue = (item: any, key: string) => {
            if (key === 'timestamp') {
                const d = new Date(item.timestamp);
                return isNaN(d.getTime()) ? 0 : d.getTime();
            }
            if (key === 'quantity') return Number(item.quantity) || 0;
            return (item[key] || '').toString().toLowerCase();
        };

        dataCopy.sort((a: any, b: any) => {
            const va = getValue(a, sortKey as string);
            const vb = getValue(b, sortKey as string);

            const dir = sortDirection === 'asc' ? 1 : -1;

            if (typeof va === 'number' && typeof vb === 'number') {
                return (va - vb) * dir;
            }
            return String(va).localeCompare(String(vb)) * dir;
        });

        return dataCopy;
    }, [filteredData, sortKey, sortDirection]);

    const totalPages = Math.ceil(sortedData.length / itemsPerPage);
    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return sortedData.slice(start, start + itemsPerPage);
    }, [sortedData, currentPage, itemsPerPage]);

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [platformFilter, typeFilter, startDate, endDate]);

    // Reset page when zone filter changes as well
    useEffect(() => {
        setCurrentPage(1);
    }, [zoneFilter]);

    // Derive zone options from selected platform (or all platforms)
    const zoneOptions = useMemo(() => {
        try {
            let options: string[] = [];
            if (platformFilter !== 'all') {
                const cam = Array.isArray(cameras) ? cameras.find((c: any) => String(c.id) === String(platformFilter)) : null;
                const zonesObj = cam?.zones || {};
                options = ['all', ...Object.keys(zonesObj)];
            } else {
                const allZones = new Set<string>();
                if (Array.isArray(cameras)) {
                    for (const c of cameras) {
                        const zs = c?.zones || {};
                        for (const k of Object.keys(zs)) allZones.add(k);
                    }
                }
                options = ['all', ...Array.from(allZones)];
            }
            // Fallback to default zones A,B,C,D when none discovered
            if (!options || options.length <= 1) {
                return ['all', 'A', 'B', 'C', 'D'];
            }
            return options;
        } catch (e) {
            return ['all', 'A', 'B', 'C'];
        }
    }, [cameras, platformFilter]);

    const handleExport = async (format: 'PDF' | 'Excel' | 'CSV') => {
        // Allow export even when no data is present; backend will generate headers/placeholders

        setIsExporting(true);
        try {
            // Map frontend filters to backend expected format
            const localePref = (i18n?.language || '').toString().toLowerCase().startsWith('pt') ? 'pt_BR' : 'en_US';
            const exportData = {
                platform: platformFilter,
                zone: zoneFilter,
                direction: typeFilter, // typeFilter now holds 'all'|'loaded'|'unloaded'
                startDate: startDate,
                endDate: endDate
            , lang: localePref
            };

            if (activeTab === 'operations') {
                let endpoint = '';
                let filename = `relatorio_operacoes_${new Date().toISOString().slice(0, 10)}`;
                if (format === 'PDF') {
                    endpoint = '/api/v1/reports/export/pdf';
                    filename += '.pdf';
                } else if (format === 'Excel') {
                    endpoint = '/api/v1/reports/export/excel';
                    filename += '.xlsx';
                } else if (format === 'CSV') {
                    endpoint = '/api/v1/reports/export/csv';
                    filename += '.csv';
                }

                // Before generating the file, verify there is data for
                // the selected filters. If there are zero rows, show
                // an alert and do not generate an (empty) file.
                const directionVal = exportData.direction;
                const checkParams: any = {
                    start: exportData.startDate,
                    end: exportData.endDate,
                    platform: exportData.platform,
                    zone: exportData.zone,
                    dir: directionVal
                };

                const checkRes = await api.get('/api/v1/reports', { params: checkParams });
                const total = checkRes?.data?.total ?? 0;
                if (total === 0) {
                    alert('Não há dados para os filtros selecionados. Selecione um dia com dados antes de exportar.');
                    setIsExporting(false);
                    return;
                }

                const response = await api.post(endpoint, exportData, {
                    responseType: 'blob'
                });
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', filename);
                document.body.appendChild(link);
                link.click();
                link.parentNode?.removeChild(link);
            } else {
                alert(`Integration logs export to ${format} is under development`);
            }
        } catch (error: any) {
            console.error('Failed to export:', error);
            // Friendly messages for common server responses
            const status = error?.response?.status;
            if (status === 404 || status === 400) {
                alert(`Cannot generate ${format} because there is no data for the selected filters.`);
            } else if (status === 500) {
                alert(`Server error while generating ${format}. Please try again later.`);
            } else {
                alert(`Could not generate ${format}. Please check the filters and try again.`);
            }
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">{t('reports.title')}</h1>
                <p className="text-slate-500">{t('reports.subtitle')}</p>
            </div>

            {/* Tab Switcher */}
            <div className="flex p-1 bg-secondary rounded-xl w-fit border border-border">
                    <button
                    onClick={() => setActiveTab('operations')}
                    className={cn(
                        "flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-lg transition-all",
                        activeTab === 'operations'
                            ? "bg-background text-blue-600 shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    <ClipboardList className="h-4 w-4" />
                    {t('reports.tabs.operations')}
                </button>
                <button
                    onClick={() => setActiveTab('integrations')}
                    className={cn(
                        "flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-lg transition-all",
                        activeTab === 'integrations'
                            ? "bg-background text-blue-600 shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    <Activity className="h-4 w-4" />
                    {t('reports.tabs.integrations')}
                </button>
            </div>

            {activeTab === 'operations' ? (
                <>
                    {/* Operations Filters Section */}
                    <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
                        <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
                            <div className="flex items-center gap-2 text-foreground font-semibold">
                                <Filter className="h-5 w-5 text-blue-600" />
                                <h2>{t('reports.filters.title')}</h2>
                            </div>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-border text-blue-600 focus:ring-blue-500"
                                        checked={includeTime}
                                        onChange={(e) => setIncludeTime(e.target.checked)}
                                    />
                                    <span>{t('reports.filters.includeTime') || 'Incluir hora'}</span>
                                </label>
                                <button
                                    onClick={() => {
                                        setPlatformFilter('all');
                                        setZoneFilter('all');
                                        setTypeFilter('all');
                                        setStartDate('');
                                        setEndDate('');
                                        setIncludeTime(false);
                                        setCurrentPage(1);
                                    }}
                                    className="px-3 py-1 text-xs font-medium rounded-lg border border-border bg-secondary text-muted-foreground hover:bg-accent transition-colors"
                                >
                                    {t('reports.filters.reset') || 'Resetar filtros'}
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-muted-foreground mb-1">{t('reports.filters.platform')}</label>
                                <select
                                    className="w-full rounded-lg bg-background border-border border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={platformFilter}
                                    onChange={(e) => setPlatformFilter(e.target.value)}
                                >
                                    <option value="all">{t('dashboard.all_platforms')}</option>
                                    {Array.isArray(cameras) && cameras.length > 0 ? (
                                        cameras.map((c: any) => (
                                            <option key={c.id} value={String(c.id)}>{c.name || c.id}</option>
                                        ))
                                    ) : null}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-muted-foreground mb-1">{t('reports.filters.zone')}</label>
                                <select
                                    className="w-full rounded-lg bg-background border-border border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={zoneFilter}
                                    onChange={(e) => setZoneFilter(e.target.value)}
                                >
                                    {zoneOptions.map((z) => (
                                        <option key={z} value={z}>{z === 'all' ? t('reports.filters.all') : z}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-muted-foreground mb-1">{t('reports.filters.operationType')}</label>
                                <select
                                    className="w-full rounded-lg bg-background border-border border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={typeFilter}
                                    onChange={(e) => setTypeFilter(e.target.value)}
                                >
                                    <option value="all">{t('reports.filters.all')}</option>
                                    <option value="loaded">{t('reports.filters.embark')}</option>
                                    <option value="unloaded">{t('reports.filters.disembark')}</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-muted-foreground mb-1">{t('reports.filters.startDate')}</label>
                                <input
                                    type={includeTime ? 'datetime-local' : 'date'}
                                    className="w-full rounded-lg bg-background border-border border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-muted-foreground mb-1">{t('reports.filters.endDate')}</label>
                                <input
                                    type={includeTime ? 'datetime-local' : 'date'}
                                    className="w-full rounded-lg bg-background border-border border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    

                    {/* Actions Bar */}
                        <div className="flex justify-between items-center bg-blue-500/10 p-4 rounded-lg border border-blue-500/20">
                            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                            <FileText className="h-5 w-5" />
                            <span className="font-medium">{t('reports.results.count', { count: filteredData.length })}</span>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <button
                                onClick={() => handleExport('PDF')}
                                disabled={isExporting}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-background border border-border rounded-lg hover:bg-accent transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isExporting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <FileText className="h-4 w-4" />
                                )}
                                {isExporting ? t('reports.actions.exporting') : t('reports.actions.exportPDF')}
                            </button>
                            <button
                                onClick={() => handleExport('Excel')}
                                disabled={isExporting}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-600 bg-background border border-border rounded-lg hover:bg-accent transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isExporting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Download className="h-4 w-4" />
                                )}
                                {isExporting ? t('reports.actions.exporting') : t('reports.actions.exportExcel')}
                            </button>
                            <button
                                onClick={() => handleExport('CSV')}
                                disabled={isExporting}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 bg-background border border-border rounded-lg hover:bg-accent transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isExporting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Activity className="h-4 w-4" />
                                )}
                                {isExporting ? t('reports.actions.exporting') : t('reports.actions.exportCSV')}
                            </button>
                        </div>
                    </div>

                    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-border">
                                <thead className="bg-secondary/50">
                                    <tr>
                                            <th
                                                onClick={() => handleSort('timestamp')}
                                                role="button"
                                                tabIndex={0}
                                                className="px-3 sm:px-4 md:px-6 py-3 text-left text-xs font-medium text-muted-foreground dark:text-white uppercase tracking-wider cursor-pointer select-none"
                                            >
                                                {t('reports.table.dateTime')}
                                                <span className="ml-1 text-xs">{sortKey === 'timestamp' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</span>
                                            </th>
                                            <th
                                                onClick={() => handleSort('platform')}
                                                role="button"
                                                tabIndex={0}
                                                className="px-3 sm:px-4 md:px-6 py-3 text-left text-xs font-medium text-muted-foreground dark:text-white uppercase tracking-wider cursor-pointer select-none"
                                            >
                                                {t('reports.table.platform')}
                                                <span className="ml-1 text-xs">{sortKey === 'platform' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</span>
                                            </th>
                                            <th
                                                onClick={() => handleSort('zone')}
                                                role="button"
                                                tabIndex={0}
                                                className="px-3 sm:px-4 md:px-6 py-3 text-left text-xs font-medium text-muted-foreground dark:text-white uppercase tracking-wider cursor-pointer select-none"
                                            >
                                                {t('reports.table.zones') || 'Zones'}
                                                <span className="ml-1 text-xs">{sortKey === 'zone' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</span>
                                            </th>
                                            <th
                                                onClick={() => handleSort('operation')}
                                                role="button"
                                                tabIndex={0}
                                                className="px-3 sm:px-4 md:px-6 py-3 text-left text-xs font-medium text-muted-foreground dark:text-white uppercase tracking-wider cursor-pointer select-none"
                                            >
                                                {t('reports.table.operation')}
                                                <span className="ml-1 text-xs">{sortKey === 'operation' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</span>
                                            </th>
                                            <th
                                                onClick={() => handleSort('quantity')}
                                                role="button"
                                                tabIndex={0}
                                                className="px-3 sm:px-4 md:px-6 py-3 text-left text-xs font-medium text-muted-foreground dark:text-white uppercase tracking-wider cursor-pointer select-none"
                                            >
                                                {t('reports.table.qtyCylinders')}
                                                <span className="ml-1 text-xs">{sortKey === 'quantity' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</span>
                                            </th>
                                            {/* User column removed */}
                                        </tr>
                                </thead>
                                <tbody className="bg-card divide-y divide-border relative min-h-[20vh] md:min-h-[200px]">
                                    {isLoading ? (
                                        <tr>
                                                <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                                                    <Loader2 className="h-10 w-10 mx-auto text-blue-500 animate-spin mb-3" />
                                                    <p className="text-lg font-medium">{t('reports.loading.data')}</p>
                                                </td>
                                            </tr>
                                    ) : paginatedData.length > 0 ? (
                                        paginatedData.map((item: any, idx) => {
                                            // Backend returns { date, time, timestamp, platform, zone, direction, count }
                                            const key = item.id ?? `${item.platform || 'plat'}-${item.timestamp || item.date || 'nodate'}-${item.zone || 'nozone'}-${item.direction || 'nodir'}-${idx}`;
                                            // Determine internal direction and localized label
                                            const internalDir = toInternalDirection(item);
                                            const operationLabel = internalDir === 'loaded' ? t('dashboard.loaded') : internalDir === 'unloaded' ? t('dashboard.unloaded') : (item.operation || item.direction || '-');
                                            return (
                                                <tr key={key} className="hover:bg-secondary/30 transition-colors">
                                                    <td className="px-3 sm:px-4 md:px-6 py-4 text-sm text-foreground font-medium">{item.timestamp || item.date || '-'}</td>
                                                    <td className="px-3 sm:px-4 md:px-6 py-4 text-sm text-muted-foreground max-w-[12rem] break-words">{item.platform}</td>
                                                    <td className="px-3 sm:px-4 md:px-6 py-4 text-sm text-muted-foreground max-w-[12rem] break-words">{item.zone || '-'}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                        <span className={cn(
                                                            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                                                            internalDir === 'loaded' ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
                                                        )}>
                                                            {operationLabel}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 sm:px-4 md:px-6 py-4 text-sm text-foreground font-bold">{item.count ?? item.quantity ?? 0}</td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                                                <Search className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                                                <p className="text-lg font-medium">{t('reports.empty.noRecords')}</p>
                                                <p className="text-sm">{t('reports.empty.tryFilters')}</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                            <div className="px-6 py-4 bg-secondary/30 border-t border-border flex items-center justify-between">
                                <div className="text-sm text-muted-foreground">
                                    {t('reports.pagination.showing')} <span className="font-medium text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> {t('reports.pagination.to')} <span className="font-medium text-foreground">{Math.min(currentPage * itemsPerPage, filteredData.length)}</span> {t('reports.pagination.of')} <span className="font-medium text-foreground">{filteredData.length}</span> {t('reports.pagination.results')}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                        disabled={currentPage === 1}
                                        className="px-3 py-1 text-sm font-medium rounded border border-border bg-background text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {t('reports.pagination.previous')}
                                    </button>
                                    <div className="flex items-center gap-1">
                                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                                            <button
                                                key={page}
                                                onClick={() => setCurrentPage(page)}
                                                className={cn(
                                                    "w-8 h-8 text-sm font-medium rounded transition-colors",
                                                    currentPage === page
                                                        ? "bg-blue-600 text-white"
                                                        : "text-muted-foreground hover:bg-accent"
                                                )}
                                            >
                                                {page}
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                        disabled={currentPage === totalPages}
                                        className="px-3 py-1 text-sm font-medium rounded border border-border bg-background text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {t('reports.pagination.next')}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <>
                    {/* Integration Logs View */}
                    <div className="flex justify-between items-center bg-orange-500/10 p-4 rounded-lg border border-orange-500/20">
                        <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
                            <Activity className="h-5 w-5" />
                            <span className="font-medium">{t('reports.integrations.title')}</span>
                        </div>
                        <button
                            onClick={fetchData}
                            className="text-xs flex items-center gap-2 font-medium text-orange-600 dark:text-orange-400 hover:underline"
                        >
                            <RefreshCcw className={cn("h-3 w-3", isLoading && "animate-spin")} />
                            {t('reports.integrations.refresh')}
                        </button>
                    </div>

                    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden min-h-[400px]">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-border">
                                <thead className="bg-secondary/50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground dark:text-white uppercase tracking-wider">{t('apiDocs.logs.table.status')}</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground dark:text-white uppercase tracking-wider">{t('apiDocs.logs.table.system')}</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground dark:text-white uppercase tracking-wider">{t('apiDocs.logs.table.dateTime')}</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground dark:text-white uppercase tracking-wider">{t('apiDocs.logs.table.returnMessage')}</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-card divide-y divide-border relative">
                                    {isLoading ? (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                                                <Loader2 className="h-10 w-10 mx-auto text-blue-500 animate-spin mb-3" />
                                                <p className="text-lg font-medium">{t('reports.loading.logs')}</p>
                                            </td>
                                        </tr>
                                    ) : integrationLogs.length > 0 ? (
                                        integrationLogs.map((log) => (
                                            <tr key={log.id} className="hover:bg-secondary/30 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                    {log.status === 'success' ? (
                                                        <span className="inline-flex items-center gap-1.5 text-green-700 font-semibold px-2 py-1 bg-green-50 rounded-lg border border-green-100">
                                                            <CheckCircle2 className="h-3.5 w-3.5" /> {t('reports.status.success')}
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 text-red-700 font-semibold px-2 py-1 bg-red-50 rounded-lg border border-red-100">
                                                            <XCircle className="h-3.5 w-3.5" /> {t('reports.status.failure')}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground font-bold">{log.system}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground font-mono">{log.date}</td>
                                                <td className="px-6 py-4 text-sm text-muted-foreground italic">"{log.message}"</td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                                                <Search className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                                                <p className="text-lg font-medium">{t('reports.integrations.empty')}</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default Reports;


