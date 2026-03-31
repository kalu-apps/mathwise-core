import { Injectable, OnModuleInit } from "@nestjs/common";
import { DatabaseService } from "../db/database.service";
import { getApiRuntimeConfig } from "../config/runtime.config";
import { CoursesRepository } from "../courses/courses.repository";
import { LessonsRepository } from "../lessons/lessons.repository";
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

  async getCourseAccessList(userId?: string): Promise<CourseAccessListResponseDto> {
    const courseIds = await this.coursesRepository.findAllIds();
    const decisions = await Promise.all(
      courseIds.map((courseId) => this.getCourseAccessDecision(courseId, userId))
    );
    return { decisions };
  }

  async getCourseAccessDecision(
    courseId: string,
    userId?: string
  ): Promise<CourseAccessDecisionDto> {
    const context = await this.resolveAccessContext(userId);
    const courseExists = await this.coursesRepository.existsById(courseId);

    if (!courseExists) {
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
    userId?: string
  ): Promise<LessonAccessDecisionDto> {
    const context = await this.resolveAccessContext(userId);
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

    const courseDecision = await this.getCourseAccessDecision(lesson.courseId, userId);
    const previewAllowed = courseDecision.mode === "preview" && lesson.order === 1;
    const canAccess = courseDecision.mode === "full" || previewAllowed;
    const mode: AccessMode = canAccess
      ? courseDecision.mode === "full"
        ? "full"
        : "preview"
      : courseDecision.mode;

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
      lesson,
    };
  }

  private async resolveAccessContext(userId?: string): Promise<AccessContext> {
    const normalizedUserId = userId?.trim();
    if (!normalizedUserId) {
      return {
        role: "anonymous",
        isIdentityVerified: false,
        requiresAuth: true,
        requiresVerification: false,
      };
    }

    const user = await this.accessRepository.findUserContext(normalizedUserId);
    if (!user) {
      return {
        role: "anonymous",
        isIdentityVerified: false,
        requiresAuth: true,
        requiresVerification: false,
      };
    }

    if (user.role === "teacher") {
      return {
        role: "teacher",
        userId: user.id,
        isIdentityVerified: true,
        requiresAuth: false,
        requiresVerification: false,
      };
    }

    return {
      role: "student",
      userId: user.id,
      isIdentityVerified: Boolean(user.isIdentityVerified),
      requiresAuth: false,
      requiresVerification: !user.isIdentityVerified,
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
}
