import { HttpException, Injectable, OnModuleInit } from "@nestjs/common";
import type { AuthUserDto } from "../auth/auth.types";
import { ensureId } from "../purchases/purchases.helpers";
import { NewsRepository } from "./news.repository";
import type {
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

const canStudentViewNews = (item: NewsPostDto, studentId: string) => {
  if (item.visibility !== "course_students") return true;
  const targetUserIds = Array.isArray(item.targetUserIds) ? item.targetUserIds : [];
  if (targetUserIds.length === 0) return true;
  return targetUserIds.includes(studentId);
};

@Injectable()
export class NewsService implements OnModuleInit {
  constructor(private readonly newsRepository: NewsRepository) {}

  async onModuleInit() {
    await this.newsRepository.ensureSchema();
  }

  async listForActor(actorUser: AuthUserDto): Promise<NewsPostDto[]> {
    const all = await this.newsRepository.listAll();
    if (actorUser.role === "teacher") {
      return all;
    }
    return all.filter((item) => canStudentViewNews(item, actorUser.id));
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
    return this.newsRepository.insert({
      id: ensureId("news"),
      authorId: params.actorUser.id,
      authorName: `${params.actorUser.firstName} ${params.actorUser.lastName}`.trim(),
      title,
      content,
      tone,
      highlighted: params.payload.highlighted === true,
      imageUrl: trimOrNull(params.payload.imageUrl),
      externalUrl: trimOrNull(params.payload.externalUrl),
      visibility,
      targetCourseId: trimOrNull(params.payload.targetCourseId),
      targetUserIds,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
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
    return updated;
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

    const deleted = await this.newsRepository.deleteById(post.id);
    if (!deleted) {
      throw new HttpException({ error: "Объявление не найдено." }, 404);
    }
    return { id: post.id };
  }
}
