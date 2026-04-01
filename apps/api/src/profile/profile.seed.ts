import fs from "node:fs";
import type {
  BookingContextDto,
  PurchaseContextDto,
  TeacherAvailabilityContextDto,
} from "./profile.types";

type SeedExecutor = {
  execute: (text: string, params?: unknown[]) => Promise<void>;
};

type SourcePayload = {
  purchases?: unknown;
  bookings?: unknown;
  teacherAvailability?: unknown;
};

export type ProfileSeedData = {
  purchases: PurchaseContextDto[];
  bookings: BookingContextDto[];
  teacherAvailability: TeacherAvailabilityContextDto[];
};

const normalizeString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const normalizeLessonKind = (value: unknown): "trial" | "regular" =>
  value === "trial" ? "trial" : "regular";

const normalizePaymentStatus = (value: unknown): "unpaid" | "paid" =>
  value === "paid" ? "paid" : "unpaid";

const normalizeBookingStatus = (
  value: unknown
): BookingContextDto["status"] =>
  value === "rescheduled" ||
  value === "canceled" ||
  value === "completed" ||
  value === "no_show"
    ? value
    : "scheduled";

const mapPurchase = (entry: unknown): PurchaseContextDto | null => {
  if (!entry || typeof entry !== "object") return null;
  const raw = entry as Record<string, unknown>;
  const id = normalizeString(raw.id);
  const userId = normalizeString(raw.userId);
  const courseId = normalizeString(raw.courseId);
  const purchasedAt = normalizeString(raw.purchasedAt);
  if (!id || !userId || !courseId || !purchasedAt) return null;
  return {
    id,
    userId,
    courseId,
    price:
      typeof raw.price === "number" && Number.isFinite(raw.price) ? raw.price : 0,
    purchasedAt,
    paymentMethod:
      typeof raw.paymentMethod === "string" ? raw.paymentMethod : undefined,
    checkoutId: typeof raw.checkoutId === "string" ? raw.checkoutId : undefined,
    bnpl: raw.bnpl,
    courseSnapshot:
      raw.courseSnapshot && typeof raw.courseSnapshot === "object"
        ? (raw.courseSnapshot as PurchaseContextDto["courseSnapshot"])
        : undefined,
    lessonsSnapshot: Array.isArray(raw.lessonsSnapshot)
      ? (raw.lessonsSnapshot as PurchaseContextDto["lessonsSnapshot"])
      : undefined,
    purchasedTestItemIds: Array.isArray(raw.purchasedTestItemIds)
      ? raw.purchasedTestItemIds
          .map((item) => (typeof item === "string" ? item : ""))
          .filter((item) => item.length > 0)
      : undefined,
  };
};

const mapBooking = (entry: unknown): BookingContextDto | null => {
  if (!entry || typeof entry !== "object") return null;
  const raw = entry as Record<string, unknown>;
  const id = normalizeString(raw.id);
  const teacherId = normalizeString(raw.teacherId);
  const studentId = normalizeString(raw.studentId);
  if (!id || !teacherId || !studentId) return null;
  const rawConsent =
    raw.consentSnapshot && typeof raw.consentSnapshot === "object"
      ? (raw.consentSnapshot as Record<string, unknown>)
      : null;
  const consentScopes = Array.isArray(rawConsent?.acceptedScopes)
    ? rawConsent!.acceptedScopes
        .map((scope) => (typeof scope === "string" ? scope.trim() : ""))
        .filter((scope) => scope.length > 0)
    : [];
  let consentSource: "public_booking" | "student_booking" | undefined;
  if (rawConsent?.source === "public_booking" || rawConsent?.source === "student_booking") {
    consentSource = rawConsent.source;
  }
  const consentSnapshot =
    rawConsent &&
    consentSource &&
    typeof rawConsent.acceptedAt === "string" &&
    consentScopes.length > 0
      ? {
          acceptedScopes: consentScopes,
          source: consentSource,
          acceptedAt: rawConsent.acceptedAt,
        }
      : undefined;
  return {
    id,
    teacherId,
    teacherName: normalizeString(raw.teacherName),
    teacherPhoto: normalizeString(raw.teacherPhoto) || undefined,
    studentId,
    studentName: normalizeString(raw.studentName),
    studentEmail: normalizeString(raw.studentEmail),
    studentPhone: normalizeString(raw.studentPhone) || undefined,
    studentPhoto: normalizeString(raw.studentPhoto) || undefined,
    date: normalizeString(raw.date),
    startTime: normalizeString(raw.startTime),
    endTime: normalizeString(raw.endTime),
    lessonKind: normalizeLessonKind(raw.lessonKind),
    status: normalizeBookingStatus(raw.status),
    paymentStatus: normalizePaymentStatus(raw.paymentStatus),
    meetingUrl: normalizeString(raw.meetingUrl) || undefined,
    materials: Array.isArray(raw.materials)
      ? (raw.materials as BookingContextDto["materials"])
      : [],
    consentSnapshot,
    createdAt: normalizeString(raw.createdAt),
  };
};

const mapAvailabilitySlot = (
  teacherId: string,
  slot: unknown
): TeacherAvailabilityContextDto | null => {
  if (!slot || typeof slot !== "object") return null;
  const raw = slot as Record<string, unknown>;
  const id = normalizeString(raw.id);
  const date = normalizeString(raw.date);
  if (!id || !date) return null;
  const startTime = normalizeString(raw.startTime ?? raw.time);
  const endTime = normalizeString(raw.endTime);
  return {
    id,
    teacherId,
    date,
    startTime,
    endTime,
  };
};

export const readProfileSeedData = (sourceFile: string): ProfileSeedData => {
  if (!fs.existsSync(sourceFile)) {
    return {
      purchases: [],
      bookings: [],
      teacherAvailability: [],
    };
  }

  try {
    const raw = fs.readFileSync(sourceFile, "utf-8");
    const parsed = JSON.parse(raw) as SourcePayload;
    const purchases = Array.isArray(parsed.purchases)
      ? parsed.purchases
          .map((entry) => mapPurchase(entry))
          .filter((entry): entry is PurchaseContextDto => Boolean(entry))
      : [];

    const bookings = Array.isArray(parsed.bookings)
      ? parsed.bookings
          .map((entry) => mapBooking(entry))
          .filter((entry): entry is BookingContextDto => Boolean(entry))
      : [];

    const teacherAvailability: TeacherAvailabilityContextDto[] = [];
    if (parsed.teacherAvailability && typeof parsed.teacherAvailability === "object") {
      const rawMap = parsed.teacherAvailability as Record<string, unknown>;
      for (const [teacherId, slotsRaw] of Object.entries(rawMap)) {
        if (!Array.isArray(slotsRaw)) continue;
        for (const slot of slotsRaw) {
          const mapped = mapAvailabilitySlot(teacherId, slot);
          if (mapped) {
            teacherAvailability.push(mapped);
          }
        }
      }
    }

    return {
      purchases,
      bookings,
      teacherAvailability,
    };
  } catch {
    return {
      purchases: [],
      bookings: [],
      teacherAvailability: [],
    };
  }
};

export const upsertProfilePurchases = async (
  executor: SeedExecutor,
  purchases: PurchaseContextDto[]
) => {
  for (const purchase of purchases) {
    await executor.execute(
      `
        INSERT INTO profile_purchases (
          id,
          user_id,
          course_id,
          price,
          purchased_at,
          payment_method,
          checkout_id,
          bnpl_json,
          course_snapshot_json,
          lessons_snapshot_json,
          purchased_test_item_ids_json,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, NOW()
        )
        ON CONFLICT (id)
        DO UPDATE SET
          user_id = EXCLUDED.user_id,
          course_id = EXCLUDED.course_id,
          price = EXCLUDED.price,
          purchased_at = EXCLUDED.purchased_at,
          payment_method = EXCLUDED.payment_method,
          checkout_id = EXCLUDED.checkout_id,
          bnpl_json = EXCLUDED.bnpl_json,
          course_snapshot_json = EXCLUDED.course_snapshot_json,
          lessons_snapshot_json = EXCLUDED.lessons_snapshot_json,
          purchased_test_item_ids_json = EXCLUDED.purchased_test_item_ids_json,
          updated_at = NOW()
      `,
      [
        purchase.id,
        purchase.userId,
        purchase.courseId,
        Math.round(purchase.price),
        purchase.purchasedAt,
        purchase.paymentMethod ?? null,
        purchase.checkoutId ?? null,
        JSON.stringify(purchase.bnpl ?? null),
        JSON.stringify(purchase.courseSnapshot ?? null),
        JSON.stringify(purchase.lessonsSnapshot ?? null),
        JSON.stringify(purchase.purchasedTestItemIds ?? null),
      ]
    );
  }
};

export const upsertProfileBookings = async (
  executor: SeedExecutor,
  bookings: BookingContextDto[]
) => {
  for (const booking of bookings) {
    await executor.execute(
      `
        INSERT INTO profile_bookings (
          id,
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
          status,
          payment_status,
          meeting_url,
          materials_json,
          consent_snapshot_json,
          identity_kind,
          identity_email_canonical,
          canceled_at,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18::jsonb, $19, $20, $21, $22, NOW()
        )
        ON CONFLICT (id)
        DO UPDATE SET
          teacher_id = EXCLUDED.teacher_id,
          teacher_name = EXCLUDED.teacher_name,
          teacher_photo = EXCLUDED.teacher_photo,
          student_id = EXCLUDED.student_id,
          student_name = EXCLUDED.student_name,
          student_email = EXCLUDED.student_email,
          student_phone = EXCLUDED.student_phone,
          student_photo = EXCLUDED.student_photo,
          date = EXCLUDED.date,
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          lesson_kind = EXCLUDED.lesson_kind,
          status = EXCLUDED.status,
          payment_status = EXCLUDED.payment_status,
          meeting_url = EXCLUDED.meeting_url,
          materials_json = EXCLUDED.materials_json,
          consent_snapshot_json = EXCLUDED.consent_snapshot_json,
          identity_kind = EXCLUDED.identity_kind,
          identity_email_canonical = EXCLUDED.identity_email_canonical,
          canceled_at = EXCLUDED.canceled_at,
          created_at = EXCLUDED.created_at,
          updated_at = NOW()
      `,
      [
        booking.id,
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
        booking.status,
        booking.paymentStatus,
        booking.meetingUrl ?? null,
        JSON.stringify(booking.materials ?? []),
        booking.consentSnapshot ? JSON.stringify(booking.consentSnapshot) : null,
        "user_bound",
        booking.studentEmail.trim().toLowerCase(),
        booking.status === "canceled" ? booking.createdAt : null,
        booking.createdAt,
      ]
    );
  }
};

export const upsertTeacherAvailability = async (
  executor: SeedExecutor,
  slots: TeacherAvailabilityContextDto[]
) => {
  for (const slot of slots) {
    await executor.execute(
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
};
