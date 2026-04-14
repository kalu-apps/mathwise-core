import { Injectable, OnModuleInit } from "@nestjs/common";
import type { AuthUserDto } from "../auth/auth.types";
import { DatabaseService } from "../db/database.service";
import type {
  AccessCapability,
  CapabilityGrantDto,
  CapabilityProjectionDto,
} from "./capabilities.types";

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

type CapabilityGrantRow = {
  capability: AccessCapability;
  state: "active" | "revoked" | "expired";
  sourceKind: "purchase" | "booking" | "legacy_inferred";
  sourceRef: string;
  courseId: string;
  teacherId: string;
  grantedAt: string;
  updatedAt: string;
};

type BookingInteractionRow = {
  bookingId: string;
  teacherId: string;
};

const nowIso = () => new Date().toISOString();
const normalizeOptionalId = (value: string | null | undefined) => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const CAPABILITY_GRANT_SCHEMA_STATEMENTS = [
  `
    CREATE TABLE IF NOT EXISTS access_capability_grants (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      capability TEXT NOT NULL CHECK (
        capability IN ('course_access', 'teacher_chat_access', 'whiteboard_access')
      ),
      source_kind TEXT NOT NULL CHECK (
        source_kind IN ('purchase', 'booking', 'legacy_inferred')
      ),
      source_ref TEXT NOT NULL DEFAULT '',
      course_id TEXT NOT NULL DEFAULT '',
      teacher_id TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL CHECK (state IN ('active', 'revoked', 'expired')),
      granted_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_at_ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, capability, source_kind, source_ref, course_id, teacher_id)
    )
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_access_capability_grants_user_capability
    ON access_capability_grants (user_id, capability, state, updated_at DESC)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_access_capability_grants_source
    ON access_capability_grants (source_kind, source_ref, user_id, state)
  `,
] as const;

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
export class CapabilitiesService implements OnModuleInit {
  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    for (const statement of CAPABILITY_GRANT_SCHEMA_STATEMENTS) {
      await this.databaseService.execute(statement);
    }
  }

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
        hasPremiumInteractionAccess: true,
        hasBookingInteractionAccess: true,
        grantedCapabilities: [
          "course_access",
          "teacher_chat_access",
          "whiteboard_access",
        ],
        activeCapabilityGrants: [],
        entitledCourseIds: [],
        premiumCourseIds: [],
        teacherIdsForPremiumInteractions: [actorUser.id],
        primaryTeacherId: actorUser.id,
        resolvedAt: nowIso(),
      };
    }

    const [userRows, entitlementRows, accessRows, explicitGrants, bookingRows] =
      await Promise.all([
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
      this.listActiveCapabilityGrants(actorUser.id),
      this.listConfirmedBookingInteractions(actorUser.id),
    ]);

    const userRow = userRows[0];
    const isIdentityVerified = Boolean(userRow?.isIdentityVerified);

    const entitledCourseIdsSet = new Set<string>();
    const premiumCourseIdsSet = new Set<string>();
    const teacherIdsSet = new Set<string>();
    const activeCapabilityGrants: CapabilityGrantDto[] = [];
    let hasPremiumInteractionAccess = false;
    let hasBookingInteractionAccess = false;
    let hasTeacherChatCapabilityByGrant = false;
    let hasWhiteboardCapabilityByGrant = false;
    let hasCourseAccessCapabilityByGrant = false;

    for (const grant of explicitGrants) {
      const courseId = normalizeOptionalId(grant.courseId);
      const teacherId = normalizeOptionalId(grant.teacherId);
      activeCapabilityGrants.push({
        capability: grant.capability,
        state: grant.state,
        sourceKind: grant.sourceKind,
        sourceRef: grant.sourceRef,
        courseId,
        teacherId,
        grantedAt: grant.grantedAt,
        updatedAt: grant.updatedAt,
      });

      if (grant.capability === "course_access") {
        hasCourseAccessCapabilityByGrant = true;
        if (courseId) entitledCourseIdsSet.add(courseId);
      }
      if (grant.capability === "teacher_chat_access") {
        hasTeacherChatCapabilityByGrant = true;
        if (teacherId) teacherIdsSet.add(teacherId);
      }
      if (grant.capability === "whiteboard_access") {
        hasWhiteboardCapabilityByGrant = true;
      }

      if (
        grant.sourceKind === "purchase" &&
        (grant.capability === "teacher_chat_access" ||
          grant.capability === "whiteboard_access")
      ) {
        hasPremiumInteractionAccess = true;
        if (courseId) {
          premiumCourseIdsSet.add(courseId);
        }
      }
      if (
        grant.sourceKind === "booking" &&
        (grant.capability === "teacher_chat_access" ||
          grant.capability === "whiteboard_access")
      ) {
        hasBookingInteractionAccess = true;
      }
    }

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

    for (const row of bookingRows) {
      if (row.teacherId?.trim()) {
        teacherIdsSet.add(row.teacherId.trim());
      }
    }

    if (bookingRows.length > 0) {
      hasBookingInteractionAccess = true;
    }

    if (premiumCourseIdsSet.size > 0) {
      hasPremiumInteractionAccess = true;
    }

    const hasCourseAccessCapability =
      hasCourseAccessCapabilityByGrant || entitledCourseIdsSet.size > 0;
    const hasTeacherChatCapability =
      hasTeacherChatCapabilityByGrant ||
      premiumCourseIdsSet.size > 0 ||
      bookingRows.length > 0;
    const hasWhiteboardCapability =
      hasWhiteboardCapabilityByGrant ||
      premiumCourseIdsSet.size > 0 ||
      bookingRows.length > 0;

    const grantedCapabilities: AccessCapability[] = [];
    if (hasCourseAccessCapability) grantedCapabilities.push("course_access");
    if (hasTeacherChatCapability) grantedCapabilities.push("teacher_chat_access");
    if (hasWhiteboardCapability) grantedCapabilities.push("whiteboard_access");

    const entitledCourseIds = Array.from(entitledCourseIdsSet).sort((a, b) =>
      a.localeCompare(b)
    );
    const premiumCourseIds = Array.from(premiumCourseIdsSet).sort((a, b) =>
      a.localeCompare(b)
    );
    const teacherIdsForPremiumInteractions = Array.from(teacherIdsSet).sort((a, b) =>
      a.localeCompare(b)
    );

    const hasActiveCourseEntitlement = entitledCourseIds.length > 0;
    const isPremiumStudent = premiumCourseIds.length > 0 || hasPremiumInteractionAccess;
    const canAccessCourse = hasActiveCourseEntitlement;
    const canAccessAllLessons = hasActiveCourseEntitlement && isIdentityVerified;
    const canChatWithTeacher =
      isIdentityVerified &&
      hasTeacherChatCapability &&
      teacherIdsForPremiumInteractions.length > 0;
    const canAccessWorkbook = isIdentityVerified && hasWhiteboardCapability;

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
      hasPremiumInteractionAccess,
      hasBookingInteractionAccess,
      grantedCapabilities,
      activeCapabilityGrants,
      entitledCourseIds,
      premiumCourseIds,
      teacherIdsForPremiumInteractions,
      primaryTeacherId: teacherIdsForPremiumInteractions[0] ?? null,
      resolvedAt: nowIso(),
    };
  }

  async getPremiumTeacherIdsForStudent(studentUserId: string): Promise<string[]> {
    const [explicitRows, legacyRows] = await Promise.all([
      this.listPremiumTeacherIdsByCapabilityGrants(studentUserId),
      this.databaseService.query<{ teacherId: string }>(
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
      ),
    ]);

    const ids = new Set<string>();
    for (const row of [...explicitRows, ...legacyRows]) {
      const teacherId = row.teacherId?.trim();
      if (teacherId) ids.add(teacherId);
    }
    return Array.from(ids).sort((a, b) => a.localeCompare(b));
  }

  private async listActiveCapabilityGrants(
    userId: string
  ): Promise<CapabilityGrantRow[]> {
    const rows = await this.databaseService.query<CapabilityGrantRow>(
      `
        SELECT
          capability,
          state,
          source_kind AS "sourceKind",
          source_ref AS "sourceRef",
          course_id AS "courseId",
          teacher_id AS "teacherId",
          granted_at AS "grantedAt",
          updated_at AS "updatedAt"
        FROM access_capability_grants
        WHERE user_id = $1
          AND state = 'active'
        ORDER BY updated_at DESC, id DESC
      `,
      [userId]
    );
    return rows;
  }

  private async listConfirmedBookingInteractions(
    userId: string
  ): Promise<BookingInteractionRow[]> {
    try {
      return await this.databaseService.query<BookingInteractionRow>(
        `
          SELECT DISTINCT
            id AS "bookingId",
            teacher_id AS "teacherId"
          FROM profile_bookings
          WHERE student_id = $1
            AND status IN ('scheduled', 'rescheduled', 'completed')
        `,
        [userId]
      );
    } catch {
      return [];
    }
  }

  private async listPremiumTeacherIdsByCapabilityGrants(
    userId: string
  ): Promise<Array<{ teacherId: string }>> {
    try {
      return await this.databaseService.query<{ teacherId: string }>(
        `
          SELECT DISTINCT
            teacher_id AS "teacherId"
          FROM access_capability_grants
          WHERE user_id = $1
            AND capability = 'teacher_chat_access'
            AND source_kind = 'purchase'
            AND state = 'active'
            AND teacher_id <> ''
        `,
        [userId]
      );
    } catch {
      return [];
    }
  }
}
