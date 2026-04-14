import { bookingGateway } from "@/shared/gateway";
import type {
  Booking,
  BookingLessonKind,
  BookingMaterial,
  BookingPaymentStatus,
  BookingSlotHoldStatusResponse,
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
  return bookingGateway.getBookings(params);
}

export async function createBooking(
  payload: CreateBookingPayload,
  options?: { idempotencyKey?: string }
): Promise<Booking> {
  return bookingGateway.createBooking(payload, options);
}

export type CreateBookingSlotHoldPayload = {
  teacherId: string;
  slotId: string;
  studentEmail?: string;
};

export async function createBookingSlotHold(
  payload: CreateBookingSlotHoldPayload,
  options?: { idempotencyKey?: string }
): Promise<BookingSlotHoldStatusResponse> {
  return bookingGateway.createBookingSlotHold(payload, options);
}

export async function getBookingSlotHoldStatus(
  holdId: string
): Promise<BookingSlotHoldStatusResponse> {
  return bookingGateway.getBookingSlotHoldStatus(holdId);
}

export type ConfirmBookingSlotHoldPayload = {
  consents?: {
    acceptedScopes: ConsentScope[];
  };
};

export async function confirmBookingSlotHold(
  holdId: string,
  payload?: ConfirmBookingSlotHoldPayload,
  options?: { idempotencyKey?: string }
): Promise<Booking> {
  return bookingGateway.confirmBookingSlotHold(holdId, payload, options);
}

export async function updateBooking(
  id: string,
  patch: Partial<
    Pick<Booking, "meetingUrl" | "materials" | "status"> & {
      paymentStatus: BookingPaymentStatus;
      reschedule: {
        slotId: string;
      };
    }
  >
): Promise<Booking> {
  return bookingGateway.updateBooking(id, patch);
}

export async function deleteBooking(id: string): Promise<{ id: string }> {
  return bookingGateway.deleteBooking(id);
}

export async function rescheduleBooking(
  id: string,
  slotId: string
): Promise<Booking> {
  return bookingGateway.rescheduleBooking(id, slotId);
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
