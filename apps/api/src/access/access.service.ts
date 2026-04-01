import { Injectable, OnModuleInit } from "@nestjs/common";
import type { AuthUserDto } from "../auth/auth.types";
import { DatabaseService } from "../db/database.service";
import { getApiRuntimeConfig } from "../config/runtime.config";
import { CoursesRepository } from "../courses/courses.repository";
import { LessonsRepository } from "../lessons/lessons.repository";
import { markFullLessonContent, redactLessonForPreview } from "../lessons/lessons.redaction";
import {
  readReadSliceSeedData,
  upsertAccessReadModel,
} from "../seed/readSlice.seed";
import { AccessRepository } from "./access.repository";
import type {
  AccessMode,
  AccessReason,
  AccessRole,
  CourseAccessDecisionDto,
  CourseAccessListResponseDto,
  LessonAccessDecisionDto,
} from "./access.types";

type AccessContext = {
  role: AccessRole;
  userId?: string;
  isIdentityVerified: boolean;
  requiresAuth: boolean;
  requiresVerification: boolean;
};

@Injectable()
export class AccessService implements OnModuleInit {
  private readonly runtimeConfig = getApiRuntimeConfig();

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly coursesRepository: CoursesRepository,
    private readonly lessonsRepository: LessonsRepository,
    private readonly accessRepository: AccessRepository
  ) {}

  async onModuleInit() {
    await this.accessRepository.ensureSchema();
    if (!this.runtimeConfig.coursesSeedOnBoot) return;
    const hasUsers = await this.accessRepository.hasAnyUsers();
    if (hasUsers) return;
    const seed = readReadSliceSeedData(this.runtimeConfig.coursesSeedSourceFile);
    await upsertAccessReadModel(this.databaseService, seed.access);
  }

  async getCourseAccessList(
    actorUser?: AuthUserDto | null
  ): Promise<CourseAccessListResponseDto> {
    const isTeacher = actorUser?.role === "teacher";
    const courseIds = isTeacher && actorUser?.id
      ? [
          ...new Set([
            ...(await this.coursesRepository.findAllPublishedCatalog()).map(
              (course) => course.id
            ),
            ...(await this.coursesRepository.findAllDraftsByTeacher(
              actorUser.id
            )).map((course) => course.id),
          ]),
        ]
      : (await this.coursesRepository.findAllPublishedCatalog()).map(
          (course) => course.id
        );
    const decisions = await Promise.all(
      courseIds.map((courseId) => this.getCourseAccessDecision(courseId, actorUser))
    );
    return { decisions };
  }

  async getCourseAccessDecision(
    courseId: string,
    actorUser?: AuthUserDto | null
  ): Promise<CourseAccessDecisionDto> {
    const context = await this.resolveAccessContext(actorUser);
    const hasPublishedRelease = await this.coursesRepository.existsPublishedById(courseId);
    const hasAnyDraft = await this.coursesRepository.existsById(courseId);
    const isTeacherOwner =
      context.role === "teacher" && context.userId
        ? await this.isTeacherOwnerOfCourse(context.userId, courseId)
        : false;
    const hasVisibleCourse =
      context.role === "teacher"
        ? isTeacherOwner
          ? hasAnyDraft
          : hasPublishedRelease
        : hasPublishedRelease;

    if (!hasVisibleCourse) {
      return this.createCourseDecision({
        courseId,
        role: context.role,
        mode: "none",
        reason: "course_not_found",
        canViewCourse: false,
        canAccessPreviewLesson: false,
        canAccessAllLessons: false,
        hasActiveCourseEntitlement: false,
        isIdentityVerified: context.isIdentityVerified,
        requiresAuth: context.requiresAuth,
        requiresVerification: context.requiresVerification,
      });
    }

    if (context.role === "teacher") {
      return this.createCourseDecision({
        courseId,
        role: "teacher",
        mode: isTeacherOwner ? "full" : "preview",
        reason: "ok",
        canViewCourse: true,
        canAccessPreviewLesson: true,
        canAccessAllLessons: isTeacherOwner,
        hasActiveCourseEntitlement: isTeacherOwner,
        isIdentityVerified: true,
        requiresAuth: false,
        requiresVerification: false,
      });
    }

    if (context.role === "anonymous" || !context.userId) {
      return this.createCourseDecision({
        courseId,
        role: "anonymous",
        mode: "preview",
        reason: "anonymous",
        canViewCourse: true,
        canAccessPreviewLesson: true,
        canAccessAllLessons: false,
        hasActiveCourseEntitlement: false,
        isIdentityVerified: false,
        requiresAuth: true,
        requiresVerification: false,
      });
    }

    const hasEntitlement = await this.accessRepository.hasActiveEntitlement(
      context.userId,
      courseId
    );
    if (hasEntitlement && context.isIdentityVerified) {
      return this.createCourseDecision({
        courseId,
        role: "student",
        mode: "full",
        reason: "ok",
        canViewCourse: true,
        canAccessPreviewLesson: true,
        canAccessAllLessons: true,
        hasActiveCourseEntitlement: true,
        isIdentityVerified: true,
        requiresAuth: false,
        requiresVerification: false,
      });
    }

    return this.createCourseDecision({
      courseId,
      role: "student",
      mode: "preview",
      reason: context.isIdentityVerified
        ? "entitlement_missing"
        : "identity_unverified",
      canViewCourse: true,
      canAccessPreviewLesson: true,
      canAccessAllLessons: false,
      hasActiveCourseEntitlement: hasEntitlement,
      isIdentityVerified: context.isIdentityVerified,
      requiresAuth: false,
      requiresVerification: !context.isIdentityVerified,
    });
  }

  async getLessonAccessDecision(
    lessonId: string,
    actorUser?: AuthUserDto | null
  ): Promise<LessonAccessDecisionDto> {
    const context = await this.resolveAccessContext(actorUser);
    if (context.role === "teacher" && context.userId) {
      const draftLesson = await this.lessonsRepository.findDraftById(lessonId);
      if (
        draftLesson &&
        (await this.isTeacherOwnerOfCourse(context.userId, draftLesson.courseId))
      ) {
        return {
          lessonId: draftLesson.id,
          courseId: draftLesson.courseId,
          lessonOrder: draftLesson.order,
          role: "teacher",
          mode: "full",
          reason: "ok",
          canAccess: true,
          hasActiveCourseEntitlement: true,
          isIdentityVerified: true,
          requiresAuth: false,
          requiresVerification: false,
          resolvedFromSnapshot: false,
          lesson: markFullLessonContent(draftLesson),
        };
      }
    }
    const lesson = await this.lessonsRepository.findById(lessonId);
    if (!lesson) {
      return {
        lessonId,
        courseId: null,
        lessonOrder: null,
        role: context.role,
        mode: "none",
        reason: "lesson_not_found",
        canAccess: false,
        hasActiveCourseEntitlement: false,
        isIdentityVerified: context.isIdentityVerified,
        requiresAuth: context.requiresAuth,
        requiresVerification: context.requiresVerification,
        resolvedFromSnapshot: false,
        lesson: null,
      };
    }

    const courseDecision = await this.getCourseAccessDecision(
      lesson.courseId,
      actorUser
    );
    const previewAllowed = courseDecision.mode === "preview" && lesson.order === 1;
    const canAccess = courseDecision.mode === "full" || previewAllowed;
    const mode: AccessMode = canAccess
      ? courseDecision.mode === "full"
        ? "full"
        : "preview"
      : courseDecision.mode;

    const lessonPayload =
      canAccess && mode === "full"
        ? markFullLessonContent(lesson)
        : redactLessonForPreview(lesson);

    return {
      lessonId,
      courseId: lesson.courseId,
      lessonOrder: lesson.order,
      role: courseDecision.role,
      mode,
      reason: courseDecision.reason,
      canAccess,
      hasActiveCourseEntitlement: courseDecision.hasActiveCourseEntitlement,
      isIdentityVerified: courseDecision.isIdentityVerified,
      requiresAuth: courseDecision.requiresAuth,
      requiresVerification: courseDecision.requiresVerification,
      resolvedFromSnapshot: false,
      lesson: lessonPayload,
    };
  }

  private async resolveAccessContext(
    actorUser?: AuthUserDto | null
  ): Promise<AccessContext> {
    if (!actorUser) {
      return {
        role: "anonymous",
        isIdentityVerified: false,
        requiresAuth: true,
        requiresVerification: false,
      };
    }

    const user = await this.accessRepository.findUserContext(actorUser.id);
    if (actorUser.role === "teacher" || user?.role === "teacher") {
      return {
        role: "teacher",
        userId: actorUser.id,
        isIdentityVerified: true,
        requiresAuth: false,
        requiresVerification: false,
      };
    }

    return {
      role: "student",
      userId: actorUser.id,
      isIdentityVerified: Boolean(user?.isIdentityVerified ?? false),
      requiresAuth: false,
      requiresVerification: !Boolean(user?.isIdentityVerified ?? false),
    };
  }

  private createCourseDecision(params: {
    courseId: string;
    role: AccessRole;
    mode: AccessMode;
    reason: AccessReason;
    canViewCourse: boolean;
    canAccessPreviewLesson: boolean;
    canAccessAllLessons: boolean;
    hasActiveCourseEntitlement: boolean;
    isIdentityVerified: boolean;
    requiresAuth: boolean;
    requiresVerification: boolean;
  }): CourseAccessDecisionDto {
    return params;
  }

  private async isTeacherOwnerOfCourse(
    teacherUserId: string,
    courseId: string
  ): Promise<boolean> {
    const rows = await this.databaseService.query<{ teacherId: string }>(
      `
        SELECT teacher_id AS "teacherId"
        FROM courses_catalog
        WHERE id = $1
        LIMIT 1
      `,
      [courseId]
    );
    return rows[0]?.teacherId === teacherUserId;
  }
}
