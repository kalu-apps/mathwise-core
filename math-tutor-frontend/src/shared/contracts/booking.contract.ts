import type {
  Booking,
  BookingLessonKind,
  BookingPaymentStatus,
} from "@/entities/booking/model/types";
import type { ConsentScope } from "@/domain/auth-payments/model/types";

export type CreateBookingPayloadContract = {
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

export type BookingSlotHoldStatusContract =
  | "active"
  | "consumed"
  | "released"
  | "expired";

export type BookingSlotHoldContract = {
  id: string;
  slotId: string;
  teacherId: string;
  teacherName: string;
  teacherPhoto?: string;
  date: string;
  startTime: string;
  endTime: string;
  status: BookingSlotHoldStatusContract;
  identityEmailCanonical?: string;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
  releasedAt?: string;
};

export type CreateBookingSlotHoldPayloadContract = {
  teacherId: string;
  slotId: string;
  studentEmail?: string;
};

export type BookingSlotHoldStatusResponseContract = {
  ok: true;
  hold: BookingSlotHoldContract;
  canConfirm: boolean;
  nextAction?:
    | "login_required_existing_account"
    | "complete_registration"
    | "hold_expired"
    | "hold_released"
    | "hold_consumed";
};

export type ConfirmBookingSlotHoldPayloadContract = {
  consents?: {
    acceptedScopes: ConsentScope[];
  };
};

export type UpdateBookingPatchContract = Partial<
  Pick<Booking, "meetingUrl" | "materials" | "status"> & {
    paymentStatus: BookingPaymentStatus;
    reschedule: {
      slotId: string;
    };
  }
>;

export type DeleteBookingResponseContract = {
  id: string;
};

export type GetBookingsParamsContract = {
  teacherId?: string;
  studentId?: string;
};
