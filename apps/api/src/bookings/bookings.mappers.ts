import type { BookingDto, BookingMaterialDto, BookingRecord } from "./bookings.types";

export type BookingRow = {
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
  status: "scheduled" | "rescheduled" | "canceled" | "completed" | "no_show" | null;
  paymentStatus: "unpaid" | "paid";
  meetingUrl: string | null;
  materials: unknown;
  consentSnapshot: unknown;
  identityKind: "user_bound" | "guest_pending" | null;
  identityEmailCanonical: string | null;
  canceledAt: string | null;
  createdAt: string;
};

const normalizeBookingMaterials = (value: unknown): BookingMaterialDto[] => {
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
};

const normalizeConsentSnapshot = (value: unknown): BookingDto["consentSnapshot"] => {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const acceptedScopes = Array.isArray(raw.acceptedScopes)
    ? raw.acceptedScopes
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0)
    : [];
  const source =
    raw.source === "public_booking" || raw.source === "student_booking"
      ? raw.source
      : null;
  const acceptedAt = typeof raw.acceptedAt === "string" ? raw.acceptedAt : "";
  if (acceptedScopes.length === 0 || !source || !acceptedAt) {
    return undefined;
  }
  return { acceptedScopes, source, acceptedAt };
};

export const mapBookingRow = (row: BookingRow): BookingDto => ({
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
  status: row.status ?? "scheduled",
  paymentStatus: row.paymentStatus,
  meetingUrl: row.meetingUrl ?? undefined,
  materials: normalizeBookingMaterials(row.materials),
  consentSnapshot: normalizeConsentSnapshot(row.consentSnapshot),
  createdAt: row.createdAt,
});

export const mapBookingRowWithSlot = (row: BookingRow): BookingRecord => ({
  ...mapBookingRow(row),
  slotId: row.slotId ?? undefined,
  identityKind: row.identityKind ?? "user_bound",
  identityEmailCanonical: row.identityEmailCanonical ?? row.studentEmail.toLowerCase(),
  canceledAt: row.canceledAt ?? undefined,
});
