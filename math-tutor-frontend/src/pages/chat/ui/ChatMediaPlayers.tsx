import { useCallback, useEffect, useRef, useState } from "react";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import VolumeUpRoundedIcon from "@mui/icons-material/VolumeUpRounded";
import VolumeOffRoundedIcon from "@mui/icons-material/VolumeOffRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import { formatPlaybackTime } from "@/pages/chat/model/chatPageUtils";

const AUDIO_PLAYBACK_RATES = [1, 1.25, 1.5, 2];
const AUDIO_WAVE_BARS = [
  24, 44, 31, 56, 42, 68, 37, 58, 46, 64, 36, 52, 40, 61, 34, 49, 30, 43,
];

export function AudioMessagePlayer({
  src,
  fileName,
}: {
  src: string;
  fileName?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  const togglePlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
      return;
    }
    audio.pause();
    setIsPlaying(false);
  }, []);

  const handleSeek = useCallback((value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrentTime(value);
  }, []);

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
    const audio = audioRef.current;
    if (!audio) return;
    const onLoadedMetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onPause = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("ended", onEnded);
      audio.pause();
    };
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = playbackRate;
  }, [playbackRate]);

  const progressRatio =
    duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
  const activeBars = Math.max(1, Math.round(progressRatio * AUDIO_WAVE_BARS.length));

  return (
    <div className="chat-page__audio-player">
      <audio ref={audioRef} preload="metadata" src={src} />
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
        <div className="chat-page__audio-head">
          <div className="chat-page__audio-wave" aria-hidden="true">
            {AUDIO_WAVE_BARS.map((height, index) => (
              <span
                key={index}
                style={{ height: `${height}%` }}
                className={index < activeBars ? "is-active" : ""}
              />
            ))}
          </div>
          <button
            type="button"
            className="chat-page__audio-speed"
            onClick={handleCyclePlaybackRate}
            aria-label="Скорость воспроизведения"
          >
            {playbackRate}x
          </button>
        </div>
        <input
          className="chat-page__audio-range"
          type="range"
          min={0}
          max={Math.max(duration, 1)}
          step={0.1}
          value={Math.min(currentTime, duration || 0)}
          onChange={(event) => handleSeek(Number(event.target.value))}
          aria-label="Позиция аудио"
        />
        <div className="chat-page__audio-time">
          <span>{formatPlaybackTime(currentTime)}</span>
          <span>{formatPlaybackTime(duration)}</span>
        </div>
      </div>
      <a
        className="chat-page__audio-download"
        href={src}
        download={fileName}
        title="Скачать аудио"
      >
        <DownloadRoundedIcon fontSize="inherit" />
      </a>
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
