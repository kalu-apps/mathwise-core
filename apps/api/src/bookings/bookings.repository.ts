import { Injectable } from "@nestjs/common";
import { DatabaseService, type DatabaseExecutor } from "../db/database.service";
import type { BookingDto, BookingMaterialDto, BookingRecord } from "./bookings.types";

type BookingRow = {
  id: string;
  slotId: string | null;
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
  paymentStatus: "unpaid" | "paid";
  meetingUrl: string | null;
  materials: unknown;
  createdAt: string;
};

type AvailabilityRow = {
  id: string;
  teacherId: string;
  date: string;
  startTime: string;
  endTime: string;
};

type IdempotencyRow = {
  response: unknown;
};

@Injectable()
export class BookingsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async ensureSchema() {
    await this.databaseService.execute(`
      CREATE TABLE IF NOT EXISTS profile_bookings (
        id TEXT PRIMARY KEY,
        slot_id TEXT,
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
      ALTER TABLE profile_bookings
      ADD COLUMN IF NOT EXISTS slot_id TEXT
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
      CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_bookings_teacher_time_unique
      ON profile_bookings (teacher_id, date, start_time, end_time)
    `);
    await this.databaseService.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_bookings_slot_unique
      ON profile_bookings (slot_id)
      WHERE slot_id IS NOT NULL
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
      CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_teacher_availability_unique_time
      ON profile_teacher_availability (teacher_id, date, start_time, end_time)
    `);

    await this.databaseService.execute(`
      CREATE TABLE IF NOT EXISTS write_idempotency_records (
        scope TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        response_json JSONB NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (scope, idempotency_key)
      )
    `);

    await this.databaseService.execute(`
      DELETE FROM write_idempotency_records
      WHERE expires_at <= NOW()
    `);
  }

  async findBookings(params?: {
    teacherId?: string;
    studentId?: string;
  }): Promise<BookingDto[]> {
    const rows = await this.databaseService.query<BookingRow>(
      `
        SELECT
          id,
          slot_id AS "slotId",
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
          payment_status AS "paymentStatus",
          meeting_url AS "meetingUrl",
          materials_json AS "materials",
          created_at AS "createdAt"
        FROM profile_bookings
        WHERE ($1::text IS NULL OR teacher_id = $1)
          AND ($2::text IS NULL OR student_id = $2)
        ORDER BY date ASC, start_time ASC, id ASC
      `,
      [params?.teacherId ?? null, params?.studentId ?? null]
    );
    return rows.map((row) => this.mapBookingRow(row));
  }

  async findBookingById(bookingId: string): Promise<BookingRecord | null> {
    const rows = await this.databaseService.query<BookingRow>(
      `
        SELECT
          id,
          slot_id AS "slotId",
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
          payment_status AS "paymentStatus",
          meeting_url AS "meetingUrl",
          materials_json AS "materials",
          created_at AS "createdAt"
        FROM profile_bookings
        WHERE id = $1
        LIMIT 1
      `,
      [bookingId]
    );
    const row = rows[0];
    return row ? this.mapBookingRowWithSlot(row) : null;
  }

  async findBookingBySlotId(slotId: string): Promise<BookingRecord | null> {
    const rows = await this.databaseService.query<BookingRow>(
      `
        SELECT
          id,
          slot_id AS "slotId",
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
          payment_status AS "paymentStatus",
          meeting_url AS "meetingUrl",
          materials_json AS "materials",
          created_at AS "createdAt"
        FROM profile_bookings
        WHERE slot_id = $1
        LIMIT 1
      `,
      [slotId]
    );
    const row = rows[0];
    return row ? this.mapBookingRowWithSlot(row) : null;
  }

  async hasBookingsForStudent(studentId: string): Promise<boolean> {
    const rows = await this.databaseService.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM profile_bookings
        WHERE student_id = $1
      `,
      [studentId]
    );
    return Number(rows[0]?.count ?? 0) > 0;
  }

  async findOverlappingBooking(params: {
    teacherId: string;
    date: string;
    startTime: string;
    endTime: string;
    excludeBookingId?: string;
  }): Promise<BookingRecord | null> {
    const rows = await this.databaseService.query<BookingRow>(
      `
        SELECT
          id,
          slot_id AS "slotId",
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
          payment_status AS "paymentStatus",
          meeting_url AS "meetingUrl",
          materials_json AS "materials",
          created_at AS "createdAt"
        FROM profile_bookings
        WHERE teacher_id = $1
          AND date = $2
          AND ($3::text IS NULL OR id <> $3)
          AND start_time < $5
          AND end_time > $4
        ORDER BY start_time ASC
        LIMIT 1
      `,
      [
        params.teacherId,
        params.date,
        params.excludeBookingId ?? null,
        params.startTime,
        params.endTime,
      ]
    );
    const row = rows[0];
    return row ? this.mapBookingRowWithSlot(row) : null;
  }

  async insertBooking(booking: BookingRecord): Promise<void> {
    await this.databaseService.execute(
      `
        INSERT INTO profile_bookings (
          id,
          slot_id,
          teacher_id,
          teacher_name,
          teacher_photo,
          student_id,
          student_name,
          student_email,
          student_phone,
          student_photo,
          date,
          start_time,
          end_time,
          lesson_kind,
          payment_status,
          meeting_url,
          materials_json,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15,
          $16, $17::jsonb, $18, NOW()
        )
      `,
      [
        booking.id,
        booking.slotId ?? null,
        booking.teacherId,
        booking.teacherName,
        booking.teacherPhoto ?? null,
        booking.studentId,
        booking.studentName,
        booking.studentEmail,
        booking.studentPhone ?? null,
        booking.studentPhoto ?? null,
        booking.date,
        booking.startTime,
        booking.endTime,
        booking.lessonKind,
        booking.paymentStatus,
        booking.meetingUrl ?? null,
        JSON.stringify(booking.materials ?? []),
        booking.createdAt,
      ]
    );
  }

  async updateBooking(booking: BookingRecord): Promise<void> {
    await this.databaseService.execute(
      `
        UPDATE profile_bookings
        SET
          slot_id = $2,
          teacher_id = $3,
          teacher_name = $4,
          teacher_photo = $5,
          student_id = $6,
          student_name = $7,
          student_email = $8,
          student_phone = $9,
          student_photo = $10,
          date = $11,
          start_time = $12,
          end_time = $13,
          lesson_kind = $14,
          payment_status = $15,
          meeting_url = $16,
          materials_json = $17::jsonb,
          created_at = $18,
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        booking.id,
        booking.slotId ?? null,
        booking.teacherId,
        booking.teacherName,
        booking.teacherPhoto ?? null,
        booking.studentId,
        booking.studentName,
        booking.studentEmail,
        booking.studentPhone ?? null,
        booking.studentPhoto ?? null,
        booking.date,
        booking.startTime,
        booking.endTime,
        booking.lessonKind,
        booking.paymentStatus,
        booking.meetingUrl ?? null,
        JSON.stringify(booking.materials ?? []),
        booking.createdAt,
      ]
    );
  }

  async deleteBooking(bookingId: string): Promise<void> {
    await this.databaseService.execute(
      "DELETE FROM profile_bookings WHERE id = $1",
      [bookingId]
    );
  }

  async findAvailabilitySlot(slotId: string): Promise<AvailabilityRow | null> {
    const rows = await this.databaseService.query<AvailabilityRow>(
      `
        SELECT
          id,
          teacher_id AS "teacherId",
          date,
          start_time AS "startTime",
          end_time AS "endTime"
        FROM profile_teacher_availability
        WHERE id = $1
        LIMIT 1
      `,
      [slotId]
    );
    return rows[0] ?? null;
  }

  async hasAvailabilitySlotAt(params: {
    teacherId: string;
    date: string;
    startTime: string;
    endTime: string;
  }): Promise<boolean> {
    const rows = await this.databaseService.query<{ id: string }>(
      `
        SELECT id
        FROM profile_teacher_availability
        WHERE teacher_id = $1
          AND date = $2
          AND start_time = $3
          AND end_time = $4
        LIMIT 1
      `,
      [params.teacherId, params.date, params.startTime, params.endTime]
    );
    return rows.length > 0;
  }

  async removeAvailabilitySlot(slotId: string): Promise<void> {
    await this.databaseService.execute(
      "DELETE FROM profile_teacher_availability WHERE id = $1",
      [slotId]
    );
  }

  async upsertAvailabilitySlot(slot: AvailabilityRow): Promise<void> {
    await this.databaseService.execute(
      `
        INSERT INTO profile_teacher_availability (
          id,
          teacher_id,
          date,
          start_time,
          end_time,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (id)
        DO UPDATE SET
          teacher_id = EXCLUDED.teacher_id,
          date = EXCLUDED.date,
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          updated_at = NOW()
      `,
      [slot.id, slot.teacherId, slot.date, slot.startTime, slot.endTime]
    );
  }

  async findIdempotentResponse<T>(
    scope: string,
    idempotencyKey: string
  ): Promise<T | null> {
    const rows = await this.databaseService.query<IdempotencyRow>(
      `
        SELECT response_json AS response
        FROM write_idempotency_records
        WHERE scope = $1
          AND idempotency_key = $2
          AND expires_at > NOW()
        LIMIT 1
      `,
      [scope, idempotencyKey]
    );
    const row = rows[0];
    return (row?.response as T | undefined) ?? null;
  }

  async saveIdempotentResponse(
    scope: string,
    idempotencyKey: string,
    response: unknown,
    ttlSec: number
  ): Promise<void> {
    const ttl = Number.isFinite(ttlSec) ? Math.max(30, Math.floor(ttlSec)) : 3600;
    await this.databaseService.execute(
      `
        INSERT INTO write_idempotency_records (
          scope,
          idempotency_key,
          response_json,
          expires_at,
          created_at
        )
        VALUES ($1, $2, $3::jsonb, NOW() + ($4 || ' seconds')::interval, NOW())
        ON CONFLICT (scope, idempotency_key)
        DO UPDATE SET
          response_json = EXCLUDED.response_json,
          expires_at = EXCLUDED.expires_at,
          created_at = NOW()
      `,
      [scope, idempotencyKey, JSON.stringify(response), String(ttl)]
    );
  }

  async createBookingWithSlotClaim(params: {
    booking: BookingRecord;
    slotId: string;
  }): Promise<boolean> {
    return this.databaseService.transaction<boolean>(async (tx) => {
      const claimed = await tx.query<{ id: string }>(
        `
          DELETE FROM profile_teacher_availability
          WHERE id = $1
          RETURNING id
        `,
        [params.slotId]
      );
      if (claimed.length === 0) {
        return false;
      }

      await this.insertBookingWithExecutor(tx, params.booking);
      return true;
    });
  }

  async rescheduleBookingAtomic(params: {
    booking: BookingRecord;
    nextSlotId: string;
    restorePreviousSlot?: AvailabilityRow;
  }): Promise<boolean> {
    return this.databaseService.transaction<boolean>(async (tx) => {
      const claimed = await tx.query<{ id: string }>(
        `
          DELETE FROM profile_teacher_availability
          WHERE id = $1
          RETURNING id
        `,
        [params.nextSlotId]
      );
      if (claimed.length === 0) {
        return false;
      }

      if (params.restorePreviousSlot) {
        await tx.execute(
          `
            INSERT INTO profile_teacher_availability (
              id,
              teacher_id,
              date,
              start_time,
              end_time,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (teacher_id, date, start_time, end_time)
            DO NOTHING
          `,
          [
            params.restorePreviousSlot.id,
            params.restorePreviousSlot.teacherId,
            params.restorePreviousSlot.date,
            params.restorePreviousSlot.startTime,
            params.restorePreviousSlot.endTime,
          ]
        );
      }

      await this.updateBookingWithExecutor(tx, params.booking);
      return true;
    });
  }

  async deleteBookingAtomic(params: {
    bookingId: string;
    restorePreviousSlot?: AvailabilityRow;
  }): Promise<boolean> {
    return this.databaseService.transaction<boolean>(async (tx) => {
      if (params.restorePreviousSlot) {
        await tx.execute(
          `
            INSERT INTO profile_teacher_availability (
              id,
              teacher_id,
              date,
              start_time,
              end_time,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (teacher_id, date, start_time, end_time)
            DO NOTHING
          `,
          [
            params.restorePreviousSlot.id,
            params.restorePreviousSlot.teacherId,
            params.restorePreviousSlot.date,
            params.restorePreviousSlot.startTime,
            params.restorePreviousSlot.endTime,
          ]
        );
      }

      const deleted = await tx.query<{ id: string }>(
        `
          DELETE FROM profile_bookings
          WHERE id = $1
          RETURNING id
        `,
        [params.bookingId]
      );
      return deleted.length > 0;
    });
  }

  private mapBookingRow(row: BookingRow): BookingDto {
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
      lessonKind: row.lessonKind,
      paymentStatus: row.paymentStatus,
      meetingUrl: row.meetingUrl ?? undefined,
      materials: this.normalizeMaterials(row.materials),
      createdAt: row.createdAt,
    };
  }

  private mapBookingRowWithSlot(row: BookingRow): BookingRecord {
    return {
      ...this.mapBookingRow(row),
      slotId: row.slotId ?? undefined,
    };
  }

  private normalizeMaterials(value: unknown): BookingMaterialDto[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const raw = item as Record<string, unknown>;
        const id = typeof raw.id === "string" ? raw.id : "";
        const name = typeof raw.name === "string" ? raw.name : "";
        const type =
          raw.type === "pdf" || raw.type === "doc" || raw.type === "video"
            ? raw.type
            : null;
        const url = typeof raw.url === "string" ? raw.url : "";
        if (!id || !name || !type || !url) return null;
        return { id, name, type, url } as BookingMaterialDto;
      })
      .filter((item): item is BookingMaterialDto => Boolean(item));
  }

  private async insertBookingWithExecutor(
    executor: DatabaseExecutor,
    booking: BookingRecord
  ): Promise<void> {
    await executor.execute(
      `
        INSERT INTO profile_bookings (
          id,
          slot_id,
          teacher_id,
          teacher_name,
          teacher_photo,
          student_id,
          student_name,
          student_email,
          student_phone,
          student_photo,
          date,
          start_time,
          end_time,
          lesson_kind,
          payment_status,
          meeting_url,
          materials_json,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15,
          $16, $17::jsonb, $18, NOW()
        )
      `,
      [
        booking.id,
        booking.slotId ?? null,
        booking.teacherId,
        booking.teacherName,
        booking.teacherPhoto ?? null,
        booking.studentId,
        booking.studentName,
        booking.studentEmail,
        booking.studentPhone ?? null,
        booking.studentPhoto ?? null,
        booking.date,
        booking.startTime,
        booking.endTime,
        booking.lessonKind,
        booking.paymentStatus,
        booking.meetingUrl ?? null,
        JSON.stringify(booking.materials ?? []),
        booking.createdAt,
      ]
    );
  }

  private async updateBookingWithExecutor(
    executor: DatabaseExecutor,
    booking: BookingRecord
  ): Promise<void> {
    await executor.execute(
      `
        UPDATE profile_bookings
        SET
          slot_id = $2,
          teacher_id = $3,
          teacher_name = $4,
          teacher_photo = $5,
          student_id = $6,
          student_name = $7,
          student_email = $8,
          student_phone = $9,
          student_photo = $10,
          date = $11,
          start_time = $12,
          end_time = $13,
          lesson_kind = $14,
          payment_status = $15,
          meeting_url = $16,
          materials_json = $17::jsonb,
          created_at = $18,
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        booking.id,
        booking.slotId ?? null,
        booking.teacherId,
        booking.teacherName,
        booking.teacherPhoto ?? null,
        booking.studentId,
        booking.studentName,
        booking.studentEmail,
        booking.studentPhone ?? null,
        booking.studentPhoto ?? null,
        booking.date,
        booking.startTime,
        booking.endTime,
        booking.lessonKind,
        booking.paymentStatus,
        booking.meetingUrl ?? null,
        JSON.stringify(booking.materials ?? []),
        booking.createdAt,
      ]
    );
  }
}
