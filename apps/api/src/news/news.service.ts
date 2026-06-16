import { HttpException, Injectable, OnModuleInit } from "@nestjs/common";
import type { AuthUserDto } from "../auth/auth.types";
import { MediaService } from "../media/media.service";
import { ensureId } from "../purchases/purchases.helpers";
import { NewsRepository } from "./news.repository";
import type {
  NewsAttachmentDto,
  NewsAttachmentKind,
  CreateNewsPostPayloadDto,
  NewsPostDto,
  NewsTone,
  NewsVisibility,
  UpdateNewsPostPayloadDto,
} from "./news.types";

const nowIso = () => new Date().toISOString();

const ALLOWED_TONES = new Set<NewsTone>([
  "general",
  "exam",
  "achievement",
  "important",
  "course_update",
]);

const ALLOWED_VISIBILITY = new Set<NewsVisibility>(["all", "course_students"]);
const ALLOWED_ATTACHMENT_KINDS = new Set<NewsAttachmentKind>(["image", "video"]);
const MAX_ATTACHMENTS_PER_NEWS = 8;

const trimOrNull = (value: string | undefined) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeTargetUserIds = (value: string[] | undefined) => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0)
    )
  );
};

const normalizeAttachments = (
  value: NewsAttachmentDto[] | undefined
): NewsAttachmentDto[] => {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_ATTACHMENTS_PER_NEWS)
    .reduce<NewsAttachmentDto[]>((acc, item, index) => {
      if (!item || typeof item !== "object") return acc;
      const id =
        typeof item.id === "string" && item.id.trim().length > 0
          ? item.id.trim()
          : `attachment_${Date.now().toString(36)}_${index + 1}`;
      const kindCandidate =
        typeof item.kind === "string" ? item.kind.trim().toLowerCase() : "";
      if (!ALLOWED_ATTACHMENT_KINDS.has(kindCandidate as NewsAttachmentKind)) {
        return acc;
      }
      const mediaObjectId =
        typeof item.mediaObjectId === "string"
          ? item.mediaObjectId.trim() || undefined
          : undefined;
      const url =
        typeof item.url === "string" ? item.url.trim() || undefined : undefined;
      if (!mediaObjectId && !url) return acc;
      const downloadable =
        typeof item.downloadable === "boolean" ? item.downloadable : true;
      const fileName =
        typeof item.fileName === "string"
          ? item.fileName.trim() || undefined
          : undefined;
      const contentType =
        typeof item.contentType === "string"
          ? item.contentType.trim() || undefined
          : undefined;
      acc.push({
        id,
        kind: kindCandidate as NewsAttachmentKind,
        mediaObjectId,
        url,
        downloadable,
        fileName,
        contentType,
      });
      return acc;
    }, []);
};

const collectAttachmentMediaObjectIds = (
  attachments: NewsAttachmentDto[] | undefined
): string[] => {
  if (!Array.isArray(attachments)) return [];
  return Array.from(
    new Set(
      attachments
        .map((attachment) =>
          typeof attachment.mediaObjectId === "string"
            ? attachment.mediaObjectId.trim()
            : ""
        )
        .filter((item) => item.length > 0)
    )
  );
};

const diffDetachedAttachmentMediaObjectIds = (params: {
  previousAttachments: NewsAttachmentDto[] | undefined;
  nextAttachments: NewsAttachmentDto[] | undefined;
}): string[] => {
  const previous = collectAttachmentMediaObjectIds(params.previousAttachments);
  if (previous.length === 0) return [];
  const next = new Set(collectAttachmentMediaObjectIds(params.nextAttachments));
  return previous.filter((mediaObjectId) => !next.has(mediaObjectId));
};

const canStudentViewNews = (item: NewsPostDto, studentId: string) => {
  if (item.visibility !== "course_students") return true;
  const targetUserIds = Array.isArray(item.targetUserIds) ? item.targetUserIds : [];
  if (targetUserIds.length === 0) return true;
  return targetUserIds.includes(studentId);
};

@Injectable()
export class NewsService implements OnModuleInit {
  constructor(
    private readonly newsRepository: NewsRepository,
    private readonly mediaService: MediaService
  ) {}

  async onModuleInit() {
    await this.newsRepository.ensureSchema();
  }

  async listForActor(actorUser: AuthUserDto): Promise<NewsPostDto[]> {
    const all = await this.newsRepository.listAll();
    if (actorUser.role === "teacher") {
      return this.hydrateNewsFeed(all);
    }
    return this.hydrateNewsFeed(
      all.filter((item) => canStudentViewNews(item, actorUser.id))
    );
  }

  private async hydrateNewsFeed(items: NewsPostDto[]): Promise<NewsPostDto[]> {
    const mediaCache = new Map<string, { url: string; expiresAt?: string }>();
    return Promise.all(items.map((item) => this.hydrateNewsPost(item, mediaCache)));
  }

  private async hydrateNewsPost(
    item: NewsPostDto,
    mediaCache: Map<string, { url: string; expiresAt?: string }>
  ): Promise<NewsPostDto> {
    const sourceAttachments = Array.isArray(item.attachments) ? item.attachments : [];
    const legacyImageAttachment: NewsAttachmentDto[] =
      sourceAttachments.length === 0 && item.imageUrl
        ? [
            {
              id: `legacy_image_${item.id}`,
              kind: "image" as const,
              url: item.imageUrl,
              downloadable: false,
            },
          ]
        : [];
    const merged = [...sourceAttachments, ...legacyImageAttachment];
    if (merged.length === 0) {
      return {
        ...item,
        attachments: [],
      };
    }

    const hydrated = await Promise.all(
      merged.map(async (attachment) => {
        const mediaObjectId = attachment.mediaObjectId?.trim();
        if (!mediaObjectId) {
          return {
            ...attachment,
            accessUrl: attachment.url,
            accessUrlExpiresAt: undefined,
            downloadable: attachment.downloadable ?? true,
          };
        }

        const cached = mediaCache.get(mediaObjectId);
        if (cached) {
          return {
            ...attachment,
            accessUrl: cached.url,
            accessUrlExpiresAt: cached.expiresAt,
            downloadable: attachment.downloadable ?? true,
          };
        }

        try {
          const access = await this.mediaService.getRuntimeDownloadUrlByObjectId(
            mediaObjectId
          );
          const resolved = {
            url: access.downloadUrl,
            expiresAt: access.expiresAt,
          };
          mediaCache.set(mediaObjectId, resolved);
          return {
            ...attachment,
            accessUrl: resolved.url,
            accessUrlExpiresAt: resolved.expiresAt,
            downloadable: attachment.downloadable ?? true,
          };
        } catch {
          return {
            ...attachment,
            accessUrl: attachment.url,
            accessUrlExpiresAt: undefined,
            downloadable: attachment.downloadable ?? true,
          };
        }
      })
    );

    return {
      ...item,
      attachments: hydrated,
    };
  }

  private async releaseNewsMediaObjectIds(
    objectIds: string[],
    reason: string
  ): Promise<void> {
    const normalized = Array.from(
      new Set(objectIds.map((item) => item.trim()).filter(Boolean))
    );
    if (normalized.length === 0) return;

    try {
      await this.mediaService.releaseMediaObjects({
        objectIds: normalized,
        reason,
      });
    } catch (error) {
      if (typeof console !== "undefined") {
        console.warn("[news] media-release-failed", {
          objectIds: normalized,
          reason,
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

  async create(params: {
    actorUser: AuthUserDto;
    payload: CreateNewsPostPayloadDto;
  }): Promise<NewsPostDto> {
    if (params.actorUser.role !== "teacher") {
      throw new HttpException({ error: "Доступ только для преподавателя." }, 403);
    }

    const title = trimOrNull(params.payload.title);
    const content = trimOrNull(params.payload.content);
    if (!title || !content) {
      throw new HttpException(
        { error: "Укажите заголовок и текст объявления." },
        400
      );
    }

    const tone = params.payload.tone;
    if (!tone || !ALLOWED_TONES.has(tone)) {
      throw new HttpException({ error: "Некорректная категория объявления." }, 400);
    }

    const visibility =
      params.payload.visibility && ALLOWED_VISIBILITY.has(params.payload.visibility)
        ? params.payload.visibility
        : "all";
    const targetUserIds = normalizeTargetUserIds(params.payload.targetUserIds);

    const actorId = trimOrNull(params.payload.authorId);
    if (actorId && actorId !== params.actorUser.id) {
      throw new HttpException(
        { error: "Недостаточно прав для публикации от имени другого пользователя." },
        403
      );
    }

    const timestamp = nowIso();
    const created = await this.newsRepository.insert({
      id: ensureId("news"),
      authorId: params.actorUser.id,
      authorName: `${params.actorUser.firstName} ${params.actorUser.lastName}`.trim(),
      title,
      content,
      tone,
      highlighted: params.payload.highlighted === true,
      imageUrl: trimOrNull(params.payload.imageUrl),
      attachments: normalizeAttachments(params.payload.attachments),
      externalUrl: trimOrNull(params.payload.externalUrl),
      visibility,
      targetCourseId: trimOrNull(params.payload.targetCourseId),
      targetUserIds,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return this.hydrateNewsPost(created, new Map());
  }

  async update(params: {
    actorUser: AuthUserDto;
    newsId: string;
    actorId: string | undefined;
    payload: UpdateNewsPostPayloadDto;
  }): Promise<NewsPostDto> {
    if (params.actorUser.role !== "teacher") {
      throw new HttpException({ error: "Доступ только для преподавателя." }, 403);
    }

    const post = await this.newsRepository.findById(params.newsId);
    if (!post) {
      throw new HttpException({ error: "Объявление не найдено." }, 404);
    }
    if (post.authorId !== params.actorUser.id) {
      throw new HttpException(
        { error: "Можно редактировать только свои объявления." },
        403
      );
    }
    if (params.actorId?.trim() && params.actorId.trim() !== params.actorUser.id) {
      throw new HttpException({ error: "Недостаточно прав." }, 403);
    }

    const title = trimOrNull(params.payload.title) ?? post.title;
    const content = trimOrNull(params.payload.content) ?? post.content;
    const tone = params.payload.tone ?? post.tone;
    if (!ALLOWED_TONES.has(tone)) {
      throw new HttpException({ error: "Некорректная категория объявления." }, 400);
    }
    const visibilityCandidate = params.payload.visibility ?? post.visibility ?? "all";
    if (!ALLOWED_VISIBILITY.has(visibilityCandidate)) {
      throw new HttpException({ error: "Некорректная видимость объявления." }, 400);
    }

    const nextAttachments =
      params.payload.attachments !== undefined
        ? normalizeAttachments(params.payload.attachments)
        : normalizeAttachments(post.attachments);
    const detachedMediaIds = diffDetachedAttachmentMediaObjectIds({
      previousAttachments: post.attachments,
      nextAttachments,
    });

    const updated = await this.newsRepository.update({
      id: post.id,
      title,
      content,
      tone,
      highlighted:
        typeof params.payload.highlighted === "boolean"
          ? params.payload.highlighted
          : post.highlighted,
      imageUrl:
        params.payload.imageUrl !== undefined
          ? trimOrNull(params.payload.imageUrl)
          : trimOrNull(post.imageUrl),
      attachments: nextAttachments,
      externalUrl:
        params.payload.externalUrl !== undefined
          ? trimOrNull(params.payload.externalUrl)
          : trimOrNull(post.externalUrl),
      visibility: visibilityCandidate,
      targetCourseId:
        params.payload.targetCourseId !== undefined
          ? trimOrNull(params.payload.targetCourseId)
          : trimOrNull(post.targetCourseId),
      targetUserIds:
        params.payload.targetUserIds !== undefined
          ? normalizeTargetUserIds(params.payload.targetUserIds)
          : normalizeTargetUserIds(post.targetUserIds),
      updatedAt: nowIso(),
    });
    if (!updated) {
      throw new HttpException({ error: "Объявление не найдено." }, 404);
    }
    await this.releaseNewsMediaObjectIds(detachedMediaIds, "news_update_detach");
    return this.hydrateNewsPost(updated, new Map());
  }

  async delete(params: {
    actorUser: AuthUserDto;
    newsId: string;
    actorId?: string;
  }): Promise<{ id: string }> {
    if (params.actorUser.role !== "teacher") {
      throw new HttpException({ error: "Доступ только для преподавателя." }, 403);
    }
    const post = await this.newsRepository.findById(params.newsId);
    if (!post) {
      throw new HttpException({ error: "Объявление не найдено." }, 404);
    }
    if (post.authorId !== params.actorUser.id) {
      throw new HttpException(
        { error: "Можно удалять только свои объявления." },
        403
      );
    }
    if (params.actorId?.trim() && params.actorId.trim() !== params.actorUser.id) {
      throw new HttpException({ error: "Недостаточно прав." }, 403);
    }

    const detachedMediaIds = collectAttachmentMediaObjectIds(post.attachments);
    const deleted = await this.newsRepository.deleteById(post.id);
    if (!deleted) {
      throw new HttpException({ error: "Объявление не найдено." }, 404);
    }
    await this.releaseNewsMediaObjectIds(detachedMediaIds, "news_delete");
    return { id: post.id };
  }
}
