import { api } from "@/shared/api/client";
import { buildIdempotencyHeaders } from "@/shared/lib/idempotency";
import type {
  Booking,
  BookingLessonKind,
  BookingMaterial,
  BookingPaymentStatus,
} from "./types";
import type { ConsentScope } from "@/domain/auth-payments/model/types";

export type CreateBookingPayload = {
  teacherId: string;
  teacherName: string;
  teacherPhoto?: string;
  studentId?: string;
  studentName?: string;
  studentEmail: string;
  studentFirstName?: string;
  studentLastName?: string;
  studentPhone?: string;
  studentPhoto?: string;
  slotId: string;
  date: string;
  startTime: string;
  endTime: string;
  lessonKind?: BookingLessonKind;
  consents?: {
    acceptedScopes: ConsentScope[];
  };
};

export async function getBookings(params?: {
  teacherId?: string;
  studentId?: string;
}): Promise<Booking[]> {
  const query = new URLSearchParams();
  if (params?.teacherId) query.set("teacherId", params.teacherId);
  if (params?.studentId) query.set("studentId", params.studentId);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return api.get<Booking[]>(`/bookings${suffix}`);
}

export async function createBooking(
  payload: CreateBookingPayload,
  options?: { idempotencyKey?: string }
): Promise<Booking> {
  return api.post<Booking>("/bookings", payload, {
    headers: buildIdempotencyHeaders("booking", options?.idempotencyKey),
  });
}

export async function updateBooking(
  id: string,
  patch: Partial<
    Pick<Booking, "meetingUrl" | "materials"> & {
      paymentStatus: BookingPaymentStatus;
      reschedule: {
        slotId: string;
      };
    }
  >
): Promise<Booking> {
  return api.put<Booking>(`/bookings/${id}`, patch);
}

export async function deleteBooking(id: string): Promise<{ id: string }> {
  return api.del<{ id: string }>(`/bookings/${id}`);
}

export async function rescheduleBooking(
  id: string,
  slotId: string
): Promise<Booking> {
  return api.put<Booking>(`/bookings/${id}`, {
    reschedule: { slotId },
  });
}

export type BookingMaterialInput = {
  id: string;
  name: string;
  type: "pdf" | "doc" | "video";
  url: string;
};

export const normalizeMaterials = (
  materials: BookingMaterialInput[]
): BookingMaterial[] =>
  materials.map((m) => ({
    id: m.id,
    name: m.name,
    type: m.type,
    url: m.url,
  }));
