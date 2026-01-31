import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Check, Trash2, Edit2, Info, RefreshCw } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/useAuthStore';
import { hasPagePermission } from '@/lib/permissions';

interface Point {
    x: number;
    y: number;
}

type Zones = Record<string, [Point, Point] | null>;

interface ZoneMappingModalProps {
    isOpen: boolean;
    onClose: () => void;
    platform: string;
    platformName: string;
}

const DEFAULT_COLORS = [
    'rgba(34, 197, 94, 0.95)', // green
    'rgba(245, 158, 11, 0.95)', // amber
    'rgba(59, 130, 246, 0.95)', // blue
    'rgba(168, 85, 247, 0.95)', // purple
    'rgba(236, 72, 153, 0.95)', // pink
    'rgba(14, 165, 233, 0.95)', // sky
    'rgba(132, 204, 22, 0.95)', // lime
    'rgba(249, 115, 22, 0.95)', // orange
];

const ZONE_STYLE_CLASSES = [
    'border-green-500 bg-green-50 dark:bg-green-900 dark:border-green-600 text-slate-800 dark:text-white border-solid',
    'border-amber-500 bg-amber-50 dark:bg-amber-900 dark:border-amber-600 text-slate-800 dark:text-white border-solid',
    'border-blue-500 bg-blue-50 dark:bg-blue-900 dark:border-blue-600 text-slate-800 dark:text-white border-solid',
    'border-purple-500 bg-purple-50 dark:bg-purple-900 dark:border-purple-600 text-slate-800 dark:text-white border-solid',
    'border-pink-500 bg-pink-50 dark:bg-pink-900 dark:border-pink-600 text-slate-800 dark:text-white border-solid',
    'border-sky-500 bg-sky-50 dark:bg-sky-900 dark:border-sky-600 text-slate-800 dark:text-white border-solid',
    'border-lime-500 bg-lime-50 dark:bg-lime-900 dark:border-lime-600 text-slate-800 dark:text-white border-solid',
    'border-orange-500 bg-orange-50 dark:bg-orange-900 dark:border-orange-600 text-slate-800 dark:text-white border-solid',
];

const FIXED_ZONE_NAMES = ['A', 'B', 'C'];

function zoneIndex(name: string) {
    let sum = 0;
    for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    return sum % DEFAULT_COLORS.length;
}

function getZoneColor(name: string) {
    return DEFAULT_COLORS[zoneIndex(name)];
}

function getZoneStyleClass(name: string) {
    return ZONE_STYLE_CLASSES[zoneIndex(name)];
}

export function ZoneMappingModal({ isOpen, onClose, platform, platformName }: ZoneMappingModalProps) {
    const { t } = useTranslation();
    const user = useAuthStore((state) => state.user);
    // allow editing zones if user has page permission 'cameras' (admins included)
    const canEditZones = hasPagePermission(user, 'cameras');
    
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoStreamUrl = useRef<string | null>(null);
    const [zones, setZones] = useState<Zones>({});
    const [currentZone, setCurrentZone] = useState<string | null>(null);
    const [tempPoints, setTempPoints] = useState<Point[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isStreamConnected, setIsStreamConnected] = useState(false);
    const animationFrameRef = useRef<number | null>(null);
    const hiddenImgRef = useRef<HTMLImageElement | null>(null);
    
    // Keep refs in sync with state for use in draw loop
    const currentZoneRef = useRef<string | null>(null);
    const tempPointsRef = useRef<Point[]>([]);
    const zonesRef = useRef<Zones>({});
    
    useEffect(() => {
        currentZoneRef.current = currentZone;
        tempPointsRef.current = tempPoints;
        zonesRef.current = zones;
    }, [currentZone, tempPoints, zones]);

    useEffect(() => {
        // Keep zonesRef in sync whenever zones state changes
        zonesRef.current = zones;
    }, [zones]);

    useEffect(() => {
        if (isOpen) {
            loadInitialData();
            startLiveStream();
        } else {
            stopLiveStream();
        }
        return () => stopLiveStream();
    }, [isOpen, platform]);

    const startLiveStream = () => {
        stopLiveStream();
        const baseUrl = import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin;
        const url = `${baseUrl}/video_feed/${platform}`;
        videoStreamUrl.current = url;
        
        // Start rendering immediately
        setupStreamCanvas();
    };

    const setupStreamCanvas = () => {
        if (!canvasRef.current || !videoStreamUrl.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Create hidden image element that receives continuous MJPEG stream
        if (hiddenImgRef.current) {
            hiddenImgRef.current.src = '';
            if (document.body.contains(hiddenImgRef.current)) {
                document.body.removeChild(hiddenImgRef.current);
            }
        }
        
        const hiddenImg = new Image();
        hiddenImg.crossOrigin = "use-credentials";
        hiddenImg.style.display = 'none';
        document.body.appendChild(hiddenImg);
        hiddenImgRef.current = hiddenImg;
        
        console.log('[ZoneModal] Setting up stream with URL:', videoStreamUrl.current);
        
        let frameCount = 0;
        let isDrawing = false;
        let successfulFrames = 0;

        const draw = () => {
            if (isDrawing) {
                animationFrameRef.current = requestAnimationFrame(draw);
                return;
            }

            try {
                isDrawing = true;
                frameCount++;
                
                // Draw every frame
                ctx.fillStyle = '#f3f4f6';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // Draw hidden image if it's loaded
                if (hiddenImg.complete && hiddenImg.naturalWidth > 0) {
                    try {
                        ctx.drawImage(hiddenImg, 0, 0, canvas.width, canvas.height);
                        successfulFrames++;
                        if (successfulFrames === 1) {
                            console.log('[ZoneModal] First frame rendered successfully');
                        }
                        if (!isStreamConnected) {
                            setIsStreamConnected(true);
                        }
                    } catch (error) {
                        console.debug('[ZoneModal] Image draw attempt error:', error);
                    }
                }
                
                // Debug: Log render state every 30 frames
                if (frameCount % 30 === 0) {
                    console.log(`[ZoneModal] Frame ${frameCount}: currentZone=${currentZoneRef.current}, tempPoints=${tempPointsRef.current.length} points`);
                }
                
                // Render zones overlay with current state values from refs
                renderZones(ctx, currentZoneRef.current, tempPointsRef.current);
            } catch (error) {
                console.error('[ZoneModal] Draw error:', error);
            } finally {
                isDrawing = false;
                animationFrameRef.current = requestAnimationFrame(draw);
            }
        };

        hiddenImg.onload = () => {
            console.log('[ZoneModal] Image onload triggered');
            setIsStreamConnected(true);
        };

        hiddenImg.onerror = (error) => {
            console.warn('[ZoneModal] Stream failed to load:', error);
            setIsStreamConnected(false);
        };

        // Set source to enable continuous MJPEG stream
        hiddenImg.src = videoStreamUrl.current;
        console.log('[ZoneModal] Image src set, waiting for frames...');

        // Start animation loop
        animationFrameRef.current = requestAnimationFrame(draw);
    };

    const stopLiveStream = () => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (hiddenImgRef.current) {
            hiddenImgRef.current.src = '';
            if (document.body.contains(hiddenImgRef.current)) {
                document.body.removeChild(hiddenImgRef.current);
            }
            hiddenImgRef.current = null;
        }
        videoStreamUrl.current = null;
    };

    const loadInitialData = async () => {
        try {
            // Load zones
            const zonesRes = await api.get(`/get_zones/${platform}`);
            const loadedZones: Zones = {};
            // Normalize to fixed zone names (A, B, C). If backend provides these keys, use them.
            // Otherwise map up to three existing zone entries into A/B/C respectively.
            const backendKeys = Object.keys(zonesRes.data || {});
            // prefer direct matches
            FIXED_ZONE_NAMES.forEach((name) => {
                if (zonesRes.data && zonesRes.data[name]) {
                    const { p1, p2 } = zonesRes.data[name];
                    if (Array.isArray(p1) && Array.isArray(p2) && p1.length === 2 && p2.length === 2) {
                        loadedZones[name] = [{ x: p1[0], y: p1[1] }, { x: p2[0], y: p2[1] }];
                    } else {
                        loadedZones[name] = null;
                    }
                }
            });

            // fill remaining slots from other backend keys if A/B/C not present
            let fillIndex = 0;
            for (let k of backendKeys) {
                if (FIXED_ZONE_NAMES.includes(k)) continue;
                while (fillIndex < FIXED_ZONE_NAMES.length && loadedZones[FIXED_ZONE_NAMES[fillIndex]] !== undefined) {
                    fillIndex++;
                }
                if (fillIndex >= FIXED_ZONE_NAMES.length) break;
                try {
                    const { p1, p2 } = zonesRes.data[k];
                    if (Array.isArray(p1) && Array.isArray(p2) && p1.length === 2 && p2.length === 2) {
                        loadedZones[FIXED_ZONE_NAMES[fillIndex]] = [{ x: p1[0], y: p1[1] }, { x: p2[0], y: p2[1] }];
                    } else {
                        loadedZones[FIXED_ZONE_NAMES[fillIndex]] = null;
                    }
                } catch (e) {
                    loadedZones[FIXED_ZONE_NAMES[fillIndex]] = null;
                }
                fillIndex++;
            }

            // ensure all fixed names exist (null if empty)
            FIXED_ZONE_NAMES.forEach((n) => {
                if (!(n in loadedZones)) loadedZones[n] = null;
            });

            setZones(loadedZones);
        } catch (error) {
            console.error('Failed to load zone data:', error);
        }
    };

    useEffect(() => {
        if (!videoStreamUrl.current || !canvasRef.current) return;

        return () => {
            // Cleanup is handled in stopLiveStream
        };
    }, []);

    const renderZones = (ctx: CanvasRenderingContext2D, currentZoneParam: string | null, tempPointsParam: Point[]) => {
        // Draw existing zones (use ref to ensure latest values inside animation loop)
        Object.keys(zonesRef.current).forEach((z) => {
            const zone = zonesRef.current[z];
            if (zone) {
                const [p1, p2] = zone;
                ctx.strokeStyle = getZoneColor(z);
                ctx.lineWidth = 6;
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();

                // Draw zone label
                const mx = (p1.x + p2.x) / 2;
                const my = (p1.y + p2.y) / 2;
                ctx.fillStyle = 'rgba(0,0,0,0.7)';
                ctx.fillRect(mx - 40, my - 20, 80, 40);
                ctx.fillStyle = getZoneColor(z);
                ctx.font = 'bold 16px Sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(t('platform.zone', { z }), mx, my + 6);
            }
        });

        // Draw current temporary points
        if (currentZoneParam && tempPointsParam.length > 0) {
            console.log(`[ZoneModal] Rendering ${tempPointsParam.length} temp points for zone ${currentZoneParam}`);
            
            ctx.fillStyle = getZoneColor(currentZoneParam);
            tempPointsParam.forEach((p, i) => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'white';
                ctx.font = 'bold 10px Sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText((i + 1).toString(), p.x, p.y + 4);
                ctx.fillStyle = getZoneColor(currentZoneParam);
            });

            if (tempPointsParam.length === 2) {
                console.log('[ZoneModal] Drawing dashed line between 2 temp points');
                console.log(`  Point 1: (${tempPointsParam[0].x}, ${tempPointsParam[0].y})`);
                console.log(`  Point 2: (${tempPointsParam[1].x}, ${tempPointsParam[1].y})`);
                console.log(`  Color: ${getZoneColor(currentZoneParam)}`);
                ctx.strokeStyle = getZoneColor(currentZoneParam);
                ctx.lineWidth = 4;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.moveTo(tempPointsParam[0].x, tempPointsParam[0].y);
                ctx.lineTo(tempPointsParam[1].x, tempPointsParam[1].y);
                console.log(`  About to stroke: strokeStyle=${ctx.strokeStyle}, lineWidth=${ctx.lineWidth}`);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

    };

    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        // Prevent editing if user doesn't have cameras permission
        if (!canEditZones || !currentZone || tempPoints.length >= 2) return;

        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = Math.round(((e.clientX - rect.left) / rect.width) * 1020);
        const y = Math.round(((e.clientY - rect.top) / rect.height) * 600);

        const newPoints = [...tempPoints, { x, y }];
        
        console.log(`[ZoneModal] Click ${newPoints.length}: (${x}, ${y})`, {
            currentZone,
            tempPoints: newPoints,
        });
        
        setTempPoints(newPoints);

        if (newPoints.length === 2) {
            console.log(`[ZoneModal] Zone ${currentZone} completed with 2 points:`, newPoints);
            // Save to zones but DON'T clear tempPoints yet
            // This keeps the line visible in the canvas
            setZones({
                ...zones,
                [currentZone]: newPoints as [Point, Point],
            });
            // User can now click another zone or edit more
            // Don't clear currentZone and tempPoints here
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const data: any = {};
            // Persist only fixed zone names
            FIXED_ZONE_NAMES.forEach((z) => {
                if (zones[z]) {
                    data[z] = {
                        p1: [zones[z]![0].x, zones[z]![0].y],
                        p2: [zones[z]![1].x, zones[z]![1].y],
                    };
                }
            });

            // Allow saving empty to clear all zones (will clear A/B/C)
            await api.post(`/set_zones/${platform}`, data);

            // Reload zones right after saving so dashboard reflects persisted values (or empty)
            const zonesRes = await api.get(`/get_zones/${platform}`);
            const reloaded: Zones = {};
            // Normalize backend response into fixed slots again
            FIXED_ZONE_NAMES.forEach((name) => {
                if (zonesRes.data && zonesRes.data[name]) {
                    try {
                        const { p1, p2 } = zonesRes.data[name];
                        if (Array.isArray(p1) && Array.isArray(p2) && p1.length === 2 && p2.length === 2) {
                            reloaded[name] = [{ x: p1[0], y: p1[1] }, { x: p2[0], y: p2[1] }];
                        } else {
                            reloaded[name] = null;
                        }
                    } catch (e) {
                        reloaded[name] = null;
                    }
                } else {
                    reloaded[name] = null;
                }
            });
            setZones(reloaded);
            // Notify other parts of the app that zones for this platform were updated
            try {
                console.debug('[ZoneModal] dispatching zones:updated', { platform, zones: reloaded });
                window.dispatchEvent(new CustomEvent('zones:updated', { detail: { platform, zones: reloaded } }));
            } catch (e) {
                console.warn('Failed to dispatch zones:updated event', e);
            }
            onClose();
        } catch (error) {
            console.error('Failed to save zones:', error);
            alert('Failed to save zones.');
        } finally {
            setIsSaving(false);
        }
    };

    const clearAll = () => {
        if (!confirm('Clear all zones for this platform?')) return;

        // Optimistically clear UI (set fixed slots to null)
        const cleared: Zones = {};
        FIXED_ZONE_NAMES.forEach((n) => { cleared[n] = null; });
        setZones(cleared);
        setTempPoints([]);
        setCurrentZone(null);

        // Persist clear to backend and refresh zones
        (async () => {
            try {
                await api.post(`/set_zones/${platform}`, {});
                const zonesRes = await api.get(`/get_zones/${platform}`);
                const reloaded: Zones = {};
                FIXED_ZONE_NAMES.forEach((name) => {
                    if (zonesRes.data && zonesRes.data[name]) {
                        try {
                            const { p1, p2 } = zonesRes.data[name];
                            if (Array.isArray(p1) && Array.isArray(p2) && p1.length === 2 && p2.length === 2) {
                                reloaded[name] = [{ x: p1[0], y: p1[1] }, { x: p2[0], y: p2[1] }];
                            } else {
                                reloaded[name] = null;
                            }
                        } catch (e) {
                            reloaded[name] = null;
                        }
                    } else {
                        reloaded[name] = null;
                    }
                });
                setZones(reloaded);
                // notify others that zones were cleared for this platform
                try {
                    window.dispatchEvent(new CustomEvent('zones:updated', { detail: { platform, zones: reloaded } }));
                } catch (e) {
                    console.warn('Failed to dispatch zones:updated (clearAll)', e);
                }
            } catch (error) {
                console.error('Failed to clear zones:', error);
                // keep UI cleared but notify user
                alert('Failed to clear zones on the server.');
            }
        })();
        
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-5xl rounded-2xl bg-card dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
                <div className="bg-slate-900 dark:bg-slate-950 px-6 py-4 flex items-center justify-between text-white">
                    <div>
                        <h2 className="text-xl font-bold">{platformName}</h2>
                                            <p className="text-slate-400 text-sm">{t('platform.counting_zones_configuration')}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {isStreamConnected && (
                                <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
                                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                                {t('platform.live_stream')}
                            </div>
                        )}
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                            <X className="h-6 w-6" />
                        </button>
                    </div>
                </div>
    {!isStreamConnected && (
                                    <div className="absolute top-4 right-4 flex gap-2 z-10">
                                        <div className="bg-amber-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm font-medium">
                                            <RefreshCw className="h-4 w-4 animate-spin" />
                                            {t('platform.connecting')}
                                        </div>
                                    </div>
                                )}
                            
                <div className="flex-1 overflow-y-auto p-6">
                    {!canEditZones && (
                        <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-xl flex items-start gap-3">
                            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="font-semibold text-blue-900 dark:text-blue-100">View Mode</p>
                                <p className="text-sm text-blue-800 dark:text-blue-200">You are viewing this camera's zones. You need the Cameras permission to edit zones.</p>
                            </div>
                        </div>
                    )}
                    
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        <div className="lg:col-span-3">
                            <div className="relative aspect-[1020/600] bg-slate-50 dark:bg-slate-800 rounded-xl overflow-hidden border-4 border-slate-200 dark:border-slate-700 shadow-inner">
                                <canvas
                                    ref={canvasRef}
                                    width={1020}
                                    height={600}
                                    onClick={handleCanvasClick}
                                    className={cn(
                                        "w-full h-full cursor-crosshair",
                                        !currentZone && "cursor-default"
                                    )}
                                />
                            </div>
                            {/* Fixed zones: only A, B, C allowed (no explanatory text) */}
                            <div className="mt-3" />
                        </div>

                        <div className="space-y-6">
                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 rounded-xl text-sm text-amber-800 dark:text-amber-200">
                                <div className="flex items-center gap-2 mb-2 font-bold">
                                    <Info className="h-4 w-4" />
                                    {t('platform.instructions_title')}
                                </div>
                                <ul className="list-disc list-inside space-y-1 text-xs">
                                    <li>{t('platform.instructions_select_zone')}</li>
                                    <li>{t('platform.instructions_click_points')}</li>
                                    <li>{t('platform.instructions_direction_entry')}</li>
                                    <li>{t('platform.instructions_direction_exit')}</li>
                                </ul>
                            </div>

                            <div className="space-y-3">
                                <div className="flex flex-col gap-3 py-2">
                                    {FIXED_ZONE_NAMES.map((z) => {
                                        const hasZone = !!zones[z];
                                        const isActive = currentZone === z;
                                        const classes = cn(
                                            "w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all font-medium",
                                            !canEditZones && "opacity-60 cursor-not-allowed",
                                            isActive ? "border-slate-900 bg-slate-900 text-white" : (hasZone ? getZoneStyleClass(z) : 'border-slate-200 border-dashed hover:border-slate-400')
                                        );

                                        return (
                                            <button
                                                key={z}
                                                onClick={() => { if (!canEditZones) return; setCurrentZone(z); setTempPoints([]); }}
                                                disabled={!canEditZones}
                                                className={classes}
                                                style={isActive ? { backgroundColor: getZoneColor(z) } : {}}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-white/20 dark:bg-black/20">
                                                        {z}
                                                    </div>
                                                    <span>{t('platform.zone', { z })}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {hasZone ? <Edit2 className="h-4 w-4" /> : <div className="w-4" />}
                                                    <Trash2 className="h-4 w-4 text-red-500" onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (!canEditZones) return;
                                                        if (!confirm(t('platform.confirm_clear_zone', { z }))) return;
                                                        const copy = { ...zones } as Zones;
                                                        copy[z] = null;
                                                        setZones(copy);
                                                        // persist update: only save fixed zones
                                                        (async () => {
                                                            try {
                                                                const data: any = {};
                                                                FIXED_ZONE_NAMES.forEach((k) => {
                                                                    if (copy[k]) data[k] = { p1: [copy[k]![0].x, copy[k]![0].y], p2: [copy[k]![1].x, copy[k]![1].y] };
                                                                });
                                                                await api.post(`/set_zones/${platform}`, data);
                                                                // notify others immediately with the updated data
                                                                try {
                                                                    window.dispatchEvent(new CustomEvent('zones:updated', { detail: { platform, zones: data } }));
                                                                } catch (e) {
                                                                    console.warn('Failed to dispatch zones:updated (single clear)', e);
                                                                }
                                                            } catch (err) {
                                                                console.error('Failed to clear zone on server', err);
                                                            }
                                                        })();
                                                    }} />
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {canEditZones && (
                                <button
                                    onClick={clearAll}
                                    className="w-full flex items-center justify-center gap-2 p-3 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors text-sm font-medium"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    {t('platform.clear_all')}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800 px-6 py-4 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-700">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-xl font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                        {!canEditZones ? t('platform.close') : t('platform.cancel')}
                    </button>
                    {canEditZones && (
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-8 py-2.5 rounded-xl font-bold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                        >
                            {isSaving ? t('platform.saving') : (
                                <>
                                    <Check className="h-5 w-5" />
                                    {t('platform.save_and_start')}
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
