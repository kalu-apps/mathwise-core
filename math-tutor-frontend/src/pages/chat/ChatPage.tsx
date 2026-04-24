import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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
import VideocamRoundedIcon from "@mui/icons-material/VideocamRounded";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import HeadsetRoundedIcon from "@mui/icons-material/HeadsetRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import DeleteSweepRoundedIcon from "@mui/icons-material/DeleteSweepRounded";
import OpenInFullRoundedIcon from "@mui/icons-material/OpenInFullRounded";
import CloseFullscreenRoundedIcon from "@mui/icons-material/CloseFullscreenRounded";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/features/auth/model/AuthContext";
import {
  clearTeacherChatThread,
  deleteTeacherChatMessage,
  getTeacherChatEligibility,
  getTeacherChatMessages,
  getTeacherChatThreads,
  markTeacherChatVoiceListened,
  markTeacherChatThreadRead,
  sendTeacherChatMessage,
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
import {
  createAttachmentFromFile,
  createVoiceMessageFromFile,
  formatAttachmentSize,
  formatDayLabel,
  formatDuration,
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
} from "@/pages/chat/ui/ChatMediaPlayers";

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
  kind: "image" | "video";
  url: string;
  title: string;
  downloadName: string;
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
  const [composerVoice, setComposerVoice] =
    useState<TeacherChatVoiceMessage | null>(null);
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

  const isTeacher = user?.role === "teacher";
  const endOfMessagesRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLElement | null>(null);
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
  const recorderSecondsRef = useRef(0);
  const listenedVoicePendingRef = useRef(new Set<string>());
  const messageMenuCloseTimerRef = useRef<number | null>(null);

  const goBack = useCallback(() => {
    if (!showBackButton) return;
    navigate(backFrom);
  }, [backFrom, navigate, showBackButton]);

  const handleToggleFullscreen = useCallback(async () => {
    const shell = shellRef.current;
    if (!shell) return;
    try {
      if (document.fullscreenElement === shell) {
        await document.exitFullscreen();
        return;
      }
      await shell.requestFullscreen();
    } catch {
      // noop: browser can block fullscreen if action was interrupted
    }
  }, []);

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
    const syncFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === shellRef.current);
    };
    syncFullscreenState();
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
    };
  }, []);

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
    Boolean(composerVoice),
    editingMessageId,
  ]);

  const resetComposer = useCallback(() => {
    setInputValue("");
    setComposerAttachments([]);
    setComposerVoice(null);
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
        try {
          const voice = await createVoiceMessageFromFile(file, {
            durationSeconds: recordedSeconds > 0 ? recordedSeconds : undefined,
            listenedByPeer: false,
          });
          if (!voice.url?.trim()) {
            setMessagesError(
              "Не удалось подготовить голосовое сообщение. Попробуйте еще раз."
            );
            return;
          }
          setComposerVoice(voice);
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
      recorderSecondsRef.current = 0;
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
      const safeVoice = isValidChatVoiceMessage(composerVoice)
        ? composerVoice
        : null;
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
          await updateTeacherChatMessage({
            messageId: editingMessageId,
            threadId: activeThreadId,
            text,
            attachments: safeAttachments,
            voice: safeVoice ?? undefined,
          });
        } else {
          const baseThreadId =
            user.role === "teacher" ? activeThreadId ?? undefined : undefined;
          const payloads: Array<{
            text: string;
            attachments?: TeacherChatAttachment[];
            voice?: TeacherChatVoiceMessage;
          }> = [];

          safeAttachments.forEach((attachment) => {
            payloads.push({
              text: "",
              attachments: [attachment],
            });
          });
          if (safeVoice) {
            payloads.push({
              text: "",
              voice: safeVoice,
            });
          }
          if (payloads.length === 0) {
            payloads.push({ text });
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
              threadId: baseThreadId,
              text: payload.text,
              attachments: payload.attachments,
              voice: payload.voice,
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
        if (!optimisticMessageIds.length) {
          resetComposer();
        }
        void loadThreads({ keepSpinner: true }).catch(() => undefined);
        if (resultingThreadId) {
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
      setComposerVoice(message.voice ?? null);
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
  const previewCurrentMedia = mediaPreview
    ? mediaPreview.items[mediaPreview.index]
    : null;

  const openMediaPreview = useCallback(
    (attachments: TeacherChatAttachment[], attachmentId?: string) => {
      const previewItems: ChatMediaPreviewItem[] = attachments
        .map((attachment, index) => {
          const url = (attachment.url ?? "").trim();
          if (!url) return null;
          const kind = getAttachmentKind(attachment.mimeType);
          if (kind !== "image" && kind !== "video") return null;
          const fallbackExtension = kind === "video" ? "mp4" : "jpg";
          const normalizedName = attachment.name?.trim() || "";
          return {
            id: attachment.id || `${kind}-${index}`,
            kind,
            url,
            title: normalizedName || "Вложение",
            downloadName: normalizedName || `chat-media-${index + 1}.${fallbackExtension}`,
          };
        })
        .filter((item): item is ChatMediaPreviewItem => Boolean(item));
      if (previewItems.length === 0) return;
      const initialIndex = attachmentId
        ? previewItems.findIndex((item) => item.id === attachmentId)
        : 0;
      setMediaPreview({
        items: previewItems,
        index: initialIndex >= 0 ? initialIndex : 0,
      });
    },
    []
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

  const handleComposerAudioAction = useCallback(() => {
    if (sending) return;
    if (isRecordingAudio) {
      stopAudioRecording();
      return;
    }
    void startAudioRecording();
  }, [isRecordingAudio, sending, startAudioRecording, stopAudioRecording]);

  const handleComposerSendAction = useCallback(() => {
    if (sending || isRecordingAudio || !hasDraftContent) return;
    void submitComposer();
  }, [hasDraftContent, isRecordingAudio, sending, submitComposer]);

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

      <section className="chat-page__shell" ref={shellRef}>
        <div className="chat-page__workspace">
          <aside className="chat-page__sidebar">
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
                      <div className="chat-page__thread-line chat-page__thread-line--head">
                        <strong>
                          {isTeacher
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
                    : selectedThread?.teacherName ?? "Чат"}
                </h2>
                <p>
                  {isTeacher
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

          {threadsError ? <Alert severity="error">{threadsError}</Alert> : null}

          {chatUnavailable ? (
            <div className="chat-page__empty-gate">
              <Alert severity="warning">
                Чат доступен после покупки курса по премиум тарифу
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
                    const attachments = Array.isArray(message.attachments)
                      ? message.attachments
                      : [];
                    const attachmentKinds = attachments.map((attachment) =>
                      getAttachmentKind(attachment.mimeType)
                    );
                    const hasAudioAttachments = attachmentKinds.includes("audio");
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
                          if (!ownMessage) return;
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
                        {!ownMessage ? (
                          <span className="chat-page__message-author">
                            {message.senderName || "Собеседник"}
                          </span>
                        ) : null}

                        {message.text ? <p>{renderChatMessageText(message.text)}</p> : null}

                        {message.voice ? (
                          <div className="chat-page__message-attachments">
                            <div className="chat-page__attachment chat-page__attachment--audio">
                              <AudioMessagePlayer
                                src={message.voice.url}
                                durationSeconds={message.voice.durationSeconds}
                                waveform={message.voice.waveform}
                                listenedByPeer={message.voice.listenedByPeer}
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
                                          attachment.id
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
                                      src={attachment.url}
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

                        {!isAudioOnlyMessage ? (
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

              {messagesError ? <Alert severity="error">{messagesError}</Alert> : null}

              {composerVoice ? (
                <div className="chat-page__composer-voice">
                  <AudioMessagePlayer
                    src={composerVoice.url}
                    durationSeconds={composerVoice.durationSeconds}
                    waveform={composerVoice.waveform}
                  />
                  <IconButton
                    size="small"
                    className="chat-page__composer-voice-remove"
                    disableRipple
                    onClick={() => setComposerVoice(null)}
                    aria-label="Удалить голосовое сообщение"
                  >
                    <CloseRoundedIcon fontSize="small" />
                  </IconButton>
                </div>
              ) : null}

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
                            <span>
                              {kind === "file"
                                ? `${getAttachmentExtension(attachment.name)} • ${formatAttachmentSize(
                                    attachment.size
                                  )}`
                                : formatAttachmentSize(attachment.size)}
                            </span>
                          </div>
                        </a>
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
                    await handlePickFiles(event.target.files);
                    event.target.value = "";
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
                      onClick={() => fileInputRef.current?.click()}
                      aria-label="Прикрепить файл"
                    >
                      <AttachFileRoundedIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      type="button"
                      disabled={sending}
                      className="chat-page__audio-button"
                      onClick={handleComposerAudioAction}
                      aria-label={
                        isRecordingAudio
                          ? "Остановить запись аудио"
                          : "Начать запись аудио"
                      }
                    >
                      {isRecordingAudio ? <StopRoundedIcon /> : <MicRoundedIcon />}
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
                      disabled={sending || isRecordingAudio || !hasDraftContent}
                      disableRipple
                      className="chat-page__send-button"
                      onClick={handleComposerSendAction}
                      aria-label="Отправить сообщение"
                    >
                      {sending ? (
                        <CircularProgress size={18} color="inherit" />
                      ) : (
                        <SendRoundedIcon />
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
      >
        {previewCurrentMedia ? (
          <div className="chat-page__preview-shell">
            {previewCurrentMedia.kind === "video" ? (
              <video
                controls
                playsInline
                preload="metadata"
                src={previewCurrentMedia.url}
                className="immersive-media-overlay__media chat-page__preview-media"
              />
            ) : (
              <img
                src={previewCurrentMedia.url}
                alt={previewCurrentMedia.title}
                className="immersive-media-overlay__media chat-page__preview-media"
              />
            )}
            <a
              className="chat-page__preview-download"
              href={previewCurrentMedia.url}
              download={previewCurrentMedia.downloadName}
              title={
                previewCurrentMedia.kind === "video"
                  ? "Скачать видео"
                  : "Скачать изображение"
              }
              aria-label={
                previewCurrentMedia.kind === "video"
                  ? "Скачать видео"
                  : "Скачать изображение"
              }
            >
              <DownloadRoundedIcon fontSize="inherit" />
            </a>
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
