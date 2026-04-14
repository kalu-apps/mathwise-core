import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../db/database.service";
import type {
  BookingContextDto,
  PurchaseContextDto,
  TeacherInviteDto,
  TeacherInviteStatus,
  TeacherAvailabilityContextDto,
} from "./profile.types";

type PurchaseRow = {
  id: string;
  userId: string;
  courseId: string;
  price: number;
  tariff: "standard" | "premium" | null;
  purchasedAt: string;
  paymentMethod: string | null;
  checkoutId: string | null;
  bnpl: unknown;
  courseSnapshot: unknown;
  lessonsSnapshot: unknown;
  purchasedTestItemIds: unknown;
};

type BookingRow = {
  id: string;
  teacherId: string;
  teacherName: string;
  teacherPhoto: string | null;
  studentId: string;
  studentName: string;
  studentEmail: string;
  studentPhone: string | null;
  studentPhoto: string | null;
  date: string;
  startTime: string;
  endTime: string;
  lessonKind: "trial" | "regular";
  status: "scheduled" | "rescheduled" | "canceled" | "completed" | "no_show";
  paymentStatus: "unpaid" | "paid";
  meetingUrl: string | null;
  materials: unknown;
  consentSnapshot: unknown;
  createdAt: string;
};

type AvailabilityRow = {
  id: string;
  teacherId: string;
  date: string;
  startTime: string;
  endTime: string;
};

type TeacherInviteRow = {
  id: string;
  teacherId: string;
  tokenHash: string;
  status: Exclude<TeacherInviteStatus, "invalid">;
  targetEmailCanonical: string | null;
  note: string | null;
  maxUses: number;
  useCount: number;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  consumedByUserId: string | null;
  revokedAt: string | null;
  metadata: unknown;
};

type TeacherInviteResolveRow = TeacherInviteRow & {
  teacherFirstName: string | null;
  teacherLastName: string | null;
  teacherPhoto: string | null;
};

@Injectable()
export class ProfileRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async ensureSchema() {
    await this.databaseService.execute(`
      CREATE TABLE IF NOT EXISTS profile_purchases (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        course_id TEXT NOT NULL,
        price INTEGER NOT NULL DEFAULT 0,
        tariff TEXT CHECK (tariff IN ('standard', 'premium')),
        purchased_at TEXT NOT NULL,
        payment_method TEXT,
        checkout_id TEXT,
        bnpl_json JSONB,
        course_snapshot_json JSONB,
        lessons_snapshot_json JSONB,
        purchased_test_item_ids_json JSONB,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_profile_purchases_user
      ON profile_purchases (user_id, purchased_at DESC)
    `);

    await this.databaseService.execute(`
      ALTER TABLE profile_purchases
      ADD COLUMN IF NOT EXISTS tariff TEXT CHECK (tariff IN ('standard', 'premium'))
    `);
    await this.databaseService.execute(`
      CREATE TABLE IF NOT EXISTS profile_teacher_invites (
        id TEXT PRIMARY KEY,
        teacher_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'consumed', 'revoked')),
        target_email_canonical TEXT,
        note TEXT,
        max_uses INTEGER NOT NULL DEFAULT 1,
        use_count INTEGER NOT NULL DEFAULT 0,
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed_at TEXT,
        consumed_by_user_id TEXT,
        revoked_at TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_profile_teacher_invites_teacher_status
      ON profile_teacher_invites (teacher_id, status, created_at DESC)
    `);
    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_profile_teacher_invites_expiry
      ON profile_teacher_invites (status, expires_at ASC)
    `);

    await this.databaseService.execute(`
      CREATE TABLE IF NOT EXISTS profile_teacher_students (
        id TEXT PRIMARY KEY,
        teacher_id TEXT NOT NULL,
        student_id TEXT NOT NULL,
        source_kind TEXT NOT NULL CHECK (source_kind IN ('booking', 'invite', 'manual')),
        source_ref TEXT,
        linked_at TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (teacher_id, student_id)
      )
    `);
    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_profile_teacher_students_teacher
      ON profile_teacher_students (teacher_id, linked_at DESC)
    `);
    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_profile_teacher_students_student
      ON profile_teacher_students (student_id, linked_at DESC)
    `);
  }

  async hasAnyProfileData(): Promise<boolean> {
    const [purchaseRows, bookingRows, availabilityRows] = await Promise.all([
      this.safeCountRows("profile_purchases"),
      this.safeCountRows("profile_bookings"),
      this.safeCountRows("profile_teacher_availability"),
    ]);
    return (
      purchaseRows > 0 ||
      bookingRows > 0 ||
      availabilityRows > 0
    );
  }

  private async safeCountRows(
    tableName:
      | "profile_purchases"
      | "profile_bookings"
      | "profile_teacher_availability"
  ): Promise<number> {
    try {
      const rows = await this.databaseService.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM ${tableName}`
      );
      return Number(rows[0]?.count ?? 0);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "42P01"
      ) {
        return 0;
      }
      throw error;
    }
  }

  async findPurchasesByUser(userId: string): Promise<PurchaseContextDto[]> {
    const rows = await this.databaseService.query<PurchaseRow>(
      `
        SELECT
          id,
          user_id AS "userId",
          course_id AS "courseId",
          price,
          tariff,
          purchased_at AS "purchasedAt",
          payment_method AS "paymentMethod",
          checkout_id AS "checkoutId",
          bnpl_json AS "bnpl",
          course_snapshot_json AS "courseSnapshot",
          lessons_snapshot_json AS "lessonsSnapshot",
          purchased_test_item_ids_json AS "purchasedTestItemIds"
        FROM profile_purchases
        WHERE user_id = $1
        ORDER BY purchased_at DESC, id ASC
      `,
      [userId]
    );
    return rows.map((row) => this.mapPurchase(row));
  }

  async findBookingsByStudent(studentId: string): Promise<BookingContextDto[]> {
    const rows = await this.databaseService.query<BookingRow>(
      `
        SELECT
          id,
          teacher_id AS "teacherId",
          teacher_name AS "teacherName",
          teacher_photo AS "teacherPhoto",
          student_id AS "studentId",
          student_name AS "studentName",
          student_email AS "studentEmail",
          student_phone AS "studentPhone",
          student_photo AS "studentPhoto",
          date,
          start_time AS "startTime",
          end_time AS "endTime",
          lesson_kind AS "lessonKind",
          status,
          payment_status AS "paymentStatus",
          meeting_url AS "meetingUrl",
          materials_json AS "materials",
          consent_snapshot_json AS "consentSnapshot",
          created_at AS "createdAt"
        FROM profile_bookings
        WHERE student_id = $1
        ORDER BY date ASC, start_time ASC, id ASC
      `,
      [studentId]
    );
    return rows.map((row) => this.mapBooking(row));
  }

  async findBookingsByTeacher(teacherId: string): Promise<BookingContextDto[]> {
    const rows = await this.databaseService.query<BookingRow>(
      `
        SELECT
          id,
          teacher_id AS "teacherId",
          teacher_name AS "teacherName",
          teacher_photo AS "teacherPhoto",
          student_id AS "studentId",
          student_name AS "studentName",
          student_email AS "studentEmail",
          student_phone AS "studentPhone",
          student_photo AS "studentPhoto",
          date,
          start_time AS "startTime",
          end_time AS "endTime",
          lesson_kind AS "lessonKind",
          status,
          payment_status AS "paymentStatus",
          meeting_url AS "meetingUrl",
          materials_json AS "materials",
          consent_snapshot_json AS "consentSnapshot",
          created_at AS "createdAt"
        FROM profile_bookings
        WHERE teacher_id = $1
        ORDER BY date ASC, start_time ASC, id ASC
      `,
      [teacherId]
    );
    return rows.map((row) => this.mapBooking(row));
  }

  async findTeacherAvailabilityByTeacherId(
    teacherId: string
  ): Promise<TeacherAvailabilityContextDto[]> {
    const rows = await this.databaseService.query<AvailabilityRow>(
      `
        SELECT
          id,
          teacher_id AS "teacherId",
          date,
          start_time AS "startTime",
          end_time AS "endTime"
        FROM profile_teacher_availability
        WHERE teacher_id = $1
        ORDER BY date ASC, start_time ASC, id ASC
      `,
      [teacherId]
    );
    return rows.map((row) => this.mapAvailability(row));
  }

  async findTeacherAvailabilityByTeacherIds(
    teacherIds: string[]
  ): Promise<TeacherAvailabilityContextDto[]> {
    if (teacherIds.length === 0) return [];
    const rows = await this.databaseService.query<AvailabilityRow>(
      `
        SELECT
          id,
          teacher_id AS "teacherId",
          date,
          start_time AS "startTime",
          end_time AS "endTime"
        FROM profile_teacher_availability
        WHERE teacher_id = ANY($1::text[])
        ORDER BY teacher_id ASC, date ASC, start_time ASC, id ASC
      `,
      [teacherIds]
    );
    return rows.map((row) => this.mapAvailability(row));
  }

  async attachGuestBookingsToStudentByEmail(params: {
    userId: string;
    canonicalEmail: string;
  }): Promise<number> {
    const rows = await this.databaseService.query<{ id: string }>(
      `
        UPDATE profile_bookings
        SET
          student_id = $1,
          identity_kind = 'user_bound',
          updated_at = NOW()
        WHERE identity_kind = 'guest_pending'
          AND LOWER(identity_email_canonical) = LOWER($2)
        RETURNING id
      `,
      [params.userId, params.canonicalEmail]
    );
    return rows.length;
  }

  async createTeacherInvite(params: {
    id: string;
    teacherId: string;
    tokenHash: string;
    targetEmailCanonical?: string;
    note?: string;
    maxUses: number;
    metadata?: Record<string, unknown>;
    createdAt: string;
    expiresAt: string;
  }): Promise<TeacherInviteDto> {
    const rows = await this.databaseService.query<TeacherInviteRow>(
      `
        INSERT INTO profile_teacher_invites (
          id,
          teacher_id,
          token_hash,
          status,
          target_email_canonical,
          note,
          max_uses,
          use_count,
          metadata_json,
          created_at,
          expires_at,
          consumed_at,
          consumed_by_user_id,
          revoked_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, 'active', $4, $5, $6, 0, $7::jsonb, $8, $9, NULL, NULL, NULL, NOW()
        )
        RETURNING
          id,
          teacher_id AS "teacherId",
          token_hash AS "tokenHash",
          status,
          target_email_canonical AS "targetEmailCanonical",
          note,
          max_uses AS "maxUses",
          use_count AS "useCount",
          created_at AS "createdAt",
          expires_at AS "expiresAt",
          consumed_at AS "consumedAt",
          consumed_by_user_id AS "consumedByUserId",
          revoked_at AS "revokedAt",
          metadata_json AS "metadata"
      `,
      [
        params.id,
        params.teacherId,
        params.tokenHash,
        params.targetEmailCanonical ?? null,
        params.note ?? null,
        Math.max(1, Math.floor(params.maxUses)),
        JSON.stringify(params.metadata ?? {}),
        params.createdAt,
        params.expiresAt,
      ]
    );
    const row = rows[0];
    if (!row) {
      throw new Error("Failed to create teacher invite.");
    }
    return this.mapTeacherInvite(row);
  }

  async findTeacherInviteByTokenHash(
    tokenHash: string
  ): Promise<TeacherInviteResolveRow | null> {
    const rows = await this.databaseService.query<TeacherInviteResolveRow>(
      `
        SELECT
          i.id,
          i.teacher_id AS "teacherId",
          i.token_hash AS "tokenHash",
          i.status,
          i.target_email_canonical AS "targetEmailCanonical",
          i.note,
          i.max_uses AS "maxUses",
          i.use_count AS "useCount",
          i.created_at AS "createdAt",
          i.expires_at AS "expiresAt",
          i.consumed_at AS "consumedAt",
          i.consumed_by_user_id AS "consumedByUserId",
          i.revoked_at AS "revokedAt",
          i.metadata_json AS "metadata",
          u.first_name AS "teacherFirstName",
          u.last_name AS "teacherLastName",
          u.photo AS "teacherPhoto"
        FROM profile_teacher_invites i
        LEFT JOIN auth_users u
          ON u.id = i.teacher_id
        WHERE i.token_hash = $1
        LIMIT 1
      `,
      [tokenHash]
    );
    return rows[0] ?? null;
  }

  async findTeacherInviteById(inviteId: string): Promise<TeacherInviteDto | null> {
    const rows = await this.databaseService.query<TeacherInviteRow>(
      `
        SELECT
          id,
          teacher_id AS "teacherId",
          token_hash AS "tokenHash",
          status,
          target_email_canonical AS "targetEmailCanonical",
          note,
          max_uses AS "maxUses",
          use_count AS "useCount",
          created_at AS "createdAt",
          expires_at AS "expiresAt",
          consumed_at AS "consumedAt",
          consumed_by_user_id AS "consumedByUserId",
          revoked_at AS "revokedAt",
          metadata_json AS "metadata"
        FROM profile_teacher_invites
        WHERE id = $1
        LIMIT 1
      `,
      [inviteId]
    );
    const row = rows[0];
    return row ? this.mapTeacherInvite(row) : null;
  }

  async markTeacherInviteExpired(inviteId: string): Promise<TeacherInviteDto | null> {
    const rows = await this.databaseService.query<TeacherInviteRow>(
      `
        UPDATE profile_teacher_invites
        SET
          status = 'expired',
          updated_at = NOW()
        WHERE id = $1
          AND status = 'active'
        RETURNING
          id,
          teacher_id AS "teacherId",
          token_hash AS "tokenHash",
          status,
          target_email_canonical AS "targetEmailCanonical",
          note,
          max_uses AS "maxUses",
          use_count AS "useCount",
          created_at AS "createdAt",
          expires_at AS "expiresAt",
          consumed_at AS "consumedAt",
          consumed_by_user_id AS "consumedByUserId",
          revoked_at AS "revokedAt",
          metadata_json AS "metadata"
      `,
      [inviteId]
    );
    const row = rows[0];
    return row ? this.mapTeacherInvite(row) : null;
  }

  async consumeTeacherInviteAndLinkStudentAtomic(params: {
    inviteId: string;
    teacherId: string;
    studentId: string;
    consumedAt: string;
  }): Promise<{
    outcome: "consumed" | "missing" | "expired" | "revoked" | "already_consumed";
    invite?: TeacherInviteDto;
  }> {
    return this.databaseService.transaction(async (executor) => {
      const rows = await executor.query<TeacherInviteRow>(
        `
          SELECT
            id,
            teacher_id AS "teacherId",
            token_hash AS "tokenHash",
            status,
            target_email_canonical AS "targetEmailCanonical",
            note,
            max_uses AS "maxUses",
            use_count AS "useCount",
            created_at AS "createdAt",
            expires_at AS "expiresAt",
            consumed_at AS "consumedAt",
            consumed_by_user_id AS "consumedByUserId",
            revoked_at AS "revokedAt",
            metadata_json AS "metadata"
          FROM profile_teacher_invites
          WHERE id = $1
          FOR UPDATE
          LIMIT 1
        `,
        [params.inviteId]
      );
      const current = rows[0];
      if (!current) {
        return { outcome: "missing" as const };
      }
      if (current.status === "revoked") {
        return { outcome: "revoked" as const, invite: this.mapTeacherInvite(current) };
      }
      if (current.status === "consumed" || current.useCount >= current.maxUses) {
        return {
          outcome: "already_consumed" as const,
          invite: this.mapTeacherInvite(current),
        };
      }
      if (current.status === "expired" || Date.parse(current.expiresAt) <= Date.now()) {
        if (current.status === "active") {
          await executor.execute(
            `
              UPDATE profile_teacher_invites
              SET status = 'expired',
                  updated_at = NOW()
              WHERE id = $1
            `,
            [params.inviteId]
          );
        }
        const expiredRows = await executor.query<TeacherInviteRow>(
          `
            SELECT
              id,
              teacher_id AS "teacherId",
              token_hash AS "tokenHash",
              status,
              target_email_canonical AS "targetEmailCanonical",
              note,
              max_uses AS "maxUses",
              use_count AS "useCount",
              created_at AS "createdAt",
              expires_at AS "expiresAt",
              consumed_at AS "consumedAt",
              consumed_by_user_id AS "consumedByUserId",
              revoked_at AS "revokedAt",
              metadata_json AS "metadata"
            FROM profile_teacher_invites
            WHERE id = $1
            LIMIT 1
          `,
          [params.inviteId]
        );
        return {
          outcome: "expired" as const,
          invite: expiredRows[0] ? this.mapTeacherInvite(expiredRows[0]) : undefined,
        };
      }

      const consumedRows = await executor.query<TeacherInviteRow>(
        `
          UPDATE profile_teacher_invites
          SET
            status = 'consumed',
            use_count = use_count + 1,
            consumed_at = $2,
            consumed_by_user_id = $3,
            updated_at = NOW()
          WHERE id = $1
            AND status = 'active'
            AND use_count < max_uses
          RETURNING
            id,
            teacher_id AS "teacherId",
            token_hash AS "tokenHash",
            status,
            target_email_canonical AS "targetEmailCanonical",
            note,
            max_uses AS "maxUses",
            use_count AS "useCount",
            created_at AS "createdAt",
            expires_at AS "expiresAt",
            consumed_at AS "consumedAt",
            consumed_by_user_id AS "consumedByUserId",
            revoked_at AS "revokedAt",
            metadata_json AS "metadata"
        `,
        [params.inviteId, params.consumedAt, params.studentId]
      );
      const consumed = consumedRows[0];
      if (!consumed) {
        const freshRows = await executor.query<TeacherInviteRow>(
          `
            SELECT
              id,
              teacher_id AS "teacherId",
              token_hash AS "tokenHash",
              status,
              target_email_canonical AS "targetEmailCanonical",
              note,
              max_uses AS "maxUses",
              use_count AS "useCount",
              created_at AS "createdAt",
              expires_at AS "expiresAt",
              consumed_at AS "consumedAt",
              consumed_by_user_id AS "consumedByUserId",
              revoked_at AS "revokedAt",
              metadata_json AS "metadata"
            FROM profile_teacher_invites
            WHERE id = $1
            LIMIT 1
          `,
          [params.inviteId]
        );
        const fresh = freshRows[0];
        if (!fresh) {
          return { outcome: "missing" as const };
        }
        if (fresh.status === "revoked") {
          return {
            outcome: "revoked" as const,
            invite: this.mapTeacherInvite(fresh),
          };
        }
        if (fresh.status === "expired") {
          return {
            outcome: "expired" as const,
            invite: this.mapTeacherInvite(fresh),
          };
        }
        return {
          outcome: "already_consumed" as const,
          invite: this.mapTeacherInvite(fresh),
        };
      }

      await executor.execute(
        `
          INSERT INTO profile_teacher_students (
            id,
            teacher_id,
            student_id,
            source_kind,
            source_ref,
            linked_at,
            updated_at
          )
          VALUES ($1, $2, $3, 'invite', $4, $5, NOW())
          ON CONFLICT (teacher_id, student_id)
          DO UPDATE SET
            source_kind = EXCLUDED.source_kind,
            source_ref = EXCLUDED.source_ref,
            linked_at = EXCLUDED.linked_at,
            updated_at = NOW()
        `,
        [`ts_rel_${params.teacherId}_${params.studentId}`, params.teacherId, params.studentId, params.inviteId, params.consumedAt]
      );

      return {
        outcome: "consumed" as const,
        invite: this.mapTeacherInvite(consumed),
      };
    });
  }

  async findTeacherRelationStudentIds(teacherId: string): Promise<string[]> {
    const rows = await this.databaseService.query<{ studentId: string }>(
      `
        SELECT student_id AS "studentId"
        FROM profile_teacher_students
        WHERE teacher_id = $1
        ORDER BY linked_at DESC
      `,
      [teacherId]
    );
    return rows
      .map((row) => row.studentId)
      .filter((studentId) => typeof studentId === "string" && studentId.trim().length > 0);
  }

  private mapPurchase(row: PurchaseRow): PurchaseContextDto {
    return {
      id: row.id,
      userId: row.userId,
      courseId: row.courseId,
      price: Number(row.price),
      tariff: row.tariff ?? undefined,
      purchasedAt: row.purchasedAt,
      paymentMethod: row.paymentMethod ?? undefined,
      checkoutId: row.checkoutId ?? undefined,
      bnpl: row.bnpl ?? undefined,
      courseSnapshot:
        row.courseSnapshot && typeof row.courseSnapshot === "object"
          ? (row.courseSnapshot as PurchaseContextDto["courseSnapshot"])
          : undefined,
      lessonsSnapshot: Array.isArray(row.lessonsSnapshot)
        ? (row.lessonsSnapshot as PurchaseContextDto["lessonsSnapshot"])
        : undefined,
      purchasedTestItemIds: Array.isArray(row.purchasedTestItemIds)
        ? row.purchasedTestItemIds
            .map((item) => (typeof item === "string" ? item : ""))
            .filter((item) => item.length > 0)
        : undefined,
    };
  }

  private mapBooking(row: BookingRow): BookingContextDto {
    return {
      id: row.id,
      teacherId: row.teacherId,
      teacherName: row.teacherName,
      teacherPhoto: row.teacherPhoto ?? undefined,
      studentId: row.studentId,
      studentName: row.studentName,
      studentEmail: row.studentEmail,
      studentPhone: row.studentPhone ?? undefined,
      studentPhoto: row.studentPhoto ?? undefined,
      date: row.date,
      startTime: row.startTime,
      endTime: row.endTime,
      lessonKind: row.lessonKind === "trial" ? "trial" : "regular",
      status:
        row.status === "rescheduled" ||
        row.status === "canceled" ||
        row.status === "completed" ||
        row.status === "no_show"
          ? row.status
          : "scheduled",
      paymentStatus: row.paymentStatus === "paid" ? "paid" : "unpaid",
      meetingUrl: row.meetingUrl ?? undefined,
      materials: Array.isArray(row.materials)
        ? (row.materials as BookingContextDto["materials"])
        : [],
      consentSnapshot:
        row.consentSnapshot &&
        typeof row.consentSnapshot === "object" &&
        Array.isArray((row.consentSnapshot as { acceptedScopes?: unknown }).acceptedScopes) &&
        (((row.consentSnapshot as { source?: unknown }).source === "public_booking" ||
          (row.consentSnapshot as { source?: unknown }).source === "student_booking") &&
          typeof (row.consentSnapshot as { acceptedAt?: unknown }).acceptedAt === "string")
          ? {
              acceptedScopes: (
                row.consentSnapshot as {
                  acceptedScopes: unknown[];
                }
              ).acceptedScopes
                .map((scope) => (typeof scope === "string" ? scope : ""))
                .filter((scope) => scope.length > 0),
              source: (row.consentSnapshot as { source: "public_booking" | "student_booking" }).source,
              acceptedAt: (row.consentSnapshot as { acceptedAt: string }).acceptedAt,
            }
          : undefined,
      createdAt: row.createdAt,
    };
  }

  private mapAvailability(row: AvailabilityRow): TeacherAvailabilityContextDto {
    return {
      id: row.id,
      teacherId: row.teacherId,
      date: row.date,
      startTime: row.startTime,
      endTime: row.endTime,
    };
  }

  private mapTeacherInvite(row: TeacherInviteRow): TeacherInviteDto {
    return {
      id: row.id,
      teacherId: row.teacherId,
      status:
        row.status === "consumed" ||
        row.status === "expired" ||
        row.status === "revoked"
          ? row.status
          : "active",
      targetEmailCanonical: row.targetEmailCanonical ?? undefined,
      note: row.note ?? undefined,
      maxUses: Math.max(1, Number(row.maxUses) || 1),
      useCount: Math.max(0, Number(row.useCount) || 0),
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      consumedAt: row.consumedAt ?? undefined,
      consumedByUserId: row.consumedByUserId ?? undefined,
    };
  }
}
