import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../db/database.service";
import type {
  BookingContextDto,
  PurchaseContextDto,
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
      CREATE TABLE IF NOT EXISTS profile_bookings (
        id TEXT PRIMARY KEY,
        teacher_id TEXT NOT NULL,
        teacher_name TEXT NOT NULL DEFAULT '',
        teacher_photo TEXT,
        student_id TEXT NOT NULL,
        student_name TEXT NOT NULL DEFAULT '',
        student_email TEXT NOT NULL DEFAULT '',
        student_phone TEXT,
        student_photo TEXT,
        date TEXT NOT NULL DEFAULT '',
        start_time TEXT NOT NULL DEFAULT '',
        end_time TEXT NOT NULL DEFAULT '',
        lesson_kind TEXT NOT NULL CHECK (lesson_kind IN ('trial', 'regular')),
        payment_status TEXT NOT NULL CHECK (payment_status IN ('unpaid', 'paid')),
        meeting_url TEXT,
        materials_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_profile_bookings_student
      ON profile_bookings (student_id, date ASC, start_time ASC)
    `);
    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_profile_bookings_teacher
      ON profile_bookings (teacher_id, date ASC, start_time ASC)
    `);
    await this.databaseService.execute(`
      ALTER TABLE profile_bookings
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'rescheduled', 'canceled', 'completed', 'no_show'))
    `);
    await this.databaseService.execute(`
      ALTER TABLE profile_bookings
      ADD COLUMN IF NOT EXISTS slot_id TEXT
    `);
    await this.databaseService.execute(`
      ALTER TABLE profile_bookings
      ADD COLUMN IF NOT EXISTS consent_snapshot_json JSONB
    `);
    await this.databaseService.execute(`
      ALTER TABLE profile_bookings
      ADD COLUMN IF NOT EXISTS identity_kind TEXT NOT NULL DEFAULT 'user_bound'
        CHECK (identity_kind IN ('user_bound', 'guest_pending'))
    `);
    await this.databaseService.execute(`
      ALTER TABLE profile_bookings
      ADD COLUMN IF NOT EXISTS identity_email_canonical TEXT NOT NULL DEFAULT ''
    `);
    await this.databaseService.execute(`
      ALTER TABLE profile_bookings
      ADD COLUMN IF NOT EXISTS canceled_at TEXT
    `);

    await this.databaseService.execute(`
      CREATE TABLE IF NOT EXISTS profile_teacher_availability (
        id TEXT PRIMARY KEY,
        teacher_id TEXT NOT NULL,
        date TEXT NOT NULL DEFAULT '',
        start_time TEXT NOT NULL DEFAULT '',
        end_time TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_profile_teacher_availability_teacher
      ON profile_teacher_availability (teacher_id, date ASC, start_time ASC)
    `);
  }

  async hasAnyProfileData(): Promise<boolean> {
    const [purchaseRows, bookingRows, availabilityRows] = await Promise.all([
      this.databaseService.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM profile_purchases"
      ),
      this.databaseService.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM profile_bookings"
      ),
      this.databaseService.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM profile_teacher_availability"
      ),
    ]);
    return (
      Number(purchaseRows[0]?.count ?? 0) > 0 ||
      Number(bookingRows[0]?.count ?? 0) > 0 ||
      Number(availabilityRows[0]?.count ?? 0) > 0
    );
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
}
