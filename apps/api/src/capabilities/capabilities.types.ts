import type { AuthUserRole } from "../auth/auth.types";

export type CapabilityProjectionRole = "anonymous" | AuthUserRole;

export type CapabilityProjectionDto = {
  role: CapabilityProjectionRole;
  userId: string;
  isIdentityVerified: boolean;
  hasActiveCourseEntitlement: boolean;
  canAccessCourse: boolean;
  canAccessAllLessons: boolean;
  canChatWithTeacher: boolean;
  canAccessWorkbook: boolean;
  isPremiumStudent: boolean;
  entitledCourseIds: string[];
  premiumCourseIds: string[];
  teacherIdsForPremiumInteractions: string[];
  primaryTeacherId: string | null;
  resolvedAt: string;
};
