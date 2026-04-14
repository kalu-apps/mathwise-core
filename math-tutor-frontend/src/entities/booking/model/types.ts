export type BookingMaterial = {
  id: string;
  name: string;
  type: "pdf" | "doc" | "video";
  url: string;
};

export type BookingLessonKind = "trial" | "regular";
export type BookingPaymentStatus = "unpaid" | "paid";
export type BookingStatus =
  | "scheduled"
  | "rescheduled"
  | "canceled"
  | "completed"
  | "no_show";

export type BookingSlotHoldStatus =
  | "active"
  | "consumed"
  | "released"
  | "expired";

export type Booking = {
  id: string;
  teacherId: string;
  teacherName: string;
  teacherPhoto?: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  studentPhone?: string;
  studentPhoto?: string;
  date: string;
  startTime: string;
  endTime: string;
  lessonKind: BookingLessonKind;
  status: BookingStatus;
  paymentStatus: BookingPaymentStatus;
  meetingUrl?: string;
  materials: BookingMaterial[];
  consentSnapshot?: {
    acceptedScopes: string[];
    source: "public_booking" | "student_booking";
    acceptedAt: string;
  };
  createdAt: string;
};

export type BookingSlotHold = {
  id: string;
  slotId: string;
  teacherId: string;
  teacherName: string;
  teacherPhoto?: string;
  date: string;
  startTime: string;
  endTime: string;
  status: BookingSlotHoldStatus;
  identityEmailCanonical?: string;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
  releasedAt?: string;
};

export type BookingSlotHoldStatusResponse = {
  ok: true;
  hold: BookingSlotHold;
  canConfirm: boolean;
  nextAction?:
    | "login_required_existing_account"
    | "complete_registration"
    | "hold_expired"
    | "hold_released"
    | "hold_consumed";
};
