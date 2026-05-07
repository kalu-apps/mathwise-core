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
import VolumeUpRoundedIcon from "@mui/icons-material/VolumeUpRounded";
import VolumeOffRoundedIcon from "@mui/icons-material/VolumeOffRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import DoneRoundedIcon from "@mui/icons-material/DoneRounded";
import DoneAllRoundedIcon from "@mui/icons-material/DoneAllRounded";
import { formatPlaybackTime } from "@/pages/chat/model/chatPageUtils";

const AUDIO_WAVE_BARS = [
  38, 44, 35, 52, 40, 60, 42, 64, 48, 58, 34, 56, 44, 62, 37, 49, 33, 46,
  30, 42, 36, 55, 41, 63, 47, 59, 35, 54, 43, 61, 39, 50, 34, 45, 31, 40,
  37, 53, 46, 57,
];
const AUDIO_LISTENED_THRESHOLD_RATIO = 0.45;
const AUDIO_LISTENED_THRESHOLD_MIN_SECONDS = 0.8;
const AUDIO_LISTENED_THRESHOLD_MAX_SECONDS = 5;
const AUDIO_WAVE_DISPLAY_BARS = 46;

export type AudioMessagePlaybackState = {
  id: string;
  src: string;
  title: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  ended?: boolean;
};

const resizeWaveform = (input: number[], targetBars: number): number[] => {
  if (input.length === 0) return [];
  if (input.length === targetBars) return input;
  return Array.from({ length: targetBars }, (_, index) => {
    const start = Math.floor((index * input.length) / targetBars);
    const end = Math.max(
      start + 1,
      Math.floor(((index + 1) * input.length) / targetBars)
    );
    let peak = 0;
    for (let cursor = start; cursor < end; cursor += 1) {
      const next = input[cursor] ?? 0;
      if (next > peak) peak = next;
    }
    return peak;
  });
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
  activeAudioId,
  onPlaybackStateChange,
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
  activeAudioId?: string | null;
  onPlaybackStateChange?: (state: AudioMessagePlaybackState) => void;
  messageTimestamp?: string;
  showEdited?: boolean;
  showReadState?: boolean;
  readByPeer?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveSeekRef = useRef<HTMLDivElement | null>(null);
  const progressRafRef = useRef<number | null>(null);
  const isSeekingRef = useRef(false);
  const listenedReportedRef = useRef(Boolean(listenedByPeer));
  const onListenedRef = useRef(onListened);
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
  const [playbackSrc, setPlaybackSrc] = useState(src);
  const audioSrc = isPlaying ? playbackSrc : src;
  const audioIdentity = mediaIdentity?.trim() || src;
  const audioTitle = title?.trim() || "Голосовое сообщение";
  const safePlaybackRate =
    Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;

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
        src,
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
        ended,
      });
    },
    [audioIdentity, audioTitle, onPlaybackStateChange, src]
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

  const waveBars = useMemo(() => {
    if (!Array.isArray(waveform) || waveform.length === 0) {
      return resizeWaveform(AUDIO_WAVE_BARS, AUDIO_WAVE_DISPLAY_BARS);
    }
    const normalized = waveform
      .filter((item): item is number => typeof item === "number" && Number.isFinite(item))
      .map((item) => Math.max(8, Math.min(100, Math.round(item))))
      .slice(0, 96);
    if (normalized.length === 0) return AUDIO_WAVE_BARS;
    return resizeWaveform(normalized, AUDIO_WAVE_DISPLAY_BARS);
  }, [waveform]);

  const visualWaveBars = useMemo(
    () =>
      waveBars.map((height, index) => {
        const previous = waveBars[index - 1] ?? height;
        const next = waveBars[index + 1] ?? height;
        return Math.max(8, Math.round(height * 0.68 + previous * 0.16 + next * 0.16));
      }),
    [waveBars]
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
        audio.currentTime = safeTime;
      }
      setCurrentTime(safeTime);
      tryReportListened(safeTime, totalDuration);
    },
    [tryReportListened]
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

  const togglePlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      if (
        Number.isFinite(audio.duration) &&
        audio.duration > 0 &&
        audio.currentTime >= audio.duration - 0.02
      ) {
        audio.currentTime = 0;
        setCurrentTime(0);
      }
      setIsPlaying(true);
      setPlaybackSrc(src);
      audio.playbackRate = safePlaybackRate;
      try {
        await audio.play();
      } catch {
        setIsPlaying(false);
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
  }, [emitPlaybackState, safePlaybackRate, src]);

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
    const audio = audioRef.current;
    if (!audio) return;
    const onLoadedMetadata = () => {
      const metadataDuration =
        Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      if (metadataDuration > 0) {
        setDuration(metadataDuration);
        return;
      }
      if (
        typeof durationSeconds === "number" &&
        Number.isFinite(durationSeconds) &&
        durationSeconds > 0
      ) {
        setDuration(durationSeconds);
      } else {
        setDuration(0);
      }
    };
    const onDurationChange = () => onLoadedMetadata();
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
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("canplay", onDurationChange);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("canplay", onDurationChange);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("ended", onEnded);
    };
  }, [
    durationSeconds,
    audioSrc,
    emitPlaybackState,
    safePlaybackRate,
    tryReportListened,
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
      audioRef.current?.pause();
    },
    []
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
    setIsPlaying(false);
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
  return (
    <div
      className={`chat-page__audio-player ${isPlaying ? "is-playing" : ""} ${
        listenedByPeer ? "is-listened" : ""
      }`}
    >
      <audio ref={audioRef} preload="metadata" src={audioSrc} />
      <button
        type="button"
        className={`chat-page__audio-toggle ${isPlaying ? "is-active" : ""}`}
        onClick={() => void togglePlayback()}
        aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
      >
        {isPlaying ? (
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
