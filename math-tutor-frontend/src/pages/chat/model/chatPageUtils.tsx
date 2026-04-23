import type { ReactNode } from "react";
import {
  getOwnedMediaDownloadUrl,
  uploadChatAttachmentFile,
} from "@/shared/lib/mediaPipeline";
import type {
  TeacherChatAttachment,
  TeacherChatMessage,
  TeacherChatThread,
  TeacherChatVoiceMessage,
} from "@/features/chat/model/types";

export const formatThreadDate = (value?: string) => {
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

export const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const toDayKey = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};

export const formatDayLabel = (value: string) => {
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

export const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
};

export const formatPlaybackTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "00:00";
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
};

export const formatAttachmentSize = (size: number | null | undefined) => {
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) return "—";
  if (size < 1024) return `${Math.round(size)} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(gb >= 100 ? 0 : 1)} GB`;
};

export const getAttachmentExtension = (name: string) => {
  const safeName = (name ?? "").trim();
  const dotIndex = safeName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex >= safeName.length - 1) return "FILE";
  return safeName.slice(dotIndex + 1).toUpperCase().slice(0, 6);
};

const CHAT_LINK_PATTERN = /\b((?:https?:\/\/|www\.)[^\s]+)/gi;

const normalizeChatLinkUrl = (value: string) =>
  /^https?:\/\//i.test(value) ? value : `https://${value}`;

const splitChatLinkToken = (token: string) => {
  let tail = "";
  let urlToken = token;
  while (
    urlToken.length > 0 &&
    /[),.!?:;"'\]]/.test(urlToken[urlToken.length - 1] ?? "")
  ) {
    tail = `${urlToken[urlToken.length - 1]}${tail}`;
    urlToken = urlToken.slice(0, -1);
  }
  return {
    urlToken,
    tail,
  };
};

export const renderChatMessageText = (value: string): ReactNode => {
  const text = value ?? "";
  if (!text) return "";
  const nodes: ReactNode[] = [];
  let cursor = 0;
  CHAT_LINK_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null = CHAT_LINK_PATTERN.exec(text);
  while (match) {
    const full = match[0] ?? "";
    const index = match.index ?? 0;
    if (index > cursor) {
      nodes.push(
        <span key={`text-${cursor}`}>{text.slice(cursor, index)}</span>
      );
    }
    const { urlToken, tail } = splitChatLinkToken(full);
    if (urlToken) {
      nodes.push(
        <a
          key={`link-${index}-${urlToken}`}
          href={normalizeChatLinkUrl(urlToken)}
          target="_blank"
          rel="noreferrer noopener"
          className="chat-page__message-link"
        >
          {urlToken}
        </a>
      );
    }
    if (tail) {
      nodes.push(<span key={`tail-${index}`}>{tail}</span>);
    }
    cursor = index + full.length;
    match = CHAT_LINK_PATTERN.exec(text);
  }
  if (cursor < text.length) {
    nodes.push(<span key={`text-tail-${cursor}`}>{text.slice(cursor)}</span>);
  }
  return nodes;
};

export const getAttachmentKind = (mimeType: string) => {
  const normalized = mimeType.toLowerCase();
  if (normalized.startsWith("image/")) return "image";
  if (normalized.startsWith("video/")) return "video";
  if (normalized.startsWith("audio/")) return "audio";
  return "file";
};

export const truncateFileName = (name: string, maxLength = 28) => {
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

export const getComposerAttachmentTitle = (attachment: TeacherChatAttachment) => {
  const kind = getAttachmentKind(attachment.mimeType);
  if (kind === "audio") return "Голосовое сообщение";
  if (kind === "video") return "Видеофайл";
  return attachment.name;
};

export const MAX_ATTACHMENTS_PER_MESSAGE = 10;
export const MAX_ATTACHMENT_SIZE_BYTES = 24 * 1024 * 1024;

export const isValidChatAttachment = (
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

export const normalizeVoiceWaveform = (value: unknown): number[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .filter((item): item is number => typeof item === "number" && Number.isFinite(item))
    .map((item) => Math.max(0, Math.min(100, Math.round(item))))
    .slice(0, 96);
  return normalized.length > 0 ? normalized : undefined;
};

export const isValidChatVoiceMessage = (
  value: TeacherChatVoiceMessage | null | undefined
): value is TeacherChatVoiceMessage =>
  Boolean(
    value &&
      typeof value.id === "string" &&
      value.id.trim() &&
      typeof value.mimeType === "string" &&
      value.mimeType.trim() &&
      typeof value.url === "string" &&
      value.url.trim()
  );

export const normalizeChatMessage = (
  message: TeacherChatMessage
): TeacherChatMessage => {
  const normalizedVoice = isValidChatVoiceMessage(message.voice)
    ? {
        ...message.voice,
        waveform: normalizeVoiceWaveform(message.voice.waveform),
      }
    : undefined;
  const normalizedAttachments = Array.isArray(message.attachments)
    ? message.attachments.filter((attachment) => isValidChatAttachment(attachment))
    : [];
  return {
    ...message,
    text: typeof message.text === "string" ? message.text : "",
    attachments: normalizedVoice
      ? normalizedAttachments.filter(
          (attachment) => !attachment.mimeType.toLowerCase().startsWith("audio/")
        )
      : normalizedAttachments,
    voice: normalizedVoice,
  };
};

export const normalizeChatThread = (
  thread: TeacherChatThread
): TeacherChatThread => ({
  ...thread,
  studentName: thread.studentName?.trim() || "Студент",
  studentEmail: thread.studentEmail?.trim() || "—",
  teacherName: thread.teacherName?.trim() || "Преподаватель",
  unreadCount:
    typeof thread.unreadCount === "number" && Number.isFinite(thread.unreadCount)
      ? Math.max(0, Math.floor(thread.unreadCount))
      : 0,
});

export const createAttachmentFromFile = async (
  file: File
): Promise<TeacherChatAttachment> => {
  const mediaObjectId = await uploadChatAttachmentFile(file);
  const access = await getOwnedMediaDownloadUrl(mediaObjectId);
  return {
    id: mediaObjectId,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    url: access.downloadUrl,
    mediaObjectId,
  };
};

const VOICE_WAVEFORM_BARS = 48;

const extractVoiceWaveform = (pcmData: Float32Array): number[] | undefined => {
  if (pcmData.length === 0) return undefined;
  const step = Math.max(1, Math.floor(pcmData.length / VOICE_WAVEFORM_BARS));
  const amplitudes: number[] = [];
  for (let index = 0; index < VOICE_WAVEFORM_BARS; index += 1) {
    const start = index * step;
    if (start >= pcmData.length) break;
    const end = Math.min(start + step, pcmData.length);
    let peak = 0;
    for (let cursor = start; cursor < end; cursor += 1) {
      const sample = Math.abs(pcmData[cursor] ?? 0);
      if (sample > peak) peak = sample;
    }
    amplitudes.push(peak);
  }
  const maxAmplitude = Math.max(...amplitudes, 0);
  if (!Number.isFinite(maxAmplitude) || maxAmplitude <= 0) return undefined;
  const normalized = amplitudes.map((value) =>
    Math.max(8, Math.min(100, Math.round((value / maxAmplitude) * 100)))
  );
  return normalizeVoiceWaveform(normalized);
};

const analyzeVoiceFile = async (
  file: File
): Promise<{ durationSeconds?: number; waveform?: number[] }> => {
  if (typeof window === "undefined") {
    return {};
  }
  const AudioContextCtor =
    window.AudioContext ??
    (
      window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;
  if (!AudioContextCtor) {
    return {};
  }
  const audioContext = new AudioContextCtor();
  try {
    const buffer = await file.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(buffer.slice(0));
    const durationSeconds =
      Number.isFinite(decoded.duration) && decoded.duration > 0
        ? decoded.duration
        : undefined;
    const waveform = extractVoiceWaveform(decoded.getChannelData(0));
    return {
      durationSeconds,
      waveform,
    };
  } catch {
    return {};
  } finally {
    await audioContext.close().catch(() => undefined);
  }
};

export const createVoiceMessageFromFile = async (
  file: File,
  options?: {
    durationSeconds?: number;
    waveform?: number[];
    listenedByPeer?: boolean;
  }
): Promise<TeacherChatVoiceMessage> => {
  const analyzed = await analyzeVoiceFile(file);
  const mediaObjectId = await uploadChatAttachmentFile(file);
  const access = await getOwnedMediaDownloadUrl(mediaObjectId);
  const durationSeconds =
    typeof options?.durationSeconds === "number" &&
    Number.isFinite(options.durationSeconds) &&
    options.durationSeconds > 0
      ? Math.max(0, options.durationSeconds)
      : typeof analyzed.durationSeconds === "number" &&
          Number.isFinite(analyzed.durationSeconds) &&
          analyzed.durationSeconds > 0
        ? Math.max(0, analyzed.durationSeconds)
        : undefined;
  return {
    id: mediaObjectId,
    mimeType: file.type || "audio/webm",
    size: file.size,
    url: access.downloadUrl,
    mediaObjectId,
    durationSeconds,
    waveform: normalizeVoiceWaveform(options?.waveform ?? analyzed.waveform),
    listenedByPeer:
      typeof options?.listenedByPeer === "boolean"
        ? options.listenedByPeer
        : false,
  };
};
