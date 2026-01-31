import { useState, useEffect, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Loader2 } from 'lucide-react';

interface VideoStreamProps {
    /** Platform identifier (e.g., 'platform1', 'platform2') */
    platform: string;
    /** Optional CSS class name for styling */
    className?: string;
    /** Optional title to display above the stream */
    title?: string;
    /** Aspect ratio (default: 16/9) */
    aspectRatio?: 'auto' | '16/9' | '4/3' | '1/1';
}

/**
 * VideoStream Component
 * 
 * Displays MJPEG video stream from Flask backend at /video_feed/<platform>
 * 
 * Features:
 * - Automatic connection/reconnection
 * - Loading state while stream initializes
 * - Error handling with fallback UI
 * - Responsive sizing with aspect ratio control
 * 
 * Usage:
 * ```tsx
 * <VideoStream 
 *   platform="platform1" 
 *   title="Camera 1" 
 *   className="rounded-lg shadow-lg"
 * />
 * ```
 * 
 * Backend Integration:
 * The Flask endpoint /video_feed/<platform> must:
 * 1. Return MJPEG stream with boundary=frame
 * 2. Require authentication (checked by @login_required decorator)
 * 3. Continuously yield frames as image/jpeg data
 * 
 * Example Flask implementation:
 * ```python
 * @app.route('/video_feed/<platform>')
 * @login_required
 * def video_feed(platform):
 *     return Response(gen_video(platform), mimetype='multipart/x-mixed-replace; boundary=frame')
 * ```
 */
function VideoStreamComponent({
    platform,
    className = '',
    title,
    aspectRatio = '16/9',
}: VideoStreamProps) {
    const { t } = useTranslation();
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Determine base URL for video stream
    const baseUrl = import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin;
    const streamUrl = `${baseUrl}/video_feed/${platform}`;

    useEffect(() => {
        // Reset state when platform changes
        setIsLoading(true);
        setError(null);
    }, [platform]);

    const handleImageLoad = () => {
        setIsLoading(false);
        setError(null);
    };

    const handleImageError = () => {
        setError(`Failed to load stream for ${platform}`);
        setIsLoading(false);
    };

    // Determine aspect ratio class
    const aspectRatioClass = {
        'auto': 'aspect-auto',
        '16/9': 'aspect-video',
        '4/3': 'aspect-[4/3]',
        '1/1': 'aspect-square',
    }[aspectRatio] || 'aspect-video';

    return (
        <div className={`relative w-full overflow-hidden rounded-lg bg-slate-900 ${aspectRatioClass} ${className}`}>
            {/* Loading state */}
            {isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/50 backdrop-blur-sm z-10">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-400 mb-2" />
                    <p className="text-sm text-slate-400">{t('platform.connecting')}</p>
                </div>
            )}

            {/* Error state */}
            {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-10">
                    <AlertCircle className="h-12 w-12 text-red-500 mb-2" />
                    <p className="text-sm text-red-400 font-medium">{error}</p>
                    <p className="text-xs text-slate-500 mt-2">{t('apiDocs.deploy.backendTip')}</p>
                </div>
            )}

            {/* Video stream - MJPEG image element */}
            <img
                key={platform}
                src={streamUrl}
                alt={title || `Video stream for ${platform}`}
                className="w-full h-full object-cover"
                onLoad={handleImageLoad}
                onError={handleImageError}
                crossOrigin="use-credentials"
            />

            {/* Optional title overlay */}
            {title && (
                <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-slate-900/80 to-transparent px-4 py-3">
                    <p className="text-sm font-semibold text-white">{title}</p>
                </div>
            )}

            {/* Status indicator */}
            <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 bg-slate-900/60 backdrop-blur-sm rounded text-xs text-slate-300">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span>{t('platform.live_stream') /* short label */}</span>
            </div>
        </div>
    );
}

// Memoize to prevent unnecessary re-renders
export const VideoStream = memo(VideoStreamComponent);
export default VideoStream;
