import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Alert,
  Avatar,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  IconButton,
  Menu,
  MenuItem,
  TextField,
} from "@mui/material";
import ForumRoundedIcon from "@mui/icons-material/ForumRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import DiamondRoundedIcon from "@mui/icons-material/DiamondRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import AttachFileRoundedIcon from "@mui/icons-material/AttachFileRounded";
import MicRoundedIcon from "@mui/icons-material/MicRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import VolumeUpRoundedIcon from "@mui/icons-material/VolumeUpRounded";
import VolumeOffRoundedIcon from "@mui/icons-material/VolumeOffRounded";
import DoneRoundedIcon from "@mui/icons-material/DoneRounded";
import DoneAllRoundedIcon from "@mui/icons-material/DoneAllRounded";
import VideocamRoundedIcon from "@mui/icons-material/VideocamRounded";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import HeadsetRoundedIcon from "@mui/icons-material/HeadsetRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import DeleteSweepRoundedIcon from "@mui/icons-material/DeleteSweepRounded";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/features/auth/model/AuthContext";
import {
  clearTeacherChatThread,
  deleteTeacherChatMessage,
  getTeacherChatEligibility,
  getTeacherChatMessages,
  getTeacherChatThreads,
  markTeacherChatThreadRead,
  sendTeacherChatMessage,
  updateTeacherChatMessage,
} from "@/features/chat/model/api";
import type {
  TeacherChatAttachment,
  TeacherChatEligibility,
  TeacherChatMessage,
  TeacherChatThread,
} from "@/features/chat/model/types";
import { fileToDataUrl } from "@/shared/lib/files";

type LocationState = {
  from?: string;
};

type DeleteDialogState = {
  open: boolean;
  message: TeacherChatMessage | null;
};

type MessageContextMenuState = {
  open: boolean;
  message: TeacherChatMessage | null;
  x: number;
  y: number;
};

type TimelineItem =
  | {
      kind: "day";
      id: string;
      label: string;
    }
  | {
      kind: "message";
      id: string;
      message: TeacherChatMessage;
    };

const formatThreadDate = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const toDayKey = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};

const formatDayLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Без даты";
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(date, today)) return "Сегодня";
  if (sameDay(date, yesterday)) return "Вчера";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
};

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
};

const formatPlaybackTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "00:00";
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
};

const getAttachmentKind = (mimeType: string) => {
  const normalized = mimeType.toLowerCase();
  if (normalized.startsWith("image/")) return "image";
  if (normalized.startsWith("video/")) return "video";
  if (normalized.startsWith("audio/")) return "audio";
  return "file";
};

const truncateFileName = (name: string, maxLength = 28) => {
  const safeName = name.trim();
  if (safeName.length <= maxLength) return safeName;
  const lastDot = safeName.lastIndexOf(".");
  if (lastDot <= 0 || lastDot >= safeName.length - 1) {
    return `${safeName.slice(0, maxLength - 1)}…`;
  }
  const ext = safeName.slice(lastDot);
  const base = safeName.slice(0, lastDot);
  const allowedBaseLength = Math.max(8, maxLength - ext.length - 1);
  return `${base.slice(0, allowedBaseLength)}…${ext}`;
};

const getComposerAttachmentTitle = (attachment: TeacherChatAttachment) => {
  const kind = getAttachmentKind(attachment.mimeType);
  if (kind === "audio") return "Голосовое сообщение";
  if (kind === "video") return "Видеофайл";
  return attachment.name;
};

const MAX_ATTACHMENTS_PER_MESSAGE = 10;
const MAX_ATTACHMENT_SIZE_BYTES = 24 * 1024 * 1024;

const isValidChatAttachment = (
  value: TeacherChatAttachment | null | undefined
): value is TeacherChatAttachment =>
  Boolean(
    value &&
      typeof value.id === "string" &&
      value.id.trim() &&
      typeof value.name === "string" &&
      value.name.trim() &&
      typeof value.mimeType === "string" &&
      value.mimeType.trim() &&
      typeof value.url === "string" &&
      value.url.trim()
  );

const normalizeChatMessage = (message: TeacherChatMessage): TeacherChatMessage => ({
  ...message,
  text: typeof message.text === "string" ? message.text : "",
  attachments: Array.isArray(message.attachments)
    ? message.attachments.filter((attachment) => isValidChatAttachment(attachment))
    : [],
});

const normalizeChatThread = (thread: TeacherChatThread): TeacherChatThread => ({
  ...thread,
  studentName: thread.studentName?.trim() || "Студент",
  studentEmail: thread.studentEmail?.trim() || "—",
  teacherName: thread.teacherName?.trim() || "Преподаватель",
  unreadCount:
    typeof thread.unreadCount === "number" && Number.isFinite(thread.unreadCount)
      ? Math.max(0, Math.floor(thread.unreadCount))
      : 0,
});

const createAttachmentFromFile = async (
  file: File
): Promise<TeacherChatAttachment> => ({
  id:
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  name: file.name,
  mimeType: file.type || "application/octet-stream",
  size: file.size,
  url: await fileToDataUrl(file),
});

function AudioMessagePlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

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

  return (
    <div className="chat-page__audio-player">
      <audio ref={audioRef} preload="metadata" src={src} />
      <button
        type="button"
        className="chat-page__audio-toggle"
        onClick={() => void togglePlayback()}
        aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
      >
        {isPlaying ? (
          <PauseRoundedIcon fontSize="inherit" />
        ) : (
          <PlayArrowRoundedIcon fontSize="inherit" />
        )}
      </button>
      <div className="chat-page__audio-track">
        <input
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
    </div>
  );
}

function VideoMessagePlayer({
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

export default function ChatPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const locationState = (location.state ?? {}) as LocationState;
  const backFrom =
    typeof locationState.from === "string" ? locationState.from.trim() : "";
  const showBackButton = backFrom.length > 0;
  const preferredThreadId = searchParams.get("threadId");
  const preferredStudentId = searchParams.get("studentId");

  const [threads, setThreads] = useState<TeacherChatThread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [messages, setMessages] = useState<TeacherChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [chatEligibility, setChatEligibility] =
    useState<TeacherChatEligibility | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [composerAttachments, setComposerAttachments] = useState<
    TeacherChatAttachment[]
  >([]);
  const [sending, setSending] = useState(false);
  const [threadQuery, setThreadQuery] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [messageMenu, setMessageMenu] = useState<MessageContextMenuState>({
    open: false,
    message: null,
    x: 0,
    y: 0,
  });
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
    open: false,
    message: null,
  });
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearLoading, setClearLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(60);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const isTeacher = user?.role === "teacher";
  const endOfMessagesRef = useRef<HTMLDivElement | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageElementRefs = useRef(new Map<string, HTMLElement>());
  const markReadThrottleRef = useRef<number | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const previousThreadIdRef = useRef<string | null>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  const restoreScrollRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const recorderTimerRef = useRef<number | null>(null);
  const messageMenuCloseTimerRef = useRef<number | null>(null);

  const goBack = useCallback(() => {
    if (!showBackButton) return;
    navigate(backFrom);
  }, [backFrom, navigate, showBackButton]);

  const closeMessageMenu = useCallback(() => {
    setMessageMenu({
      open: false,
      message: null,
      x: 0,
      y: 0,
    });
  }, []);

  const cancelMessageMenuClose = useCallback(() => {
    if (messageMenuCloseTimerRef.current !== null) {
      window.clearTimeout(messageMenuCloseTimerRef.current);
      messageMenuCloseTimerRef.current = null;
    }
  }, []);

  const scheduleMessageMenuClose = useCallback(() => {
    cancelMessageMenuClose();
    messageMenuCloseTimerRef.current = window.setTimeout(() => {
      closeMessageMenu();
    }, 120);
  }, [cancelMessageMenuClose, closeMessageMenu]);

  const loadThreads = useCallback(
    async (options?: { keepSpinner?: boolean }) => {
      if (!user) return;
      if (!options?.keepSpinner) {
        setThreadsLoading(true);
      }
      setThreadsError(null);
      try {
        const nextThreads = await getTeacherChatThreads();
        const normalizedThreads = nextThreads.map(normalizeChatThread);
        setThreads(normalizedThreads);
        setSelectedThreadId((currentId) => {
          if (currentId && normalizedThreads.some((item) => item.id === currentId)) {
            return currentId;
          }
          return normalizedThreads[0]?.id ?? null;
        });
      } catch (error) {
        setThreadsError(
          error instanceof Error ? error.message : "Не удалось загрузить диалоги."
        );
      } finally {
        setThreadsLoading(false);
      }
    },
    [user]
  );

  const loadMessages = useCallback(
    async (threadId: string, options?: { silent?: boolean }) => {
      if (!threadId) return;
      if (!options?.silent) {
        setMessagesLoading(true);
      }
      setMessagesError(null);
      try {
        const nextMessages = await getTeacherChatMessages(threadId);
        const normalizedMessages = nextMessages.map(normalizeChatMessage);
        setMessages(normalizedMessages);
      } catch (error) {
        setMessagesError(
          error instanceof Error ? error.message : "Не удалось загрузить сообщения."
        );
      } finally {
        setMessagesLoading(false);
      }
    },
    []
  );

  const requestMarkRead = useCallback(() => {
    if (!selectedThreadId || !user) return;
    if (markReadThrottleRef.current !== null) return;
    markReadThrottleRef.current = window.setTimeout(() => {
      markReadThrottleRef.current = null;
      void markTeacherChatThreadRead(selectedThreadId)
        .then(() => Promise.all([
          loadThreads({ keepSpinner: true }),
          loadMessages(selectedThreadId, { silent: true }),
        ]))
        .catch(() => undefined);
    }, 320);
  }, [loadMessages, loadThreads, selectedThreadId, user]);

  useEffect(() => {
    if (markReadThrottleRef.current === null) return;
    return () => {
      if (markReadThrottleRef.current !== null) {
        window.clearTimeout(markReadThrottleRef.current);
        markReadThrottleRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const bootstrap = async () => {
      setThreadsLoading(true);
      setThreadsError(null);
      if (user.role === "student") {
        try {
          const eligibility = await getTeacherChatEligibility();
          if (cancelled) return;
          setChatEligibility(eligibility);
          if (!eligibility.available) {
            setThreads([]);
            setSelectedThreadId(null);
            setMessages([]);
            setThreadsLoading(false);
            return;
          }
        } catch (error) {
          if (cancelled) return;
          setThreadsError(
            error instanceof Error
              ? error.message
              : "Не удалось проверить доступ к чату."
          );
          setThreadsLoading(false);
          return;
        }
      }
      if (cancelled) return;
      await loadThreads();
    };
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [loadThreads, user]);

  useEffect(() => {
    if (!selectedThreadId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedThreadId);
  }, [loadMessages, selectedThreadId]);

  useEffect(() => {
    if (!threads.length || (!preferredThreadId && !preferredStudentId)) return;
    const matchedThread =
      (preferredThreadId
        ? threads.find((thread) => thread.id === preferredThreadId)
        : null) ??
      (preferredStudentId
        ? threads.find((thread) => thread.studentId === preferredStudentId)
        : null) ??
      null;
    if (!matchedThread) return;
    if (selectedThreadId !== matchedThread.id) {
      setSelectedThreadId(matchedThread.id);
    }
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("threadId");
    nextParams.delete("studentId");
    const nextQuery = nextParams.toString();
    if (nextQuery !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [
    preferredStudentId,
    preferredThreadId,
    searchParams,
    selectedThreadId,
    setSearchParams,
    threads,
  ]);

  useEffect(() => {
    if (!selectedThreadId) return;
    const pollId = window.setInterval(() => {
      void loadMessages(selectedThreadId, { silent: true });
      void loadThreads({ keepSpinner: true });
    }, 8_000);
    return () => {
      window.clearInterval(pollId);
    };
  }, [loadMessages, loadThreads, selectedThreadId]);

  useEffect(() => {
    if (previousThreadIdRef.current !== selectedThreadId) {
      previousThreadIdRef.current = selectedThreadId;
      shouldStickToBottomRef.current = true;
      lastMessageIdRef.current = null;
      setVisibleCount(60);
    }
  }, [selectedThreadId]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;
    const currentLastMessageId = messages[messages.length - 1]?.id ?? null;
    const hasTailChanged = currentLastMessageId !== lastMessageIdRef.current;
    if (!hasTailChanged) return;
    lastMessageIdRef.current = currentLastMessageId;
    if (!shouldStickToBottomRef.current) return;
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useLayoutEffect(() => {
    const previousHeight = restoreScrollRef.current;
    if (previousHeight === null) return;
    const viewport = messagesViewportRef.current;
    if (!viewport) {
      restoreScrollRef.current = null;
      return;
    }
    const delta = viewport.scrollHeight - previousHeight;
    if (delta > 0) {
      viewport.scrollTop += delta;
    }
    restoreScrollRef.current = null;
  }, [visibleCount, messages.length]);

  const visibleMessages = useMemo(() => {
    if (messages.length <= visibleCount) return messages;
    return messages.slice(-visibleCount);
  }, [messages, visibleCount]);

  const hasOlderMessages = messages.length > visibleCount;

  useEffect(() => {
    const root = messagesViewportRef.current;
    if (!root || !user || !selectedThreadId) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const hasVisibleIncoming = entries.some((entry) => {
          if (!entry.isIntersecting) return false;
          const messageId = entry.target.getAttribute("data-message-id");
          if (!messageId) return false;
          const message = visibleMessages.find((item) => item.id === messageId);
          if (!message) return false;
          return message.senderId !== user.id;
        });
        if (hasVisibleIncoming) {
          requestMarkRead();
        }
      },
      {
        root,
        threshold: 0.68,
      }
    );

    visibleMessages.forEach((message) => {
      if (message.senderId === user.id) return;
      const element = messageElementRefs.current.get(message.id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, [requestMarkRead, selectedThreadId, user, visibleMessages]);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [selectedThreadId, threads]
  );

  const filteredThreads = useMemo(() => {
    if (!isTeacher) return threads;
    const query = threadQuery.trim().toLowerCase();
    if (!query) return threads;
    return threads.filter((thread) =>
      `${thread.studentName} ${thread.studentEmail}`.toLowerCase().includes(query)
    );
  }, [isTeacher, threadQuery, threads]);

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    let previousDay = "";
    visibleMessages.forEach((message) => {
      const dayKey = toDayKey(message.createdAt);
      if (dayKey !== previousDay) {
        previousDay = dayKey;
        items.push({
          kind: "day",
          id: `day-${dayKey}`,
          label: formatDayLabel(message.createdAt),
        });
      }
      items.push({
        kind: "message",
        id: message.id,
        message,
      });
    });
    return items;
  }, [visibleMessages]);

  const adjustComposerHeight = useCallback(() => {
    const node = composerInputRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(168, Math.max(42, node.scrollHeight))}px`;
  }, []);

  useEffect(() => {
    adjustComposerHeight();
  }, [adjustComposerHeight, inputValue, composerAttachments.length, editingMessageId]);

  const resetComposer = useCallback(() => {
    setInputValue("");
    setComposerAttachments([]);
    setEditingMessageId(null);
  }, []);

  const handleMessagesScroll = useCallback(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;
    const distanceToBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    shouldStickToBottomRef.current = distanceToBottom < 64;
  }, []);

  const handleLoadOlderMessages = useCallback(() => {
    if (!hasOlderMessages) return;
    const viewport = messagesViewportRef.current;
    if (viewport) {
      restoreScrollRef.current = viewport.scrollHeight;
    }
    setVisibleCount((current) => Math.min(messages.length, current + 40));
  }, [hasOlderMessages, messages.length]);

  const handlePickFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const selected = Array.from(files).slice(0, MAX_ATTACHMENTS_PER_MESSAGE);
    const oversized = selected.filter((file) => file.size > MAX_ATTACHMENT_SIZE_BYTES);
    if (oversized.length > 0) {
      setMessagesError(
        `Файл слишком большой. Максимум ${Math.round(
          MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)
        )} МБ на файл.`
      );
      return;
    }
    try {
      const settled = await Promise.allSettled(
        selected.map((file) => createAttachmentFromFile(file))
      );
      const successful = settled
        .filter(
          (
            item
          ): item is PromiseFulfilledResult<TeacherChatAttachment> =>
            item.status === "fulfilled"
        )
        .map((item) => item.value)
        .filter(
          (attachment) =>
            Boolean(attachment.url?.trim()) && Boolean(attachment.name?.trim())
        );
      const failedCount = settled.length - successful.length;
      if (failedCount > 0) {
        setMessagesError(
          "Часть файлов не удалось подготовить к отправке. Проверьте формат и повторите попытку."
        );
      } else {
        setMessagesError(null);
      }
      if (successful.length === 0) return;
      setComposerAttachments((current) => {
        const merged = [...current, ...successful];
        if (merged.length <= MAX_ATTACHMENTS_PER_MESSAGE) return merged;
        return merged.slice(0, MAX_ATTACHMENTS_PER_MESSAGE);
      });
    } catch (error) {
      setMessagesError(
        error instanceof Error
          ? error.message
          : "Не удалось обработать выбранные файлы."
      );
    }
  }, []);

  const stopAudioRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, []);

  const startAudioRecording = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMessagesError("Запись аудио недоступна в текущем браузере.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setMessagesError("Запись аудио не поддерживается этим устройством.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorderStreamRef.current = stream;
      recorderChunksRef.current = [];
      setMessagesError(null);
      setRecordingSeconds(0);
      setIsRecordingAudio(true);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recorderChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        if (recorderTimerRef.current !== null) {
          window.clearInterval(recorderTimerRef.current);
          recorderTimerRef.current = null;
        }
        const chunks = recorderChunksRef.current;
        recorderChunksRef.current = [];
        setIsRecordingAudio(false);
        setRecordingSeconds(0);
        recorderRef.current = null;

        if (recorderStreamRef.current) {
          recorderStreamRef.current.getTracks().forEach((track) => track.stop());
          recorderStreamRef.current = null;
        }

        if (chunks.length === 0) return;
        const blob = new Blob(chunks, {
          type: recorder.mimeType || "audio/webm",
        });
        if (blob.size <= 0) return;
        const file = new File([blob], `voice-${Date.now()}.webm`, {
          type: blob.type || "audio/webm",
        });
        try {
          const attachment = await createAttachmentFromFile(file);
          if (!attachment.url?.trim()) {
            setMessagesError(
              "Не удалось подготовить голосовое сообщение. Попробуйте еще раз."
            );
            return;
          }
          setComposerAttachments((current) => {
            const merged = [...current, attachment];
            if (merged.length <= MAX_ATTACHMENTS_PER_MESSAGE) return merged;
            return merged.slice(0, MAX_ATTACHMENTS_PER_MESSAGE);
          });
        } catch (error) {
          setMessagesError(
            error instanceof Error
              ? error.message
              : "Не удалось подготовить голосовое сообщение."
          );
        }
      };

      recorder.start(300);
      recorderTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((current) => current + 1);
      }, 1000);
    } catch (error) {
      setMessagesError(
        error instanceof Error ? error.message : "Не удалось начать запись аудио."
      );
      setIsRecordingAudio(false);
      if (recorderTimerRef.current !== null) {
        window.clearInterval(recorderTimerRef.current);
        recorderTimerRef.current = null;
      }
      if (recorderStreamRef.current) {
        recorderStreamRef.current.getTracks().forEach((track) => track.stop());
        recorderStreamRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      if (recorderTimerRef.current !== null) {
        window.clearInterval(recorderTimerRef.current);
      }
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      if (recorderStreamRef.current) {
        recorderStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (messageMenuCloseTimerRef.current !== null) {
        window.clearTimeout(messageMenuCloseTimerRef.current);
      }
    };
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!user || sending || isRecordingAudio) return;
      const text = inputValue.trim().slice(0, 4000);
      const safeAttachments = composerAttachments
        .filter(
          (attachment) =>
            Boolean(attachment.id) &&
            Boolean(attachment.name?.trim()) &&
            Boolean(attachment.url?.trim())
        )
        .slice(0, MAX_ATTACHMENTS_PER_MESSAGE);
      if (!text && safeAttachments.length === 0) return;
      const activeThreadId = selectedThreadId;
      if (user.role === "teacher" && !activeThreadId) {
        setMessagesError("Сначала выберите диалог студента.");
        return;
      }

      shouldStickToBottomRef.current = true;
      setSending(true);
      setMessagesError(null);
      let resultingThreadId = activeThreadId;
      try {
        if (editingMessageId && activeThreadId) {
          await updateTeacherChatMessage({
            messageId: editingMessageId,
            threadId: activeThreadId,
            text,
            attachments: safeAttachments,
          });
        } else {
          const baseThreadId =
            user.role === "teacher" ? activeThreadId ?? undefined : undefined;
          const payloads: Array<{ text: string; attachments?: TeacherChatAttachment[] }> =
            [];

          if (safeAttachments.length > 1) {
            safeAttachments.forEach((attachment, index) => {
              payloads.push({
                text: index === 0 ? text : "",
                attachments: [attachment],
              });
            });
          } else if (safeAttachments.length === 1) {
            payloads.push({
              text,
              attachments: safeAttachments,
            });
          } else {
            payloads.push({ text });
          }

          let createdThreadId: string | null = null;
          for (const payload of payloads) {
            const created = await sendTeacherChatMessage({
              threadId: baseThreadId,
              text: payload.text,
              attachments: payload.attachments,
            });
            if (created?.threadId) {
              createdThreadId = created.threadId;
            }
          }
          if (!activeThreadId && createdThreadId) {
            setSelectedThreadId(createdThreadId);
            resultingThreadId = createdThreadId;
          }
        }
        resetComposer();
        try {
          await loadThreads({ keepSpinner: true });
        } catch {
          // the message may already be sent; refresh errors are non-fatal
        }
        if (resultingThreadId) {
          try {
            await loadMessages(resultingThreadId, { silent: true });
          } catch {
            // the message may already be sent; refresh errors are non-fatal
          }
        }
      } catch (error) {
        setMessagesError(
          error instanceof Error ? error.message : "Не удалось отправить сообщение."
        );
      } finally {
        setSending(false);
      }
    },
    [
      composerAttachments,
      editingMessageId,
      inputValue,
      isRecordingAudio,
      loadMessages,
      loadThreads,
      resetComposer,
      selectedThreadId,
      sending,
      user,
    ]
  );

  const handleEditMessage = useCallback(
    (message: TeacherChatMessage) => {
      setEditingMessageId(message.id);
      setInputValue(message.text);
      setComposerAttachments(message.attachments ?? []);
      requestAnimationFrame(() => {
        composerInputRef.current?.focus();
        adjustComposerHeight();
      });
    },
    [adjustComposerHeight]
  );

  const handleDelete = useCallback(
    async (scope: "self" | "all") => {
      if (!deleteDialog.message || !selectedThreadId || !user) return;
      setDeleteLoading(true);
      setMessagesError(null);
      try {
        await deleteTeacherChatMessage({
          messageId: deleteDialog.message.id,
          threadId: selectedThreadId,
          scope,
        });
        setDeleteDialog({ open: false, message: null });
        if (editingMessageId === deleteDialog.message.id) {
          resetComposer();
        }
        await loadThreads({ keepSpinner: true });
        await loadMessages(selectedThreadId, { silent: true });
      } catch (error) {
        setMessagesError(
          error instanceof Error ? error.message : "Не удалось удалить сообщение."
        );
      } finally {
        setDeleteLoading(false);
      }
    },
    [
      deleteDialog.message,
      editingMessageId,
      loadMessages,
      loadThreads,
      resetComposer,
      selectedThreadId,
      user,
    ]
  );

  const handleClearThread = useCallback(async () => {
    if (!selectedThreadId || !isTeacher || clearLoading) return;
    setClearLoading(true);
    setMessagesError(null);
    try {
      await clearTeacherChatThread(selectedThreadId);
      setClearDialogOpen(false);
      resetComposer();
      await Promise.all([
        loadThreads({ keepSpinner: true }),
        loadMessages(selectedThreadId, { silent: true }),
      ]);
    } catch (error) {
      setMessagesError(
        error instanceof Error
          ? error.message
          : "Не удалось очистить переписку."
      );
    } finally {
      setClearLoading(false);
    }
  }, [
    clearLoading,
    isTeacher,
    loadMessages,
    loadThreads,
    resetComposer,
    selectedThreadId,
  ]);

  const chatUnavailable =
    user?.role === "student" && chatEligibility && !chatEligibility.available;

  return (
    <div className="chat-page">
      {showBackButton ? (
        <IconButton
          onClick={goBack}
          className="chat-page__back-square"
          aria-label="Назад"
        >
          <ArrowBackRoundedIcon fontSize="small" />
        </IconButton>
      ) : null}

      <section className="chat-page__shell">
        <aside className="chat-page__sidebar">
          <div className="chat-page__sidebar-head">
            <h1>
              <ForumRoundedIcon fontSize="small" />
              {isTeacher ? "Диалоги со студентами" : "Диалог с преподавателем"}
            </h1>
            <span>
              {isTeacher
                ? "Единый канал обратной связи"
                : "Премиум-чат для вопросов по обучению"}
            </span>
          </div>
          {isTeacher ? (
            <TextField
              value={threadQuery}
              onChange={(event) => setThreadQuery(event.target.value)}
              placeholder="Поиск студента..."
              size="small"
              fullWidth
            />
          ) : null}
          <div className="chat-page__thread-list">
            {threadsLoading ? (
              <div className="chat-page__state">
                <CircularProgress size={24} />
              </div>
            ) : filteredThreads.length === 0 ? (
              <div className="chat-page__state">Нет доступных диалогов.</div>
            ) : (
              filteredThreads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  className={`chat-page__thread-item ${
                    thread.id === selectedThreadId ? "is-active" : ""
                  }`}
                  onClick={() => setSelectedThreadId(thread.id)}
                >
                  <Avatar
                    src={isTeacher ? thread.studentPhoto : thread.teacherPhoto}
                    className="chat-page__thread-avatar"
                  >
                    {isTeacher ? (
                      <PersonRoundedIcon fontSize="small" />
                    ) : (
                      <SchoolRoundedIcon fontSize="small" />
                    )}
                  </Avatar>
                  <div className="chat-page__thread-copy">
                    <strong>
                      {isTeacher ? thread.studentName : thread.teacherName || "Преподаватель"}
                    </strong>
                    <span>{thread.lastMessageText ?? "Нет сообщений"}</span>
                  </div>
                  <div className="chat-page__thread-meta">
                    <time>{formatThreadDate(thread.lastMessageAt ?? thread.updatedAt)}</time>
                    {thread.unreadCount > 0 && (
                      <span className="chat-page__thread-unread">{thread.unreadCount}</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="chat-page__main">
          <header className="chat-page__main-head">
            <div className="chat-page__main-title">
              <Avatar
                src={isTeacher ? selectedThread?.studentPhoto : selectedThread?.teacherPhoto}
                className="chat-page__main-avatar"
              >
                {isTeacher ? <PersonRoundedIcon /> : <SchoolRoundedIcon />}
              </Avatar>
              <div>
                <h2>
                  {isTeacher
                    ? selectedThread?.studentName ?? "Выберите диалог"
                    : selectedThread?.teacherName ?? "Чат с преподавателем"}
                </h2>
                <p>
                  {isTeacher
                    ? selectedThread?.studentEmail ?? "Сообщения и обратная связь"
                    : "Личные ответы преподавателя в одном окне"}
                </p>
              </div>
            </div>
            <div className="chat-page__head-actions">
              {isTeacher && selectedThread ? (
                <Button
                  variant="outlined"
                  size="small"
                  className="chat-page__clear-button"
                  onClick={() => setClearDialogOpen(true)}
                  startIcon={<DeleteSweepRoundedIcon fontSize="small" />}
                >
                  Очистить чат
                </Button>
              ) : null}
              <div className="chat-page__premium-pill">
                <DiamondRoundedIcon fontSize="small" />
                <span>Премиум-канал</span>
              </div>
            </div>
          </header>

          {threadsError ? <Alert severity="error">{threadsError}</Alert> : null}

          {chatUnavailable ? (
            <div className="chat-page__empty-gate">
              <Alert severity="warning">
                Чат с преподавателем доступен после покупки курса по премиум тарифу
                или записи на индивидуальное занятие.
              </Alert>
              <div className="chat-page__empty-actions">
                <Button variant="contained" onClick={() => navigate("/courses")}>
                  Перейти к курсам
                </Button>
                <Button variant="outlined" onClick={() => navigate("/booking")}>
                  Записаться на занятие
                </Button>
              </div>
            </div>
          ) : !selectedThread ? (
            <div className="chat-page__state chat-page__state--large">
              {threadsLoading ? <CircularProgress size={30} /> : "Выберите диалог для начала"}
            </div>
          ) : (
            <div className="chat-page__conversation">
              <div
                className="chat-page__messages"
                ref={messagesViewportRef}
                onScroll={handleMessagesScroll}
              >
                {hasOlderMessages ? (
                  <div className="chat-page__history-toolbar">
                    <Button
                      size="small"
                      variant="outlined"
                      className="chat-page__history-button"
                      onClick={handleLoadOlderMessages}
                    >
                      Показать предыдущие сообщения
                    </Button>
                  </div>
                ) : null}
                {messagesLoading ? (
                  <div className="chat-page__state chat-page__state--messages-loading">
                    <div className="chat-page__messages-loader" aria-label="Загрузка сообщений">
                      <span className="chat-page__messages-spinner" />
                      <span className="chat-page__messages-spinner-ring" />
                    </div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="chat-page__state">
                    Пока сообщений нет. Начните диалог первым.
                  </div>
                ) : (
                  timeline.map((item) => {
                    if (item.kind === "day") {
                      return (
                        <div key={item.id} className="chat-page__day-separator">
                          <span>{item.label}</span>
                        </div>
                      );
                    }

                    const message = item.message;
                    const ownMessage = message.senderId === user?.id;
                    const senderClass =
                      message.senderRole === "teacher" ? "is-teacher" : "is-student";
                    const isDeleted = Boolean(message.deletedForAll);
                    return (
                      <article
                        key={message.id}
                        data-message-id={message.id}
                        ref={(node) => {
                          if (node) {
                            messageElementRefs.current.set(message.id, node);
                          } else {
                            messageElementRefs.current.delete(message.id);
                          }
                        }}
                        className={`chat-page__message ${senderClass} ${
                          ownMessage ? "is-own" : ""
                        } ${isDeleted ? "is-deleted" : ""}`}
                        onMouseEnter={() => {
                          if (messageMenu.message?.id === message.id) {
                            cancelMessageMenuClose();
                          }
                        }}
                        onMouseLeave={() => {
                          if (messageMenu.message?.id === message.id) {
                            scheduleMessageMenuClose();
                          }
                        }}
                        onContextMenu={(event) => {
                          if (!ownMessage || isDeleted) return;
                          event.preventDefault();
                          cancelMessageMenuClose();
                          setMessageMenu({
                            open: true,
                            message,
                            x: event.clientX,
                            y: event.clientY,
                          });
                        }}
                      >
                        {message.text ? <p>{message.text}</p> : null}

                        {message.attachments && message.attachments.length > 0 ? (
                          <div className="chat-page__message-attachments">
                            {message.attachments.map((attachment) => {
                              const kind = getAttachmentKind(attachment.mimeType);
                              if (kind === "image") {
                                return (
                                  <div
                                    key={attachment.id}
                                    className="chat-page__attachment chat-page__attachment--image"
                                  >
                                    <a
                                      href={attachment.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="chat-page__attachment-image-open"
                                    >
                                      <img src={attachment.url} alt={attachment.name} />
                                    </a>
                                    <a
                                      className="chat-page__attachment-download"
                                      href={attachment.url}
                                      download={attachment.name}
                                      title="Скачать изображение"
                                    >
                                      <DownloadRoundedIcon fontSize="inherit" />
                                    </a>
                                  </div>
                                );
                              }
                              if (kind === "video") {
                                return (
                                  <div
                                    key={attachment.id}
                                    className="chat-page__attachment chat-page__attachment--video"
                                  >
                                    <VideoMessagePlayer
                                      src={attachment.url}
                                      fileName={attachment.name}
                                    />
                                  </div>
                                );
                              }
                              if (kind === "audio") {
                                return (
                                  <div
                                    key={attachment.id}
                                    className="chat-page__attachment chat-page__attachment--audio"
                                  >
                                    <AudioMessagePlayer src={attachment.url} />
                                  </div>
                                );
                              }
                              return (
                                <div
                                  key={attachment.id}
                                  className="chat-page__attachment chat-page__attachment--file"
                                >
                                  <DescriptionRoundedIcon fontSize="small" />
                                  <a
                                    className="chat-page__attachment-file-link"
                                    href={attachment.url}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {truncateFileName(attachment.name, 26)}
                                  </a>
                                  <a
                                    className="chat-page__attachment-file-download"
                                    href={attachment.url}
                                    download={attachment.name}
                                    title="Скачать файл"
                                  >
                                    <DownloadRoundedIcon fontSize="inherit" />
                                  </a>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}

                        <div className="chat-page__message-foot">
                          <time>{formatTime(message.createdAt)}</time>
                          {ownMessage ? (
                            <span className="chat-page__read-state">
                              {message.readByPeer ? (
                                <DoneAllRoundedIcon fontSize="inherit" />
                              ) : (
                                <DoneRoundedIcon fontSize="inherit" />
                              )}
                            </span>
                          ) : null}
                        </div>
                      </article>
                    );
                  })
                )}
                <div ref={endOfMessagesRef} />
              </div>

              {messagesError ? <Alert severity="error">{messagesError}</Alert> : null}

              <form className="chat-page__composer" onSubmit={handleSubmit}>
                {composerAttachments.length > 0 ? (
                  <div className="chat-page__composer-attachments">
                    {composerAttachments.map((attachment) => {
                      const kind = getAttachmentKind(attachment.mimeType);
                      return (
                        <article
                          key={attachment.id}
                          className={`chat-page__composer-attachment chat-page__composer-attachment--${kind}`}
                        >
                          <a
                            className="chat-page__composer-attachment-preview"
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <span
                              className={`chat-page__composer-attachment-thumb chat-page__composer-attachment-thumb--${kind}`}
                            >
                              {kind === "image" ? (
                                <img src={attachment.url} alt={attachment.name} />
                              ) : kind === "video" ? (
                                <VideocamRoundedIcon fontSize="small" />
                              ) : kind === "audio" ? (
                                <HeadsetRoundedIcon fontSize="small" />
                              ) : (
                                <DescriptionRoundedIcon fontSize="small" />
                              )}
                            </span>
                            <div className="chat-page__composer-attachment-copy">
                              <strong>
                                {truncateFileName(getComposerAttachmentTitle(attachment), 28)}
                              </strong>
                            </div>
                          </a>
                          <IconButton
                            size="small"
                            className="chat-page__composer-attachment-remove"
                            disableRipple
                            sx={{
                              position: "absolute",
                              top: "4px",
                              right: "6px",
                              zIndex: 3,
                              width: "18px",
                              height: "18px",
                              minWidth: "18px",
                              minHeight: "18px",
                              padding: 0,
                              margin: 0,
                            }}
                            onClick={() =>
                              setComposerAttachments((current) =>
                                current.filter((item) => item.id !== attachment.id)
                              )
                            }
                            aria-label="Удалить вложение"
                          >
                            <CloseRoundedIcon fontSize="small" />
                          </IconButton>
                        </article>
                      );
                    })}
                  </div>
                ) : null}

                <div className="chat-page__composer-row">
                  <div className="chat-page__composer-controls">
                    <input
                      ref={fileInputRef}
                      type="file"
                      hidden
                      multiple
                      onChange={async (event) => {
                        await handlePickFiles(event.target.files);
                        event.target.value = "";
                      }}
                    />
                    <Button
                      variant="outlined"
                      className="chat-page__attach-button"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <AttachFileRoundedIcon fontSize="small" />
                    </Button>
                    <Button
                      variant={isRecordingAudio ? "contained" : "outlined"}
                      color={isRecordingAudio ? "error" : "inherit"}
                      className="chat-page__record-button"
                      onClick={() => {
                        if (isRecordingAudio) {
                          stopAudioRecording();
                        } else {
                          void startAudioRecording();
                        }
                      }}
                    >
                      {isRecordingAudio ? (
                        <StopRoundedIcon fontSize="small" />
                      ) : (
                        <MicRoundedIcon fontSize="small" />
                      )}
                    </Button>
                    {isRecordingAudio ? (
                      <span className="chat-page__record-timer">
                        {formatDuration(recordingSeconds)}
                      </span>
                    ) : null}
                  </div>
                  <textarea
                    ref={composerInputRef}
                    className="chat-page__composer-input"
                    value={inputValue}
                    onChange={(event) => setInputValue(event.target.value)}
                    placeholder="Введите сообщение..."
                    rows={1}
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={
                      sending ||
                      isRecordingAudio ||
                      (!inputValue.trim() && composerAttachments.length === 0)
                    }
                    className="chat-page__send-button"
                  >
                    {sending ? (
                      <CircularProgress size={18} color="inherit" />
                    ) : (
                      <SendRoundedIcon />
                    )}
                  </Button>
                </div>
                {editingMessageId ? (
                  <div className="chat-page__editing-row">
                    <span>Режим редактирования сообщения</span>
                    <Button
                      size="small"
                      onClick={() => {
                        resetComposer();
                      }}
                    >
                      Отменить
                    </Button>
                  </div>
                ) : null}
              </form>
            </div>
          )}
        </div>
      </section>

      <Dialog
        open={clearDialogOpen}
        onClose={() => setClearDialogOpen(false)}
        fullWidth
        maxWidth="xs"
        className="ui-dialog ui-dialog--compact"
      >
        <DialogContent className="chat-page__delete-dialog-content">
          <h3>Очистить переписку</h3>
          <p>
            История переписки будет очищена для преподавателя и студента.
          </p>
        </DialogContent>
        <DialogActions>
          <Button
            color="inherit"
            onClick={() => setClearDialogOpen(false)}
            disabled={clearLoading}
          >
            Отмена
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => void handleClearThread()}
            disabled={clearLoading}
          >
            Очистить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, message: null })}
        fullWidth
        maxWidth="xs"
        className="ui-dialog ui-dialog--compact"
      >
        <DialogContent className="chat-page__delete-dialog-content">
          <h3>Удалить сообщение</h3>
          <p>
            Выберите вариант удаления. Можно скрыть сообщение только у себя или
            удалить его у собеседника тоже.
          </p>
        </DialogContent>
        <DialogActions>
          <Button
            color="inherit"
            onClick={() => setDeleteDialog({ open: false, message: null })}
            disabled={deleteLoading}
          >
            Отмена
          </Button>
          <Button
            variant="outlined"
            onClick={() => void handleDelete("self")}
            disabled={deleteLoading}
          >
            Удалить у меня
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => void handleDelete("all")}
            disabled={
              deleteLoading ||
              !deleteDialog.message ||
              deleteDialog.message.senderId !== user?.id
            }
          >
            Удалить у всех
          </Button>
        </DialogActions>
      </Dialog>

      <Menu
        open={messageMenu.open}
        onClose={closeMessageMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          messageMenu.open
            ? {
                top: messageMenu.y,
                left: messageMenu.x,
              }
            : undefined
        }
        MenuListProps={{
          onMouseEnter: cancelMessageMenuClose,
          onMouseLeave: scheduleMessageMenuClose,
        }}
        className="chat-page__context-menu"
      >
        <MenuItem
          dense
          onClick={() => {
            const target = messageMenu.message;
            if (!target) return;
            handleEditMessage(target);
            closeMessageMenu();
          }}
        >
          <EditRoundedIcon fontSize="small" />
          <span>Редактировать</span>
        </MenuItem>
        <MenuItem
          dense
          onClick={() => {
            const target = messageMenu.message;
            if (!target) return;
            setDeleteDialog({ open: true, message: target });
            closeMessageMenu();
          }}
        >
          <DeleteOutlineRoundedIcon fontSize="small" />
          <span>Удалить</span>
        </MenuItem>
      </Menu>
    </div>
  );
}
