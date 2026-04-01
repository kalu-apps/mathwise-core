import { Injectable, OnModuleInit } from "@nestjs/common";
import type { AuthUserDto } from "../auth/auth.types";
import { DatabaseService } from "../db/database.service";
import { getApiRuntimeConfig } from "../config/runtime.config";
import { LessonsRepository } from "./lessons.repository";
import type { LessonDto } from "./lessons.types";
import { readReadSliceSeedData, upsertLessons } from "../seed/readSlice.seed";
import { markFullLessonContent, redactLessonForPreview } from "./lessons.redaction";

type CourseAccessMode = "full" | "preview";

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
    const lessons = await this.lessonsRepository.findAll(params?.courseId);
    if (lessons.length === 0) return [];
    const uniqueCourseIds = [...new Set(lessons.map((lesson) => lesson.courseId))];
    const accessModes = await this.resolveCourseAccessModes(
      uniqueCourseIds,
      params?.actorUser
    );
    return lessons.map((lesson) =>
      accessModes.get(lesson.courseId) === "full"
        ? markFullLessonContent(lesson)
        : redactLessonForPreview(lesson)
    );
  }

  async getLessonById(
    lessonId: string,
    actorUser?: AuthUserDto | null
  ): Promise<LessonDto | null> {
    const normalized = lessonId.trim();
    if (!normalized) return null;
    const lesson = await this.lessonsRepository.findById(normalized);
    if (!lesson) return null;
    const accessModes = await this.resolveCourseAccessModes([lesson.courseId], actorUser);
    if (accessModes.get(lesson.courseId) === "full") {
      return markFullLessonContent(lesson);
    }
    return redactLessonForPreview(lesson);
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
