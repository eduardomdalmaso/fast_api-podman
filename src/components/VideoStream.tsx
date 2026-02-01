import { useEffect, useRef, useState, memo } from "react";
import Hls from "hls.js";
import { useTranslation } from "react-i18next";
import { AlertCircle, Loader2 } from "lucide-react";

interface VideoStreamProps {
  /** either an HLS URL (index.m3u8) or an MJPEG endpoint (image stream) */
  hlsUrl?: string;
  mjpegUrl?: string;
  className?: string;
  title?: string;
  aspectRatio?: "auto" | "16/9" | "4/3" | "1/1";
}

function VideoStreamComponent({
  hlsUrl,
  mjpegUrl,
  className = "",
  title,
  aspectRatio = "16/9",
}: VideoStreamProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);

    // cleanup previous hls instance
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {}
      hlsRef.current = null;
    }

    // If hlsUrl is provided and hls.js is supported, use it
    if (hlsUrl && videoRef.current) {
      const video = videoRef.current;

      if (Hls.isSupported()) {
        const hls = new Hls({
          // tune as needed
          maxBufferLength: 30,
          enableWorker: true,
        });
        hlsRef.current = hls;
        hls.attachMedia(video);
        hls.on(Hls.Events.MEDIA_ATTACHED, () => {
          hls.loadSource(hlsUrl);
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setIsLoading(false);
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (data.fatal) {
            setError("Stream error");
            setIsLoading(false);
            hls.destroy();
            hlsRef.current = null;
          }
        });
      } else {
        // native HLS support (Safari)
        video.src = hlsUrl;
        video.onloadedmetadata = () => {
          setIsLoading(false);
          video.play().catch(() => {});
        };
        video.onerror = () => {
          setError("Failed to play HLS stream");
          setIsLoading(false);
        };
      }
      return () => {
        if (hlsRef.current) {
          try {
            hlsRef.current.destroy();
          } catch {}
          hlsRef.current = null;
        }
      };
    }

    // If no hlsUrl, nothing else to setup; img will handle MJPEG if provided
    setIsLoading(false);
    return () => {};
  }, [hlsUrl, mjpegUrl]);

  const handleImgLoad = () => {
    setIsLoading(false);
    setError(null);
  };
  const handleImgError = () => {
    setError("Failed to load stream (image)");
    setIsLoading(false);
  };

  const aspectRatioClass =
    {
      auto: "aspect-auto",
      "16/9": "aspect-video",
      "4/3": "aspect-[4/3]",
      "1/1": "aspect-square",
    }[aspectRatio] || "aspect-video";

  return (
    <div
      className={`relative w-full overflow-hidden rounded-lg bg-slate-900 ${aspectRatioClass} ${className}`}
    >
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/50 z-10">
          <Loader2 className="h-8 w-8 animate-spin text-blue-400 mb-2" />
          <p className="text-sm text-slate-400">{t("platform.connecting")}</p>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-10">
          <AlertCircle className="h-12 w-12 text-red-500 mb-2" />
          <p className="text-sm text-red-400 font-medium">{error}</p>
          <p className="text-xs text-slate-500 mt-2">
            {t("apiDocs.deploy.backendTip")}
          </p>
        </div>
      )}

      {/* HLS video player (preferred) */}
      {hlsUrl ? (
        <video
          ref={videoRef}
          controls
          muted
          autoPlay
          playsInline
          className="w-full h-full object-cover bg-black"
        />
      ) : (
        // MJPEG fallback - legacy: image stream served as multipart/x-mixed-replace
        <img
          ref={imgRef}
          src={mjpegUrl}
          alt={title || "video stream"}
          className="w-full h-full object-cover"
          onLoad={handleImgLoad}
          onError={handleImgError}
          crossOrigin="use-credentials"
        />
      )}

      {title && (
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-slate-900/80 to-transparent px-4 py-3">
          <p className="text-sm font-semibold text-white">{title}</p>
        </div>
      )}

      <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 bg-slate-900/60 rounded text-xs text-slate-300">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span>{t("platform.live_stream")}</span>
      </div>
    </div>
  );
}

export const VideoStream = memo(VideoStreamComponent);
export default VideoStream;
