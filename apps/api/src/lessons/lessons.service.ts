import { HttpException, Injectable, OnModuleInit } from "@nestjs/common";
import type { AuthUserDto } from "../auth/auth.types";
import { getApiRuntimeConfig } from "../config/runtime.config";
import { DatabaseService } from "../db/database.service";
import { MediaService } from "../media/media.service";
import { readReadSliceSeedData, upsertLessons } from "../seed/readSlice.seed";
import { markFullLessonContent, redactLessonForPreview } from "./lessons.redaction";
import { sanitizePersistedMediaUrl } from "./lessons.mapper";
import { LessonsRepository } from "./lessons.repository";
import type {
  LessonDto,
  LessonMaterialAccessDto,
  LessonPlaybackAccessDto,
} from "./lessons.types";

type CourseAccessMode = "full" | "preview";

const normalizeLessonInput = (lesson: LessonDto, courseId: string, order: number): LessonDto => ({
  id: lesson.id.trim(),
  courseId,
  title: lesson.title.trim(),
  order: Math.max(1, Math.floor(order)),
  duration: Math.max(0, Math.floor(Number(lesson.duration) || 0)),
  videoMediaObjectId: lesson.videoMediaObjectId?.trim() || undefined,
  videoUrl: sanitizePersistedMediaUrl(lesson.videoUrl),
  videoStreamUrl: sanitizePersistedMediaUrl(lesson.videoStreamUrl),
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
          mediaObjectId: material.mediaObjectId?.trim() || undefined,
          url: sanitizePersistedMediaUrl(material.url),
          downloadable:
            typeof material.downloadable === "boolean"
              ? material.downloadable
              : undefined,
        }))
        .filter((material) => Boolean(material.mediaObjectId || material.url))
    : undefined,
  settings: lesson.settings,
});

const collectLessonMediaObjectIds = (lesson: LessonDto): string[] => {
  const ids = new Set<string>();
  const videoId = lesson.videoMediaObjectId?.trim();
  if (videoId) ids.add(videoId);
  for (const material of lesson.materials ?? []) {
    const mediaObjectId = material.mediaObjectId?.trim();
    if (mediaObjectId) ids.add(mediaObjectId);
  }
  return [...ids];
};

const collectLessonsMediaObjectIds = (lessons: LessonDto[]): string[] => {
  const ids = new Set<string>();
  for (const lesson of lessons) {
    for (const id of collectLessonMediaObjectIds(lesson)) {
      ids.add(id);
    }
  }
  return [...ids];
};

const diffDetachedMediaObjectIds = (params: {
  previousLessons: LessonDto[];
  nextLessons: LessonDto[];
}): string[] => {
  const previous = new Set(collectLessonsMediaObjectIds(params.previousLessons));
  const next = new Set(collectLessonsMediaObjectIds(params.nextLessons));
  return [...previous].filter((id) => !next.has(id));
};

@Injectable()
export class LessonsService implements OnModuleInit {
  private readonly runtimeConfig = getApiRuntimeConfig();

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly lessonsRepository: LessonsRepository,
    private readonly mediaService: MediaService
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
    const previousDraftLesson = await this.lessonsRepository.findDraftById(normalized.id);
    const detachedMediaIds =
      previousDraftLesson && previousDraftLesson.courseId === courseId
      ? diffDetachedMediaObjectIds({
          previousLessons: [previousDraftLesson],
          nextLessons: [normalized],
        })
      : [];
    await this.lessonsRepository.upsertOne(normalized);
    if (detachedMediaIds.length > 0) {
      await this.mediaService.releaseMediaObjects({
        objectIds: detachedMediaIds,
        reason: "lesson_save_detach",
      });
    }
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
    const previousLessons = await this.lessonsRepository.findDraftByCourse(courseId);
    const normalizedLessons = params.lessons.map((lesson, index) =>
      normalizeLessonInput(lesson, courseId, index + 1)
    );
    const invalidLesson = normalizedLessons.find((lesson) => !lesson.id || !lesson.title);
    if (invalidLesson) {
      throw new HttpException({ error: "Все уроки должны иметь id и title." }, 400);
    }
    await this.lessonsRepository.replaceByCourse(courseId, normalizedLessons);
    const detachedMediaIds = diffDetachedMediaObjectIds({
      previousLessons,
      nextLessons: normalizedLessons,
    });
    if (detachedMediaIds.length > 0) {
      await this.mediaService.releaseMediaObjects({
        objectIds: detachedMediaIds,
        reason: "lessons_replace_detach",
      });
    }
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
    const previousLessons = await this.lessonsRepository.findDraftByCourse(
      normalizedCourseId
    );
    await this.lessonsRepository.deleteByCourse(normalizedCourseId);
    const detachedMediaIds = collectLessonsMediaObjectIds(previousLessons);
    if (detachedMediaIds.length > 0) {
      await this.mediaService.releaseMediaObjects({
        objectIds: detachedMediaIds,
        reason: "lessons_delete_by_course",
      });
    }
  }

  async getLessonPlaybackAccess(
    lessonId: string,
    actorUser?: AuthUserDto | null
  ): Promise<LessonPlaybackAccessDto> {
    const lesson = await this.requireFullLessonAccess(lessonId, actorUser);

    const mediaObjectId = lesson.videoMediaObjectId?.trim();
    if (mediaObjectId) {
      const signed = await this.mediaService.getRuntimeDownloadUrlByObjectId(
        mediaObjectId
      );
      return {
        lessonId: lesson.id,
        source: "media",
        playbackUrl: signed.downloadUrl,
        expiresAt: signed.expiresAt,
      };
    }

    const externalSource =
      lesson.videoStreamUrl?.trim() || lesson.videoUrl?.trim();
    if (externalSource) {
      return {
        lessonId: lesson.id,
        source: "external",
        playbackUrl: externalSource,
        expiresAt: null,
      };
    }

    throw new HttpException({ error: "Видео для урока не настроено." }, 409);
  }

  async getLessonMaterialAccess(
    params: { lessonId: string; materialId: string },
    actorUser?: AuthUserDto | null
  ): Promise<LessonMaterialAccessDto> {
    const lesson = await this.requireFullLessonAccess(params.lessonId, actorUser);
    const materialId = params.materialId.trim();
    if (!materialId) {
      throw new HttpException({ error: "materialId обязателен." }, 400);
    }

    const material = lesson.materials?.find((item) => item.id === materialId);
    if (!material) {
      throw new HttpException({ error: "Материал урока не найден." }, 404);
    }

    const downloadsDisabledByLesson =
      lesson.settings?.disablePrintableDownloads === true &&
      (material.type === "pdf" || material.type === "doc");
    const downloadable =
      material.downloadable !== false && !downloadsDisabledByLesson;

    const mediaObjectId = material.mediaObjectId?.trim();
    if (mediaObjectId) {
      const signed = await this.mediaService.getRuntimeDownloadUrlByObjectId(
        mediaObjectId
      );
      return {
        lessonId: lesson.id,
        materialId: material.id,
        source: "media",
        accessUrl: signed.downloadUrl,
        expiresAt: signed.expiresAt,
        downloadable,
      };
    }

    const externalUrl = material.url?.trim();
    if (externalUrl) {
      return {
        lessonId: lesson.id,
        materialId: material.id,
        source: "external",
        accessUrl: externalUrl,
        expiresAt: null,
        downloadable,
      };
    }

    throw new HttpException({ error: "Материал урока не готов." }, 409);
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
      const ownedCourseRows = await this.databaseService.query<{ id: string }>(
        `
          SELECT id
          FROM courses_catalog
          WHERE teacher_id = $1
            AND id = ANY($2::text[])
        `,
        [actorUser.id, courseIds]
      );
      const ownedCourseIds = new Set(ownedCourseRows.map((row) => row.id));
      for (const courseId of courseIds) {
        accessMap.set(courseId, ownedCourseIds.has(courseId) ? "full" : "preview");
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

  private async requireFullLessonAccess(
    lessonId: string,
    actorUser?: AuthUserDto | null
  ): Promise<LessonDto> {
    if (!actorUser?.id) {
      throw new HttpException({ error: "Требуется авторизация." }, 401);
    }
    const normalizedLessonId = lessonId.trim();
    if (!normalizedLessonId) {
      throw new HttpException({ error: "lessonId обязателен." }, 400);
    }

    const draftLesson = await this.lessonsRepository.findDraftById(normalizedLessonId);
    if (
      draftLesson &&
      (await this.isTeacherOwnerOfCourse(actorUser, draftLesson.courseId))
    ) {
      return markFullLessonContent(draftLesson);
    }

    const lesson = await this.lessonsRepository.findPublishedById(normalizedLessonId);
    if (!lesson) {
      throw new HttpException({ error: "Урок не найден." }, 404);
    }

    const accessModes = await this.resolveCourseAccessModes(
      [lesson.courseId],
      actorUser
    );
    if (accessModes.get(lesson.courseId) !== "full") {
      throw new HttpException(
        { error: "Нет доступа к полному контенту урока." },
        403
      );
    }
    return markFullLessonContent(lesson);
  }
}
