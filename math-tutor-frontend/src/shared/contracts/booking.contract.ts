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
