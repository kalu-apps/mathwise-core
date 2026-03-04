import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, CircularProgress } from "@mui/material";

interface Props {
  src?: string;
  streamSrc?: string;
  poster?: string;
  onEnded?: () => void;
  watermarkText?: string;
}

const isLikelyHlsSource = (value?: string) =>
  Boolean(value && /\.m3u8(?:$|[?#])/i.test(value.trim()));

const resolvePlaybackSource = (params: { streamSrc?: string; src?: string }) => {
  const preferredStream = params.streamSrc?.trim() ?? "";
  const fallbackSource = params.src?.trim() ?? "";
  if (!preferredStream && !fallbackSource) {
    return {
      src: "",
      error: "Источник видео не настроен для этого урока.",
    };
  }

  if (!preferredStream) {
    return { src: fallbackSource, error: null };
  }

  if (!isLikelyHlsSource(preferredStream)) {
    return { src: preferredStream, error: null };
  }

  if (typeof document === "undefined") {
    return { src: fallbackSource, error: null };
  }

  const probe = document.createElement("video");
  const supportsNativeHls = Boolean(
    probe.canPlayType("application/vnd.apple.mpegurl") ||
      probe.canPlayType("application/x-mpegURL")
  );

  if (supportsNativeHls) {
    return { src: preferredStream, error: null };
  }

  if (fallbackSource) {
    return { src: fallbackSource, error: null };
  }

  return {
    src: "",
    error:
      "Этот браузер не поддерживает HLS без mp4 fallback. Добавьте резервный mp4-источник.",
  };
};

function VideoPlayerContent({ src, streamSrc, poster, onEnded, watermarkText }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ratioRef = useRef<HTMLDivElement | null>(null);
  const [showSecurityHint, setShowSecurityHint] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [isNearViewport, setIsNearViewport] = useState(
    () => typeof IntersectionObserver === "undefined"
  );
  const [isActivated, setIsActivated] = useState(false);
  const [resolvedSrc, setResolvedSrc] = useState<string>("");
  const watermark = useMemo(
    () => watermarkText ?? `Protected stream • ${new Date().toLocaleTimeString("ru-RU")}`,
    [watermarkText]
  );
  const previewTitle = isNearViewport
    ? "Поток подготовлен к запуску"
    : "Видео будет инициализировано при открытии урока";
  const previewActionLabel = isNearViewport ? "Запустить видео" : "Подготовить видео";

  useEffect(() => {
    const ratioNode = ratioRef.current;
    if (!ratioNode) return;
    if (typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsNearViewport(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: "240px 0px",
        threshold: 0.12,
      }
    );

    observer.observe(ratioNode);
    return () => observer.disconnect();
  }, [src, streamSrc, poster]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let restoreTimer: number | null = null;
    const restoreViewport = () => {
      if (typeof window === "undefined") return;
      const currentY = window.scrollY;
      document.body.classList.add("video-player-restore");
      window.dispatchEvent(new Event("resize"));
      window.scrollTo({ top: currentY, behavior: "auto" });
      if (restoreTimer) {
        window.clearTimeout(restoreTimer);
      }
      restoreTimer = window.setTimeout(() => {
        document.body.classList.remove("video-player-restore");
      }, 260);
    };

    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        restoreViewport();
      }
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    video.addEventListener("webkitendfullscreen", restoreViewport as EventListener);
    const preventContextMenu = (event: Event) => {
      event.preventDefault();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      // Best-effort deterrent only: browsers cannot guarantee screenshot blocking.
      const isPrintScreen =
        event.key === "PrintScreen" ||
        (event.metaKey && event.shiftKey && event.key.toLowerCase() === "4") ||
        (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "s");
      if (isPrintScreen) {
        setShowSecurityHint(true);
      }
    };
    video.addEventListener("contextmenu", preventContextMenu);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      video.removeEventListener(
        "webkitendfullscreen",
        restoreViewport as EventListener
      );
      video.removeEventListener("contextmenu", preventContextMenu);
      window.removeEventListener("keydown", onKeyDown);
      if (restoreTimer) {
        window.clearTimeout(restoreTimer);
      }
      document.body.classList.remove("video-player-restore");
    };
  }, [isActivated, resolvedSrc]);

  const handleRetry = () => {
    const nextSource = resolvePlaybackSource({ streamSrc, src });
    if (!nextSource.src) {
      setPlaybackError(nextSource.error);
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    setResolvedSrc(nextSource.src);
    setPlaybackError(nextSource.error);
    setIsBuffering(true);
    video.load();
  };

  const handleActivate = () => {
    setIsNearViewport(true);
    setIsActivated(true);
    const nextSource = resolvePlaybackSource({ streamSrc, src });
    setResolvedSrc(nextSource.src);
    if (nextSource.error) {
      setPlaybackError(nextSource.error);
      setIsBuffering(false);
      return;
    }
    setPlaybackError(null);
    setIsBuffering(true);
  };

  return (
    <div className="video-player">
      {showSecurityHint && (
        <Alert
          severity="warning"
          className="video-player__security-hint ui-alert"
          onClose={() => setShowSecurityHint(false)}
        >
          Скриншоты и запись экрана запрещены правилами платформы. Это best-effort защита браузера.
        </Alert>
      )}
      <div className="video-player__ratio" ref={ratioRef}>
        {!isActivated ? (
          <button
            type="button"
            className="video-player__poster-shell"
            onClick={handleActivate}
            style={poster ? { backgroundImage: `url(${poster})` } : undefined}
            aria-label="Запустить видеоурок"
          >
            <div className="video-player__poster-backdrop" />
            <div className="video-player__poster-content">
              <span className="video-player__poster-kicker">{previewTitle}</span>
              <strong>Видеоурок</strong>
              <span className="video-player__poster-hint">
                {poster
                  ? "Poster удерживает макет стабильным до старта плеера."
                  : "Добавьте poster, чтобы сократить визуальные скачки до запуска."}
              </span>
              {playbackError ? (
                <span className="video-player__poster-hint video-player__poster-hint--error">
                  {playbackError}
                </span>
              ) : null}
              <span className="video-player__poster-action">
                <PlayArrowRoundedIcon fontSize="inherit" />
                {previewActionLabel}
              </span>
            </div>
          </button>
        ) : null}
        <div className="video-player__watermark">{watermark}</div>
        {isActivated && isBuffering && !playbackError ? (
          <div className="video-player__loading" aria-live="polite">
            <CircularProgress size={22} thickness={4.2} />
            <span>Подготавливаем поток</span>
          </div>
        ) : null}
        {isActivated && playbackError ? (
          <div className="video-player__loading video-player__loading--error" aria-live="polite">
            <span>{playbackError}</span>
            <Button size="small" onClick={handleRetry}>
              Повторить
            </Button>
          </div>
        ) : null}
        {isActivated && resolvedSrc ? (
          <video
            ref={videoRef}
            src={resolvedSrc}
            poster={poster}
            controls
            preload="metadata"
            playsInline
            controlsList="nodownload"
            disablePictureInPicture
            onEnded={onEnded}
            onLoadStart={() => {
              setIsBuffering(true);
              setPlaybackError(null);
            }}
            onLoadedData={() => {
              setIsBuffering(false);
              setPlaybackError(null);
            }}
            onCanPlay={() => setIsBuffering(false)}
            onPlaying={() => setIsBuffering(false)}
            onWaiting={() => setIsBuffering(true)}
            onStalled={() => setIsBuffering(true)}
            onSuspend={() => setIsBuffering(false)}
            onError={() => {
              setIsBuffering(false);
              setPlaybackError(
                "Не удалось стабильно загрузить видео. Проверьте соединение и повторите попытку."
              );
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

export function VideoPlayer(props: Props) {
  const sourceKey = `${props.streamSrc ?? ""}|${props.src ?? ""}|${props.poster ?? ""}`;
  return <VideoPlayerContent key={sourceKey} {...props} />;
}
