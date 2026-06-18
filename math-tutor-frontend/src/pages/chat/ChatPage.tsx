import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
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
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import AttachFileRoundedIcon from "@mui/icons-material/AttachFileRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import MicRoundedIcon from "@mui/icons-material/MicRounded";
import DoneRoundedIcon from "@mui/icons-material/DoneRounded";
import DoneAllRoundedIcon from "@mui/icons-material/DoneAllRounded";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import HeadsetRoundedIcon from "@mui/icons-material/HeadsetRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import DeleteSweepRoundedIcon from "@mui/icons-material/DeleteSweepRounded";
import OpenInFullRoundedIcon from "@mui/icons-material/OpenInFullRounded";
import CloseFullscreenRoundedIcon from "@mui/icons-material/CloseFullscreenRounded";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/features/auth/model/AuthContext";
import {
  clearTeacherChatThread,
  deleteTeacherChatMessage,
  getTeacherChatEligibility,
  getTeacherChatMessageMediaAccess,
  getTeacherChatMessages,
  getTeacherChatThreads,
  markTeacherChatVoiceListened,
  markTeacherChatThreadRead,
  sendTeacherChatMessage,
  subscribeTeacherChatEvents,
  updateTeacherChatMessage,
} from "@/features/chat/model/api";
import type {
  TeacherChatAttachment,
  TeacherChatEligibility,
  TeacherChatMessage,
  TeacherChatThread,
  TeacherChatVoiceMessage,
} from "@/features/chat/model/types";
import { generateId } from "@/shared/lib/id";
import { logCollectionPressure, usePerfScreenTag } from "@/shared/lib/perfScreen";
import { ImmersiveMediaOverlay } from "@/shared/ui/ImmersiveMediaOverlay";
import { Notice } from "@/shared/ui/Notice";
import {
  createAttachmentFromFile,
  createVoiceMessageFromFile,
  formatAttachmentSize,
  formatDayLabel,
  formatDuration,
  formatPlaybackTime,
  formatThreadDate,
  formatTime,
  getAttachmentKind,
  getAttachmentExtension,
  getComposerAttachmentTitle,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_SIZE_BYTES,
  normalizeChatMessage,
  isValidChatVoiceMessage,
  normalizeChatThread,
  renderChatMessageText,
  toDayKey,
  truncateFileName,
} from "@/pages/chat/model/chatPageUtils";
import {
  AudioMessagePlayer,
  type AudioMessagePlaybackCommand,
  type AudioMessagePlaybackState,
} from "@/pages/chat/ui/ChatMediaPlayers";
import { buildAudioMessageWaveformBars } from "@/pages/chat/ui/chatAudioWaveform";

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

type ChatMediaPreviewItem = {
  id: string;
  kind: "image" | "video" | "file";
  url: string;
  title: string;
  downloadName: string;
  mimeType?: string;
  threadId?: string;
  messageId?: string;
  mediaObjectId?: string;
  urlExpiresAt?: string;
  loading?: boolean;
  error?: boolean;
};

type ChatMediaPreviewState = {
  items: ChatMediaPreviewItem[];
  index: number;
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

const CHAT_AUDIO_PLAYBACK_RATES = [1, 1.5, 2] as const;
const CHAT_AUDIO_RATE_STORAGE_PREFIX = "mathwise.chat.audioRate.";
const CHAT_AUDIO_CACHE_SKEW_MS = 30_000;
const CHAT_AUDIO_LEGACY_URL_TTL_MS = 90_000;
const CHAT_NOTIFICATION_SOUND_MIN_INTERVAL_MS = 1_200;

type AudioContextConstructor = new (
  contextOptions?: AudioContextOptions
) => AudioContext;

type ChatNotificationWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: AudioContextConstructor;
  };

type ChatAudioSourceCacheEntry = {
  downloadUrl: string;
  expiresAtMs: number;
  urlExpiresAt?: string;
  ready: boolean;
  duration?: number;
  cachedAtMs: number;
};

type ChatAudioPositionCacheEntry = {
  currentTime: number;
  duration?: number;
  updatedAtMs: number;
};

type ChatMediaSourceCacheEntry = {
  downloadUrl: string;
  expiresAtMs: number;
  urlExpiresAt?: string;
};

type ComposerVoiceUploadStatus = "uploading" | "ready" | "failed";

type ComposerVoiceDraft = TeacherChatVoiceMessage & {
  localPreviewUrl?: string;
  uploadStatus?: ComposerVoiceUploadStatus;
  uploadError?: string;
};

const chatAudioSourceCache = new Map<string, ChatAudioSourceCacheEntry>();
const chatAudioPositionCache = new Map<string, ChatAudioPositionCacheEntry>();
const chatMediaSourceCache = new Map<string, ChatMediaSourceCacheEntry>();

const isSupportedChatAudioRate = (value: number) =>
  CHAT_AUDIO_PLAYBACK_RATES.some((rate) => rate === value);

const formatChatAudioRateLabel = (value: number) =>
  value === 1 ? "1x" : `${Number.isInteger(value) ? value : value.toFixed(1)}x`;

const getChatAudioDockCopy = (title: string | undefined) => {
  const normalized = title?.trim() || "";
  const match = normalized.match(
    /^(.*?)\s*[-–—]\s*(голосовое сообщение|аудиофайл)$/i
  );
  if (!match) {
    return {
      title: normalized || "Аудио",
      peer: "",
    };
  }
  return {
    title:
      match[2].toLowerCase() === "аудиофайл"
        ? "Аудиофайл"
        : "Голосовое сообщение",
    peer: match[1].trim(),
  };
};

const getChatAudioCacheKey = (threadId: string, mediaObjectId: string) =>
  `${threadId.trim()}:${mediaObjectId.trim()}`;

const parseChatAudioExpiresAt = (value: string | undefined) => {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
};

const getFreshChatAudioSource = (
  threadId: string,
  mediaObjectId: string
): ChatAudioSourceCacheEntry | null => {
  const key = getChatAudioCacheKey(threadId, mediaObjectId);
  const cached = chatAudioSourceCache.get(key);
  if (!cached) return null;
  if (cached.expiresAtMs > Date.now() + CHAT_AUDIO_CACHE_SKEW_MS) {
    return cached;
  }
  chatAudioSourceCache.delete(key);
  return null;
};

const getFreshChatMediaSource = (
  threadId: string,
  mediaObjectId: string
): ChatMediaSourceCacheEntry | null => {
  const key = getChatAudioCacheKey(threadId, mediaObjectId);
  const cached = chatMediaSourceCache.get(key);
  if (!cached) return null;
  if (cached.expiresAtMs > Date.now() + CHAT_AUDIO_CACHE_SKEW_MS) {
    return cached;
  }
  chatMediaSourceCache.delete(key);
  return null;
};

const rememberChatMediaSource = (params: {
  threadId: string;
  mediaObjectId: string;
  downloadUrl: string;
  expiresAt?: string;
}) => {
  const threadId = params.threadId.trim();
  const mediaObjectId = params.mediaObjectId.trim();
  const downloadUrl = params.downloadUrl.trim();
  if (!threadId || !mediaObjectId || !downloadUrl) return;
  const explicitExpiresAtMs = parseChatAudioExpiresAt(params.expiresAt);
  const fallbackExpiresAtMs = Date.now() + CHAT_AUDIO_LEGACY_URL_TTL_MS;
  const expiresAtMs = explicitExpiresAtMs ?? fallbackExpiresAtMs;
  if (expiresAtMs <= Date.now() + CHAT_AUDIO_CACHE_SKEW_MS) return;
  chatMediaSourceCache.set(getChatAudioCacheKey(threadId, mediaObjectId), {
    downloadUrl,
    expiresAtMs,
    urlExpiresAt: params.expiresAt,
  });
};

const isChatMediaUrlExpiring = (value: string | undefined) => {
  const expiresAtMs = parseChatAudioExpiresAt(value);
  return Boolean(
    expiresAtMs && expiresAtMs <= Date.now() + CHAT_AUDIO_CACHE_SKEW_MS
  );
};

const rememberChatAudioSource = (params: {
  threadId: string;
  mediaObjectId: string;
  downloadUrl: string;
  expiresAt?: string;
  ready?: boolean;
  duration?: number;
}) => {
  const threadId = params.threadId.trim();
  const mediaObjectId = params.mediaObjectId.trim();
  const downloadUrl = params.downloadUrl.trim();
  if (!threadId || !mediaObjectId || !downloadUrl) return;
  const explicitExpiresAtMs = parseChatAudioExpiresAt(params.expiresAt);
  const fallbackExpiresAtMs = Date.now() + CHAT_AUDIO_LEGACY_URL_TTL_MS;
  const expiresAtMs = explicitExpiresAtMs ?? fallbackExpiresAtMs;
  if (expiresAtMs <= Date.now() + CHAT_AUDIO_CACHE_SKEW_MS) return;
  const key = getChatAudioCacheKey(threadId, mediaObjectId);
  const previous = chatAudioSourceCache.get(key);
  chatAudioSourceCache.set(key, {
    downloadUrl,
    expiresAtMs,
    urlExpiresAt: params.expiresAt,
    ready: Boolean(params.ready ?? previous?.ready),
    duration:
      typeof params.duration === "number" && Number.isFinite(params.duration)
        ? Math.max(0, params.duration)
        : previous?.duration,
    cachedAtMs: Date.now(),
  });
};

const rememberChatAudioPlayback = (
  threadId: string | null,
  state: AudioMessagePlaybackState
) => {
  if (!threadId) return;
  const audioId = state.id.trim();
  if (!audioId) return;
  const key = getChatAudioCacheKey(threadId, audioId);
  if (state.ended) {
    chatAudioPositionCache.delete(key);
  } else {
    const currentTime =
      Number.isFinite(state.currentTime) && state.currentTime > 0
        ? state.currentTime
        : 0;
    chatAudioPositionCache.set(key, {
      currentTime,
      duration:
        Number.isFinite(state.duration) && state.duration > 0
          ? state.duration
          : undefined,
      updatedAtMs: Date.now(),
    });
  }
  if (state.src.trim()) {
    rememberChatAudioSource({
      threadId,
      mediaObjectId: audioId,
      downloadUrl: state.src,
      ready: state.isPlaying || state.duration > 0,
      duration: state.duration,
    });
  }
};

const getCachedChatAudioPosition = (
  threadId: string,
  mediaObjectId: string
) => {
  const cached = chatAudioPositionCache.get(
    getChatAudioCacheKey(threadId, mediaObjectId)
  );
  if (!cached) return 0;
  return Number.isFinite(cached.currentTime) && cached.currentTime > 0
    ? cached.currentTime
    : 0;
};

const isCachedChatAudioReady = (threadId: string, mediaObjectId: string) =>
  Boolean(getFreshChatAudioSource(threadId, mediaObjectId)?.ready);

const mergeChatAudioCacheIntoMessages = (
  threadId: string,
  messages: TeacherChatMessage[]
) =>
  messages.map((message) => {
    let nextVoice = message.voice;
    if (nextVoice) {
      const voiceMediaObjectId = nextVoice.mediaObjectId || nextVoice.id;
      const cached = getFreshChatAudioSource(threadId, voiceMediaObjectId);
      if (cached) {
        nextVoice = {
          ...nextVoice,
          url: cached.downloadUrl,
          urlExpiresAt: cached.urlExpiresAt ?? nextVoice.urlExpiresAt,
        };
      } else {
        rememberChatAudioSource({
          threadId,
          mediaObjectId: voiceMediaObjectId,
          downloadUrl: nextVoice.url,
          expiresAt: nextVoice.urlExpiresAt,
        });
      }
    }

    const nextAttachments = (message.attachments ?? []).map((attachment) => {
      if (!attachment.mimeType.toLowerCase().startsWith("audio/")) {
        return attachment;
      }
      const mediaObjectId = attachment.mediaObjectId || attachment.id;
      const cached = getFreshChatAudioSource(threadId, mediaObjectId);
      if (cached) {
        return {
          ...attachment,
          url: cached.downloadUrl,
          urlExpiresAt: cached.urlExpiresAt ?? attachment.urlExpiresAt,
        };
      }
      rememberChatAudioSource({
        threadId,
        mediaObjectId,
        downloadUrl: attachment.url,
        expiresAt: attachment.urlExpiresAt,
      });
      return attachment;
    });

    return {
      ...message,
      attachments: nextAttachments,
      voice: nextVoice,
    };
  });

const collectCachedChatAudioPositions = (
  threadId: string,
  messages: TeacherChatMessage[]
) => {
  const positions: Record<string, number> = {};
  messages.forEach((message) => {
    if (message.voice) {
      const audioId = message.voice.mediaObjectId || message.voice.id;
      const cachedTime = getCachedChatAudioPosition(threadId, audioId);
      if (cachedTime > 0) positions[audioId] = cachedTime;
    }
    (message.attachments ?? []).forEach((attachment) => {
      if (!attachment.mimeType.toLowerCase().startsWith("audio/")) return;
      const audioId = attachment.mediaObjectId || attachment.id;
      const cachedTime = getCachedChatAudioPosition(threadId, audioId);
      if (cachedTime > 0) positions[audioId] = cachedTime;
    });
  });
  return positions;
};

const sortChatMessages = (messages: TeacherChatMessage[]) =>
  [...messages].sort((left, right) => {
    const leftTs = Date.parse(left.createdAt);
    const rightTs = Date.parse(right.createdAt);
    const leftSafeTs = Number.isFinite(leftTs) ? leftTs : 0;
    const rightSafeTs = Number.isFinite(rightTs) ? rightTs : 0;
    if (leftSafeTs !== rightSafeTs) return leftSafeTs - rightSafeTs;
    return left.id.localeCompare(right.id);
  });

const mergeChatMessage = (
  messages: TeacherChatMessage[],
  nextMessage: TeacherChatMessage
) => {
  const next = normalizeChatMessage(nextMessage);
  const nextClientMessageId = next.clientMessageId?.trim() ?? "";
  const index = messages.findIndex((message) => {
    if (message.id === next.id) return true;
    if (!nextClientMessageId) return false;
    return message.clientMessageId?.trim() === nextClientMessageId;
  });
  if (index < 0) {
    return sortChatMessages([...messages, next]);
  }
  const updated = [...messages];
  updated[index] = next;
  return sortChatMessages(updated);
};

const releaseComposerVoicePreview = (
  voice: ComposerVoiceDraft | null | undefined
) => {
  const localPreviewUrl = voice?.localPreviewUrl?.trim();
  if (!localPreviewUrl || typeof URL === "undefined") return;
  URL.revokeObjectURL(localPreviewUrl);
};

const isReadyComposerVoice = (
  voice: ComposerVoiceDraft | null | undefined
): voice is ComposerVoiceDraft => {
  if (!isValidChatVoiceMessage(voice)) return false;
  if (voice.uploadStatus === "uploading" || voice.uploadStatus === "failed") {
    return false;
  }
  const mediaObjectId = voice.mediaObjectId?.trim() || voice.id.trim();
  return mediaObjectId.startsWith("media_");
};

const readStoredChatAudioRate = (threadId: string) => {
  try {
    const stored = window.localStorage.getItem(
      `${CHAT_AUDIO_RATE_STORAGE_PREFIX}${threadId}`
    );
    const parsed = Number(stored);
    return isSupportedChatAudioRate(parsed) ? parsed : 1;
  } catch {
    return 1;
  }
};

export default function ChatPage() {
  usePerfScreenTag("ChatPage");
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
  const [composerVoice, setComposerVoice] = useState<ComposerVoiceDraft | null>(
    null
  );
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
  const [mediaPreview, setMediaPreview] = useState<ChatMediaPreviewState | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeAudio, setActiveAudio] =
    useState<AudioMessagePlaybackState | null>(null);
  const [audioPlaybackCommand, setAudioPlaybackCommand] =
    useState<AudioMessagePlaybackCommand | null>(null);
  const [audioPlaybackPositionById, setAudioPlaybackPositionById] =
    useState<Record<string, number>>({});
  const [audioPlaybackRateByThreadId, setAudioPlaybackRateByThreadId] =
    useState<Record<string, number>>({});
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  const isTeacher = user?.role === "teacher";
  const pathname = location.pathname.toLowerCase();
  const isTeacherView =
    pathname.startsWith("/teacher/") ||
    (!pathname.startsWith("/student/") && Boolean(isTeacher));
  const endOfMessagesRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLElement | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const activeAudioDockTrackRef = useRef<HTMLDivElement | null>(null);
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
  const recorderSecondsRef = useRef(0);
  const activeAudioDockSeekingRef = useRef(false);
  const audioRecoveryThrottleRef = useRef<number | null>(null);
  const threadRefreshThrottleRef = useRef<number | null>(null);
  const lastRealtimeEventVersionRef = useRef(0);
  const messagesRef = useRef<TeacherChatMessage[]>([]);
  const composerVoiceRef = useRef<ComposerVoiceDraft | null>(null);
  const composerVoiceUploadGenerationRef = useRef(0);
  const listenedVoicePendingRef = useRef(new Set<string>());
  const notificationAudioContextRef = useRef<AudioContext | null>(null);
  const lastNotificationSoundAtRef = useRef(0);
  const fullscreenPreferenceRef = useRef(false);
  const fileDialogFullscreenRestoreRef = useRef(false);

  const getNotificationAudioContext = useCallback(() => {
    if (typeof window === "undefined") return null;
    const audioWindow = window as ChatNotificationWindow;
    const AudioContextClass =
      audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextClass) return null;
    const current = notificationAudioContextRef.current;
    if (current && current.state !== "closed") return current;
    const next = new AudioContextClass();
    notificationAudioContextRef.current = next;
    return next;
  }, []);

  const playIncomingMessageNotification = useCallback(() => {
    if (typeof window === "undefined") return;
    const now = window.performance.now();
    if (
      now - lastNotificationSoundAtRef.current <
      CHAT_NOTIFICATION_SOUND_MIN_INTERVAL_MS
    ) {
      return;
    }
    lastNotificationSoundAtRef.current = now;
    const context = getNotificationAudioContext();
    if (!context || context.state === "closed") return;

    const playTone = () => {
      if (context.state === "closed") return;
      const startAt = context.currentTime;
      const endAt = startAt + 0.28;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.035, startAt + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
      gain.connect(context.destination);

      const firstTone = context.createOscillator();
      firstTone.type = "sine";
      firstTone.frequency.setValueAtTime(660, startAt);
      firstTone.frequency.exponentialRampToValueAtTime(880, startAt + 0.12);
      firstTone.connect(gain);
      firstTone.start(startAt);
      firstTone.stop(startAt + 0.18);

      const secondTone = context.createOscillator();
      secondTone.type = "sine";
      secondTone.frequency.setValueAtTime(1046.5, startAt + 0.08);
      secondTone.frequency.exponentialRampToValueAtTime(987.8, endAt);
      secondTone.connect(gain);
      secondTone.start(startAt + 0.08);
      secondTone.stop(endAt);
      secondTone.addEventListener(
        "ended",
        () => {
          firstTone.disconnect();
          secondTone.disconnect();
          gain.disconnect();
        },
        { once: true }
      );
    };

    if (context.state === "suspended") {
      void context.resume().then(playTone).catch(() => undefined);
      return;
    }
    playTone();
  }, [getNotificationAudioContext]);

  const goBack = useCallback(() => {
    if (!showBackButton) return;
    navigate(backFrom);
  }, [backFrom, navigate, showBackButton]);

  const requestNativeChatFullscreen = useCallback(async () => {
    const shell = shellRef.current;
    if (!shell || document.fullscreenElement === shell) return;
    try {
      await shell.requestFullscreen();
    } catch {
      // Keep the CSS fullscreen fallback active when the browser blocks native fullscreen.
    }
  }, []);

  const restorePreferredFullscreen = useCallback(() => {
    if (!fullscreenPreferenceRef.current) return;
    setIsFullscreen(true);
    void requestNativeChatFullscreen();
  }, [requestNativeChatFullscreen]);

  const handleToggleFullscreen = useCallback(() => {
    const shell = shellRef.current;
    if (isFullscreen) {
      fullscreenPreferenceRef.current = false;
      setIsFullscreen(false);
      if (shell && document.fullscreenElement === shell) {
        void document.exitFullscreen().catch(() => undefined);
      }
      return;
    }

    fullscreenPreferenceRef.current = true;
    setIsFullscreen(true);
    void requestNativeChatFullscreen();
  }, [isFullscreen, requestNativeChatFullscreen]);

  const handleAttachButtonClick = useCallback(() => {
    if (isFullscreen) {
      fileDialogFullscreenRestoreRef.current = true;
      const restoreAfterFileDialogFocus = () => {
        if (!fileDialogFullscreenRestoreRef.current) return;
        fileDialogFullscreenRestoreRef.current = false;
        window.setTimeout(restorePreferredFullscreen, 80);
      };
      window.setTimeout(() => {
        window.addEventListener("focus", restoreAfterFileDialogFocus, { once: true });
      }, 0);
    }
    fileInputRef.current?.click();
  }, [isFullscreen, restorePreferredFullscreen]);

  const closeMessageMenu = useCallback(() => {
    setMessageMenu({
      open: false,
      message: null,
      x: 0,
      y: 0,
    });
  }, []);

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
        const normalizedMessages = mergeChatAudioCacheIntoMessages(
          threadId,
          nextMessages.map(normalizeChatMessage)
        );
        setMessages(normalizedMessages);
        const cachedPositions = collectCachedChatAudioPositions(
          threadId,
          normalizedMessages
        );
        if (Object.keys(cachedPositions).length > 0) {
          setAudioPlaybackPositionById((current) => ({
            ...cachedPositions,
            ...current,
          }));
        }
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

  const handleAudioPlaybackError = useCallback(() => {
    if (!selectedThreadId || audioRecoveryThrottleRef.current !== null) return;
    audioRecoveryThrottleRef.current = window.setTimeout(() => {
      audioRecoveryThrottleRef.current = null;
      void loadMessages(selectedThreadId, { silent: true }).catch(() => undefined);
    }, 450);
  }, [loadMessages, selectedThreadId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    composerVoiceRef.current = composerVoice;
  }, [composerVoice]);

  const resolveAudioPlaybackSource = useCallback(
    async (
      audioId: string,
      options?: { forceRefresh?: boolean }
    ): Promise<string | null> => {
      const normalizedAudioId = audioId.trim();
      if (!selectedThreadId || !normalizedAudioId) return null;
      const cachedSource = options?.forceRefresh
        ? null
        : getFreshChatAudioSource(selectedThreadId, normalizedAudioId);
      if (cachedSource) {
        return cachedSource.downloadUrl;
      }

      const sourceMessage = messagesRef.current.find((message) => {
        const voiceId = message.voice
          ? message.voice.mediaObjectId || message.voice.id
          : "";
        if (voiceId === normalizedAudioId) return true;
        return (message.attachments ?? []).some(
          (attachment) =>
            (attachment.mediaObjectId || attachment.id) === normalizedAudioId
        );
      });
      if (sourceMessage) {
        try {
          const access = await getTeacherChatMessageMediaAccess({
            threadId: selectedThreadId,
            messageId: sourceMessage.id,
            mediaObjectId: normalizedAudioId,
          });
          rememberChatAudioSource({
            threadId: selectedThreadId,
            mediaObjectId: normalizedAudioId,
            downloadUrl: access.downloadUrl,
            expiresAt: access.expiresAt,
          });
          setMessages((current) =>
            current.map((message) => {
              if (message.id !== sourceMessage.id) return message;
              return {
                ...message,
                voice:
                  message.voice &&
                  (message.voice.mediaObjectId || message.voice.id) ===
                    normalizedAudioId
                    ? {
                        ...message.voice,
                        url: access.downloadUrl,
                        urlExpiresAt: access.expiresAt,
                      }
                    : message.voice,
                attachments: (message.attachments ?? []).map((attachment) =>
                  (attachment.mediaObjectId || attachment.id) === normalizedAudioId
                    ? {
                        ...attachment,
                        url: access.downloadUrl,
                        urlExpiresAt: access.expiresAt,
                      }
                    : attachment
                ),
              };
            })
          );
          return access.downloadUrl;
        } catch {
          // Fallback below reloads the current timeline in case the message changed.
        }
      }

      try {
        const nextMessages = await getTeacherChatMessages(selectedThreadId);
        const normalizedMessages = mergeChatAudioCacheIntoMessages(
          selectedThreadId,
          nextMessages.map(normalizeChatMessage)
        );
        setMessages(normalizedMessages);

        for (const message of normalizedMessages) {
          const voiceId = message.voice
            ? message.voice.mediaObjectId || message.voice.id
            : "";
          if (voiceId === normalizedAudioId && message.voice?.url) {
            rememberChatAudioSource({
              threadId: selectedThreadId,
              mediaObjectId: normalizedAudioId,
              downloadUrl: message.voice.url,
              expiresAt: message.voice.urlExpiresAt,
            });
            return message.voice.url;
          }

          const matchingAttachment = (message.attachments ?? []).find(
            (attachment) =>
              (attachment.mediaObjectId || attachment.id) === normalizedAudioId
          );
          if (matchingAttachment?.url) {
            rememberChatAudioSource({
              threadId: selectedThreadId,
              mediaObjectId: normalizedAudioId,
              downloadUrl: matchingAttachment.url,
              expiresAt: matchingAttachment.urlExpiresAt,
            });
            return matchingAttachment.url;
          }
        }
      } catch {
        return null;
      }

      return null;
    },
    [selectedThreadId]
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

  const scheduleThreadRefresh = useCallback(() => {
    if (threadRefreshThrottleRef.current !== null) return;
    threadRefreshThrottleRef.current = window.setTimeout(() => {
      threadRefreshThrottleRef.current = null;
      void loadThreads({ keepSpinner: true }).catch(() => undefined);
    }, 180);
  }, [loadThreads]);

  useEffect(() => {
    const syncNativeFullscreenState = () => {
      const shell = shellRef.current;
      if (shell && document.fullscreenElement === shell) {
        setIsFullscreen(true);
        return;
      }

      if (document.fullscreenElement && document.fullscreenElement !== shell) {
        fullscreenPreferenceRef.current = false;
        setIsFullscreen(false);
        return;
      }

      if (!fullscreenPreferenceRef.current) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener("fullscreenchange", syncNativeFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", syncNativeFullscreenState);
    };
  }, []);

  useEffect(() => {
    if (!isFullscreen) return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleFullscreenKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        fullscreenPreferenceRef.current = false;
        setIsFullscreen(false);
        const shell = shellRef.current;
        if (shell && document.fullscreenElement === shell) {
          void document.exitFullscreen().catch(() => undefined);
        }
      }
    };
    document.addEventListener("keydown", handleFullscreenKeyDown);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.removeEventListener("keydown", handleFullscreenKeyDown);
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const unlockNotificationAudio = () => {
      const context = getNotificationAudioContext();
      if (context?.state === "suspended") {
        void context.resume().catch(() => undefined);
      }
    };
    window.addEventListener("pointerdown", unlockNotificationAudio, {
      capture: true,
      once: true,
      passive: true,
    });
    window.addEventListener("keydown", unlockNotificationAudio, {
      capture: true,
      once: true,
    });
    return () => {
      window.removeEventListener("pointerdown", unlockNotificationAudio, true);
      window.removeEventListener("keydown", unlockNotificationAudio, true);
    };
  }, [getNotificationAudioContext]);

  useEffect(() => {
    return () => {
      const context = notificationAudioContextRef.current;
      notificationAudioContextRef.current = null;
      if (context && context.state !== "closed") {
        void context.close().catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (markReadThrottleRef.current !== null) {
        window.clearTimeout(markReadThrottleRef.current);
        markReadThrottleRef.current = null;
      }
      if (threadRefreshThrottleRef.current !== null) {
        window.clearTimeout(threadRefreshThrottleRef.current);
        threadRefreshThrottleRef.current = null;
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
    if (!selectedThreadId || !user) return;
    const resetRealtimeState = window.setTimeout(() => {
      setRealtimeConnected(false);
    }, 0);
    const unsubscribe = subscribeTeacherChatEvents({
      threadId: null,
      lastEventId: lastRealtimeEventVersionRef.current,
      onOpen: () => setRealtimeConnected(true),
      onError: () => setRealtimeConnected(false),
      onEvent: (event) => {
        if (event.type === "connected" || event.type === "ping") {
          setRealtimeConnected(true);
          return;
        }
        if (event.version > lastRealtimeEventVersionRef.current) {
          lastRealtimeEventVersionRef.current = event.version;
        }
        const eventThreadId = event.threadId ?? event.message?.threadId;
        if (eventThreadId && eventThreadId !== selectedThreadId) {
          if (
            event.type === "message.created" &&
            event.message &&
            event.message.senderId !== user.id
          ) {
            playIncomingMessageNotification();
          }
          scheduleThreadRefresh();
          return;
        }

        if (event.type === "thread.cleared") {
          setMessages([]);
          setActiveAudio(null);
          scheduleThreadRefresh();
          return;
        }

        const realtimeMessage = event.message;
        if (realtimeMessage) {
          const [cachedRealtimeMessage] = mergeChatAudioCacheIntoMessages(
            selectedThreadId,
            [normalizeChatMessage(realtimeMessage)]
          );
          if (cachedRealtimeMessage) {
            setMessages((current) =>
              mergeChatMessage(current, cachedRealtimeMessage)
            );
          }
          scheduleThreadRefresh();
          return;
        }

        if (event.type === "message.deleted" && event.messageId) {
          setMessages((current) =>
            current.filter((message) => message.id !== event.messageId)
          );
          scheduleThreadRefresh();
        }
      },
    });
    return () => {
      window.clearTimeout(resetRealtimeState);
      unsubscribe();
    };
  }, [
    playIncomingMessageNotification,
    scheduleThreadRefresh,
    selectedThreadId,
    user,
  ]);

  useEffect(() => {
    if (!selectedThreadId) return;
    const pollId = window.setInterval(() => {
      void loadMessages(selectedThreadId, { silent: true });
      void loadThreads({ keepSpinner: true });
    }, realtimeConnected ? 45_000 : 8_000);
    return () => {
      window.clearInterval(pollId);
    };
  }, [loadMessages, loadThreads, realtimeConnected, selectedThreadId]);

  useEffect(() => {
    if (previousThreadIdRef.current !== selectedThreadId) {
      previousThreadIdRef.current = selectedThreadId;
      shouldStickToBottomRef.current = true;
      lastMessageIdRef.current = null;
      setVisibleCount(60);
      listenedVoicePendingRef.current.clear();
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
    const viewport = messagesViewportRef.current;
    if (!viewport) {
      restoreScrollRef.current = null;
      return;
    }
    if (previousHeight === null) {
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

  useEffect(() => {
    logCollectionPressure({
      screen: "ChatPage",
      metric: "chat-thread-message-collections",
      size: threads.length + messages.length,
      warnAt: 220,
      errorAt: 440,
      details: {
        threads: threads.length,
        messages: messages.length,
      },
    });
  }, [messages.length, threads.length]);

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
  const selectedThreadAudioRate = selectedThreadId
    ? audioPlaybackRateByThreadId[selectedThreadId] ?? 1
    : 1;
  const hasComposerVoice = Boolean(composerVoice);
  const activeAudioDock = activeAudio?.ended ? null : activeAudio;
  const activeAudioProgressRatio =
    activeAudioDock && activeAudioDock.duration > 0
      ? Math.min(
          1,
          Math.max(0, activeAudioDock.currentTime / activeAudioDock.duration)
        )
      : 0;
  const activeAudioDockWaveform = activeAudioDock?.waveform;
  const activeAudioDockCopy = useMemo(
    () => getChatAudioDockCopy(activeAudioDock?.title),
    [activeAudioDock?.title]
  );
  const activeAudioDockWaveBars = useMemo(
    () => buildAudioMessageWaveformBars(activeAudioDockWaveform, 64),
    [activeAudioDockWaveform]
  );
  const activeAudioDockActiveBars =
    activeAudioDock && activeAudioDock.duration > 0
      ? activeAudioDock.isPlaying
        ? Math.max(
            1,
            Math.round(activeAudioProgressRatio * activeAudioDockWaveBars.length)
          )
        : Math.max(
            0,
            Math.round(activeAudioProgressRatio * activeAudioDockWaveBars.length)
          )
      : 0;

  const handleAudioPlaybackStateChange = useCallback(
    (state: AudioMessagePlaybackState) => {
      rememberChatAudioPlayback(selectedThreadId, state);
      setAudioPlaybackPositionById((current) => {
        if (state.ended) {
          if (!Object.prototype.hasOwnProperty.call(current, state.id)) {
            return current;
          }
          const next = { ...current };
          delete next[state.id];
          return next;
        }
        const nextTime =
          Number.isFinite(state.currentTime) && state.currentTime > 0
            ? state.currentTime
            : 0;
        if (Math.abs((current[state.id] ?? 0) - nextTime) < 0.05) {
          return current;
        }
        return {
          ...current,
          [state.id]: nextTime,
        };
      });
      setActiveAudio((current) => {
        if (state.ended) {
          return current?.id === state.id ? null : current;
        }
        if (state.isPlaying) {
          return state;
        }
        if (current?.id !== state.id) {
          return current;
        }
        return {
          ...current,
          ...state,
        };
      });
    },
    [selectedThreadId]
  );

  const handleToggleActiveAudioDock = useCallback(() => {
    if (!activeAudioDock) return;
    setAudioPlaybackCommand({
      id: activeAudioDock.id,
      action: "toggle",
      token: window.performance.now(),
    });
  }, [activeAudioDock]);

  const handleDismissActiveAudioDock = useCallback(() => {
    if (!activeAudioDock) return;
    if (activeAudioDock.isPlaying) {
      setAudioPlaybackCommand({
        id: activeAudioDock.id,
        action: "toggle",
        token: window.performance.now(),
      });
    }
    setActiveAudio(null);
  }, [activeAudioDock]);

  const handleSeekActiveAudioDock = useCallback((nextTime: number) => {
    if (!activeAudioDock || activeAudioDock.duration <= 0) return;
    const safeTime = Math.min(
      activeAudioDock.duration,
      Math.max(0, Number.isFinite(nextTime) ? nextTime : 0)
    );
    setAudioPlaybackPositionById((current) => ({
      ...current,
      [activeAudioDock.id]: safeTime,
    }));
    setActiveAudio((current) => {
      if (current?.id !== activeAudioDock.id) return current;
      return {
        ...current,
        currentTime: safeTime,
        duration: activeAudioDock.duration,
      };
    });
    setAudioPlaybackCommand({
      id: activeAudioDock.id,
      action: "seek",
      currentTime: safeTime,
      token: window.performance.now(),
    });
  }, [activeAudioDock]);

  const seekActiveAudioDockFromClientX = useCallback(
    (clientX: number) => {
      const node = activeAudioDockTrackRef.current;
      if (!node || !activeAudioDock || activeAudioDock.duration <= 0) return;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      handleSeekActiveAudioDock(activeAudioDock.duration * ratio);
    },
    [activeAudioDock, handleSeekActiveAudioDock]
  );

  const handleActiveAudioDockPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      activeAudioDockSeekingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      seekActiveAudioDockFromClientX(event.clientX);
    },
    [seekActiveAudioDockFromClientX]
  );

  const handleActiveAudioDockPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!activeAudioDockSeekingRef.current) return;
      event.preventDefault();
      seekActiveAudioDockFromClientX(event.clientX);
    },
    [seekActiveAudioDockFromClientX]
  );

  const handleActiveAudioDockPointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      activeAudioDockSeekingRef.current = false;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    []
  );

  const handleActiveAudioDockKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!activeAudioDock || activeAudioDock.duration <= 0) return;
      const seekStepSeconds = event.shiftKey ? 15 : 5;
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        event.preventDefault();
        handleSeekActiveAudioDock(activeAudioDock.currentTime - seekStepSeconds);
      } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        event.preventDefault();
        handleSeekActiveAudioDock(activeAudioDock.currentTime + seekStepSeconds);
      } else if (event.key === "Home") {
        event.preventDefault();
        handleSeekActiveAudioDock(0);
      } else if (event.key === "End") {
        event.preventDefault();
        handleSeekActiveAudioDock(activeAudioDock.duration);
      }
    },
    [activeAudioDock, handleSeekActiveAudioDock]
  );

  const handleSetThreadAudioRate = useCallback(
    (nextRate: number) => {
      if (!selectedThreadId || !isSupportedChatAudioRate(nextRate)) return;
      setAudioPlaybackRateByThreadId((current) => ({
        ...current,
        [selectedThreadId]: nextRate,
      }));
      try {
        window.localStorage.setItem(
          `${CHAT_AUDIO_RATE_STORAGE_PREFIX}${selectedThreadId}`,
          String(nextRate)
        );
      } catch {
        // noop: playback rate still applies for the current session
      }
    },
    [selectedThreadId]
  );

  const handleCycleThreadAudioRate = useCallback(() => {
    const currentIndex = CHAT_AUDIO_PLAYBACK_RATES.findIndex(
      (rate) => rate === selectedThreadAudioRate
    );
    const nextRate =
      CHAT_AUDIO_PLAYBACK_RATES[
        (currentIndex >= 0 ? currentIndex + 1 : 0) %
          CHAT_AUDIO_PLAYBACK_RATES.length
      ];
    handleSetThreadAudioRate(nextRate);
  }, [handleSetThreadAudioRate, selectedThreadAudioRate]);

  useEffect(() => {
    if (!selectedThreadId) return;
    setAudioPlaybackRateByThreadId((current) => {
      if (Object.prototype.hasOwnProperty.call(current, selectedThreadId)) {
        return current;
      }
      return {
        ...current,
        [selectedThreadId]: readStoredChatAudioRate(selectedThreadId),
      };
    });
  }, [selectedThreadId]);

  useEffect(() => {
    setActiveAudio(null);
  }, [selectedThreadId]);

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
      if (message.deletedForAll) return;
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
    node.style.height = `${Math.min(168, Math.max(34, node.scrollHeight))}px`;
  }, []);

  useEffect(() => {
    adjustComposerHeight();
  }, [
    adjustComposerHeight,
    inputValue,
    composerAttachments.length,
    hasComposerVoice,
    editingMessageId,
  ]);

  const resetComposer = useCallback(() => {
    composerVoiceUploadGenerationRef.current += 1;
    setInputValue("");
    setComposerAttachments([]);
    setComposerVoice((current) => {
      releaseComposerVoicePreview(current);
      return null;
    });
    setEditingMessageId(null);
  }, []);

  const clearComposerVoice = useCallback(() => {
    composerVoiceUploadGenerationRef.current += 1;
    setComposerVoice((current) => {
      releaseComposerVoicePreview(current);
      return null;
    });
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
      recorderSecondsRef.current = 0;
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
        const recordedSeconds = recorderSecondsRef.current;
        recorderSecondsRef.current = 0;
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
        const localPreviewUrl = URL.createObjectURL(blob);
        const localVoiceId = `local-voice-${generateId()}`;
        const uploadGeneration = composerVoiceUploadGenerationRef.current + 1;
        composerVoiceUploadGenerationRef.current = uploadGeneration;
        const localVoice: ComposerVoiceDraft = {
          id: localVoiceId,
          mimeType: file.type || "audio/webm",
          size: file.size,
          url: localPreviewUrl,
          localPreviewUrl,
          durationSeconds: recordedSeconds > 0 ? recordedSeconds : undefined,
          listenedByPeer: false,
          uploadStatus: "uploading",
        };
        setComposerVoice((current) => {
          releaseComposerVoicePreview(current);
          return localVoice;
        });
        const markLocalVoiceFailed = (message: string) => {
          if (composerVoiceUploadGenerationRef.current !== uploadGeneration) {
            return;
          }
          setComposerVoice((current) => {
            if (current?.id !== localVoiceId) return current;
            return {
              ...current,
              uploadStatus: "failed",
              uploadError: message,
            };
          });
          setMessagesError(message);
        };
        try {
          const voice = await createVoiceMessageFromFile(file, {
            durationSeconds: recordedSeconds > 0 ? recordedSeconds : undefined,
            listenedByPeer: false,
          });
          if (!voice.url?.trim()) {
            markLocalVoiceFailed(
              "Не удалось подготовить голосовое сообщение. Попробуйте еще раз."
            );
            return;
          }
          setComposerVoice((current) => {
            if (composerVoiceUploadGenerationRef.current !== uploadGeneration) {
              return current;
            }
            if (current?.id !== localVoiceId) return current;
            releaseComposerVoicePreview(current);
            return {
              ...voice,
              uploadStatus: "ready",
            };
          });
        } catch (error) {
          markLocalVoiceFailed(
            error instanceof Error
              ? error.message
              : "Не удалось подготовить голосовое сообщение."
          );
        }
      };

      recorder.start(300);
      recorderTimerRef.current = window.setInterval(() => {
        recorderSecondsRef.current += 1;
        setRecordingSeconds(recorderSecondsRef.current);
      }, 1000);
    } catch (error) {
      setMessagesError(
        error instanceof Error ? error.message : "Не удалось начать запись аудио."
      );
      setIsRecordingAudio(false);
      recorderSecondsRef.current = 0;
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
      if (audioRecoveryThrottleRef.current !== null) {
        window.clearTimeout(audioRecoveryThrottleRef.current);
      }
      recorderSecondsRef.current = 0;
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      if (recorderStreamRef.current) {
        recorderStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      releaseComposerVoicePreview(composerVoiceRef.current);
      composerVoiceRef.current = null;
    };
  }, []);

  const submitComposer = useCallback(
    async () => {
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
      if (composerVoice?.uploadStatus === "uploading") {
        setMessagesError(
          "Голосовое сообщение еще готовится к отправке. Подождите пару секунд."
        );
        return;
      }
      if (composerVoice?.uploadStatus === "failed") {
        setMessagesError(
          composerVoice.uploadError ||
            "Не удалось подготовить голосовое сообщение. Удалите запись и попробуйте еще раз."
        );
        return;
      }
      const safeVoice = isReadyComposerVoice(composerVoice) ? composerVoice : null;
      if (!text && safeAttachments.length === 0 && !safeVoice) return;
      const activeThreadId = selectedThreadId;
      if (user.role === "teacher" && !activeThreadId) {
        setMessagesError("Сначала выберите диалог студента.");
        return;
      }

      shouldStickToBottomRef.current = true;
      setSending(true);
      setMessagesError(null);
      let resultingThreadId = activeThreadId;
      let optimisticMessageIds: string[] = [];
      const restoreDraftText = text;
      const restoreDraftAttachments = safeAttachments;
      const restoreDraftVoice = safeVoice;
      try {
        if (editingMessageId && activeThreadId) {
          const updated = await updateTeacherChatMessage({
            messageId: editingMessageId,
            threadId: activeThreadId,
            text,
            attachments: safeAttachments,
            voice: safeVoice ?? undefined,
          });
          setMessages((current) => mergeChatMessage(current, updated));
        } else {
          const baseThreadId =
            user.role === "teacher" ? activeThreadId ?? undefined : undefined;
          const payloads: Array<{
            clientMessageId: string;
            text: string;
            attachments?: TeacherChatAttachment[];
            voice?: TeacherChatVoiceMessage;
          }> = [];

          safeAttachments.forEach((attachment) => {
            payloads.push({
              clientMessageId: `chat-client-${generateId()}`,
              text: "",
              attachments: [attachment],
            });
          });
          if (safeVoice) {
            payloads.push({
              clientMessageId: `chat-client-${generateId()}`,
              text: "",
              voice: safeVoice,
            });
          }
          if (payloads.length === 0) {
            payloads.push({
              clientMessageId: `chat-client-${generateId()}`,
              text,
            });
          } else {
            const [firstPayload, ...restPayloads] = payloads;
            if (firstPayload) {
              payloads.splice(0, payloads.length, { ...firstPayload, text }, ...restPayloads);
            }
          }

          if (activeThreadId) {
            const senderName =
              `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
              (user.role === "teacher"
                ? selectedThread?.teacherName || "Преподаватель"
                : selectedThread?.studentName || "Студент");
            const senderPhoto =
              user.role === "teacher"
                ? selectedThread?.teacherPhoto
                : selectedThread?.studentPhoto;
            const baseTimestamp = Date.now();
            const optimisticMessages: TeacherChatMessage[] = payloads.map(
              (payload, index) => ({
                id: `optimistic-${generateId()}`,
                threadId: activeThreadId,
                senderId: user.id,
                senderRole: user.role,
                senderName,
                senderPhoto,
                clientMessageId: payload.clientMessageId,
                text: payload.text,
                createdAt: new Date(baseTimestamp + index).toISOString(),
                attachments: payload.attachments ?? [],
                voice: payload.voice,
                readByPeer: false,
              })
            );
            optimisticMessageIds = optimisticMessages.map((item) => item.id);
            setMessages((current) => [...current, ...optimisticMessages]);
            resetComposer();
            closeMessageMenu();
          }

          let createdThreadId: string | null = null;
          for (const payload of payloads) {
            const created = await sendTeacherChatMessage({
              clientMessageId: payload.clientMessageId,
              threadId: baseThreadId,
              text: payload.text,
              attachments: payload.attachments,
              voice: payload.voice,
            });
            if (created?.threadId) {
              createdThreadId = created.threadId;
            }
            if (activeThreadId) {
              setMessages((current) => mergeChatMessage(current, created));
            }
          }
          if (!activeThreadId && createdThreadId) {
            setSelectedThreadId(createdThreadId);
            resultingThreadId = createdThreadId;
          }
        }
        if (!optimisticMessageIds.length) {
          resetComposer();
        }
        void loadThreads({ keepSpinner: true }).catch(() => undefined);
        if (!activeThreadId && resultingThreadId) {
          void loadMessages(resultingThreadId, { silent: true }).catch(() => undefined);
        }
      } catch (error) {
        if (optimisticMessageIds.length > 0) {
          setMessages((current) =>
            current.filter((message) => !optimisticMessageIds.includes(message.id))
          );
          setInputValue(restoreDraftText);
          setComposerAttachments(restoreDraftAttachments);
          setComposerVoice(restoreDraftVoice);
        }
        setMessagesError(
          error instanceof Error ? error.message : "Не удалось отправить сообщение."
        );
      } finally {
        setSending(false);
      }
    },
    [
      composerAttachments,
      composerVoice,
      editingMessageId,
      inputValue,
      isRecordingAudio,
      loadMessages,
      loadThreads,
      closeMessageMenu,
      resetComposer,
      selectedThread,
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
      composerVoiceUploadGenerationRef.current += 1;
      setComposerVoice((current) => {
        releaseComposerVoicePreview(current);
        return message.voice ?? null;
      });
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
  const hasDraftContent =
    inputValue.trim().length > 0 ||
    composerAttachments.length > 0 ||
    Boolean(composerVoice);
  const isComposerVoicePreparing = composerVoice?.uploadStatus === "uploading";
  const isComposerPrimarySendMode = hasDraftContent && !isRecordingAudio;
  const isComposerPrimaryDisabled = isRecordingAudio
    ? sending
    : isComposerPrimarySendMode
      ? sending || isComposerVoicePreparing
      : sending;
  const composerPrimaryActionLabel = isRecordingAudio
    ? "Остановить запись аудио"
    : isComposerPrimarySendMode
      ? "Отправить сообщение"
      : "Записать аудиосообщение";
  const previewCurrentMedia = mediaPreview
    ? mediaPreview.items[mediaPreview.index]
    : null;

  const openMediaPreview = useCallback(
    (
      attachments: TeacherChatAttachment[],
      attachmentId?: string,
      options?: { includeFiles?: boolean; threadId?: string; messageId?: string }
    ) => {
      const accessThreadId = options?.threadId?.trim() || selectedThreadId || "";
      const accessMessageId = options?.messageId?.trim() || "";
      const previewItems = attachments.reduce<ChatMediaPreviewItem[]>(
        (acc, attachment, index) => {
          const url = (attachment.url ?? "").trim();
          if (!url) return acc;
          const kind = getAttachmentKind(attachment.mimeType);
          if (kind !== "image" && kind !== "video" && kind !== "file") return acc;
          if (kind === "file" && !options?.includeFiles) return acc;
          const mediaObjectId = (attachment.mediaObjectId || attachment.id).trim();
          const cached =
            accessThreadId && mediaObjectId
              ? getFreshChatMediaSource(accessThreadId, mediaObjectId)
              : null;
          const fallbackExtension =
            kind === "video" ? "mp4" : kind === "image" ? "jpg" : "file";
          const normalizedName = attachment.name?.trim() || "";
          acc.push({
            id: attachment.id || `${kind}-${index}`,
            kind,
            url: cached?.downloadUrl ?? url,
            title: normalizedName || "Вложение",
            downloadName: normalizedName || `chat-media-${index + 1}.${fallbackExtension}`,
            mimeType: attachment.mimeType,
            threadId: accessThreadId || undefined,
            messageId: accessMessageId || undefined,
            mediaObjectId: mediaObjectId || undefined,
            urlExpiresAt: cached?.urlExpiresAt ?? attachment.urlExpiresAt,
          });
          return acc;
        },
        []
      );
      if (previewItems.length === 0) return;
      const initialIndex = attachmentId
        ? previewItems.findIndex((item) => item.id === attachmentId)
        : 0;
      setMediaPreview({
        items: previewItems,
        index: initialIndex >= 0 ? initialIndex : 0,
      });
    },
    [selectedThreadId]
  );

  const shiftMediaPreview = useCallback((direction: 1 | -1) => {
    setMediaPreview((current) => {
      if (!current || current.items.length <= 1) return current;
      const nextIndex =
        (current.index + direction + current.items.length) % current.items.length;
      return {
        ...current,
        index: nextIndex,
      };
    });
  }, []);

  const refreshPreviewMediaItem = useCallback(
    async (
      item: ChatMediaPreviewItem,
      options?: { forceRefresh?: boolean }
    ): Promise<string | null> => {
      const threadId = item.threadId?.trim() || selectedThreadId || "";
      const messageId = item.messageId?.trim() || "";
      const mediaObjectId = item.mediaObjectId?.trim() || "";
      if (!threadId || !messageId || !mediaObjectId) return null;

      const cached = options?.forceRefresh
        ? null
        : getFreshChatMediaSource(threadId, mediaObjectId);
      if (cached) {
        setMediaPreview((current) => {
          if (!current) return current;
          return {
            ...current,
            items: current.items.map((previewItem) =>
              previewItem.mediaObjectId === mediaObjectId &&
              previewItem.messageId === messageId
                ? {
                    ...previewItem,
                    url: cached.downloadUrl,
                    urlExpiresAt: cached.urlExpiresAt ?? previewItem.urlExpiresAt,
                    loading: false,
                    error: false,
                  }
                : previewItem
            ),
          };
        });
        return cached.downloadUrl;
      }

      setMediaPreview((current) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items.map((previewItem) =>
            previewItem.mediaObjectId === mediaObjectId &&
            previewItem.messageId === messageId
              ? { ...previewItem, loading: true, error: false }
              : previewItem
          ),
        };
      });

      try {
        const access = await getTeacherChatMessageMediaAccess({
          threadId,
          messageId,
          mediaObjectId,
        });
        rememberChatMediaSource({
          threadId,
          mediaObjectId,
          downloadUrl: access.downloadUrl,
          expiresAt: access.expiresAt,
        });
        setMessages((current) =>
          current.map((message) => {
            if (message.id !== messageId) return message;
            return {
              ...message,
              attachments: (message.attachments ?? []).map((attachment) =>
                (attachment.mediaObjectId || attachment.id) === mediaObjectId
                  ? {
                      ...attachment,
                      url: access.downloadUrl,
                      urlExpiresAt: access.expiresAt,
                    }
                  : attachment
              ),
            };
          })
        );
        setMediaPreview((current) => {
          if (!current) return current;
          return {
            ...current,
            items: current.items.map((previewItem) =>
              previewItem.mediaObjectId === mediaObjectId &&
              previewItem.messageId === messageId
                ? {
                    ...previewItem,
                    url: access.downloadUrl,
                    urlExpiresAt: access.expiresAt,
                    loading: false,
                    error: false,
                  }
                : previewItem
            ),
          };
        });
        return access.downloadUrl;
      } catch {
        setMediaPreview((current) => {
          if (!current) return current;
          return {
            ...current,
            items: current.items.map((previewItem) =>
              previewItem.mediaObjectId === mediaObjectId &&
              previewItem.messageId === messageId
                ? { ...previewItem, loading: false, error: true }
                : previewItem
            ),
          };
        });
        return null;
      }
    },
    [selectedThreadId]
  );

  useEffect(() => {
    if (!previewCurrentMedia || previewCurrentMedia.loading) return;
    if (!isChatMediaUrlExpiring(previewCurrentMedia.urlExpiresAt)) return;
    void refreshPreviewMediaItem(previewCurrentMedia, { forceRefresh: true });
  }, [
    previewCurrentMedia?.id,
    previewCurrentMedia?.messageId,
    previewCurrentMedia?.mediaObjectId,
    previewCurrentMedia?.urlExpiresAt,
    previewCurrentMedia?.loading,
    refreshPreviewMediaItem,
  ]);

  const handleComposerPrimaryAction = useCallback(() => {
    if (sending) return;
    if (isRecordingAudio) {
      stopAudioRecording();
      return;
    }
    if (!hasDraftContent) {
      void startAudioRecording();
      return;
    }
    if (isComposerVoicePreparing) {
      return;
    }
    void submitComposer();
  }, [
    hasDraftContent,
    isComposerVoicePreparing,
    isRecordingAudio,
    sending,
    startAudioRecording,
    stopAudioRecording,
    submitComposer,
  ]);

  const handleVoiceListened = useCallback(
    async (message: TeacherChatMessage) => {
      if (!selectedThreadId || !user?.id) return;
      if (!message.voice || message.voice.listenedByPeer) return;
      if (message.senderId === user.id) return;
      if (listenedVoicePendingRef.current.has(message.id)) return;
      listenedVoicePendingRef.current.add(message.id);
      setMessages((current) =>
        current.map((item) =>
          item.id === message.id && item.voice
            ? {
                ...item,
                voice: {
                  ...item.voice,
                  listenedByPeer: true,
                },
              }
            : item
        )
      );
      try {
        await markTeacherChatVoiceListened({
          messageId: message.id,
          threadId: selectedThreadId,
        });
      } catch {
        setMessages((current) =>
          current.map((item) =>
            item.id === message.id && item.voice
              ? {
                  ...item,
                  voice: {
                    ...item.voice,
                    listenedByPeer: false,
                  },
                }
              : item
          )
        );
      } finally {
        listenedVoicePendingRef.current.delete(message.id);
      }
    },
    [selectedThreadId, user?.id]
  );

  useEffect(() => {
    setMediaPreview(null);
    setActiveAudio(null);
  }, [selectedThreadId]);

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

      <section
        className={`chat-page__shell${isFullscreen ? " is-fullscreen" : ""}`}
        ref={shellRef}
      >
        <div
          className={`chat-page__workspace ${
            isTeacherView ? "chat-page__workspace--with-sidebar" : ""
          }`}
        >
          {isTeacherView ? (
            <aside className="chat-page__sidebar">
              <TextField
                value={threadQuery}
                onChange={(event) => setThreadQuery(event.target.value)}
                placeholder="Поиск студента..."
                size="small"
                fullWidth
              />
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
                        src={isTeacherView ? thread.studentPhoto : thread.teacherPhoto}
                        className="chat-page__thread-avatar"
                      >
                        {isTeacherView ? (
                          <PersonRoundedIcon fontSize="small" />
                        ) : (
                          <SchoolRoundedIcon fontSize="small" />
                        )}
                      </Avatar>
                      <div className="chat-page__thread-copy">
                        <div className="chat-page__thread-line chat-page__thread-line--head">
                          <strong>
                            {isTeacherView
                              ? thread.studentName
                              : thread.teacherName || "Преподаватель"}
                          </strong>
                          <time>{formatThreadDate(thread.lastMessageAt ?? thread.updatedAt)}</time>
                        </div>
                        <div className="chat-page__thread-line chat-page__thread-line--foot">
                          <span>{thread.lastMessageText ?? "Нет сообщений"}</span>
                          {thread.unreadCount > 0 && (
                            <span className="chat-page__thread-unread">{thread.unreadCount}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </aside>
          ) : null}

          <div className="chat-page__main">
          <header className="chat-page__main-head">
            <div className="chat-page__main-title">
              <Avatar
                src={isTeacherView ? selectedThread?.studentPhoto : selectedThread?.teacherPhoto}
                className="chat-page__main-avatar"
              >
                {isTeacherView ? <PersonRoundedIcon /> : <SchoolRoundedIcon />}
              </Avatar>
              <div>
                <div className="chat-page__main-name-row">
                  <h2>
                    {isTeacherView
                      ? selectedThread?.studentName ?? "Выберите диалог"
                      : selectedThread?.teacherName ?? "Чат"}
                  </h2>
                  {isTeacherView && selectedThread?.studentId ? (
                    <IconButton
                      className="chat-page__student-profile-link"
                      onClick={() => navigate(`/teacher/students/${selectedThread.studentId}`)}
                      aria-label="Открыть профиль студента"
                      title="Профиль студента"
                    >
                      <OpenInNewRoundedIcon fontSize="small" />
                    </IconButton>
                  ) : null}
                </div>
                <p>
                  {isTeacherView
                    ? selectedThread?.studentEmail ?? "Сообщения и обратная связь"
                    : "Личные ответы преподавателя в одном окне"}
                </p>
              </div>
            </div>
            {selectedThread ? (
              <div className="chat-page__head-actions">
                <IconButton
                  className="chat-page__fullscreen-button"
                  onClick={() => void handleToggleFullscreen()}
                  aria-label={
                    isFullscreen
                      ? "Выйти из полноэкранного режима"
                      : "Открыть чат в полноэкранном режиме"
                  }
                >
                  {isFullscreen ? (
                    <CloseFullscreenRoundedIcon fontSize="small" />
                  ) : (
                    <OpenInFullRoundedIcon fontSize="small" />
                  )}
                </IconButton>
                {isTeacher ? (
                  <IconButton
                    className="chat-page__clear-button"
                    onClick={() => setClearDialogOpen(true)}
                    aria-label="Очистить чат"
                  >
                    <DeleteSweepRoundedIcon fontSize="small" />
                  </IconButton>
                ) : null}
              </div>
            ) : null}
          </header>

          {threadsError ? (
            <Notice tone="critical" density="compact">
              {threadsError}
            </Notice>
          ) : null}

          {chatUnavailable ? (
            <div className="chat-page__empty-gate">
              <Notice
                tone="warning"
                density="compact"
                title="Чат пока недоступен"
                actions={[
                  {
                    label: "Курсы",
                    onClick: () => navigate("/courses"),
                  },
                  {
                    label: "Занятие",
                    onClick: () => navigate("/booking"),
                    variant: "secondary",
                  },
                ]}
              >
                Чат доступен после покупки курса по премиум тарифу
                или записи на индивидуальное занятие.
              </Notice>
            </div>
          ) : !selectedThread ? (
            <div className="chat-page__state chat-page__state--large">
              {threadsLoading ? <CircularProgress size={30} /> : "Выберите диалог для начала"}
            </div>
          ) : (
            <div
              className={`chat-page__conversation ${
                activeAudioDock ? "chat-page__conversation--with-audio-dock" : ""
              }`}
            >
              {activeAudioDock ? (
                <div
                  className={`chat-page__audio-dock ${
                    activeAudioDock.isPlaying ? "is-playing" : "is-paused"
                  }`}
                  aria-label="Активное аудио"
                >
                  <button
                    type="button"
                    className={`chat-page__audio-dock-toggle ${
                      activeAudioDock.isPlaying ? "is-active" : ""
                    }`}
                    onClick={handleToggleActiveAudioDock}
                    aria-label={activeAudioDock.isPlaying ? "Поставить аудио на паузу" : "Продолжить аудио"}
                  >
                    {activeAudioDock.isPlaying ? (
                      <PauseRoundedIcon fontSize="inherit" />
                    ) : (
                      <PlayArrowRoundedIcon fontSize="inherit" />
                    )}
                  </button>
                  <div className="chat-page__audio-dock-body">
                    <div className="chat-page__audio-dock-copy">
                      <span className="chat-page__audio-dock-title">
                        {activeAudioDockCopy.title}
                      </span>
                      {activeAudioDockCopy.peer ? (
                        <span className="chat-page__audio-dock-peer">
                          {activeAudioDockCopy.peer}
                        </span>
                      ) : null}
                      <span className="chat-page__audio-dock-time">
                        {formatPlaybackTime(activeAudioDock.currentTime)}
                        {activeAudioDock.duration > 0
                          ? ` / ${formatPlaybackTime(activeAudioDock.duration)}`
                          : ""}
                      </span>
                    </div>
                    <div
                      ref={activeAudioDockTrackRef}
                      className="chat-page__audio-dock-track"
                      role="slider"
                      tabIndex={activeAudioDock.duration > 0 ? 0 : -1}
                      aria-label="Перемотать активное аудио"
                      aria-valuemin={0}
                      aria-valuemax={Math.max(0, Math.round(activeAudioDock.duration))}
                      aria-valuenow={Math.max(
                        0,
                        Math.round(activeAudioDock.currentTime)
                      )}
                      aria-valuetext={`${formatPlaybackTime(
                        activeAudioDock.currentTime
                      )} из ${formatPlaybackTime(activeAudioDock.duration)}`}
                      style={
                        {
                          "--audio-dock-progress": `${
                            Math.round(activeAudioProgressRatio * 1000) / 10
                          }%`,
                        } as CSSProperties
                      }
                      onPointerDown={handleActiveAudioDockPointerDown}
                      onPointerMove={handleActiveAudioDockPointerMove}
                      onPointerUp={handleActiveAudioDockPointerUp}
                      onPointerCancel={handleActiveAudioDockPointerUp}
                      onKeyDown={handleActiveAudioDockKeyDown}
                    >
                      <div className="chat-page__audio-dock-wave">
                        {activeAudioDockWaveBars.map((height, index) => (
                          <span
                            key={index}
                            className={
                              index < activeAudioDockActiveBars ? "is-active" : ""
                            }
                            style={{ height: `${height}%` }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="chat-page__audio-dock-actions">
                    <button
                      type="button"
                      className="chat-page__audio-rate-control"
                      onClick={handleCycleThreadAudioRate}
                      aria-label={`Скорость аудио ${formatChatAudioRateLabel(
                        selectedThreadAudioRate
                      )}. Нажмите, чтобы переключить`}
                    >
                      {formatChatAudioRateLabel(selectedThreadAudioRate)}
                    </button>
                    <button
                      type="button"
                      className="chat-page__audio-dock-close"
                      onClick={handleDismissActiveAudioDock}
                      aria-label="Остановить и скрыть аудиоплеер"
                    >
                      <CloseRoundedIcon fontSize="inherit" />
                    </button>
                  </div>
                </div>
              ) : null}
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
                    const attachments = Array.isArray(message.attachments)
                      ? message.attachments
                      : [];
                    const attachmentKinds = attachments.map((attachment) =>
                      getAttachmentKind(attachment.mimeType)
                    );
                    const hasAudioAttachments = attachmentKinds.includes("audio");
                    const hasVisualAttachments = attachmentKinds.some(
                      (kind) => kind === "image" || kind === "video"
                    );
                    const hasNonAudioAttachments = attachmentKinds.some(
                      (kind) => kind !== "audio"
                    );
                    const isAudioOnlyMessage =
                      !message.text &&
                      (Boolean(message.voice) || hasAudioAttachments) &&
                      !hasNonAudioAttachments;
                    const isMediaOnlyMessage =
                      !message.text &&
                      !message.voice &&
                      attachments.length > 0 &&
                      attachmentKinds.every((kind) => kind === "image" || kind === "video");
                    const messageTimestampLabel = formatTime(message.createdAt);
                    const showVoiceInlineMeta = Boolean(message.voice) && isAudioOnlyMessage;
                    let inlineAudioMetaRendered = showVoiceInlineMeta;
                    const currentSenderName =
                      message.senderRole === "teacher"
                        ? selectedThread?.teacherName
                        : selectedThread?.studentName;
                    const displaySenderName =
                      currentSenderName?.trim() ||
                      message.senderName?.trim() ||
                      "Собеседник";
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
                        } ${
                          isMediaOnlyMessage ? "is-media-only" : ""
                        } ${
                          isAudioOnlyMessage ? "is-audio-only" : ""
                        }`}
                        onContextMenu={(event) => {
                          if (!ownMessage) return;
                          event.preventDefault();
                          setMessageMenu({
                            open: true,
                            message,
                            x: event.clientX,
                            y: event.clientY,
                          });
                        }}
                      >
                        {message.text ? <p>{renderChatMessageText(message.text)}</p> : null}

                        {message.voice ? (
                          <div className="chat-page__message-attachments">
                            <div className="chat-page__attachment chat-page__attachment--audio">
                              <AudioMessagePlayer
                                key={message.voice.mediaObjectId || message.voice.id}
                                src={message.voice.url}
                                mediaIdentity={
                                  message.voice.mediaObjectId || message.voice.id
                                }
                                title={`${displaySenderName} - голосовое сообщение`}
                                durationSeconds={message.voice.durationSeconds}
                                waveform={message.voice.waveform}
                                listenedByPeer={message.voice.listenedByPeer}
                                playbackRate={selectedThreadAudioRate}
                                playbackCommand={audioPlaybackCommand}
                                resumeTime={
                                  audioPlaybackPositionById[
                                    message.voice.mediaObjectId || message.voice.id
                                  ] ??
                                  (selectedThreadId
                                    ? getCachedChatAudioPosition(
                                        selectedThreadId,
                                        message.voice.mediaObjectId || message.voice.id
                                      )
                                    : 0)
                                }
                                knownReady={
                                  selectedThreadId
                                    ? isCachedChatAudioReady(
                                        selectedThreadId,
                                        message.voice.mediaObjectId || message.voice.id
                                      )
                                    : false
                                }
                                activeAudioId={activeAudio?.id ?? null}
                                onPlaybackStateChange={
                                  handleAudioPlaybackStateChange
                                }
                                onPlaybackError={handleAudioPlaybackError}
                                onResolvePlaybackSource={resolveAudioPlaybackSource}
                                messageTimestamp={
                                  showVoiceInlineMeta ? messageTimestampLabel : undefined
                                }
                                showEdited={
                                  showVoiceInlineMeta && Boolean(message.editedAt)
                                }
                                showReadState={showVoiceInlineMeta && ownMessage}
                                readByPeer={
                                  showVoiceInlineMeta ? message.readByPeer : undefined
                                }
                                onListened={
                                  ownMessage
                                    ? undefined
                                    : () => {
                                        void handleVoiceListened(message);
                                      }
                                }
                              />
                            </div>
                          </div>
                        ) : null}

                        {attachments.length > 0 ? (
                          <div className="chat-page__message-attachments">
                            {attachments.map((attachment) => {
                              const kind = getAttachmentKind(attachment.mimeType);
                              if (kind === "image" || kind === "video") {
                                return (
                                  <div
                                    key={attachment.id}
                                    className={`chat-page__attachment chat-page__attachment--${kind}`}
                                  >
                                    <button
                                      type="button"
                                      className={`chat-page__attachment-preview chat-page__attachment-preview--${kind}`}
                                      onClick={() =>
                                        openMediaPreview(
                                          message.attachments ?? [],
                                          attachment.id,
                                          {
                                            threadId: message.threadId,
                                            messageId: message.id,
                                          }
                                        )
                                      }
                                      aria-label={
                                        kind === "video"
                                          ? "Открыть превью видео"
                                          : "Открыть превью изображения"
                                      }
                                    >
                                      {kind === "video" ? (
                                        <video
                                          src={attachment.url}
                                          muted
                                          playsInline
                                          preload="metadata"
                                        />
                                      ) : (
                                        <img src={attachment.url} alt={attachment.name} />
                                      )}
                                      <span className="chat-page__attachment-time">
                                        <time>{messageTimestampLabel}</time>
                                        {ownMessage ? (
                                          <span className="chat-page__attachment-read-state">
                                            {message.readByPeer ? (
                                              <DoneAllRoundedIcon fontSize="inherit" />
                                            ) : (
                                              <DoneRoundedIcon fontSize="inherit" />
                                            )}
                                          </span>
                                        ) : null}
                                      </span>
                                    </button>
                                  </div>
                                );
                              }
                              if (kind === "audio") {
                                const showAttachmentInlineMeta =
                                  isAudioOnlyMessage && !inlineAudioMetaRendered;
                                if (showAttachmentInlineMeta) {
                                  inlineAudioMetaRendered = true;
                                }
                                return (
                                  <div
                                    key={attachment.id}
                                    className="chat-page__attachment chat-page__attachment--audio"
                                  >
                                    <AudioMessagePlayer
                                      key={attachment.mediaObjectId || attachment.id}
                                      src={attachment.url}
                                      mediaIdentity={
                                        attachment.mediaObjectId || attachment.id
                                      }
                                      title={`${displaySenderName} - аудиофайл`}
                                      playbackRate={selectedThreadAudioRate}
                                      playbackCommand={audioPlaybackCommand}
                                      resumeTime={
                                        audioPlaybackPositionById[
                                          attachment.mediaObjectId || attachment.id
                                        ] ??
                                        (selectedThreadId
                                          ? getCachedChatAudioPosition(
                                              selectedThreadId,
                                              attachment.mediaObjectId ||
                                                attachment.id
                                            )
                                          : 0)
                                      }
                                      knownReady={
                                        selectedThreadId
                                          ? isCachedChatAudioReady(
                                              selectedThreadId,
                                              attachment.mediaObjectId ||
                                                attachment.id
                                            )
                                          : false
                                      }
                                      activeAudioId={activeAudio?.id ?? null}
                                      onPlaybackStateChange={
                                        handleAudioPlaybackStateChange
                                      }
                                      onPlaybackError={handleAudioPlaybackError}
                                      onResolvePlaybackSource={resolveAudioPlaybackSource}
                                      messageTimestamp={
                                        showAttachmentInlineMeta
                                          ? messageTimestampLabel
                                          : undefined
                                      }
                                      showEdited={
                                        showAttachmentInlineMeta &&
                                        Boolean(message.editedAt)
                                      }
                                      showReadState={
                                        showAttachmentInlineMeta && ownMessage
                                      }
                                      readByPeer={
                                        showAttachmentInlineMeta
                                          ? message.readByPeer
                                          : undefined
                                      }
                                    />
                                  </div>
                                );
                              }
                              return (
                                <div
                                  key={attachment.id}
                                  className="chat-page__attachment chat-page__attachment--file"
                                >
                                  <span className="chat-page__attachment-file-mark">
                                    {getAttachmentExtension(attachment.name)}
                                  </span>
                                  <a
                                    className="chat-page__attachment-file-link"
                                    href={attachment.url}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {truncateFileName(attachment.name, 26)}
                                  </a>
                                  <span className="chat-page__attachment-file-size">
                                    {formatAttachmentSize(attachment.size)}
                                  </span>
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

                        {!isAudioOnlyMessage && !hasVisualAttachments ? (
                          <div className="chat-page__message-foot">
                            {message.editedAt ? (
                              <span className="chat-page__message-edited">изм.</span>
                            ) : null}
                            <time>{messageTimestampLabel}</time>
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
                        ) : null}
                      </article>
                    );
                  })
                )}
                <div ref={endOfMessagesRef} />
              </div>

              {messagesError ? (
                <Notice tone="critical" density="compact">
                  {messagesError}
                </Notice>
              ) : null}

              {composerVoice ? (
                <div
                  className={`chat-page__composer-voice chat-page__composer-voice--${composerVoice.uploadStatus}`}
                >
                  <AudioMessagePlayer
                    key={composerVoice.mediaObjectId || composerVoice.id}
                    src={composerVoice.url}
                    mediaIdentity={composerVoice.mediaObjectId || composerVoice.id}
                    title="Голосовое сообщение"
                    durationSeconds={composerVoice.durationSeconds}
                    waveform={composerVoice.waveform}
                    playbackRate={selectedThreadAudioRate}
                  />
                  <div className="chat-page__composer-voice-actions">
                    {composerVoice.uploadStatus === "uploading" ? (
                      <span className="chat-page__composer-voice-status">
                        Подготовка
                      </span>
                    ) : composerVoice.uploadStatus === "failed" ? (
                      <span className="chat-page__composer-voice-status is-error">
                        Ошибка
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="chat-page__audio-rate-control chat-page__composer-voice-rate"
                      onClick={handleCycleThreadAudioRate}
                      aria-label="Изменить скорость голосового сообщения"
                    >
                      {formatChatAudioRateLabel(selectedThreadAudioRate)}
                    </button>
                    <IconButton
                      size="small"
                      className="chat-page__composer-voice-remove"
                      disableRipple
                      onClick={clearComposerVoice}
                      aria-label="Удалить голосовое сообщение"
                    >
                      <CloseRoundedIcon fontSize="small" />
                    </IconButton>
                  </div>
                </div>
              ) : null}

              {composerAttachments.length > 0 ? (
                <div className="chat-page__composer-attachments">
                  {composerAttachments.map((attachment) => {
                    const kind = getAttachmentKind(attachment.mimeType);
                    const canPreviewAttachment =
                      kind === "image" || kind === "video" || kind === "file";
                    return (
                      <article
                        key={attachment.id}
                        className={`chat-page__composer-attachment chat-page__composer-attachment--${kind}`}
                      >
                        <button
                          type="button"
                          className="chat-page__composer-attachment-preview"
                          disabled={!canPreviewAttachment}
                          onClick={() =>
                            openMediaPreview(composerAttachments, attachment.id, {
                              includeFiles: true,
                            })
                          }
                          aria-label="Открыть превью вложения"
                        >
                          <span
                            className={`chat-page__composer-attachment-thumb chat-page__composer-attachment-thumb--${kind}`}
                          >
                            {kind === "image" ? (
                              <img src={attachment.url} alt={attachment.name} />
                            ) : kind === "video" ? (
                              <video
                                src={attachment.url}
                                muted
                                playsInline
                                preload="metadata"
                              />
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
                            <span>
                              {kind === "file"
                                ? `${getAttachmentExtension(attachment.name)} • ${formatAttachmentSize(
                                    attachment.size
                                  )}`
                                : formatAttachmentSize(attachment.size)}
                            </span>
                          </div>
                        </button>
                        <IconButton
                          size="small"
                          className="chat-page__composer-attachment-remove"
                          disableRipple
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
                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  multiple
                  onChange={async (event) => {
                    try {
                      await handlePickFiles(event.target.files);
                    } finally {
                      event.target.value = "";
                      if (fileDialogFullscreenRestoreRef.current) {
                        fileDialogFullscreenRestoreRef.current = false;
                        window.setTimeout(restorePreferredFullscreen, 80);
                      }
                    }
                  }}
                />
                <div
                  className={`chat-page__composer-field ${
                    isRecordingAudio ? "is-recording" : ""
                  }`}
                >
                  <div className="chat-page__composer-actions chat-page__composer-actions--left">
                    <IconButton
                      type="button"
                      disabled={sending || isRecordingAudio}
                      className="chat-page__attach-button"
                      onClick={handleAttachButtonClick}
                      aria-label="Прикрепить файл"
                    >
                      <AttachFileRoundedIcon fontSize="small" />
                    </IconButton>
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
                  <div className="chat-page__composer-actions chat-page__composer-actions--right">
                    <IconButton
                      type="button"
                      disabled={isComposerPrimaryDisabled}
                      className={`chat-page__send-button chat-page__primary-action-button ${
                        isRecordingAudio
                          ? "is-recording"
                          : isComposerPrimarySendMode
                            ? "is-send-mode"
                            : "is-record-mode"
                      }`}
                      onClick={handleComposerPrimaryAction}
                      aria-label={composerPrimaryActionLabel}
                    >
                      {sending ? (
                        <CircularProgress size={18} color="inherit" />
                      ) : (
                        <span className="chat-page__primary-action-icons" aria-hidden="true">
                          <span className="chat-page__primary-action-icon chat-page__primary-action-icon--mic">
                            <MicRoundedIcon />
                          </span>
                          <span className="chat-page__primary-action-icon chat-page__primary-action-icon--send">
                            <SendRoundedIcon />
                          </span>
                          <span className="chat-page__primary-action-icon chat-page__primary-action-icon--stop">
                            <StopRoundedIcon />
                          </span>
                        </span>
                      )}
                    </IconButton>
                  </div>
                </div>
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
            </div>
          )}
          </div>
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
        disablePortal={isFullscreen}
        container={isFullscreen ? shellRef.current : undefined}
        anchorReference="anchorPosition"
        anchorPosition={
          messageMenu.open
            ? {
                top: messageMenu.y,
                left: messageMenu.x,
              }
            : undefined
        }
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

      <ImmersiveMediaOverlay
        open={Boolean(mediaPreview)}
        onClose={() => setMediaPreview(null)}
        onPrev={
          mediaPreview && mediaPreview.items.length > 1
            ? () => shiftMediaPreview(-1)
            : undefined
        }
        onNext={
          mediaPreview && mediaPreview.items.length > 1
            ? () => shiftMediaPreview(1)
            : undefined
        }
        ariaLabel="Просмотр вложения чата"
        closeLabel="Закрыть просмотр вложения"
        prevLabel="Предыдущее вложение"
        nextLabel="Следующее вложение"
        actions={
          previewCurrentMedia ? (
            <a
              className="chat-page__preview-download"
              href={previewCurrentMedia.url}
              download={previewCurrentMedia.downloadName}
              title={
                previewCurrentMedia.kind === "video"
                  ? "Скачать видео"
                  : previewCurrentMedia.kind === "image"
                    ? "Скачать изображение"
                    : "Скачать файл"
              }
              aria-label={
                previewCurrentMedia.kind === "video"
                  ? "Скачать видео"
                  : previewCurrentMedia.kind === "image"
                    ? "Скачать изображение"
                    : "Скачать файл"
              }
            >
              <DownloadRoundedIcon fontSize="inherit" />
            </a>
          ) : null
        }
      >
        {previewCurrentMedia ? (
          <div
            className={`chat-page__preview-shell chat-page__preview-shell--${previewCurrentMedia.kind}`}
          >
            {previewCurrentMedia.loading ? (
              <div className="chat-page__preview-status" role="status">
                <CircularProgress size={24} thickness={4} />
                <span>Открываем вложение...</span>
              </div>
            ) : null}
            {previewCurrentMedia.error ? (
              <div className="chat-page__preview-status chat-page__preview-status--error">
                <span>Не удалось открыть вложение. Ссылка могла устареть.</span>
                <button
                  type="button"
                  className="chat-page__preview-retry"
                  onClick={() =>
                    void refreshPreviewMediaItem(previewCurrentMedia, {
                      forceRefresh: true,
                    })
                  }
                >
                  <RefreshRoundedIcon fontSize="small" />
                  Обновить
                </button>
              </div>
            ) : previewCurrentMedia.kind === "video" ? (
              <video
                key={previewCurrentMedia.url}
                controls
                playsInline
                preload="metadata"
                src={previewCurrentMedia.url}
                onError={() =>
                  void refreshPreviewMediaItem(previewCurrentMedia, {
                    forceRefresh: true,
                  })
                }
                className="immersive-media-overlay__media chat-page__preview-media"
              />
            ) : previewCurrentMedia.kind === "file" ? (
              <div className="chat-page__preview-file">
                <iframe
                  src={previewCurrentMedia.url}
                  title={previewCurrentMedia.title}
                  className="chat-page__preview-file-frame"
                />
                <a
                  className="chat-page__preview-file-open"
                  href={previewCurrentMedia.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Открыть файл отдельно
                </a>
              </div>
            ) : (
              <img
                key={previewCurrentMedia.url}
                src={previewCurrentMedia.url}
                alt={previewCurrentMedia.title}
                onError={() =>
                  void refreshPreviewMediaItem(previewCurrentMedia, {
                    forceRefresh: true,
                  })
                }
                className="immersive-media-overlay__media chat-page__preview-media"
              />
            )}
          </div>
        ) : (
          <div className="immersive-media-overlay__fallback">
            Не удалось загрузить вложение.
          </div>
        )}
      </ImmersiveMediaOverlay>
    </div>
  );
}
