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
  entitledCourseIds: string[];
  premiumCourseIds: string[];
  teacherIdsForPremiumInteractions: string[];
  primaryTeacherId: string | null;
  resolvedAt: string;
};
