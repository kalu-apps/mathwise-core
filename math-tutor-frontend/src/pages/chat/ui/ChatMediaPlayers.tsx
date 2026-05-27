import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import VolumeUpRoundedIcon from "@mui/icons-material/VolumeUpRounded";
import VolumeOffRoundedIcon from "@mui/icons-material/VolumeOffRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import DoneRoundedIcon from "@mui/icons-material/DoneRounded";
import DoneAllRoundedIcon from "@mui/icons-material/DoneAllRounded";
import { formatPlaybackTime } from "@/pages/chat/model/chatPageUtils";
import { buildAudioMessageWaveformBars } from "./chatAudioWaveform";

const AUDIO_LISTENED_THRESHOLD_RATIO = 0.45;
const AUDIO_LISTENED_THRESHOLD_MIN_SECONDS = 0.8;
const AUDIO_LISTENED_THRESHOLD_MAX_SECONDS = 5;
const AUDIO_LOAD_WATCHDOG_MS = 12_000;
type AudioLoadState = "idle" | "loading" | "ready" | "error";

export type AudioMessagePlaybackState = {
  id: string;
  src: string;
  title: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  waveform?: number[];
  ended?: boolean;
};

export type AudioMessagePlaybackCommand =
  | {
      id: string;
      action: "toggle";
      token: number;
    }
  | {
      id: string;
      action: "seek";
      token: number;
      currentTime: number;
    };

export function AudioMessagePlayer({
  src,
  mediaIdentity,
  title,
  durationSeconds,
  waveform,
  listenedByPeer,
  onListened,
  playbackRate = 1,
  playbackCommand,
  resumeTime,
  knownReady,
  activeAudioId,
  onPlaybackStateChange,
  onPlaybackError,
  onResolvePlaybackSource,
  messageTimestamp,
  showEdited,
  showReadState,
  readByPeer,
}: {
  src: string;
  mediaIdentity?: string;
  title?: string;
  durationSeconds?: number;
  waveform?: number[];
  listenedByPeer?: boolean;
  onListened?: () => void;
  playbackRate?: number;
  playbackCommand?: AudioMessagePlaybackCommand | null;
  resumeTime?: number;
  knownReady?: boolean;
  activeAudioId?: string | null;
  onPlaybackStateChange?: (state: AudioMessagePlaybackState) => void;
  onPlaybackError?: () => void;
  onResolvePlaybackSource?: (
    audioId: string,
    options?: { forceRefresh?: boolean }
  ) => Promise<string | null | undefined>;
  messageTimestamp?: string;
  showEdited?: boolean;
  showReadState?: boolean;
  readByPeer?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playerRef = useRef<HTMLDivElement | null>(null);
  const waveSeekRef = useRef<HTMLDivElement | null>(null);
  const progressRafRef = useRef<number | null>(null);
  const loadWatchdogTimerRef = useRef<number | null>(null);
  const isSeekingRef = useRef(false);
  const preloadRequestedRef = useRef(false);
  const initialLoadState: AudioLoadState = knownReady ? "ready" : "idle";
  const loadStateRef = useRef<AudioLoadState>(initialLoadState);
  const handledPlaybackCommandTokenRef = useRef<number | null>(null);
  const togglePlaybackRef = useRef<(() => Promise<void>) | null>(null);
  const listenedReportedRef = useRef(Boolean(listenedByPeer));
  const onListenedRef = useRef(onListened);
  const onPlaybackErrorRef = useRef(onPlaybackError);
  const onResolvePlaybackSourceRef = useRef(onResolvePlaybackSource);
  const playbackErrorReportedRef = useRef(false);
  const currentTimeRef = useRef(0);
  const resumeTimeRef = useRef(
    typeof resumeTime === "number" && Number.isFinite(resumeTime)
      ? Math.max(0, resumeTime)
      : 0
  );
  const durationRef = useRef(
    typeof durationSeconds === "number" && Number.isFinite(durationSeconds)
      ? Math.max(0, durationSeconds)
      : 0
  );
  const durationSecondsRef = useRef(
    typeof durationSeconds === "number" && Number.isFinite(durationSeconds)
      ? Math.max(0, durationSeconds)
      : 0
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(
    typeof durationSeconds === "number" && Number.isFinite(durationSeconds)
      ? Math.max(0, durationSeconds)
      : 0
  );
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSrc, setPlaybackSrc] = useState(src.trim());
  const [loadState, setLoadState] = useState<AudioLoadState>(initialLoadState);
  const audioSrc = playbackSrc;
  const audioIdentity = mediaIdentity?.trim() || src;
  const audioTitle = title?.trim() || "Голосовое сообщение";
  const safePlaybackRate =
    Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;

  const reportPlaybackError = useCallback(() => {
    if (playbackErrorReportedRef.current) return;
    playbackErrorReportedRef.current = true;
    onPlaybackErrorRef.current?.();
  }, []);

  const clearLoadWatchdog = useCallback(() => {
    if (loadWatchdogTimerRef.current !== null) {
      window.clearTimeout(loadWatchdogTimerRef.current);
      loadWatchdogTimerRef.current = null;
    }
  }, []);

  const scheduleLoadWatchdog = useCallback(() => {
    clearLoadWatchdog();
    loadWatchdogTimerRef.current = window.setTimeout(() => {
      loadWatchdogTimerRef.current = null;
      if (loadStateRef.current !== "loading") return;
      const audio = audioRef.current;
      if (audio && !audio.error && audio.readyState >= audio.HAVE_FUTURE_DATA) {
        loadStateRef.current = "ready";
        setLoadState((current) => (current === "ready" ? current : "ready"));
        return;
      }
      preloadRequestedRef.current = false;
      setIsPlaying(false);
      loadStateRef.current = "error";
      setLoadState((current) => (current === "error" ? current : "error"));
      reportPlaybackError();
    }, AUDIO_LOAD_WATCHDOG_MS);
  }, [clearLoadWatchdog, reportPlaybackError]);

  const updateLoadState = useCallback(
    (nextState: AudioLoadState) => {
      loadStateRef.current = nextState;
      setLoadState((current) => (current === nextState ? current : nextState));
      if (nextState === "loading") {
        scheduleLoadWatchdog();
      } else {
        clearLoadWatchdog();
      }
    },
    [clearLoadWatchdog, scheduleLoadWatchdog]
  );

  const requestAudioPreload = useCallback(
    (options?: { force?: boolean }) => {
      const audio = audioRef.current;
      if (!audio) return;
      const forceRetry = Boolean(options?.force);
      if (!forceRetry && loadStateRef.current === "error") {
        return;
      }
      if (!forceRetry && loadStateRef.current === "ready") {
        return;
      }
      if (
        !forceRetry &&
        preloadRequestedRef.current &&
        loadStateRef.current !== "error"
      ) {
        return;
      }
      preloadRequestedRef.current = true;
      playbackErrorReportedRef.current = false;
      if (loadStateRef.current !== "ready") {
        updateLoadState("loading");
      }
      audio.preload = "auto";
      if (audio.paused && (forceRetry || audio.readyState < audio.HAVE_FUTURE_DATA)) {
        try {
          audio.load();
        } catch {
          updateLoadState("error");
          reportPlaybackError();
        }
      }
    },
    [reportPlaybackError, updateLoadState]
  );

  useEffect(() => {
    onPlaybackErrorRef.current = onPlaybackError;
  }, [onPlaybackError]);

  useEffect(() => {
    onResolvePlaybackSourceRef.current = onResolvePlaybackSource;
  }, [onResolvePlaybackSource]);

  useEffect(() => {
    preloadRequestedRef.current = false;
    playbackErrorReportedRef.current = false;
    const nextLoadState = knownReady ? "ready" : "idle";
    loadStateRef.current = nextLoadState;
    const timeoutId = window.setTimeout(() => {
      updateLoadState(nextLoadState);
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [audioSrc, knownReady, updateLoadState]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    const nextSrc = src.trim();
    if (!nextSrc || nextSrc === playbackSrc) return;

    const audio = audioRef.current;
    const preservedTime =
      audio && Number.isFinite(audio.currentTime) && audio.currentTime > 0
        ? audio.currentTime
        : currentTimeRef.current;
    const wasPlaying = Boolean(audio && !audio.paused);

    if (audio && wasPlaying) {
      audio.pause();
    }
    preloadRequestedRef.current = false;
    playbackErrorReportedRef.current = false;
    loadStateRef.current = "idle";
    const syncTimeoutId = window.setTimeout(() => {
      setPlaybackSrc(nextSrc);
      updateLoadState(knownReady ? "ready" : "idle");
      if (preservedTime > 0.05) {
        setCurrentTime(preservedTime);
      }

      if (wasPlaying) {
        const nextAudio = audioRef.current;
        if (!nextAudio) return;
        if (preservedTime > 0.05) {
          try {
            nextAudio.currentTime = preservedTime;
          } catch {
            // The refreshed signed URL may still be resolving metadata.
          }
        }
        void togglePlaybackRef.current?.();
      }
    }, 0);

    return () => {
      window.clearTimeout(syncTimeoutId);
    };
  }, [knownReady, playbackSrc, src, updateLoadState]);

  const emitPlaybackState = useCallback(
    ({
      isPlaying: nextIsPlaying,
      currentTime: nextCurrentTime,
      duration: nextDuration,
      ended,
    }: {
      isPlaying: boolean;
      currentTime: number;
      duration?: number;
      ended?: boolean;
    }) => {
      if (!onPlaybackStateChange) return;
      const resolvedDuration =
        typeof nextDuration === "number" &&
        Number.isFinite(nextDuration) &&
        nextDuration > 0
          ? nextDuration
          : durationRef.current > 0
            ? durationRef.current
            : durationSecondsRef.current;
      onPlaybackStateChange({
        id: audioIdentity,
        src: audioSrc,
        title: audioTitle,
        isPlaying: nextIsPlaying,
        currentTime:
          Number.isFinite(nextCurrentTime) && nextCurrentTime > 0
            ? nextCurrentTime
            : 0,
        duration:
          Number.isFinite(resolvedDuration) && resolvedDuration > 0
            ? resolvedDuration
            : 0,
        waveform,
        ended,
      });
    },
    [audioIdentity, audioSrc, audioTitle, onPlaybackStateChange, waveform]
  );

  const tryReportListened = useCallback(
    (nextCurrentTime: number, fallbackDuration?: number) => {
      if (!onListenedRef.current || listenedReportedRef.current) return;
      const totalDuration =
        durationRef.current > 0
          ? durationRef.current
          : typeof fallbackDuration === "number" && Number.isFinite(fallbackDuration)
            ? fallbackDuration
            : durationSecondsRef.current > 0
              ? durationSecondsRef.current
              : 0;
      if (totalDuration <= 0) return;
      const listenedThreshold = Math.min(
        AUDIO_LISTENED_THRESHOLD_MAX_SECONDS,
        Math.max(
          AUDIO_LISTENED_THRESHOLD_MIN_SECONDS,
          totalDuration * AUDIO_LISTENED_THRESHOLD_RATIO
        )
      );
      if (nextCurrentTime >= listenedThreshold) {
        listenedReportedRef.current = true;
        onListenedRef.current();
      }
    },
    []
  );

  const visualWaveBars = useMemo(
    () => buildAudioMessageWaveformBars(waveform),
    [waveform]
  );

  const seekToAudioTime = useCallback(
    (nextTime: number) => {
      const audio = audioRef.current;
      const totalDuration =
        audio && Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : durationRef.current > 0
            ? durationRef.current
            : durationSecondsRef.current;
      if (!Number.isFinite(totalDuration) || totalDuration <= 0) return;
      const safeTime = Math.min(totalDuration, Math.max(0, nextTime));
      if (audio) {
        try {
          audio.currentTime = safeTime;
        } catch {
          // Metadata may still be resolving; React state keeps the requested seek position visible.
        }
      }
      setCurrentTime(safeTime);
      tryReportListened(safeTime, totalDuration);
      emitPlaybackState({
        isPlaying: audio ? !audio.paused : isPlaying,
        currentTime: safeTime,
        duration: totalDuration,
      });
    },
    [emitPlaybackState, isPlaying, tryReportListened]
  );

  const seekAudioFromClientX = useCallback(
    (clientX: number) => {
      const node = waveSeekRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const totalDuration =
        durationRef.current > 0 ? durationRef.current : durationSecondsRef.current;
      if (!Number.isFinite(totalDuration) || totalDuration <= 0) return;
      seekToAudioTime(totalDuration * ratio);
    },
    [seekToAudioTime]
  );

  const retryAudioLoad = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    setIsPlaying(false);
    preloadRequestedRef.current = true;
    playbackErrorReportedRef.current = false;
    updateLoadState("loading");

    const freshSrc = await onResolvePlaybackSourceRef.current?.(audioIdentity, {
      forceRefresh: true,
    });
    const normalizedFreshSrc = freshSrc?.trim();
    const nextSrc = normalizedFreshSrc || playbackSrc || src.trim();
    if (!nextSrc) {
      preloadRequestedRef.current = false;
      updateLoadState("error");
      reportPlaybackError();
      return;
    }

    try {
      if (playbackSrc !== nextSrc) {
        setPlaybackSrc(nextSrc);
      }
      if (audio.src !== nextSrc) {
        audio.src = nextSrc;
      }
      audio.preload = "auto";
      audio.load();
    } catch {
      preloadRequestedRef.current = false;
      updateLoadState("error");
      reportPlaybackError();
    }
  }, [audioIdentity, playbackSrc, reportPlaybackError, src, updateLoadState]);

  const togglePlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (loadStateRef.current === "error") {
      await retryAudioLoad();
      return;
    }
    if (audio.paused) {
      const knownCurrentTime =
        Number.isFinite(currentTime) && currentTime > 0.05
          ? currentTime
          : resumeTimeRef.current;
      const shouldUseLatestSrc = playbackSrc !== src.trim();
      if (shouldUseLatestSrc) {
        const nextSrc = src.trim();
        audio.src = nextSrc;
        setPlaybackSrc(nextSrc);
        preloadRequestedRef.current = false;
        playbackErrorReportedRef.current = false;
      }
      requestAudioPreload({ force: shouldUseLatestSrc });
      if (
        Number.isFinite(audio.duration) &&
        audio.duration > 0 &&
        audio.currentTime >= audio.duration - 0.02
      ) {
        audio.currentTime = 0;
        setCurrentTime(0);
      } else if (knownCurrentTime > 0.05 && audio.currentTime < 0.05) {
        const totalDuration =
          Number.isFinite(audio.duration) && audio.duration > 0
            ? audio.duration
            : durationRef.current > 0
              ? durationRef.current
              : durationSecondsRef.current;
        const safeResumeTime =
          totalDuration > 0
            ? Math.min(totalDuration - 0.02, knownCurrentTime)
            : knownCurrentTime;
        try {
          audio.currentTime = Math.max(0, safeResumeTime);
          setCurrentTime(Math.max(0, safeResumeTime));
        } catch {
          // Some browsers only allow seeking after metadata; keep React state as the source of truth.
        }
      }
      audio.playbackRate = safePlaybackRate;
      try {
        await audio.play();
        setIsPlaying(true);
        updateLoadState("ready");
      } catch {
        const freshSrc = await onResolvePlaybackSourceRef.current?.(audioIdentity, {
          forceRefresh: true,
        });
        const normalizedFreshSrc = freshSrc?.trim();
        if (normalizedFreshSrc) {
          try {
            updateLoadState("loading");
            audio.src = normalizedFreshSrc;
            setPlaybackSrc(normalizedFreshSrc);
            preloadRequestedRef.current = true;
            playbackErrorReportedRef.current = false;
            audio.load();
            if (knownCurrentTime > 0.05) {
              try {
                audio.currentTime = knownCurrentTime;
                setCurrentTime(knownCurrentTime);
              } catch {
                // The fresh media URL may need metadata before seeking.
              }
            }
            audio.playbackRate = safePlaybackRate;
            await audio.play();
            setIsPlaying(true);
            updateLoadState("ready");
            emitPlaybackState({
              isPlaying: true,
              currentTime: audio.currentTime,
              duration: audio.duration,
            });
            return;
          } catch {
            // Fall through to the visible error state below.
          }
        }
        setIsPlaying(false);
        updateLoadState("error");
        reportPlaybackError();
        emitPlaybackState({
          isPlaying: false,
          currentTime: audio.currentTime,
          duration: audio.duration,
        });
      }
      return;
    }
    audio.pause();
    setIsPlaying(false);
  }, [
    audioIdentity,
    currentTime,
    emitPlaybackState,
    playbackSrc,
    reportPlaybackError,
    requestAudioPreload,
    retryAudioLoad,
    safePlaybackRate,
    src,
    updateLoadState,
  ]);

  useEffect(() => {
    togglePlaybackRef.current = togglePlayback;
  }, [togglePlayback]);

  useEffect(() => {
    if (!playbackCommand || playbackCommand.id !== audioIdentity) return;
    if (handledPlaybackCommandTokenRef.current === playbackCommand.token) return;
    handledPlaybackCommandTokenRef.current = playbackCommand.token;
    if (playbackCommand.action === "toggle") {
      void togglePlaybackRef.current?.();
    } else if (playbackCommand.action === "seek") {
      const timeoutId = window.setTimeout(() => {
        requestAudioPreload();
        seekToAudioTime(playbackCommand.currentTime);
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }
  }, [audioIdentity, playbackCommand, requestAudioPreload, seekToAudioTime]);

  const handleWavePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      isSeekingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      seekAudioFromClientX(event.clientX);
    },
    [seekAudioFromClientX]
  );

  const handleWavePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!isSeekingRef.current) return;
      event.preventDefault();
      seekAudioFromClientX(event.clientX);
    },
    [seekAudioFromClientX]
  );

  const handleWavePointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    isSeekingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const handleWaveKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      const totalDuration =
        audio && Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : durationRef.current > 0
            ? durationRef.current
            : durationSecondsRef.current;
      if (!Number.isFinite(totalDuration) || totalDuration <= 0) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        event.preventDefault();
        seekToAudioTime(currentTime - 5);
      } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        event.preventDefault();
        seekToAudioTime(currentTime + 5);
      } else if (event.key === "Home") {
        event.preventDefault();
        seekToAudioTime(0);
      } else if (event.key === "End") {
        event.preventDefault();
        seekToAudioTime(totalDuration);
      }
    },
    [currentTime, seekToAudioTime]
  );

  useEffect(() => {
    listenedReportedRef.current = Boolean(listenedByPeer);
  }, [listenedByPeer, src]);

  useEffect(() => {
    onListenedRef.current = onListened;
  }, [onListened]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    durationSecondsRef.current =
      typeof durationSeconds === "number" && Number.isFinite(durationSeconds)
        ? Math.max(0, durationSeconds)
        : 0;
  }, [durationSeconds]);

  useEffect(() => {
    const nextResumeTime =
      typeof resumeTime === "number" && Number.isFinite(resumeTime)
        ? Math.max(0, resumeTime)
        : 0;
    resumeTimeRef.current = nextResumeTime;
    if (!isPlaying && nextResumeTime > 0.05 && currentTime < 0.05) {
      const audio = audioRef.current;
      if (audio && audio.currentTime < 0.05) {
        try {
          audio.currentTime = nextResumeTime;
        } catch {
          // Metadata may not be available yet; the value is applied again before playback.
        }
      }
    }
  }, [currentTime, isPlaying, resumeTime]);

  useEffect(() => {
    const node = playerRef.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      const timeoutId = globalThis.setTimeout(requestAudioPreload, 250);
      return () => globalThis.clearTimeout(timeoutId);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        requestAudioPreload();
        observer.disconnect();
      },
      {
        root: null,
        rootMargin: "720px 0px",
        threshold: 0.01,
      }
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [audioSrc, requestAudioPreload]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const updateReadyState = () => {
      if (audio.error) {
        updateLoadState("error");
        reportPlaybackError();
        return;
      }
      if (audio.readyState >= audio.HAVE_FUTURE_DATA) {
        updateLoadState("ready");
      } else if (preloadRequestedRef.current) {
        updateLoadState("loading");
      }
    };
    const onLoadedMetadata = () => {
      const metadataDuration =
        Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      if (metadataDuration > 0) {
        setDuration(metadataDuration);
      } else if (
        typeof durationSeconds === "number" &&
        Number.isFinite(durationSeconds) &&
        durationSeconds > 0
      ) {
        setDuration(durationSeconds);
      } else {
        setDuration(0);
      }
      updateReadyState();
    };
    const onDurationChange = () => onLoadedMetadata();
    const onLoadStart = () => updateLoadState("loading");
    const onCanPlay = () => {
      onLoadedMetadata();
      updateLoadState("ready");
    };
    const onWaiting = () => {
      if (!audio.error && audio.readyState < audio.HAVE_FUTURE_DATA) {
        updateLoadState("loading");
      }
    };
    const onError = () => {
      setIsPlaying(false);
      updateLoadState("error");
      reportPlaybackError();
      emitPlaybackState({
        isPlaying: false,
        currentTime: audio.currentTime,
        duration: Number.isFinite(audio.duration) ? audio.duration : durationRef.current,
      });
    };
    const onTimeUpdate = () => {
      const nextCurrentTime = audio.currentTime;
      setCurrentTime(nextCurrentTime);
      tryReportListened(nextCurrentTime, audio.duration);
      if (!audio.paused) {
        emitPlaybackState({
          isPlaying: true,
          currentTime: nextCurrentTime,
          duration: audio.duration,
        });
      }
    };
    const onPause = () => {
      const trackDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
      if (trackDuration > 0 && audio.currentTime >= trackDuration - 0.02) {
        audio.currentTime = 0;
        setCurrentTime(0);
      }
      setIsPlaying(false);
      emitPlaybackState({
        isPlaying: false,
        currentTime: audio.currentTime,
        duration: trackDuration,
      });
    };
    const onPlay = () => {
      audio.playbackRate = safePlaybackRate;
      updateLoadState("ready");
      setIsPlaying(true);
      emitPlaybackState({
        isPlaying: true,
        currentTime: audio.currentTime,
        duration: audio.duration,
      });
    };
    const onEnded = () => {
      tryReportListened(
        Number.isFinite(audio.duration) ? audio.duration : audio.currentTime,
        audio.duration
      );
      emitPlaybackState({
        isPlaying: false,
        currentTime: 0,
        duration: audio.duration,
        ended: true,
      });
      audio.currentTime = 0;
      setIsPlaying(false);
      setCurrentTime(0);
    };
    updateReadyState();
    audio.addEventListener("loadstart", onLoadStart);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("canplaythrough", onCanPlay);
    audio.addEventListener("playing", onCanPlay);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("stalled", onWaiting);
    audio.addEventListener("error", onError);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("loadstart", onLoadStart);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("canplaythrough", onCanPlay);
      audio.removeEventListener("playing", onCanPlay);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("stalled", onWaiting);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("ended", onEnded);
    };
  }, [
    durationSeconds,
    audioSrc,
    emitPlaybackState,
    reportPlaybackError,
    safePlaybackRate,
    tryReportListened,
    updateLoadState,
  ]);

  useEffect(() => {
    if (!isPlaying) return;
    const syncProgress = () => {
      const audio = audioRef.current;
      if (!audio) return;
      setCurrentTime(audio.currentTime);
      progressRafRef.current = window.requestAnimationFrame(syncProgress);
    };
    progressRafRef.current = window.requestAnimationFrame(syncProgress);
    return () => {
      if (progressRafRef.current !== null) {
        window.cancelAnimationFrame(progressRafRef.current);
        progressRafRef.current = null;
      }
    };
  }, [isPlaying]);

  useEffect(
    () => () => {
      if (progressRafRef.current !== null) {
        window.cancelAnimationFrame(progressRafRef.current);
        progressRafRef.current = null;
      }
      clearLoadWatchdog();
      audioRef.current?.pause();
    },
    [clearLoadWatchdog]
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = safePlaybackRate;
  }, [safePlaybackRate]);

  useEffect(() => {
    if (!activeAudioId || activeAudioId === audioIdentity) return;
    const audio = audioRef.current;
    if (!audio || audio.paused) return;
    audio.pause();
  }, [activeAudioId, audioIdentity]);

  const fallbackDuration =
    typeof durationSeconds === "number" && Number.isFinite(durationSeconds)
      ? Math.max(0, durationSeconds)
      : 0;
  const displayDuration = duration > 0 ? duration : fallbackDuration;
  const progressRatio =
    displayDuration > 0 ? Math.min(1, Math.max(0, currentTime / displayDuration)) : 0;
  const activeBars =
    displayDuration > 0
      ? isPlaying
        ? Math.max(1, Math.round(progressRatio * visualWaveBars.length))
        : Math.max(0, Math.round(progressRatio * visualWaveBars.length))
      : isPlaying
        ? ((Math.floor(currentTime * 14) % visualWaveBars.length) +
            visualWaveBars.length) %
            visualWaveBars.length || 1
        : 0;
  const isAudioLoading = loadState === "loading" && !isPlaying;
  const hasAudioError = loadState === "error";
  const audioLoadStatus = hasAudioError
    ? "не удалось загрузить"
    : isAudioLoading
      ? "подгружается"
      : loadState === "ready" && !isPlaying && currentTime < 0.05
        ? "готово"
        : "";
  const audioToggleLabel = hasAudioError
    ? "Повторить загрузку аудио"
    : isAudioLoading
      ? "Аудио загружается"
      : isPlaying
        ? "Пауза"
        : "Воспроизвести";
  return (
    <div
      ref={playerRef}
      className={`chat-page__audio-player ${isPlaying ? "is-playing" : ""} ${
        listenedByPeer ? "is-listened" : ""
      } ${isAudioLoading ? "is-loading" : ""} ${
        loadState === "ready" ? "is-ready" : ""
      } ${hasAudioError ? "is-error" : ""}`}
      onFocusCapture={() => requestAudioPreload()}
      onPointerEnter={() => requestAudioPreload()}
      onPointerDownCapture={() => {
        if (!hasAudioError) {
          requestAudioPreload();
        }
      }}
    >
      <audio ref={audioRef} preload="metadata" src={audioSrc} />
      <button
        type="button"
        className={`chat-page__audio-toggle ${isPlaying ? "is-active" : ""}`}
        onClick={() => void togglePlayback()}
        aria-label={audioToggleLabel}
        aria-busy={isAudioLoading ? true : undefined}
      >
        {isAudioLoading ? (
          <span className="chat-page__audio-toggle-spinner" aria-hidden="true" />
        ) : hasAudioError ? (
          <RefreshRoundedIcon fontSize="inherit" />
        ) : isPlaying ? (
          <PauseRoundedIcon fontSize="inherit" />
        ) : (
          <PlayArrowRoundedIcon fontSize="inherit" />
        )}
      </button>
      <div className="chat-page__audio-content">
        <div className="chat-page__audio-topline">
          <div
            ref={waveSeekRef}
            className="chat-page__audio-wave-wrap"
            role="slider"
            tabIndex={displayDuration > 0 ? 0 : -1}
            aria-label="Перемотать аудиосообщение"
            aria-valuemin={0}
            aria-valuemax={Math.max(0, Math.round(displayDuration))}
            aria-valuenow={Math.max(0, Math.round(currentTime))}
            aria-valuetext={`${formatPlaybackTime(currentTime)} из ${formatPlaybackTime(displayDuration)}`}
            style={
              {
                "--audio-progress": `${Math.round(progressRatio * 1000) / 10}%`,
              } as CSSProperties
            }
            onPointerDown={handleWavePointerDown}
            onPointerMove={handleWavePointerMove}
            onPointerUp={handleWavePointerUp}
            onPointerCancel={handleWavePointerUp}
            onKeyDown={handleWaveKeyDown}
          >
            <div className="chat-page__audio-wave">
              {visualWaveBars.map((height, index) => (
                <span
                  key={index}
                  style={{
                    height: `${height}%`,
                    animationDelay: `${(index % 8) * 0.06}s`,
                  }}
                  className={index < activeBars ? "is-active" : ""}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="chat-page__audio-meta">
          <div className="chat-page__audio-time">
            <span>{formatPlaybackTime(currentTime)}</span>
            {displayDuration > 0 ? (
              <>
                <span className="chat-page__audio-time-dot"> / </span>
                <span>{formatPlaybackTime(displayDuration)}</span>
              </>
            ) : null}
          </div>
          {audioLoadStatus ? (
            <span
              className={`chat-page__audio-load-state chat-page__audio-load-state--${loadState}`}
              role={hasAudioError ? "alert" : undefined}
            >
              {audioLoadStatus}
            </span>
          ) : null}
          {messageTimestamp ? (
            <div className="chat-page__audio-message-meta">
              {showEdited ? (
                <span className="chat-page__message-edited">изм.</span>
              ) : null}
              <time>{messageTimestamp}</time>
              {showReadState ? (
                <span className="chat-page__read-state">
                  {readByPeer ? (
                    <DoneAllRoundedIcon fontSize="inherit" />
                  ) : (
                    <DoneRoundedIcon fontSize="inherit" />
                  )}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function VideoMessagePlayer({
  src,
  fileName,
}: {
  src: string;
  fileName: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const togglePlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      try {
        await video.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
      return;
    }
    video.pause();
    setIsPlaying(false);
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  const handleSeek = useCallback((value: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = value;
    setCurrentTime(value);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onLoadedMetadata = () => {
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    };
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onPause = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const onVolumeChange = () => setIsMuted(video.muted);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("pause", onPause);
    video.addEventListener("play", onPlay);
    video.addEventListener("ended", onEnded);
    video.addEventListener("volumechange", onVolumeChange);
    return () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("volumechange", onVolumeChange);
      video.pause();
    };
  }, [src]);

  return (
    <div className="chat-page__video-player">
      <video ref={videoRef} preload="metadata" src={src} playsInline />
      <button
        type="button"
        className={`chat-page__video-play ${isPlaying ? "is-playing" : ""}`}
        onClick={() => void togglePlayback()}
        aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
      >
        {isPlaying ? (
          <PauseRoundedIcon fontSize="inherit" />
        ) : (
          <PlayArrowRoundedIcon fontSize="inherit" />
        )}
      </button>
      <div className="chat-page__video-topline">
        <span className="chat-page__video-file">{fileName}</span>
      </div>
      <div className="chat-page__video-controls">
        <button
          type="button"
          className="chat-page__video-control-btn"
          onClick={() => void togglePlayback()}
          aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
        >
          {isPlaying ? (
            <PauseRoundedIcon fontSize="inherit" />
          ) : (
            <PlayArrowRoundedIcon fontSize="inherit" />
          )}
        </button>
        <input
          className="chat-page__video-range"
          type="range"
          min={0}
          max={Math.max(duration, 1)}
          step={0.1}
          value={Math.min(currentTime, duration || 0)}
          onChange={(event) => handleSeek(Number(event.target.value))}
          aria-label="Позиция видео"
        />
        <span className="chat-page__video-time">
          {formatPlaybackTime(currentTime)} / {formatPlaybackTime(duration)}
        </span>
        <button
          type="button"
          className="chat-page__video-control-btn"
          onClick={toggleMute}
          aria-label={isMuted ? "Включить звук" : "Выключить звук"}
        >
          {isMuted ? (
            <VolumeOffRoundedIcon fontSize="inherit" />
          ) : (
            <VolumeUpRoundedIcon fontSize="inherit" />
          )}
        </button>
        <a
          className="chat-page__video-download"
          href={src}
          download={fileName}
          title="Скачать видео"
        >
          <DownloadRoundedIcon fontSize="inherit" />
        </a>
      </div>
    </div>
  );
}
