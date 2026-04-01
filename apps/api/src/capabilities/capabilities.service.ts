import { Injectable } from "@nestjs/common";
import type { AuthUserDto } from "../auth/auth.types";
import { DatabaseService } from "../db/database.service";
import type { CapabilityProjectionDto } from "./capabilities.types";

type AccessUserRow = {
  role: "student" | "teacher";
  isIdentityVerified: boolean;
};

type EntitlementRow = {
  courseId: string;
  teacherId: string | null;
  tariff: string | null;
  price: number | null;
  priceGuided: number | null;
};

type CourseAccessRow = {
  courseId: string;
};

const nowIso = () => new Date().toISOString();

const resolvePremiumByRow = (row: EntitlementRow) => {
  if (row.tariff === "premium") return true;
  if (row.tariff === "standard") return false;

  // Legacy compatibility: old purchases may not have explicit tariff yet.
  const price = Number.isFinite(row.price ?? NaN) ? Number(row.price) : 0;
  const guided = Number.isFinite(row.priceGuided ?? NaN)
    ? Number(row.priceGuided)
    : 0;
  return guided > 0 && price >= guided;
};

@Injectable()
export class CapabilitiesService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getCapabilitiesForUser(
    actorUser: AuthUserDto
  ): Promise<CapabilityProjectionDto> {
    if (actorUser.role === "teacher") {
      return {
        role: "teacher",
        userId: actorUser.id,
        isIdentityVerified: true,
        hasActiveCourseEntitlement: true,
        canAccessCourse: true,
        canAccessAllLessons: true,
        canChatWithTeacher: true,
        canAccessWorkbook: true,
        isPremiumStudent: false,
        entitledCourseIds: [],
        premiumCourseIds: [],
        teacherIdsForPremiumInteractions: [actorUser.id],
        primaryTeacherId: actorUser.id,
        resolvedAt: nowIso(),
      };
    }

    const [userRows, entitlementRows, accessRows] = await Promise.all([
      this.databaseService.query<AccessUserRow>(
        `
          SELECT
            role,
            is_identity_verified AS "isIdentityVerified"
          FROM access_users
          WHERE id = $1
          LIMIT 1
        `,
        [actorUser.id]
      ),
      this.databaseService.query<EntitlementRow>(
        `
          SELECT
            ce.course_id AS "courseId",
            c.teacher_id AS "teacherId",
            pp.tariff AS tariff,
            pp.price AS price,
            c.price_guided AS "priceGuided"
          FROM course_entitlements ce
          LEFT JOIN profile_purchases pp
            ON pp.id = ce.purchase_id
          LEFT JOIN courses_catalog c
            ON c.id = ce.course_id
          WHERE ce.user_id = $1
            AND ce.state = 'active'
          ORDER BY ce.updated_at DESC, ce.id DESC
        `,
        [actorUser.id]
      ),
      this.databaseService.query<CourseAccessRow>(
        `
          SELECT
            course_id AS "courseId"
          FROM user_course_access
          WHERE user_id = $1
            AND has_active_entitlement = TRUE
        `,
        [actorUser.id]
      ),
    ]);

    const userRow = userRows[0];
    const isIdentityVerified = Boolean(userRow?.isIdentityVerified);

    const entitledCourseIdsSet = new Set<string>();
    const premiumCourseIdsSet = new Set<string>();
    const teacherIdsSet = new Set<string>();

    for (const row of entitlementRows) {
      if (!row.courseId) continue;
      entitledCourseIdsSet.add(row.courseId);
      if (row.teacherId) {
        teacherIdsSet.add(row.teacherId);
      }
      if (resolvePremiumByRow(row)) {
        premiumCourseIdsSet.add(row.courseId);
      }
    }

    for (const row of accessRows) {
      if (row.courseId) {
        entitledCourseIdsSet.add(row.courseId);
      }
    }

    const entitledCourseIds = Array.from(entitledCourseIdsSet);
    const premiumCourseIds = Array.from(premiumCourseIdsSet);
    const teacherIdsForPremiumInteractions = Array.from(teacherIdsSet);

    const hasActiveCourseEntitlement = entitledCourseIds.length > 0;
    const isPremiumStudent = premiumCourseIds.length > 0;
    const canAccessCourse = hasActiveCourseEntitlement;
    const canAccessAllLessons = hasActiveCourseEntitlement && isIdentityVerified;
    const canChatWithTeacher =
      isIdentityVerified &&
      isPremiumStudent &&
      teacherIdsForPremiumInteractions.length > 0;
    const canAccessWorkbook = canChatWithTeacher;

    return {
      role: "student",
      userId: actorUser.id,
      isIdentityVerified,
      hasActiveCourseEntitlement,
      canAccessCourse,
      canAccessAllLessons,
      canChatWithTeacher,
      canAccessWorkbook,
      isPremiumStudent,
      entitledCourseIds,
      premiumCourseIds,
      teacherIdsForPremiumInteractions,
      primaryTeacherId: teacherIdsForPremiumInteractions[0] ?? null,
      resolvedAt: nowIso(),
    };
  }

  async getPremiumTeacherIdsForStudent(studentUserId: string): Promise<string[]> {
    const rows = await this.databaseService.query<{ teacherId: string }>(
      `
        SELECT DISTINCT
          c.teacher_id AS "teacherId"
        FROM course_entitlements ce
        LEFT JOIN profile_purchases pp
          ON pp.id = ce.purchase_id
        INNER JOIN courses_catalog c
          ON c.id = ce.course_id
        WHERE ce.user_id = $1
          AND ce.state = 'active'
          AND (
            pp.tariff = 'premium'
            OR (
              pp.tariff IS NULL
              AND pp.price IS NOT NULL
              AND c.price_guided IS NOT NULL
              AND pp.price >= c.price_guided
            )
          )
      `,
      [studentUserId]
    );
    return rows
      .map((row) => row.teacherId?.trim() || "")
      .filter((teacherId) => teacherId.length > 0);
  }
}
