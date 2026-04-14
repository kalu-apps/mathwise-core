import crypto from "node:crypto";
import {
  HttpException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import type { AuthUserDto } from "../auth/auth.types";
import { getApiRuntimeConfig } from "../config/runtime.config";
import {
  MediaRepository,
  type MediaReferenceUsage,
} from "./media.repository";
import { MediaStorageService } from "./media.storage";
import type {
  AbortMultipartUploadPayloadDto,
  AbortMultipartUploadResponseDto,
  CompleteMultipartUploadPayloadDto,
  CompleteMultipartUploadResponseDto,
  CompleteUploadPayloadDto,
  CompleteUploadResponseDto,
  CreateMultipartUploadPayloadDto,
  CreateMultipartUploadResponseDto,
  CreateUploadUrlPayloadDto,
  CreateUploadUrlResponseDto,
  GetDownloadUrlResponseDto,
  MarkFinalizeFailedResponseDto,
  MediaObjectRecord,
} from "./media.types";

const ensureId = (prefix: string) =>
  typeof crypto.randomUUID === "function"
    ? `${prefix}_${crypto.randomUUID()}`
    : `${prefix}_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 10)}`;

const nowIso = () => new Date().toISOString();

const sanitizeFileName = (input: string) =>
  input
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);

const normalizeCategory = (value: string | undefined) => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "general";
  return normalized.replace(/[^a-z0-9_-]/g, "_").slice(0, 32) || "general";
};

const toByteSize = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, Math.floor(parsed));
};

const formatSizeLimit = (bytes: number) => {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    const rounded = Number.isInteger(gb) ? String(gb) : gb.toFixed(1);
    return `${rounded} ГБ`;
  }
  const mb = Math.floor(bytes / (1024 * 1024));
  return `${mb} МБ`;
};

const MIN_MULTIPART_PART_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_MULTIPART_PARTS = 1000;

const resolveMultipartPartSizeBytes = (sizeBytes: number) => {
  let partSize = MIN_MULTIPART_PART_SIZE_BYTES;
  let partCount = Math.ceil(sizeBytes / partSize);
  while (partCount > MAX_MULTIPART_PARTS) {
    partSize += 4 * 1024 * 1024;
    partCount = Math.ceil(sizeBytes / partSize);
  }
  return partSize;
};

@Injectable()
export class MediaService implements OnModuleInit, OnModuleDestroy {
  private readonly runtimeConfig = getApiRuntimeConfig({
    requireDatabase: false,
    requireRedis: false,
  });
  private readonly lessonVideoMaxUploadBytes =
    this.runtimeConfig.mediaLessonVideoMaxUploadBytes;
  private readonly gcIntervalMs = this.runtimeConfig.mediaGcIntervalSec * 1000;
  private readonly gcBatchLimit = this.runtimeConfig.mediaGcBatchLimit;
  private gcTimer: NodeJS.Timeout | null = null;
  private gcRunning = false;

  constructor(
    private readonly mediaRepository: MediaRepository,
    private readonly mediaStorageService: MediaStorageService
  ) {}

  async onModuleInit() {
    await this.mediaRepository.ensureSchema();
    if (!this.mediaStorageService.isEnabled()) return;

    await this.mediaRepository.markStalePendingAsFailed(180);
    this.startGcWorker();
  }

  onModuleDestroy() {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
  }

  isStorageEnabled() {
    return this.mediaStorageService.isEnabled();
  }

  async isStorageReady() {
    return this.mediaStorageService.healthcheck();
  }

  async createUploadUrl(params: {
    payload: CreateUploadUrlPayloadDto;
    actorUser: AuthUserDto | null;
  }): Promise<CreateUploadUrlResponseDto> {
    this.ensureStorageEnabled();

    const actorUser = params.actorUser;
    if (!actorUser) {
      throw new HttpException({ error: "Требуется авторизация." }, 401);
    }

    const fileNameRaw = params.payload.fileName?.trim();
    const contentType = params.payload.contentType?.trim().toLowerCase();
    if (!fileNameRaw || !contentType) {
      throw new HttpException({ error: "fileName и contentType обязательны." }, 400);
    }

    const fileName = sanitizeFileName(fileNameRaw);
    const objectId = ensureId("media");
    const datePrefix = new Date().toISOString().slice(0, 10);
    const category = normalizeCategory(params.payload.category);
    const requestedSizeBytes = toByteSize(params.payload.sizeBytes);
    this.ensureCategoryUploadSize({
      category,
      sizeBytes: requestedSizeBytes,
    });
    const objectKey = `${this.mediaStorageService.getAppEnv()}/${category}/${actorUser.id}/${datePrefix}/${objectId}_${fileName}`;

    const signed = await this.mediaStorageService.createSignedUploadUrl({
      objectKey,
      contentType,
    });

    const createdAt = nowIso();
    const record: MediaObjectRecord = {
      id: objectId,
      objectKey,
      bucket: this.mediaStorageService.getBucket(),
      ownerUserId: actorUser.id,
      category,
      contentType,
      sizeBytes: requestedSizeBytes,
      state: "pending_upload",
      createdAt,
      updatedAt: createdAt,
    };
    await this.mediaRepository.insertPending(record);

    return {
      objectId,
      objectKey,
      uploadUrl: signed.url,
      method: "PUT",
      headers: {
        "Content-Type": contentType,
      },
      expiresAt: signed.expiresAt,
    };
  }

  async createMultipartUpload(params: {
    payload: CreateMultipartUploadPayloadDto;
    actorUser: AuthUserDto | null;
  }): Promise<CreateMultipartUploadResponseDto> {
    this.ensureStorageEnabled();

    const actorUser = params.actorUser;
    if (!actorUser) {
      throw new HttpException({ error: "Требуется авторизация." }, 401);
    }

    const fileNameRaw = params.payload.fileName?.trim();
    const contentType = params.payload.contentType?.trim().toLowerCase();
    if (!fileNameRaw || !contentType) {
      throw new HttpException({ error: "fileName и contentType обязательны." }, 400);
    }

    const requestedSizeBytes = toByteSize(params.payload.sizeBytes);
    if (!requestedSizeBytes || requestedSizeBytes <= 0) {
      throw new HttpException(
        { error: "sizeBytes обязателен для multipart-загрузки." },
        400
      );
    }

    const category = normalizeCategory(params.payload.category);
    this.ensureCategoryUploadSize({
      category,
      sizeBytes: requestedSizeBytes,
    });

    const objectId = ensureId("media");
    const datePrefix = new Date().toISOString().slice(0, 10);
    const fileName = sanitizeFileName(fileNameRaw);
    const objectKey = `${this.mediaStorageService.getAppEnv()}/${category}/${actorUser.id}/${datePrefix}/${objectId}_${fileName}`;

    const partSizeBytes = resolveMultipartPartSizeBytes(requestedSizeBytes);
    const partCount = Math.ceil(requestedSizeBytes / partSizeBytes);
    if (partCount > MAX_MULTIPART_PARTS) {
      throw new HttpException(
        {
          error: "Файл слишком большой для multipart-загрузки в текущей конфигурации.",
          code: "multipart_part_count_too_large",
        },
        413
      );
    }

    const createdAt = nowIso();
    const record: MediaObjectRecord = {
      id: objectId,
      objectKey,
      bucket: this.mediaStorageService.getBucket(),
      ownerUserId: actorUser.id,
      category,
      contentType,
      sizeBytes: requestedSizeBytes,
      state: "pending_upload",
      createdAt,
      updatedAt: createdAt,
    };

    const { uploadId } = await this.mediaStorageService.createMultipartUpload({
      objectKey,
      contentType,
    });

    try {
      await this.mediaRepository.insertPending(record);
    } catch (error) {
      await this.mediaStorageService.abortMultipartUpload({
        objectKey,
        uploadId,
      });
      throw error;
    }

    const urls = await Promise.all(
      Array.from({ length: partCount }, (_, index) =>
        this.mediaStorageService.createSignedUploadPartUrl({
          objectKey,
          uploadId,
          partNumber: index + 1,
        })
      )
    );

    return {
      objectId,
      objectKey,
      uploadId,
      partSizeBytes,
      partCount,
      parts: urls.map((signed, index) => ({
        partNumber: index + 1,
        uploadUrl: signed.url,
        expiresAt: signed.expiresAt,
        method: "PUT" as const,
      })),
    };
  }

  async completeMultipartUpload(params: {
    objectId: string;
    payload: CompleteMultipartUploadPayloadDto;
    actorUser: AuthUserDto | null;
  }): Promise<CompleteMultipartUploadResponseDto> {
    this.ensureStorageEnabled();

    const actorUser = params.actorUser;
    if (!actorUser) {
      throw new HttpException({ error: "Требуется авторизация." }, 401);
    }

    const uploadId = params.payload.uploadId?.trim();
    const partCount = Math.floor(Number(params.payload.partCount));
    if (!uploadId || !Number.isFinite(partCount) || partCount <= 0) {
      throw new HttpException(
        { error: "uploadId и partCount обязательны для завершения multipart." },
        400
      );
    }

    const media = await this.requireOwnedMedia(params.objectId, actorUser);
    const listedParts = await this.mediaStorageService.listMultipartUploadedParts({
      objectKey: media.objectKey,
      uploadId,
    });

    if (listedParts.length < partCount) {
      throw new HttpException(
        {
          error: "Не все части загружены. Проверьте сеть и повторите загрузку.",
          code: "multipart_parts_incomplete",
        },
        409
      );
    }

    const normalizedParts = listedParts
      .filter((part) => part.partNumber <= partCount)
      .sort((a, b) => a.partNumber - b.partNumber);

    for (let index = 0; index < partCount; index += 1) {
      const expectedPart = index + 1;
      if (normalizedParts[index]?.partNumber !== expectedPart) {
        throw new HttpException(
          {
            error: "Multipart загрузка повреждена: отсутствуют части файла.",
            code: "multipart_parts_missing",
          },
          409
        );
      }
    }

    await this.mediaStorageService.completeMultipartUpload({
      objectKey: media.objectKey,
      uploadId,
      parts: normalizedParts.slice(0, partCount),
    });

    const completed = await this.completeUpload({
      objectId: media.id,
      payload: {
        sizeBytes: toByteSize(params.payload.sizeBytes) ?? media.sizeBytes,
      },
      actorUser,
    });

    return {
      ok: true,
      media: completed.media,
    };
  }

  async abortMultipartUpload(params: {
    objectId: string;
    payload: AbortMultipartUploadPayloadDto;
    actorUser: AuthUserDto | null;
  }): Promise<AbortMultipartUploadResponseDto> {
    this.ensureStorageEnabled();

    const actorUser = params.actorUser;
    if (!actorUser) {
      throw new HttpException({ error: "Требуется авторизация." }, 401);
    }
    const uploadId = params.payload.uploadId?.trim();
    if (!uploadId) {
      throw new HttpException({ error: "uploadId обязателен." }, 400);
    }

    const media = await this.requireOwnedMedia(params.objectId, actorUser);
    await this.mediaStorageService.abortMultipartUpload({
      objectKey: media.objectKey,
      uploadId,
    });

    await this.mediaRepository.markUploadFailed({
      id: media.id,
      reason: "multipart_aborted",
    });
    await this.mediaRepository.markOrphanCandidate(media.id);
    await this.cleanupCandidateIds([media.id]);

    const current = (await this.mediaRepository.findById(media.id)) ?? media;
    return {
      ok: true,
      media: current,
    };
  }

  async completeUpload(params: {
    objectId: string;
    payload?: CompleteUploadPayloadDto;
    actorUser: AuthUserDto | null;
  }): Promise<CompleteUploadResponseDto> {
    this.ensureStorageEnabled();

    const actorUser = params.actorUser;
    if (!actorUser) {
      throw new HttpException({ error: "Требуется авторизация." }, 401);
    }

    const media = await this.requireOwnedMedia(params.objectId, actorUser);
    const head = await this.mediaStorageService.headObject(media.objectKey);
    if (!head) {
      await this.mediaRepository.markUploadFailed({
        id: media.id,
        reason: "head_object_missing",
      });
      throw new HttpException({ error: "Файл еще не загружен в storage." }, 409);
    }

    const completedSizeBytes =
      toByteSize(params.payload?.sizeBytes) ?? head.contentLength;
    try {
      this.ensureCategoryUploadSize({
        category: media.category,
        sizeBytes: completedSizeBytes,
      });
    } catch (error) {
      await this.mediaRepository.markUploadFailed({
        id: media.id,
        reason: "size_validation_failed",
      });
      await this.mediaRepository.markOrphanCandidate(media.id);
      await this.cleanupCandidateIds([media.id]);
      throw error;
    }

    const updated = await this.mediaRepository.markUploaded({
      id: media.id,
      sizeBytes: completedSizeBytes,
      etag: params.payload?.etag?.trim() || head.etag,
    });

    if (!updated) {
      throw new HttpException({ error: "Медиа-объект не найден." }, 404);
    }

    return {
      ok: true,
      media: updated,
    };
  }

  async markFinalizeFailed(params: {
    objectId: string;
    actorUser: AuthUserDto | null;
  }): Promise<MarkFinalizeFailedResponseDto> {
    this.ensureStorageEnabled();

    const actorUser = params.actorUser;
    if (!actorUser) {
      throw new HttpException({ error: "Требуется авторизация." }, 401);
    }

    const media = await this.requireOwnedMedia(params.objectId, actorUser);
    if (media.state === "uploaded" || media.state === "deleted") {
      return { ok: true, media };
    }

    const head = await this.mediaStorageService.headObject(media.objectKey);
    if (!head) {
      const failed =
        (await this.mediaRepository.markUploadFailed({
          id: media.id,
          reason: "finalize_failed_no_object",
        })) ?? media;
      return { ok: true, media: failed };
    }

    await this.mediaRepository.markOrphanCandidate(media.id);
    await this.cleanupCandidateIds([media.id]);
    const next = (await this.mediaRepository.findById(media.id)) ?? media;
    return { ok: true, media: next };
  }

  async releaseMediaObjects(params: {
    objectIds: string[];
    reason?: string;
  }): Promise<void> {
    this.ensureStorageEnabled();

    const ids = [...new Set(params.objectIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) return;

    for (const id of ids) {
      await this.mediaRepository.markOrphanCandidate(id);
    }
    await this.cleanupCandidateIds(ids);
  }

  async processOrphanCandidates(limit = 100): Promise<void> {
    this.ensureStorageEnabled();
    const candidates = await this.mediaRepository.findCleanupCandidates(limit);
    if (candidates.length === 0) return;
    await this.cleanupCandidateIds(candidates.map((candidate) => candidate.id));
  }

  async getReferenceUsage(objectId: string): Promise<MediaReferenceUsage> {
    return this.mediaRepository.countReferencesByObjectId(objectId.trim());
  }

  async getDownloadUrl(params: {
    objectId: string;
    actorUser: AuthUserDto | null;
  }): Promise<GetDownloadUrlResponseDto> {
    this.ensureStorageEnabled();

    const actorUser = params.actorUser;
    if (!actorUser) {
      throw new HttpException({ error: "Требуется авторизация." }, 401);
    }
    const media = await this.requireOwnedMedia(params.objectId, actorUser);
    if (media.state !== "uploaded") {
      throw new HttpException({ error: "Файл еще не готов к скачиванию." }, 409);
    }

    return this.buildDownloadUrlResponse(media);
  }

  async getRuntimeDownloadUrlByObjectId(
    objectId: string
  ): Promise<GetDownloadUrlResponseDto> {
    this.ensureStorageEnabled();
    const media = await this.requireMediaReady(objectId);
    return this.buildDownloadUrlResponse(media);
  }

  private startGcWorker() {
    if (this.gcTimer) return;
    this.gcTimer = setInterval(() => {
      void this.runGcPass();
    }, this.gcIntervalMs);
    this.gcTimer.unref?.();
  }

  private async runGcPass() {
    if (this.gcRunning) return;
    this.gcRunning = true;
    try {
      await this.mediaRepository.markStalePendingAsFailed(180);
      await this.processOrphanCandidates(this.gcBatchLimit);
    } catch (error) {
      if (typeof console !== "undefined") {
        console.error("[media-gc] background-pass-failed", {
          error:
            error instanceof Error
              ? {
                  name: error.name,
                  message: error.message,
                }
              : error,
        });
      }
    } finally {
      this.gcRunning = false;
    }
  }

  private async cleanupCandidateIds(ids: string[]): Promise<void> {
    for (const id of ids) {
      const media = await this.mediaRepository.findById(id);
      if (!media || media.state === "deleted") continue;

      const refs = await this.mediaRepository.countReferencesByObjectId(media.id);
      if (refs.totalRefs > 0) {
        if (media.state !== "uploaded") {
          await this.mediaRepository.markUploadedState(media.id);
        }
        continue;
      }

      await this.mediaRepository.markCleanupPending(media.id);
      const deleted = await this.mediaStorageService.deleteObject(media.objectKey);
      if (deleted) {
        await this.mediaRepository.markDeleted(media.id);
        continue;
      }

      const stillExists = await this.mediaStorageService.headObject(media.objectKey);
      if (!stillExists) {
        await this.mediaRepository.markDeleted(media.id);
        continue;
      }

      await this.mediaRepository.markOrphanCandidate(media.id);
    }
  }

  private async buildDownloadUrlResponse(
    media: MediaObjectRecord
  ): Promise<GetDownloadUrlResponseDto> {
    const signed = await this.mediaStorageService.createSignedDownloadUrl({
      objectKey: media.objectKey,
    });

    return {
      objectId: media.id,
      objectKey: media.objectKey,
      downloadUrl: signed.url,
      expiresAt: signed.expiresAt,
      contentType: media.contentType,
      sizeBytes: media.sizeBytes,
    };
  }

  private ensureStorageEnabled() {
    if (!this.mediaStorageService.isEnabled()) {
      throw new HttpException(
        {
          error:
            "Media storage disabled. Set MEDIA_STORAGE_ENABLED=true and valid S3_* env.",
        },
        503
      );
    }
  }

  private async requireOwnedMedia(
    objectId: string,
    actorUser: AuthUserDto
  ): Promise<MediaObjectRecord> {
    const id = objectId.trim();
    if (!id) {
      throw new HttpException({ error: "objectId обязателен." }, 400);
    }
    const media = await this.mediaRepository.findById(id);
    if (!media) {
      throw new HttpException({ error: "Медиа-объект не найден." }, 404);
    }
    if (media.ownerUserId !== actorUser.id) {
      throw new HttpException(
        { error: "Недостаточно прав для media объекта." },
        403
      );
    }
    return media;
  }

  private async requireMediaReady(objectId: string): Promise<MediaObjectRecord> {
    const id = objectId.trim();
    if (!id) {
      throw new HttpException({ error: "objectId обязателен." }, 400);
    }
    const media = await this.mediaRepository.findById(id);
    if (!media) {
      throw new HttpException({ error: "Медиа-объект не найден." }, 404);
    }
    if (media.state !== "uploaded") {
      throw new HttpException({ error: "Файл еще не готов к скачиванию." }, 409);
    }
    return media;
  }

  private ensureCategoryUploadSize(params: { category: string; sizeBytes?: number }) {
    if (params.category !== "lesson-video") return;
    if (!params.sizeBytes || params.sizeBytes <= 0) {
      throw new HttpException(
        {
          error: "Для загрузки видео требуется размер файла.",
          code: "lesson_video_size_required",
        },
        400
      );
    }
    if (params.sizeBytes > this.lessonVideoMaxUploadBytes) {
      throw new HttpException(
        {
          error: `Размер видео превышает лимит ${formatSizeLimit(
            this.lessonVideoMaxUploadBytes
          )}.`,
          code: "lesson_video_too_large",
          limitBytes: this.lessonVideoMaxUploadBytes,
        },
        413
      );
    }
  }
}
