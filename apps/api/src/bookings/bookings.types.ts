export type BookingMaterialDto = {
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
export type BookingIdentityKind = "user_bound" | "guest_pending";
export type BookingSlotHoldStatus =
  | "active"
  | "consumed"
  | "released"
  | "expired";

export type BookingConsentSnapshotDto = {
  acceptedScopes: string[];
  source: "public_booking" | "student_booking";
  acceptedAt: string;
};

export type BookingDto = {
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
  materials: BookingMaterialDto[];
  consentSnapshot?: BookingConsentSnapshotDto;
  createdAt: string;
};

export type CreateBookingPayloadDto = {
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
    acceptedScopes: string[];
  };
};

export type UpdateBookingPatchDto = Partial<
  Pick<BookingDto, "meetingUrl" | "materials" | "status"> & {
    paymentStatus: BookingPaymentStatus;
    reschedule: {
      slotId: string;
    };
  }
>;

export type BookingRecord = BookingDto & {
  slotId?: string;
  identityKind: BookingIdentityKind;
  identityEmailCanonical: string;
  canceledAt?: string;
};

export type BookingSlotHoldDto = {
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

export type CreateBookingSlotHoldPayloadDto = {
  teacherId: string;
  slotId: string;
  studentEmail?: string;
};

export type BookingSlotHoldStatusResponseDto = {
  ok: true;
  hold: BookingSlotHoldDto;
  canConfirm: boolean;
  nextAction?:
    | "login_required_existing_account"
    | "complete_registration"
    | "hold_expired"
    | "hold_released"
    | "hold_consumed";
};

export type ConfirmBookingSlotHoldPayloadDto = {
  consents?: {
    acceptedScopes: string[];
  };
};
