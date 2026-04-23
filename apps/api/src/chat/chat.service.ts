import { HttpException, Injectable, OnModuleInit } from "@nestjs/common";
import type { AuthUserDto } from "../auth/auth.types";
import { AuthRepository } from "../auth/auth.repository";
import { CapabilitiesService } from "../capabilities/capabilities.service";
import { MediaService } from "../media/media.service";
import { ensureId } from "../purchases/purchases.helpers";
import { ChatRepository } from "./chat.repository";
import type {
  DeleteTeacherChatMessagePayloadDto,
  MarkTeacherChatVoiceListenedPayloadDto,
  SendTeacherChatMessagePayloadDto,
  TeacherChatAttachmentDto,
  TeacherChatEligibilityDto,
  TeacherChatMessageDto,
  TeacherChatThreadDto,
  TeacherChatVoiceMessageDto,
  UpdateTeacherChatMessagePayloadDto,
} from "./chat.types";

const nowIso = () => new Date().toISOString();

const normalizeMessageText = (value: string) => value.trim();

const normalizeAttachments = (
  value: SendTeacherChatMessagePayloadDto["attachments"]
): TeacherChatAttachmentDto[] => {
  if (!Array.isArray(value)) return [];
  return value.reduce<TeacherChatAttachmentDto[]>((acc, item) => {
    if (!item || typeof item !== "object") return acc;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const mimeType =
      typeof item.mimeType === "string" ? item.mimeType.trim() : "";
    const url = typeof item.url === "string" ? item.url.trim() : "";
    const mediaObjectId =
      typeof item.mediaObjectId === "string" ? item.mediaObjectId.trim() : "";
    if (!id || !name || !mimeType || (!url && !mediaObjectId)) return acc;
    acc.push({
      id,
      name,
      mimeType,
      size:
        typeof item.size === "number" && Number.isFinite(item.size)
          ? Math.max(0, Math.floor(item.size))
          : 0,
      url,
      mediaObjectId: mediaObjectId || undefined,
    });
    return acc;
  }, []);
};

const isAudioAttachment = (attachment: TeacherChatAttachmentDto) =>
  attachment.mimeType.toLowerCase().startsWith("audio/");

const normalizeVoiceWaveform = (value: unknown): number[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .filter((item): item is number => typeof item === "number" && Number.isFinite(item))
    .map((item) => Math.max(0, Math.min(100, Math.round(item))))
    .slice(0, 96);
  return normalized.length > 0 ? normalized : undefined;
};

const normalizeVoiceMessage = (
  value:
    | SendTeacherChatMessagePayloadDto["voice"]
    | UpdateTeacherChatMessagePayloadDto["voice"]
): TeacherChatVoiceMessageDto | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const mimeType = typeof value.mimeType === "string" ? value.mimeType.trim() : "";
  const url = typeof value.url === "string" ? value.url.trim() : "";
  const mediaObjectId =
    typeof value.mediaObjectId === "string" ? value.mediaObjectId.trim() : "";
  if (!id || !mimeType || (!url && !mediaObjectId)) return undefined;
  const size =
    typeof value.size === "number" && Number.isFinite(value.size)
      ? Math.max(0, Math.floor(value.size))
      : 0;
  const durationSeconds =
    typeof value.durationSeconds === "number" &&
    Number.isFinite(value.durationSeconds) &&
    value.durationSeconds > 0
      ? Math.max(0, value.durationSeconds)
      : undefined;
  const listenedByPeer =
    typeof value.listenedByPeer === "boolean" ? value.listenedByPeer : undefined;
  return {
    id,
    mimeType,
    size,
    url,
    mediaObjectId: mediaObjectId || undefined,
    durationSeconds,
    waveform: normalizeVoiceWaveform(value.waveform),
    listenedByPeer,
  };
};

const toVoiceFromAttachment = (
  attachment: TeacherChatAttachmentDto
): TeacherChatVoiceMessageDto => ({
  id: attachment.id,
  mimeType: attachment.mimeType,
  size: attachment.size,
  url: attachment.url,
  mediaObjectId: attachment.mediaObjectId,
  listenedByPeer: false,
});

const splitMessageMedia = (params: {
  attachments: SendTeacherChatMessagePayloadDto["attachments"];
  voice?: SendTeacherChatMessagePayloadDto["voice"];
}): { attachments: TeacherChatAttachmentDto[]; voice?: TeacherChatVoiceMessageDto } => {
  const attachments = normalizeAttachments(params.attachments);
  const explicitVoice = normalizeVoiceMessage(params.voice);
  if (explicitVoice) {
    const filteredAttachments = attachments.filter((attachment) => {
      if (!isAudioAttachment(attachment)) return true;
      if (explicitVoice.mediaObjectId && attachment.mediaObjectId) {
        return attachment.mediaObjectId.trim() !== explicitVoice.mediaObjectId;
      }
      return attachment.id !== explicitVoice.id;
    });
    return {
      attachments: filteredAttachments,
      voice: explicitVoice,
    };
  }
  const legacyVoiceIndex = attachments.findIndex((attachment) =>
    isAudioAttachment(attachment)
  );
  if (legacyVoiceIndex < 0) {
    return {
      attachments,
      voice: undefined,
    };
  }
  const legacyVoiceAttachment = attachments[legacyVoiceIndex];
  if (!legacyVoiceAttachment) {
    return {
      attachments,
      voice: undefined,
    };
  }
  return {
    attachments: attachments.filter((_, index) => index !== legacyVoiceIndex),
    voice: toVoiceFromAttachment(legacyVoiceAttachment),
  };
};

const isSameVoiceMedia = (
  previousVoice: TeacherChatVoiceMessageDto | undefined,
  nextVoice: TeacherChatVoiceMessageDto | undefined
): boolean => {
  if (!previousVoice || !nextVoice) return false;
  const previousMediaObjectId = previousVoice.mediaObjectId?.trim() ?? "";
  const nextMediaObjectId = nextVoice.mediaObjectId?.trim() ?? "";
  if (previousMediaObjectId && nextMediaObjectId) {
    return previousMediaObjectId === nextMediaObjectId;
  }
  return previousVoice.id.trim() === nextVoice.id.trim();
};

@Injectable()
export class ChatService implements OnModuleInit {
  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly authRepository: AuthRepository,
    private readonly capabilitiesService: CapabilitiesService,
    private readonly mediaService: MediaService
  ) {}

  async onModuleInit() {
    await this.chatRepository.ensureSchema();
  }

  async getEligibility(actorUser: AuthUserDto): Promise<TeacherChatEligibilityDto> {
    if (actorUser.role === "teacher") {
      return {
        available: true,
        reason: "teacher",
        hasPremiumAccess: true,
        hasBookingAccess: true,
        teacherId: actorUser.id,
        teacherName: `${actorUser.firstName} ${actorUser.lastName}`.trim(),
        teacherPhoto: actorUser.photo ?? null,
      };
    }

    const capabilities =
      await this.capabilitiesService.getCapabilitiesForUser(actorUser);
    const teacherId =
      capabilities.primaryTeacherId ??
      (await this.capabilitiesService.getPremiumTeacherIdsForStudent(actorUser.id))[0] ??
      null;
    const teacher = teacherId ? await this.authRepository.findById(teacherId) : null;

    const hasPremiumAccess = capabilities.hasPremiumInteractionAccess;
    const hasBookingAccess = capabilities.hasBookingInteractionAccess;
    const available = capabilities.canChatWithTeacher && Boolean(teacher);

    return {
      available,
      reason: !teacher
        ? "teacher_not_found"
        : available
          ? "eligible"
          : "premium_or_booking_required",
      hasPremiumAccess,
      hasBookingAccess,
      teacherId: teacher?.id ?? null,
      teacherName: teacher
        ? `${teacher.firstName} ${teacher.lastName}`.trim()
        : null,
      teacherPhoto: teacher?.photo ?? null,
    };
  }

  async getThreads(actorUser: AuthUserDto): Promise<TeacherChatThreadDto[]> {
    if (actorUser.role === "teacher") {
      return this.chatRepository.listThreadsForTeacher(actorUser.id);
    }

    const eligibility = await this.getEligibility(actorUser);
    if (!eligibility.available || !eligibility.teacherId) {
      return [];
    }

    await this.ensureThread(actorUser.id, eligibility.teacherId);
    return this.chatRepository.listThreadsForStudent(actorUser.id);
  }

  async getMessages(params: {
    actorUser: AuthUserDto;
    threadId: string;
  }): Promise<TeacherChatMessageDto[]> {
    const thread = await this.assertThreadAccess(params.actorUser, params.threadId);
    if (params.actorUser.role === "student") {
      await this.assertStudentPremiumAccess(params.actorUser, thread.teacherId);
    }
    const messages = await this.chatRepository.listMessagesByThread(params.threadId);
    return this.hydrateMessageAttachments(messages);
  }

  async sendMessage(params: {
    actorUser: AuthUserDto;
    payload: SendTeacherChatMessagePayloadDto;
  }): Promise<TeacherChatMessageDto> {
    const { attachments, voice } = splitMessageMedia({
      attachments: params.payload.attachments,
      voice: params.payload.voice,
    });
    const text = normalizeMessageText(params.payload.text ?? "");
    if (!text && attachments.length === 0 && !voice) {
      throw new HttpException(
        { error: "Сообщение не может быть пустым.", code: "validation_failed" },
        400
      );
    }

    const thread = await this.resolveThreadForMessage({
      actorUser: params.actorUser,
      requestedThreadId: params.payload.threadId?.trim(),
    });

    const createdAt = nowIso();
    const created = await this.chatRepository.insertMessage({
      id: ensureId("chat_msg"),
      threadId: thread.id,
      senderId: params.actorUser.id,
      senderRole: params.actorUser.role,
      senderName: `${params.actorUser.firstName} ${params.actorUser.lastName}`.trim(),
      senderPhoto: params.actorUser.photo,
      text,
      attachments,
      voice,
      voiceListenedByPeer: false,
      createdAt,
    });
    const [hydrated] = await this.hydrateMessageAttachments([created]);
    return hydrated ?? created;
  }

  async updateMessage(params: {
    actorUser: AuthUserDto;
    messageId: string;
    payload: UpdateTeacherChatMessagePayloadDto;
  }): Promise<TeacherChatMessageDto> {
    const message = await this.chatRepository.findMessageById(params.messageId);
    if (!message) {
      throw new HttpException({ error: "Сообщение не найдено." }, 404);
    }
    if (message.senderId !== params.actorUser.id) {
      throw new HttpException(
        { error: "Недостаточно прав для редактирования сообщения." },
        403
      );
    }
    const thread = await this.assertThreadAccess(
      params.actorUser,
      params.payload.threadId
    );
    if (thread.id !== message.threadId) {
      throw new HttpException({ error: "Недопустимый threadId." }, 409);
    }
    const text = normalizeMessageText(params.payload.text ?? "");
    const { attachments, voice } = splitMessageMedia({
      attachments: params.payload.attachments,
      voice: params.payload.voice,
    });
    const previousAttachmentObjectIds = this.collectMediaObjectIds({
      attachments: message.attachments,
      voice: message.voice,
    });
    const nextAttachmentObjectIds = this.collectMediaObjectIds({
      attachments,
      voice,
    });
    if (!text && attachments.length === 0 && !voice) {
      throw new HttpException(
        { error: "Сообщение не может быть пустым.", code: "validation_failed" },
        400
      );
    }
    const voiceListenedByPeer =
      voice && message.voice && isSameVoiceMedia(message.voice, voice)
        ? Boolean(message.voice.listenedByPeer)
        : false;
    const updated = await this.chatRepository.updateMessage({
      id: params.messageId,
      text,
      attachments,
      voice,
      voiceListenedByPeer,
      editedAt: nowIso(),
    });
    if (!updated) {
      throw new HttpException({ error: "Сообщение не найдено." }, 404);
    }
    const detachedObjectIds = previousAttachmentObjectIds.filter(
      (id) => !nextAttachmentObjectIds.includes(id)
    );
    await this.releaseMediaObjectIds(detachedObjectIds);
    const [hydrated] = await this.hydrateMessageAttachments([updated]);
    return hydrated ?? updated;
  }

  async deleteMessage(params: {
    actorUser: AuthUserDto;
    messageId: string;
    payload: DeleteTeacherChatMessagePayloadDto;
  }): Promise<{ ok: boolean }> {
    const message = await this.chatRepository.findMessageById(params.messageId);
    if (!message) {
      throw new HttpException({ error: "Сообщение не найдено." }, 404);
    }
    if (message.senderId !== params.actorUser.id) {
      throw new HttpException(
        { error: "Недостаточно прав для удаления сообщения." },
        403
      );
    }
    const thread = await this.assertThreadAccess(
      params.actorUser,
      params.payload.threadId
    );
    if (thread.id !== message.threadId) {
      throw new HttpException({ error: "Недопустимый threadId." }, 409);
    }
    const attachedObjectIds = this.collectMediaObjectIds({
      attachments: message.attachments,
      voice: message.voice,
    });

    const deleted = await this.chatRepository.markMessageDeletedForAll({
      id: params.messageId,
      editedAt: nowIso(),
    });
    if (!deleted) {
      throw new HttpException({ error: "Сообщение не найдено." }, 404);
    }
    await this.releaseMediaObjectIds(attachedObjectIds);
    return { ok: true };
  }

  async clearThread(params: {
    actorUser: AuthUserDto;
    threadId: string;
  }): Promise<{ ok: boolean }> {
    const thread = await this.assertThreadAccess(params.actorUser, params.threadId);
    if (params.actorUser.role === "student") {
      await this.assertStudentPremiumAccess(params.actorUser, thread.teacherId);
    }
    const messages = await this.chatRepository.listMessagesByThread(params.threadId);
    const objectIds = messages.flatMap((message) =>
      this.collectMediaObjectIds({
        attachments: message.attachments,
        voice: message.voice,
      })
    );
    await this.chatRepository.clearThreadMessages(params.threadId, nowIso());
    await this.releaseMediaObjectIds(objectIds);
    return { ok: true };
  }

  async markThreadRead(params: {
    actorUser: AuthUserDto;
    threadId: string;
  }): Promise<{ ok: boolean }> {
    const thread = await this.assertThreadAccess(params.actorUser, params.threadId);
    if (params.actorUser.role === "student") {
      await this.assertStudentPremiumAccess(params.actorUser, thread.teacherId);
    }
    return { ok: true };
  }

  async markVoiceListened(params: {
    actorUser: AuthUserDto;
    messageId: string;
    payload: MarkTeacherChatVoiceListenedPayloadDto;
  }): Promise<{ ok: boolean }> {
    const thread = await this.assertThreadAccess(
      params.actorUser,
      params.payload.threadId
    );
    if (params.actorUser.role === "student") {
      await this.assertStudentPremiumAccess(params.actorUser, thread.teacherId);
    }
    const messageId = params.messageId.trim();
    if (!messageId) {
      throw new HttpException({ error: "messageId обязателен." }, 400);
    }
    const message = await this.chatRepository.findMessageById(messageId);
    if (!message) {
      throw new HttpException({ error: "Сообщение не найдено." }, 404);
    }
    if (message.threadId !== thread.id) {
      throw new HttpException({ error: "Недопустимый threadId." }, 409);
    }
    if (message.senderId === params.actorUser.id) {
      return { ok: true };
    }
    if (!message.voice) {
      return { ok: true };
    }
    await this.chatRepository.markVoiceListenedByPeer({ id: message.id });
    return { ok: true };
  }

  private async resolveThreadForMessage(params: {
    actorUser: AuthUserDto;
    requestedThreadId?: string;
  }) {
    if (params.requestedThreadId) {
      return this.assertThreadAccess(params.actorUser, params.requestedThreadId);
    }

    if (params.actorUser.role === "teacher") {
      throw new HttpException(
        { error: "threadId обязателен для преподавателя." },
        400
      );
    }

    const eligibility = await this.getEligibility(params.actorUser);
    if (!eligibility.available || !eligibility.teacherId) {
      throw new HttpException(
        {
          error: "Чат недоступен для текущего аккаунта.",
          code: "chat_access_denied",
        },
        403
      );
    }
    return this.ensureThread(params.actorUser.id, eligibility.teacherId);
  }

  private async ensureThread(studentId: string, teacherId: string) {
    const existing = await this.chatRepository.findThreadByParticipants({
      studentId,
      teacherId,
    });
    if (existing) return existing;
    await this.chatRepository.insertThread({
      id: ensureId("chat_thread"),
      studentId,
      teacherId,
      createdAt: nowIso(),
    });
    const created = await this.chatRepository.findThreadByParticipants({
      studentId,
      teacherId,
    });
    if (!created) {
      throw new HttpException({ error: "Не удалось создать чат-тред." }, 500);
    }
    return created;
  }

  private async assertThreadAccess(actorUser: AuthUserDto, threadId: string) {
    const normalizedThreadId = threadId.trim();
    if (!normalizedThreadId) {
      throw new HttpException({ error: "threadId обязателен." }, 400);
    }
    const thread = await this.chatRepository.findThreadById(normalizedThreadId);
    if (!thread) {
      throw new HttpException({ error: "Чат не найден." }, 404);
    }
    if (actorUser.role === "teacher") {
      if (thread.teacherId !== actorUser.id) {
        throw new HttpException({ error: "Чат недоступен." }, 403);
      }
      return thread;
    }
    if (thread.studentId !== actorUser.id) {
      throw new HttpException({ error: "Чат недоступен." }, 403);
    }
    return thread;
  }

  private async assertStudentPremiumAccess(
    actorUser: AuthUserDto,
    teacherId: string
  ): Promise<void> {
    const capabilities =
      await this.capabilitiesService.getCapabilitiesForUser(actorUser);
    if (!capabilities.canChatWithTeacher) {
      throw new HttpException(
        {
          error:
            "Чат доступен только при активной premium или booking-возможности.",
          code: "chat_access_denied",
        },
        403
      );
    }
    if (
      capabilities.teacherIdsForPremiumInteractions.length > 0 &&
      !capabilities.teacherIdsForPremiumInteractions.includes(teacherId)
    ) {
      throw new HttpException(
        {
          error: "Чат недоступен вне закрепленного преподавателя.",
          code: "chat_access_denied",
        },
        403
      );
    }
  }

  private collectMediaObjectIds(params: {
    attachments?: TeacherChatAttachmentDto[];
    voice?: TeacherChatVoiceMessageDto;
  }): string[] {
    const candidates: string[] = [];
    if (Array.isArray(params.attachments)) {
      params.attachments.forEach((attachment) => {
        const mediaObjectId = attachment.mediaObjectId?.trim();
        if (mediaObjectId) candidates.push(mediaObjectId);
      });
    }
    const voiceMediaObjectId = params.voice?.mediaObjectId?.trim();
    if (voiceMediaObjectId) {
      candidates.push(voiceMediaObjectId);
    }
    return Array.from(new Set(candidates.filter(Boolean)));
  }

  private async releaseMediaObjectIds(objectIds: string[]): Promise<void> {
    const normalized = Array.from(
      new Set(objectIds.map((item) => item.trim()).filter(Boolean))
    );
    if (normalized.length === 0) return;
    try {
      await this.mediaService.releaseMediaObjects({
        objectIds: normalized,
        reason: "chat_attachment_detach",
      });
    } catch (error) {
      if (typeof console !== "undefined") {
        console.warn("[chat] media-release-failed", {
          objectIds: normalized,
          error:
            error instanceof Error
              ? {
                  name: error.name,
                  message: error.message,
                }
              : error,
        });
      }
    }
  }

  private async hydrateMessageAttachments(
    messages: TeacherChatMessageDto[]
  ): Promise<TeacherChatMessageDto[]> {
    const mediaCache = new Map<string, string>();
    const hydrateUrl = async (mediaObjectId: string): Promise<string | null> => {
      const normalizedMediaObjectId = mediaObjectId.trim();
      if (!normalizedMediaObjectId) return null;
      const cachedUrl = mediaCache.get(normalizedMediaObjectId);
      if (cachedUrl) return cachedUrl;
      try {
        const access = await this.mediaService.getRuntimeDownloadUrlByObjectId(
          normalizedMediaObjectId
        );
        mediaCache.set(normalizedMediaObjectId, access.downloadUrl);
        return access.downloadUrl;
      } catch {
        return null;
      }
    };
    return Promise.all(
      messages.map(async (message) => {
        const sourceAttachments = Array.isArray(message.attachments)
          ? message.attachments
          : [];
        const sourceVoice = message.voice;
        if (sourceAttachments.length === 0 && !sourceVoice) return message;

        const hydratedAttachments = await Promise.all(
          sourceAttachments.map(async (attachment) => {
            const mediaObjectId = attachment.mediaObjectId?.trim();
            if (!mediaObjectId) return attachment;
            const hydratedUrl = await hydrateUrl(mediaObjectId);
            if (hydratedUrl) {
              return {
                ...attachment,
                url: hydratedUrl,
              };
            }
            return attachment;
          })
        );
        let hydratedVoice = sourceVoice;
        if (sourceVoice?.mediaObjectId) {
          const hydratedUrl = await hydrateUrl(sourceVoice.mediaObjectId);
          if (hydratedUrl) {
            hydratedVoice = {
              ...sourceVoice,
              url: hydratedUrl,
            };
          }
        }

        return {
          ...message,
          attachments: hydratedAttachments,
          voice: hydratedVoice,
        };
      })
    );
  }
}
