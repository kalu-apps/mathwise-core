import { HttpException, Injectable, OnModuleInit } from "@nestjs/common";
import type { AuthUserDto } from "../auth/auth.types";
import { getApiRuntimeConfig } from "../config/runtime.config";
import { DatabaseService } from "../db/database.service";
import { LessonsRepository } from "../lessons/lessons.repository";
import { readReadSliceSeedData, upsertCourses } from "../seed/readSlice.seed";
import { ensureId } from "../shared/id";
import { CoursesRepository } from "./courses.repository";
import type {
  CourseAssessmentReleaseItemDto,
  CourseCatalogItemDto,
  PublishCourseResponseDto,
} from "./courses.types";

const nowIso = () => new Date().toISOString();

const normalizeCourseStatus = (value: unknown): CourseCatalogItemDto["status"] => {
  return value === "published" ? "published" : "draft";
};

const normalizeDraftCourseInput = (
  input: CourseCatalogItemDto,
  actorTeacherId: string
): CourseCatalogItemDto => {
  return {
    id: input.id.trim(),
    title: input.title.trim(),
    description: input.description.trim(),
    level: input.level.trim(),
    priceGuided: Math.max(0, Math.round(Number(input.priceGuided) || 0)),
    priceSelf: Math.max(0, Math.round(Number(input.priceSelf) || 0)),
    teacherId: actorTeacherId,
    status: normalizeCourseStatus(input.status),
  };
};

@Injectable()
export class CoursesService implements OnModuleInit {
  private readonly runtimeConfig = getApiRuntimeConfig();

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly coursesRepository: CoursesRepository,
    private readonly lessonsRepository: LessonsRepository
  ) {}

  async onModuleInit() {
    await this.coursesRepository.ensureSchema();
    if (!this.runtimeConfig.coursesSeedOnBoot) return;
    const hasData = await this.coursesRepository.hasAnyCourses();
    if (hasData) return;
    const seed = readReadSliceSeedData(this.runtimeConfig.coursesSeedSourceFile);
    await upsertCourses(this.databaseService, seed.courses);
  }

  async getCatalog(): Promise<CourseCatalogItemDto[]> {
    return this.coursesRepository.findAllPublishedCatalog();
  }

  async getById(
    courseId: string,
    actorUser?: AuthUserDto | null
  ): Promise<CourseCatalogItemDto | null> {
    const normalizedId = courseId.trim();
    if (!normalizedId) return null;

    const draft = await this.coursesRepository.findDraftById(normalizedId);
    if (draft && actorUser?.role === "teacher" && draft.teacherId === actorUser.id) {
      return draft;
    }

    return this.coursesRepository.findPublishedById(normalizedId);
  }

  async getTeacherDrafts(actorUser: AuthUserDto | null): Promise<CourseCatalogItemDto[]> {
    if (!actorUser || actorUser.role !== "teacher") {
      throw new HttpException({ error: "Доступ только для преподавателя." }, 403);
    }
    return this.coursesRepository.findAllDraftsByTeacher(actorUser.id);
  }

  async createDraft(
    payload: CourseCatalogItemDto,
    actorUser: AuthUserDto | null
  ): Promise<CourseCatalogItemDto> {
    if (!actorUser || actorUser.role !== "teacher") {
      throw new HttpException({ error: "Доступ только для преподавателя." }, 403);
    }
    const normalized = normalizeDraftCourseInput(payload, actorUser.id);
    if (!normalized.id || !normalized.title) {
      throw new HttpException({ error: "id и title обязательны." }, 400);
    }
    return this.coursesRepository.upsertDraft({
      ...normalized,
      status: "draft",
    });
  }

  async updateDraft(
    courseId: string,
    payload: CourseCatalogItemDto,
    actorUser: AuthUserDto | null
  ): Promise<CourseCatalogItemDto> {
    if (!actorUser || actorUser.role !== "teacher") {
      throw new HttpException({ error: "Доступ только для преподавателя." }, 403);
    }
    const normalizedId = courseId.trim();
    if (!normalizedId) {
      throw new HttpException({ error: "courseId обязателен." }, 400);
    }
    const existing = await this.coursesRepository.findDraftById(normalizedId);
    if (!existing) {
      throw new HttpException({ error: "Курс не найден." }, 404);
    }
    if (existing.teacherId !== actorUser.id) {
      throw new HttpException({ error: "Нет доступа к чужому курсу." }, 403);
    }
    const normalized = normalizeDraftCourseInput(payload, actorUser.id);
    if (!normalized.title) {
      throw new HttpException({ error: "title обязателен." }, 400);
    }
    return this.coursesRepository.upsertDraft({
      ...normalized,
      id: normalizedId,
      status: "draft",
    });
  }

  async deleteDraft(courseId: string, actorUser: AuthUserDto | null): Promise<void> {
    if (!actorUser || actorUser.role !== "teacher") {
      throw new HttpException({ error: "Доступ только для преподавателя." }, 403);
    }
    const normalizedId = courseId.trim();
    if (!normalizedId) {
      throw new HttpException({ error: "courseId обязателен." }, 400);
    }
    const existing = await this.coursesRepository.findDraftById(normalizedId);
    if (!existing) {
      return;
    }
    if (existing.teacherId !== actorUser.id) {
      throw new HttpException({ error: "Нет доступа к чужому курсу." }, 403);
    }
    await this.lessonsRepository.deleteByCourse(normalizedId);
    await this.coursesRepository.deleteDraft(normalizedId);
  }

  async publishCourse(params: {
    courseId: string;
    actorUser: AuthUserDto | null;
    assessmentsSnapshot?: CourseAssessmentReleaseItemDto[];
  }): Promise<PublishCourseResponseDto> {
    const { actorUser } = params;
    if (!actorUser || actorUser.role !== "teacher") {
      throw new HttpException({ error: "Публикация доступна только преподавателю." }, 403);
    }
    const courseId = params.courseId.trim();
    if (!courseId) {
      throw new HttpException({ error: "courseId обязателен." }, 400);
    }

    const course = await this.coursesRepository.findDraftById(courseId);
    if (!course) {
      throw new HttpException({ error: "Курс не найден." }, 404);
    }
    if (course.teacherId !== actorUser.id) {
      throw new HttpException({ error: "Нельзя публиковать чужой курс." }, 403);
    }

    const lessons = await this.lessonsRepository.findDraftByCourse(courseId);
    if (lessons.length === 0) {
      throw new HttpException({ error: "Нельзя публиковать курс без уроков." }, 409);
    }

    for (const lesson of lessons) {
      const hasVideo = Boolean(
        lesson.videoStreamUrl?.trim() || lesson.videoUrl?.trim()
      );
      if (!hasVideo) {
        throw new HttpException(
          { error: `Урок «${lesson.title}» не готов: отсутствует видео.` },
          409
        );
      }
      if (
        lesson.mediaJobStatus === "queued" ||
        lesson.mediaJobStatus === "processing"
      ) {
        throw new HttpException(
          {
            error: `Урок «${lesson.title}» еще обрабатывается. Дождитесь готовности media.`,
          },
          409
        );
      }
      if (lesson.mediaJobStatus === "failed") {
        throw new HttpException(
          {
            error: `Урок «${lesson.title}» содержит неуспешную media-обработку.`,
          },
          409
        );
      }
    }

    const publishedAt = nowIso();
    const assessmentsSnapshot = Array.isArray(params.assessmentsSnapshot)
      ? params.assessmentsSnapshot
      : await this.resolveAssessmentsSnapshotFromState(courseId);
    const releaseId = ensureId("course_release");
    const release = await this.coursesRepository.publishDraft({
      releaseId,
      courseId,
      createdByTeacherId: actorUser.id,
      publishedAt,
      courseSnapshot: {
        ...course,
        status: "published",
      },
      lessonsSnapshot: lessons.map((lesson) => ({
        ...lesson,
        contentVisibility: "entitled_full" as const,
      })),
      assessmentsSnapshot,
    });

    return {
      courseId,
      releaseId: release.releaseId,
      version: release.version,
      publishedAt,
      lessonsCount: lessons.length,
      assessmentsCount: assessmentsSnapshot.length,
    };
  }

  private async resolveAssessmentsSnapshotFromState(
    courseId: string
  ): Promise<CourseAssessmentReleaseItemDto[]> {
    try {
      const rows = await this.databaseService.query<{ payload: unknown }>(
        `
          SELECT payload_json AS payload
          FROM assessments_state_store
          WHERE id = 'state'
          LIMIT 1
        `
      );
      const payload = rows[0]?.payload;
      if (!payload || typeof payload !== "object") return [];
      const source = payload as Record<string, unknown>;
      if (
        !source.courseContent ||
        typeof source.courseContent !== "object" ||
        Array.isArray(source.courseContent)
      ) {
        return [];
      }
      const contentByCourse = source.courseContent as Record<string, unknown>;
      const contentItems = contentByCourse[courseId];
      if (!Array.isArray(contentItems)) return [];

      return contentItems
        .map((item): CourseAssessmentReleaseItemDto | null => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return null;
          const record = item as Record<string, unknown>;
          const id = typeof record.id === "string" ? record.id.trim() : "";
          const blockId =
            typeof record.blockId === "string" ? record.blockId.trim() : "";
          const type = record.type === "lesson" || record.type === "test" ? record.type : null;
          if (!id || !blockId || !type) return null;

          const orderRaw = Number(record.order);
          const order = Number.isFinite(orderRaw) ? Math.max(1, Math.floor(orderRaw)) : 1;
          const createdAt =
            typeof record.createdAt === "string" && record.createdAt.trim().length > 0
              ? record.createdAt
              : nowIso();

          return {
            id,
            courseId,
            blockId,
            type,
            order,
            createdAt,
            lessonId:
              typeof record.lessonId === "string" ? record.lessonId : undefined,
            templateId:
              typeof record.templateId === "string" ? record.templateId : undefined,
            titleSnapshot:
              typeof record.titleSnapshot === "string"
                ? record.titleSnapshot
                : undefined,
            templateSnapshot:
              record.templateSnapshot && typeof record.templateSnapshot === "object"
                ? record.templateSnapshot
                : undefined,
          };
        })
        .filter(
          (item): item is CourseAssessmentReleaseItemDto =>
            Boolean(item)
        )
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    } catch {
      return [];
    }
  }
}
