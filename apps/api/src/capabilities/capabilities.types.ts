import type { AuthUserRole } from "../auth/auth.types";

export type CapabilityProjectionRole = "anonymous" | AuthUserRole;
export type AccessCapability =
  | "course_access"
  | "teacher_chat_access"
  | "whiteboard_access";

export type CapabilityGrantSourceKind =
  | "purchase"
  | "booking"
  | "legacy_inferred";

export type CapabilityGrantState = "active" | "revoked" | "expired";

export type CapabilityGrantDto = {
  capability: AccessCapability;
  state: CapabilityGrantState;
  sourceKind: CapabilityGrantSourceKind;
  sourceRef: string;
  courseId: string | null;
  teacherId: string | null;
  grantedAt: string;
  updatedAt: string;
};

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
  hasPremiumInteractionAccess: boolean;
  hasBookingInteractionAccess: boolean;
  grantedCapabilities: AccessCapability[];
  activeCapabilityGrants: CapabilityGrantDto[];
  entitledCourseIds: string[];
  premiumCourseIds: string[];
  teacherIdsForPremiumInteractions: string[];
  primaryTeacherId: string | null;
  resolvedAt: string;
};
