import { useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@mui/material";

interface Props {
  src: string;
  onEnded?: () => void;
  watermarkText?: string;
}

export function VideoPlayer({ src, onEnded, watermarkText }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [showSecurityHint, setShowSecurityHint] = useState(false);
  const watermark = useMemo(
    () => watermarkText ?? `Protected stream • ${new Date().toLocaleTimeString("ru-RU")}`,
    [watermarkText]
  );

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
  }, []);

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
      <div className="video-player__ratio">
        <div className="video-player__watermark">{watermark}</div>
        <video
          ref={videoRef}
          src={src}
          controls
          preload="metadata"
          playsInline
          onEnded={onEnded}
        />
      </div>
    </div>
  );
}
