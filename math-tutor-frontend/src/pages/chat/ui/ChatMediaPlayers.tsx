import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import VolumeUpRoundedIcon from "@mui/icons-material/VolumeUpRounded";
import VolumeOffRoundedIcon from "@mui/icons-material/VolumeOffRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import DoneRoundedIcon from "@mui/icons-material/DoneRounded";
import DoneAllRoundedIcon from "@mui/icons-material/DoneAllRounded";
import { formatPlaybackTime } from "@/pages/chat/model/chatPageUtils";

const AUDIO_PLAYBACK_RATES = [1, 1.25, 1.5, 2];
const AUDIO_WAVE_BARS = [
  38, 44, 35, 52, 40, 60, 42, 64, 48, 58, 34, 56, 44, 62, 37, 49, 33, 46,
  30, 42, 36, 55, 41, 63, 47, 59, 35, 54, 43, 61, 39, 50, 34, 45, 31, 40,
  37, 53, 46, 57,
];
const AUDIO_LISTENED_THRESHOLD_RATIO = 0.45;
const AUDIO_LISTENED_THRESHOLD_MIN_SECONDS = 0.8;
const AUDIO_LISTENED_THRESHOLD_MAX_SECONDS = 5;
const AUDIO_WAVE_DISPLAY_BARS = 40;

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
  durationSeconds,
  waveform,
  listenedByPeer,
  onListened,
  messageTimestamp,
  showEdited,
  showReadState,
  readByPeer,
}: {
  src: string;
  mediaIdentity?: string;
  durationSeconds?: number;
  waveform?: number[];
  listenedByPeer?: boolean;
  onListened?: () => void;
  messageTimestamp?: string;
  showEdited?: boolean;
  showReadState?: boolean;
  readByPeer?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRafRef = useRef<number | null>(null);
  const pendingSrcRef = useRef<string | null>(null);
  const previousIdentityRef = useRef(
    (typeof mediaIdentity === "string" && mediaIdentity.trim()) || src
  );
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
  const [playbackRate, setPlaybackRate] = useState(1);
  const [playbackSrc, setPlaybackSrc] = useState(src);

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
      return AUDIO_WAVE_BARS;
    }
    const normalized = waveform
      .filter((item): item is number => typeof item === "number" && Number.isFinite(item))
      .map((item) => Math.max(8, Math.min(100, Math.round(item))))
      .slice(0, 96);
    if (normalized.length === 0) return AUDIO_WAVE_BARS;
    return resizeWaveform(normalized, AUDIO_WAVE_DISPLAY_BARS);
  }, [waveform]);

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
      try {
        await audio.play();
      } catch {
        setIsPlaying(false);
        if (src !== playbackSrc) {
          setPlaybackSrc(src);
        }
      }
      return;
    }
    audio.pause();
    setIsPlaying(false);
  }, [playbackSrc, src]);

  const handleCyclePlaybackRate = useCallback(() => {
    const currentIndex = AUDIO_PLAYBACK_RATES.findIndex((rate) => rate === playbackRate);
    const nextRate =
      AUDIO_PLAYBACK_RATES[
        currentIndex >= 0
          ? (currentIndex + 1) % AUDIO_PLAYBACK_RATES.length
          : 0
      ] ?? 1;
    setPlaybackRate(nextRate);
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = nextRate;
    }
  }, [playbackRate]);

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
    const nextIdentity =
      (typeof mediaIdentity === "string" && mediaIdentity.trim()) || src;
    const previousIdentity = previousIdentityRef.current;
    const identityChanged = nextIdentity !== previousIdentity;

    if (identityChanged) {
      previousIdentityRef.current = nextIdentity;
      pendingSrcRef.current = null;
      setPlaybackSrc(src);
      setCurrentTime(0);
      setIsPlaying(false);
      setPlaybackRate(1);
      setDuration(
        typeof durationSeconds === "number" && Number.isFinite(durationSeconds)
          ? Math.max(0, durationSeconds)
          : 0
      );
      return;
    }

    if (isPlaying) {
      pendingSrcRef.current = src;
      return;
    }

    if (src !== playbackSrc) {
      setPlaybackSrc(src);
    }
  }, [durationSeconds, isPlaying, mediaIdentity, playbackSrc, src]);

  useEffect(() => {
    if (isPlaying) return;
    const pendingSrc = pendingSrcRef.current;
    if (!pendingSrc) return;
    pendingSrcRef.current = null;
    if (pendingSrc !== playbackSrc) {
      setPlaybackSrc(pendingSrc);
    }
  }, [isPlaying, playbackSrc]);

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
    };
    const onPause = () => {
      const trackDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
      if (trackDuration > 0 && audio.currentTime >= trackDuration - 0.02) {
        audio.currentTime = 0;
        setCurrentTime(0);
      }
      setIsPlaying(false);
    };
    const onPlay = () => setIsPlaying(true);
    const onEnded = () => {
      tryReportListened(
        Number.isFinite(audio.duration) ? audio.duration : audio.currentTime,
        audio.duration
      );
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
  }, [durationSeconds, playbackSrc, tryReportListened]);

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
      pendingSrcRef.current = null;
      audioRef.current?.pause();
    },
    []
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = playbackRate;
  }, [playbackRate]);

  const displayDuration =
    duration > 0
      ? duration
      : durationSecondsRef.current > 0
        ? durationSecondsRef.current
        : 0;
  const progressRatio =
    displayDuration > 0 ? Math.min(1, Math.max(0, currentTime / displayDuration)) : 0;
  const activeBars =
    displayDuration > 0
      ? isPlaying
        ? Math.max(1, Math.round(progressRatio * waveBars.length))
        : Math.max(0, Math.round(progressRatio * waveBars.length))
      : isPlaying
        ? ((Math.floor(currentTime * 14) % waveBars.length) + waveBars.length) %
            waveBars.length || 1
        : 0;

  return (
    <div
      className={`chat-page__audio-player ${isPlaying ? "is-playing" : ""} ${
        listenedByPeer ? "is-listened" : ""
      }`}
    >
      <audio ref={audioRef} preload="metadata" src={playbackSrc} />
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
          <div className="chat-page__audio-wave-wrap" aria-hidden="true">
            <div className="chat-page__audio-wave">
              {waveBars.map((height, index) => (
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
          {isPlaying ? (
            <button
              type="button"
              className="chat-page__audio-speed"
              onClick={handleCyclePlaybackRate}
              aria-label="Скорость воспроизведения"
            >
              {playbackRate}x
            </button>
          ) : null}
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
