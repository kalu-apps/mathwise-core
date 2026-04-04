import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Alert, Button, CircularProgress } from "@mui/material";
import { shouldShowVideoPlayerLoading } from "@/entities/lesson/model/videoPlayerUi";

interface Props {
  src?: string;
  streamSrc?: string;
  poster?: string;
  onEnded?: () => void;
  watermarkText?: string;
  onRequestSourceRefresh?: () => Promise<{
    src?: string;
    streamSrc?: string;
  }>;
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
      "Этот формат видео не поддерживается в текущем браузере. Обновите доступ или откройте урок в другом браузере.",
  };
};

const TEMPLATE_VIDEO_POSTER = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#182338"/>
      <stop offset="100%" stop-color="#05070d"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#bg)"/>
  <circle cx="800" cy="450" r="96" fill="rgba(255,255,255,0.16)"/>
  <path d="M770 390 L880 450 L770 510 Z" fill="#ffffff"/>
</svg>
`)}`;

function VideoPlayerContent({
  src,
  streamSrc,
  poster,
  onEnded,
  watermarkText,
  onRequestSourceRefresh,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ratioRef = useRef<HTMLDivElement | null>(null);
  const [showSecurityHint, setShowSecurityHint] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [hasRenderedFirstFrame, setHasRenderedFirstFrame] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [isActivated, setIsActivated] = useState(false);
  const [resolvedSrc, setResolvedSrc] = useState<string>("");
  const watermark = useMemo(() => watermarkText?.trim() ?? "", [watermarkText]);
  const customPoster = useMemo(() => poster?.trim() ?? "", [poster]);
  const previewPoster = useMemo(
    () => customPoster || TEMPLATE_VIDEO_POSTER,
    [customPoster]
  );
  const customPosterStyle = useMemo<CSSProperties | undefined>(() => {
    if (!customPoster) return undefined;
    return {
      ["--video-poster-image" as string]: `url("${customPoster}")`,
    };
  }, [customPoster]);
  const showLoadingOverlay = shouldShowVideoPlayerLoading({
    isActivated,
    isBuffering,
    playbackError,
    hasRenderedFirstFrame,
  });

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
    const runLocalReload = (next: { src?: string; streamSrc?: string } = {}) => {
      const nextSource = resolvePlaybackSource({
        streamSrc: next.streamSrc ?? streamSrc,
        src: next.src ?? src,
      });
      if (!nextSource.src) {
        setPlaybackError(nextSource.error);
        setIsBuffering(false);
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      setResolvedSrc(nextSource.src);
      setPlaybackError(nextSource.error);
      setHasRenderedFirstFrame(false);
      setIsBuffering(true);
      video.load();
    };

    if (onRequestSourceRefresh) {
      setIsBuffering(true);
      setPlaybackError(null);
      void onRequestSourceRefresh()
        .then((next) => {
          runLocalReload(next);
        })
        .catch(() => {
          setIsBuffering(false);
          setPlaybackError(
            "Ссылка на видео устарела или недоступна. Обновите доступ и повторите попытку."
          );
        });
      return;
    }

    runLocalReload();
  };

  const handleActivate = () => {
    setIsActivated(true);
    setHasRenderedFirstFrame(false);
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
            aria-label="Запустить видеоурок"
          >
            {customPoster ? (
              <div
                className="video-player__poster-image"
                style={customPosterStyle}
                aria-hidden="true"
              />
            ) : null}
            <div className="video-player__poster-grid" aria-hidden="true" />
            <div className="video-player__polyhedron-scene" aria-hidden="true">
              <span className="video-player__polyhedron-halo" />
              <span className="video-player__polyhedron-plane video-player__polyhedron-plane--primary" />
              <span className="video-player__polyhedron-plane video-player__polyhedron-plane--secondary" />
              <svg
                className="video-player__polyhedron-svg"
                viewBox="0 0 280 220"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <linearGradient id="polyhedronFacetA" x1="48" y1="24" x2="232" y2="188">
                    <stop offset="0%" stopColor="rgba(214, 239, 255, 0.84)" />
                    <stop offset="100%" stopColor="rgba(112, 198, 247, 0.3)" />
                  </linearGradient>
                  <linearGradient id="polyhedronFacetB" x1="88" y1="68" x2="216" y2="188">
                    <stop offset="0%" stopColor="rgba(188, 222, 255, 0.66)" />
                    <stop offset="100%" stopColor="rgba(123, 174, 255, 0.22)" />
                  </linearGradient>
                  <linearGradient id="polyhedronFacetC" x1="74" y1="76" x2="176" y2="194">
                    <stop offset="0%" stopColor="rgba(165, 232, 255, 0.52)" />
                    <stop offset="100%" stopColor="rgba(139, 147, 247, 0.2)" />
                  </linearGradient>
                  <linearGradient id="draftingCurveLine" x1="32" y1="132" x2="248" y2="132">
                    <stop offset="0%" stopColor="rgba(129, 235, 255, 0.3)" />
                    <stop offset="52%" stopColor="rgba(180, 224, 255, 0.84)" />
                    <stop offset="100%" stopColor="rgba(162, 151, 252, 0.34)" />
                  </linearGradient>
                </defs>
                <path
                  d="M26 170 H256 M44 190 H236 M40 52 V196 M140 34 V198 M240 58 V196"
                  stroke="rgba(178, 215, 255, 0.24)"
                  strokeWidth="1"
                  strokeDasharray="5 6"
                  strokeLinecap="round"
                />
                <path
                  className="video-player__polyhedron-curve"
                  d="M28 146 C72 116, 112 110, 148 122 C184 134, 218 144, 252 126"
                  stroke="url(#draftingCurveLine)"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <polygon
                  points="70,104 214,86 240,138 100,158"
                  fill="rgba(122, 203, 255, 0.16)"
                  stroke="rgba(184, 223, 255, 0.32)"
                  strokeWidth="1"
                />
                <polygon
                  points="88,84 194,64 218,108 112,128"
                  fill="rgba(165, 180, 255, 0.13)"
                  stroke="rgba(193, 207, 255, 0.28)"
                  strokeWidth="0.9"
                />
                <polygon
                  points="140,24 222,82 186,176 94,176 58,82"
                  fill="url(#polyhedronFacetA)"
                  stroke="rgba(209, 231, 255, 0.58)"
                  strokeWidth="1.4"
                />
                <polygon
                  points="140,56 192,92 170,154 110,154 88,92"
                  fill="url(#polyhedronFacetB)"
                  stroke="rgba(190, 217, 255, 0.52)"
                  strokeWidth="1.1"
                />
                <path
                  d="M140 24V176M58 82L222 82M94 176L140 56L186 176"
                  stroke="rgba(212, 231, 255, 0.58)"
                  strokeWidth="1"
                  strokeLinecap="round"
                />
                <path
                  d="M58 82L110 154M222 82L170 154"
                  stroke="rgba(161, 220, 246, 0.5)"
                  strokeWidth="0.9"
                  strokeLinecap="round"
                />
                <polygon
                  points="140,56 170,154 110,154"
                  fill="url(#polyhedronFacetC)"
                  stroke="rgba(159, 191, 241, 0.46)"
                  strokeWidth="0.9"
                />
                <circle cx="58" cy="82" r="2.6" fill="rgba(206, 233, 255, 0.72)" />
                <circle cx="140" cy="24" r="2.6" fill="rgba(200, 228, 255, 0.74)" />
                <circle cx="222" cy="82" r="2.6" fill="rgba(195, 223, 255, 0.74)" />
                <circle cx="186" cy="176" r="2.6" fill="rgba(193, 220, 255, 0.72)" />
                <circle cx="94" cy="176" r="2.6" fill="rgba(193, 220, 255, 0.72)" />
              </svg>
            </div>
            <div className="video-player__poster-backdrop" />
            <div className="video-player__poster-content">
              {playbackError ? (
                <span className="video-player__poster-hint video-player__poster-hint--error">
                  {playbackError}
                </span>
              ) : null}
              <span className="video-player__poster-action">
                <PlayArrowRoundedIcon fontSize="inherit" />
                Смотреть урок
              </span>
            </div>
          </button>
        ) : null}
        {watermark ? <div className="video-player__watermark">{watermark}</div> : null}
        {showLoadingOverlay ? (
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
            poster={previewPoster}
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
              setHasRenderedFirstFrame(true);
              setIsBuffering(false);
              setPlaybackError(null);
            }}
            onCanPlay={() => {
              setHasRenderedFirstFrame(true);
              setIsBuffering(false);
            }}
            onPlaying={() => {
              setHasRenderedFirstFrame(true);
              setIsBuffering(false);
            }}
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
