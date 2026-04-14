export type UserCapabilityProjection = {
  role: "anonymous" | "student" | "teacher";
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
  grantedCapabilities: Array<
    "course_access" | "teacher_chat_access" | "whiteboard_access"
  >;
  activeCapabilityGrants: Array<{
    capability: "course_access" | "teacher_chat_access" | "whiteboard_access";
    state: "active" | "revoked" | "expired";
    sourceKind: "purchase" | "booking" | "legacy_inferred";
    sourceRef: string;
    courseId: string | null;
    teacherId: string | null;
    grantedAt: string;
    updatedAt: string;
  }>;
  entitledCourseIds: string[];
  premiumCourseIds: string[];
  teacherIdsForPremiumInteractions: string[];
  primaryTeacherId: string | null;
  resolvedAt: string;
};
