import type { LessonDto } from "../lessons/lessons.types";

export type AccessRole = "anonymous" | "student" | "teacher";
export type AccessMode = "none" | "preview" | "full";

export type AccessReason =
  | "ok"
  | "anonymous"
  | "identity_unverified"
  | "entitlement_missing"
  | "course_not_found"
  | "lesson_not_found";

export type CourseAccessDecisionDto = {
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
};

export type LessonAccessDecisionDto = {
  lessonId: string;
  courseId: string | null;
  lessonOrder: number | null;
  role: AccessRole;
  mode: AccessMode;
  reason: AccessReason;
  canAccess: boolean;
  hasActiveCourseEntitlement: boolean;
  isIdentityVerified: boolean;
  requiresAuth: boolean;
  requiresVerification: boolean;
  resolvedFromSnapshot: boolean;
  lesson: LessonDto | null;
};

export type CourseAccessListResponseDto = {
  decisions: CourseAccessDecisionDto[];
};
