import crypto from "node:crypto";
import { HttpException, Injectable, OnModuleInit } from "@nestjs/common";
import type { AuthUserDto } from "../auth/auth.types";
import { MediaRepository } from "./media.repository";
import { MediaStorageService } from "./media.storage";
import type {
  CompleteUploadPayloadDto,
  CompleteUploadResponseDto,
  CreateUploadUrlPayloadDto,
  CreateUploadUrlResponseDto,
  GetDownloadUrlResponseDto,
  MediaObjectRecord,
} from "./media.types";

const ensureId = (prefix: string) =>
  typeof crypto.randomUUID === "function"
    ? `${prefix}_${crypto.randomUUID()}`
    : `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

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

@Injectable()
export class MediaService implements OnModuleInit {
  constructor(
    private readonly mediaRepository: MediaRepository,
    private readonly mediaStorageService: MediaStorageService
  ) {}

  async onModuleInit() {
    await this.mediaRepository.ensureSchema();
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
      throw new HttpException(
        { error: "fileName и contentType обязательны." },
        400
      );
    }

    const fileName = sanitizeFileName(fileNameRaw);
    const objectId = ensureId("media");
    const datePrefix = new Date().toISOString().slice(0, 10);
    const category = normalizeCategory(params.payload.category);
    const objectKey = `${this.mediaStorageService.getAppEnv()}/${category}/${actorUser.id}/${datePrefix}/${objectId}_${fileName}`;

    const createdAt = nowIso();
    const record: MediaObjectRecord = {
      id: objectId,
      objectKey,
      bucket: this.mediaStorageService.getBucket(),
      ownerUserId: actorUser.id,
      category,
      contentType,
      sizeBytes: toByteSize(params.payload.sizeBytes),
      state: "pending_upload",
      createdAt,
      updatedAt: createdAt,
    };
    await this.mediaRepository.insertPending(record);

    const signed = await this.mediaStorageService.createSignedUploadUrl({
      objectKey,
      contentType,
    });

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
      throw new HttpException({ error: "Файл еще не загружен в storage." }, 409);
    }

    const updated = await this.mediaRepository.markUploaded({
      id: media.id,
      sizeBytes: toByteSize(params.payload?.sizeBytes) ?? head.contentLength,
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
      throw new HttpException(
        { error: "Файл еще не готов к скачиванию." },
        409
      );
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
      throw new HttpException({ error: "Недостаточно прав для media объекта." }, 403);
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
      throw new HttpException(
        { error: "Файл еще не готов к скачиванию." },
        409
      );
    }
    return media;
  }
}
