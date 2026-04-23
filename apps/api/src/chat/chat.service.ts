import { HttpException, Injectable, OnModuleInit } from "@nestjs/common";
import type { AuthUserDto } from "../auth/auth.types";
import { AuthRepository } from "../auth/auth.repository";
import { CapabilitiesService } from "../capabilities/capabilities.service";
import { MediaService } from "../media/media.service";
import { ensureId } from "../purchases/purchases.helpers";
import { ChatRepository } from "./chat.repository";
import type {
  DeleteTeacherChatMessagePayloadDto,
  SendTeacherChatMessagePayloadDto,
  TeacherChatAttachmentDto,
  TeacherChatEligibilityDto,
  TeacherChatMessageDto,
  TeacherChatThreadDto,
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
    const attachments = normalizeAttachments(params.payload.attachments);
    const text = normalizeMessageText(params.payload.text ?? "");
    if (!text && attachments.length === 0) {
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
    const attachments = normalizeAttachments(params.payload.attachments);
    const previousAttachmentObjectIds = this.collectMediaObjectIds(
      message.attachments
    );
    const nextAttachmentObjectIds = this.collectMediaObjectIds(attachments);
    if (!text && attachments.length === 0) {
      throw new HttpException(
        { error: "Сообщение не может быть пустым.", code: "validation_failed" },
        400
      );
    }
    const updated = await this.chatRepository.updateMessage({
      id: params.messageId,
      text,
      attachments,
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
    const attachedObjectIds = this.collectMediaObjectIds(message.attachments);

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
    const objectIds = this.collectMediaObjectIds(
      messages.flatMap((message) => message.attachments ?? [])
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

  private collectMediaObjectIds(
    attachments: TeacherChatAttachmentDto[] | undefined
  ): string[] {
    if (!Array.isArray(attachments) || attachments.length === 0) return [];
    return Array.from(
      new Set(
        attachments
          .map((attachment) => attachment.mediaObjectId?.trim() || "")
          .filter(Boolean)
      )
    );
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
    return Promise.all(
      messages.map(async (message) => {
        const sourceAttachments = Array.isArray(message.attachments)
          ? message.attachments
          : [];
        if (sourceAttachments.length === 0) return message;

        const hydratedAttachments = await Promise.all(
          sourceAttachments.map(async (attachment) => {
            const mediaObjectId = attachment.mediaObjectId?.trim();
            if (!mediaObjectId) return attachment;

            const cachedUrl = mediaCache.get(mediaObjectId);
            if (cachedUrl) {
              return {
                ...attachment,
                url: cachedUrl,
              };
            }

            try {
              const access = await this.mediaService.getRuntimeDownloadUrlByObjectId(
                mediaObjectId
              );
              mediaCache.set(mediaObjectId, access.downloadUrl);
              return {
                ...attachment,
                url: access.downloadUrl,
              };
            } catch {
              return attachment;
            }
          })
        );

        return {
          ...message,
          attachments: hydratedAttachments,
        };
      })
    );
  }
}
