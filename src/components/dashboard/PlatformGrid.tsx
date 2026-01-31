import { useState, useEffect, memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Maximize2, VideoOff, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCameraStore } from '@/store/useCameraStore';
import api from '@/lib/api';
import { ZoneMappingModal } from './ZoneMappingModal';


interface PlatformGridProps {
    platformFilter: string;
    realtimeData?: any;
}

function PlatformGridComponent({ platformFilter, realtimeData }: PlatformGridProps) {
    const { t } = useTranslation();
    const cameras = useCameraStore((state: any) => state.cameras);
    const fetchCameras = useCameraStore((state: any) => state.fetchCameras);
    const [platformStats, setPlatformStats] = useState<any>({});
    const [zonesByPlatform, setZonesByPlatform] = useState<Record<string, any>>({});
    const [selectedPlatform, setSelectedPlatform] = useState<{ id: string, name: string } | null>(null);
    const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);

    useEffect(() => {
        if (!realtimeData?.platforms) return;
        const platformsPayload = realtimeData.platforms;
        const hasCounts = Object.values(platformsPayload || {}).some((p: any) => (p?.total_loaded || p?.total_unloaded));
        // Avoid wiping fetched stats with empty realtime payloads
        setPlatformStats((prev: any) => {
            if (!hasCounts && prev && Object.keys(prev).length > 0) return prev;
            return platformsPayload;
        });
    }, [realtimeData]);

    useEffect(() => {
        const fetchAllStats = async () => {
            try {
                const response = await api.get('/api/v1/today-summary', {
                    params: { platform: platformFilter },
                });
                setPlatformStats(response.data.platforms || {});
            } catch (error) {
                console.error('Failed to fetch platform grid stats:', error);
            }
        };
        fetchAllStats();
    }, [platformFilter]);

    useEffect(() => {
        if (!cameras.length) {
            fetchCameras().catch(() => {
                /* errors already handled in store */
            });
        }
    }, [cameras.length, fetchCameras]);

    // Clean stale cached zones when cameras list changes (but DO NOT clear platformStats
    // here — platform stats should be sourced from the backend (/today-summary) or
    // from realtime feeds and must not be dropped when a camera/platform is
    // temporarily removed from the local `cameras` list).
    useEffect(() => {
        const currentIds = new Set((cameras || []).map((c: any) => String(c.id)).filter(Boolean));
        // Remove zones for platforms that no longer exist
        setZonesByPlatform((prev) => {
            if (!prev) return {};
            const cleaned: Record<string, any> = {};
            Object.entries(prev).forEach(([k, v]) => {
                if (currentIds.has(k)) cleaned[k] = v;
            });
            return cleaned;
        });

        // NOTE: Intentionally do NOT remove entries from `platformStats` here.
        // Keeping `platformStats` intact ensures the dashboard KPIs/charts remain
        // populated using persisted data from the server even if a camera
        // entry is temporarily removed from the local `cameras` store.
    }, [cameras]);

    // Fetch zones for platforms that don't have them in realtime stats
    useEffect(() => {
        const platformIds = (cameras.length ? cameras.map((c: any) => c.id) : []).filter(Boolean);
        if (!platformIds.length) return;

        platformIds.forEach(async (platId: any) => {
            // Avoid fetching if we already have zones for this platform
            setZonesByPlatform((current) => {
                if (current && current[platId]) return current; // already present
                // trigger async fetch below (don't await inside setState)
                (async () => {
                    try {
                        const res = await api.get(`/get_zones/${platId}`);
                        setZonesByPlatform((s) => ({ ...s, [platId]: res.data || {} }));
                    } catch (err) {
                        setZonesByPlatform((s) => ({ ...s, [platId]: {} }));
                    }
                })();
                return current;
            });
        });
    }, [cameras]);

    // Listen for external zone updates (e.g., when zone editor saves) and refresh cache
    useEffect(() => {
        const handler = async (ev: Event) => {
            try {
                // @ts-ignore - CustomEvent detail
                const detail = (ev as CustomEvent)?.detail || {};
                const platId = detail.platform;
                if (!platId) return;

                // If the event already contains zone data, apply it immediately
                if (detail.zones) {
                    setZonesByPlatform((s) => ({ ...s, [platId]: detail.zones || {} }));
                    return;
                }

                // Otherwise, fetch from server but only if platform exists in cameras
                const known = cameras.find((c: any) => String(c.id) === String(platId));
                if (!known) return;
                const res = await api.get(`/get_zones/${platId}`);
                setZonesByPlatform((s) => ({ ...s, [platId]: res.data || {} }));
            } catch (err) {
                console.error('Failed to refresh zones after zones:updated event', err);
            }
        };

        window.addEventListener('zones:updated', handler as EventListener);
        return () => {
            window.removeEventListener('zones:updated', handler as EventListener);
        };
    }, [cameras]);

    // Memoize platform list to avoid recreating objects on every render (prevents unnecessary remounts
    // of children such as <img> which cause flicker when the element is recreated)
    const platforms = useMemo(() => {
        const base = cameras.length ? cameras.map((c: any) => {
            // Ensure stable id/name (avoid using Date.now or unstable fallbacks)
            const idStr = String(c.id ?? c.platform ?? `platform${c.platformId ?? '0'}`);
            const nameStr = String(c.name ?? c.id ?? idStr);
            return {
                id: idStr,
                name: nameStr,
                status: c.status ?? 'offline',
            };
        }) : Object.keys(platformStats).map((key: any) => ({
            id: String(key),
            name: String(key),
            status: platformStats?.[key]?.status === 'live' ? 'online' : 'offline',
        }));

        return base.map((p: any) => {
            const stats = platformStats?.[p.id];
            // expose numeric totals for conservative zone filtering below
            const numericLoaded = stats?.total_loaded !== undefined ? Number(stats.total_loaded) : 0;
            const numericUnloaded = stats?.total_unloaded !== undefined ? Number(stats.total_unloaded) : 0;
            return {
                ...p,
                // user-facing formatted strings
                loaded: numericLoaded.toLocaleString(),
                unloaded: numericUnloaded.toLocaleString(),
                // numeric values for logic
                numericLoaded,
                numericUnloaded,
                zones: stats?.zones && Object.keys(stats.zones).length ? stats.zones : (zonesByPlatform[p.id] || {}),
            };
        });
    }, [cameras, platformStats, zonesByPlatform]);

    // Conservative zone display: only show a zone's count if it represents
    // a sufficient fraction of the platform's total to avoid small spillover
    // counts appearing in adjacent zones. Adjust `THRESHOLD` to tune.
    const ZONE_DISPLAY_THRESHOLD = 0.25; // fraction of platform total
    const shouldShowZoneCount = (zoneCount: number, platformTotal: number) => {
        if (!zoneCount || zoneCount <= 0) return false;
        if (!platformTotal || platformTotal <= 0) return true; // show when no platform total available
        return (zoneCount / platformTotal) >= ZONE_DISPLAY_THRESHOLD;
    };

    const filteredPlatforms = platformFilter === 'all'
        ? platforms
        : platforms.filter((p: any) => String(p.id) === platformFilter);

    return (
        <>
            <div className="w-full min-w-full grid grid-flow-col auto-cols-[minmax(320px,320px)] gap-4 overflow-x-auto md:grid-flow-row md:auto-cols-auto md:grid-cols-2 lg:grid-cols-4">
                {filteredPlatforms.map((platform: any) => {
                    const isOnline = platform.status === 'online';
                    const videoUrl = `${api.defaults.baseURL}/video_feed/${platform.id}`;
                    const isExpanded = expandedPlatform === String(platform.id);
                    return (
                        <div key={platform.id} className={cn('min-w-[320px] flex-shrink-0')}>
                            <div
                                className={cn(
                                    'rounded-xl bg-card overflow-hidden border border-border shadow-sm transform-gpu min-h-[460px] relative',
                                    'transition-transform transition-shadow duration-200 ease-out',
                                    'hover:scale-[1.02] hover:shadow-lg hover:z-10'
                                )}
                                onClick={() => setSelectedPlatform({ id: platform.id, name: platform.name })}
                            >
                                <div className="bg-slate-800 dark:bg-slate-900 px-4 py-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-white">{platform.name}</span>
                                        <span className={cn('h-2 w-2 rounded-full', isOnline ? 'bg-green-400' : 'bg-red-400')} />
                                    </div>

                                    <button
                                        aria-label={isExpanded ? t('platform.collapse') : t('platform.expand')}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setExpandedPlatform((p) => (p === String(platform.id) ? null : String(platform.id)));
                                        }}
                                        className={cn(
                                            'p-2 rounded-lg transition-all duration-200 ease-out',
                                            'hover:bg-slate-600/50 hover:backdrop-blur-sm',
                                            'active:scale-95',
                                            isExpanded && 'bg-slate-600/30 backdrop-blur-sm'
                                        )}
                                        title={isExpanded ? t('platform.collapse') : t('platform.expand')}
                                    >
                                        <Maximize2 className={cn(
                                            'h-4 w-4 transition-all duration-200',
                                            isExpanded ? 'text-slate-200 scale-110' : 'text-slate-400'
                                        )} />
                                    </button>
                                </div>

                                <div
                                    className={cn(
                                        'aspect-video bg-slate-100 dark:bg-slate-800 relative group cursor-pointer border-b border-slate-200 dark:border-slate-700'
                                    )}
                                >
                                    <img
                                        src={videoUrl}
                                        alt={platform.name}
                                        className="absolute inset-0 w-full h-full object-cover"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                        }}
                                    />

                                    <div className="absolute inset-0 flex items-center justify-center bg-slate-800 hidden">
                                        <div className="flex flex-col items-center text-slate-500">
                                            <VideoOff className="h-10 w-10 mb-2" />
                                            <span className="text-xs">{t('platform.signal_lost')}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="px-6 py-4 bg-card dark:bg-slate-800">
                                    <div className="flex justify-between items-center text-sm mb-1">
                                        <span className="text-slate-600 dark:text-slate-400">{t('platform.loaded')}</span>
                                        <span className="font-bold text-foreground">{platform.loaded}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-600 dark:text-slate-400">{t('platform.unloaded')}</span>
                                        <span className="font-bold text-foreground">{platform.unloaded}</span>
                                    </div>

                                    <div className="mt-3">
                                        <div className="overflow-x-auto min-h-[72px]">
                                            <div className="flex gap-3 py-1">
                                                {(() => {
                                                    const pZones = platform.zones || {};
                                                    // Consider a zone "present" only when it has either
                                                    // numeric counts (loaded/unloaded) or coordinates (p1/p2).
                                                    const validZoneKeys = ['A', 'B', 'C'].filter((z) => {
                                                        const v = pZones[z];
                                                        return v !== undefined && v !== null && (
                                                            v.loaded !== undefined || v.unloaded !== undefined || v.p1 !== undefined
                                                        );
                                                    });

                                                    if (validZoneKeys.length === 0) {
                                                        return (
                                                            <div className="rounded border border-slate-200 dark:border-slate-600 p-2 bg-slate-50 dark:bg-slate-800 min-w-[508px] flex-1">
                                                                <div className="font-semibold text-slate-700 dark:text-slate-100">{t('platform.no_zones')}</div>
                                                                <div className="text-sm text-muted-foreground">{t('platform.create_zones')}</div>
                                                            </div>
                                                        );
                                                    }

                                                    return validZoneKeys.map((z) => (
                                                        <div key={z} className="rounded border border-slate-200 dark:border-slate-600 p-2 bg-slate-50 dark:bg-slate-800 min-w-[160px]">
                                                                    <div className="font-semibold text-slate-700 dark:text-slate-100">{t('platform.zone', { z })}</div>
                                                                    {(() => {
                                                                        const zoneLoaded = Number(platform.zones?.[z]?.loaded ?? 0);
                                                                        const zoneUnloaded = Number(platform.zones?.[z]?.unloaded ?? 0);
                                                                        const platTotalLoaded = Number(platform.numericLoaded ?? 0);
                                                                        const platTotalUnloaded = Number(platform.numericUnloaded ?? 0);
                                                                        const showLoaded = shouldShowZoneCount(zoneLoaded, platTotalLoaded);
                                                                        const showUnloaded = shouldShowZoneCount(zoneUnloaded, platTotalUnloaded);
                                                                        return (
                                                                            <>
                                                                                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                                                                                    <span>{t('platform.loaded')}</span>
                                                                                    <span className="font-bold text-green-600 dark:text-green-400">{showLoaded ? zoneLoaded : 0}</span>
                                                                                </div>
                                                                                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                                                                                    <span>{t('platform.unloaded')}</span>
                                                                                    <span className="font-bold text-red-600 dark:text-red-400">{showUnloaded ? zoneUnloaded : 0}</span>
                                                                                </div>
                                                                            </>
                                                                        );
                                                                    })()}
                                                        </div>
                                                    ));
                                                })()}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-end">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedPlatform({ id: platform.id, name: platform.name });
                                            }}
                                            className="text-xs text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 font-medium flex items-center gap-1"
                                        >
                                            {t('platform.configure_button')}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {selectedPlatform && (
                <ZoneMappingModal
                    isOpen={true}
                    onClose={() => setSelectedPlatform(null)}
                    platform={selectedPlatform.id}
                    platformName={selectedPlatform.name}
                />
            )}

            {/* Expand modal: modest overlay shown when user clicks expand */}
            {expandedPlatform && (() => {
                const plat = platforms.find((p: any) => String(p.id) === String(expandedPlatform));
                if (!plat) return null;
                const videoUrl = `${api.defaults.baseURL}/video_feed/${plat.id}`;

                return (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center"
                        onClick={() => setExpandedPlatform(null)}
                    >
                        <div className="absolute inset-0 bg-black/40" />

                        <div
                            className="relative w-[95%] max-w-6xl bg-card rounded-lg shadow-lg overflow-hidden z-10"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                                <div className="font-semibold">{plat.name}</div>
                                <button
                                    aria-label={t('platform.collapse')}
                                    onClick={() => setExpandedPlatform(null)}
                                    className="p-1 rounded hover:bg-slate-700"
                                >
                                    <X className="h-5 w-5 text-slate-400" />
                                </button>
                            </div>


                            <div className="w-full bg-slate-900 relative">
                                <img
                                    src={videoUrl}
                                    alt={plat.name}
                                    className="w-full h-[50vh] object-contain bg-black"
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                        (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                    }}
                                />

                                <div className="absolute inset-0 flex items-center justify-center bg-slate-800 hidden">
                                    <div className="flex flex-col items-center text-slate-500">
                                        <VideoOff className="h-10 w-10 mb-2" />
                                        <span className="text-xs">{t('platform.signal_lost')}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4">
                                <div className="flex gap-6">
                                    <div>
                                        <div className="text-sm text-muted-foreground">{t('platform.loaded')}</div>
                                        <div className="font-bold text-foreground text-lg">{plat.loaded}</div>
                                    </div>
                                    <div>
                                        <div className="text-sm text-muted-foreground">{t('platform.unloaded')}</div>
                                        <div className="font-bold text-foreground text-lg">{plat.unloaded}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </>
    );
}

// Memoize to prevent unnecessary re-renders when parent updates
export const PlatformGrid = memo(PlatformGridComponent);
