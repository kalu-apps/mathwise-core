import { HttpException, Injectable, OnModuleInit } from "@nestjs/common";
import type { AuthUserDto } from "../auth/auth.types";
import { getApiRuntimeConfig } from "../config/runtime.config";
import { DatabaseService } from "../db/database.service";
import { readReadSliceSeedData, upsertLessons } from "../seed/readSlice.seed";
import { markFullLessonContent, redactLessonForPreview } from "./lessons.redaction";
import { LessonsRepository } from "./lessons.repository";
import type { LessonDto } from "./lessons.types";

type CourseAccessMode = "full" | "preview";

const normalizeLessonInput = (lesson: LessonDto, courseId: string, order: number): LessonDto => ({
  id: lesson.id.trim(),
  courseId,
  title: lesson.title.trim(),
  order: Math.max(1, Math.floor(order)),
  duration: Math.max(0, Math.floor(Number(lesson.duration) || 0)),
  videoUrl: lesson.videoUrl?.trim() || undefined,
  videoStreamUrl: lesson.videoStreamUrl?.trim() || undefined,
  videoPosterUrl: lesson.videoPosterUrl?.trim() || undefined,
  mediaJobId: lesson.mediaJobId?.trim() || undefined,
  mediaJobStatus: lesson.mediaJobStatus,
  mediaJobError: lesson.mediaJobError?.trim() || undefined,
  materials: Array.isArray(lesson.materials)
    ? lesson.materials
        .filter((material) => material?.id && material?.name)
        .map((material) => ({
          ...material,
          id: material.id.trim(),
          name: material.name.trim(),
          url: material.url.trim(),
        }))
    : undefined,
  settings: lesson.settings,
});

@Injectable()
export class LessonsService implements OnModuleInit {
  private readonly runtimeConfig = getApiRuntimeConfig();

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly lessonsRepository: LessonsRepository
  ) {}

  async onModuleInit() {
    await this.lessonsRepository.ensureSchema();
    if (!this.runtimeConfig.coursesSeedOnBoot) return;
    const hasData = await this.lessonsRepository.hasAnyLessons();
    if (hasData) return;
    const seed = readReadSliceSeedData(this.runtimeConfig.coursesSeedSourceFile);
    await upsertLessons(this.databaseService, seed.lessons);
  }

  async getLessons(
    params?: { courseId?: string; actorUser?: AuthUserDto | null }
  ): Promise<LessonDto[]> {
    const courseId = params?.courseId?.trim() || "";
    const actorUser = params?.actorUser ?? null;

    if (!courseId) {
      const lessons = await this.lessonsRepository.findPublishedAll();
      return this.applyAccessRedaction(lessons, actorUser);
    }

    const isTeacherOwner = await this.isTeacherOwnerOfCourse(actorUser, courseId);
    if (isTeacherOwner) {
      const draftLessons = await this.lessonsRepository.findDraftByCourse(courseId);
      return draftLessons.map((lesson) => markFullLessonContent(lesson));
    }

    const publishedLessons = await this.lessonsRepository.findPublishedByCourse(courseId);
    return this.applyAccessRedaction(publishedLessons, actorUser);
  }

  async getLessonById(
    lessonId: string,
    actorUser?: AuthUserDto | null
  ): Promise<LessonDto | null> {
    const normalized = lessonId.trim();
    if (!normalized) return null;

    const draftLesson = await this.lessonsRepository.findDraftById(normalized);
    if (draftLesson && (await this.isTeacherOwnerOfCourse(actorUser ?? null, draftLesson.courseId))) {
      return markFullLessonContent(draftLesson);
    }

    const lesson = await this.lessonsRepository.findPublishedById(normalized);
    if (!lesson) return null;
    const accessModes = await this.resolveCourseAccessModes([lesson.courseId], actorUser);
    if (accessModes.get(lesson.courseId) === "full") {
      return markFullLessonContent(lesson);
    }
    return redactLessonForPreview(lesson);
  }

  async saveLesson(
    payload: LessonDto,
    actorUser: AuthUserDto | null
  ): Promise<LessonDto> {
    if (!actorUser || actorUser.role !== "teacher") {
      throw new HttpException({ error: "Доступ только для преподавателя." }, 403);
    }
    const courseId = payload.courseId?.trim();
    if (!courseId) {
      throw new HttpException({ error: "courseId обязателен." }, 400);
    }
    if (!(await this.isTeacherOwnerOfCourse(actorUser, courseId))) {
      throw new HttpException({ error: "Нельзя редактировать чужой курс." }, 403);
    }
    const normalized = normalizeLessonInput(payload, courseId, payload.order);
    if (!normalized.id || !normalized.title) {
      throw new HttpException({ error: "id и title урока обязательны." }, 400);
    }
    await this.lessonsRepository.upsertOne(normalized);
    return normalized;
  }

  async replaceLessonsByCourse(
    params: {
      courseId: string;
      lessons: LessonDto[];
    },
    actorUser: AuthUserDto | null
  ): Promise<void> {
    if (!actorUser || actorUser.role !== "teacher") {
      throw new HttpException({ error: "Доступ только для преподавателя." }, 403);
    }
    const courseId = params.courseId.trim();
    if (!courseId) {
      throw new HttpException({ error: "courseId обязателен." }, 400);
    }
    if (!(await this.isTeacherOwnerOfCourse(actorUser, courseId))) {
      throw new HttpException({ error: "Нельзя редактировать чужой курс." }, 403);
    }
    const normalizedLessons = params.lessons.map((lesson, index) =>
      normalizeLessonInput(lesson, courseId, index + 1)
    );
    const invalidLesson = normalizedLessons.find((lesson) => !lesson.id || !lesson.title);
    if (invalidLesson) {
      throw new HttpException({ error: "Все уроки должны иметь id и title." }, 400);
    }
    await this.lessonsRepository.replaceByCourse(courseId, normalizedLessons);
  }

  async deleteLessonsByCourse(
    courseId: string,
    actorUser: AuthUserDto | null
  ): Promise<void> {
    if (!actorUser || actorUser.role !== "teacher") {
      throw new HttpException({ error: "Доступ только для преподавателя." }, 403);
    }
    const normalizedCourseId = courseId.trim();
    if (!normalizedCourseId) {
      throw new HttpException({ error: "courseId обязателен." }, 400);
    }
    if (!(await this.isTeacherOwnerOfCourse(actorUser, normalizedCourseId))) {
      throw new HttpException({ error: "Нельзя редактировать чужой курс." }, 403);
    }
    await this.lessonsRepository.deleteByCourse(normalizedCourseId);
  }

  private async applyAccessRedaction(
    lessons: LessonDto[],
    actorUser?: AuthUserDto | null
  ): Promise<LessonDto[]> {
    if (lessons.length === 0) return [];
    const uniqueCourseIds = [...new Set(lessons.map((lesson) => lesson.courseId))];
    const accessModes = await this.resolveCourseAccessModes(uniqueCourseIds, actorUser);
    return lessons.map((lesson) =>
      accessModes.get(lesson.courseId) === "full"
        ? markFullLessonContent(lesson)
        : redactLessonForPreview(lesson)
    );
  }

  private async isTeacherOwnerOfCourse(
    actorUser: AuthUserDto | null,
    courseId: string
  ): Promise<boolean> {
    if (!actorUser || actorUser.role !== "teacher") return false;
    const rows = await this.databaseService.query<{ teacherId: string }>(
      `
        SELECT teacher_id AS "teacherId"
        FROM courses_catalog
        WHERE id = $1
        LIMIT 1
      `,
      [courseId]
    );
    return rows[0]?.teacherId === actorUser.id;
  }

  private async resolveCourseAccessModes(
    courseIds: string[],
    actorUser?: AuthUserDto | null
  ): Promise<Map<string, CourseAccessMode>> {
    const accessMap = new Map<string, CourseAccessMode>();
    if (courseIds.length === 0) return accessMap;

    if (!actorUser?.id) {
      for (const courseId of courseIds) {
        accessMap.set(courseId, "preview");
      }
      return accessMap;
    }

    if (actorUser.role === "teacher") {
      for (const courseId of courseIds) {
        accessMap.set(courseId, "full");
      }
      return accessMap;
    }

    const userContext = await this.databaseService.query<{
      role: "student" | "teacher";
      isIdentityVerified: boolean;
    }>(
      `
        SELECT
          role,
          is_identity_verified AS "isIdentityVerified"
        FROM access_users
        WHERE id = $1
        LIMIT 1
      `,
      [actorUser.id]
    );

    const actor = userContext[0];
    if (!actor || actor.role !== "student" || !actor.isIdentityVerified) {
      for (const courseId of courseIds) {
        accessMap.set(courseId, "preview");
      }
      return accessMap;
    }

    const entitledRows = await this.databaseService.query<{ courseId: string }>(
      `
        SELECT course_id AS "courseId"
        FROM user_course_access
        WHERE user_id = $1
          AND has_active_entitlement = TRUE
          AND course_id = ANY($2::text[])
      `,
      [actorUser.id, courseIds]
    );

    const entitledCourseIds = new Set(entitledRows.map((row) => row.courseId));
    for (const courseId of courseIds) {
      accessMap.set(courseId, entitledCourseIds.has(courseId) ? "full" : "preview");
    }
    return accessMap;
  }
}
