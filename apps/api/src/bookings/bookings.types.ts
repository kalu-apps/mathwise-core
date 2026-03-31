export type BookingMaterialDto = {
  id: string;
  name: string;
  type: "pdf" | "doc" | "video";
  url: string;
};

export type BookingLessonKind = "trial" | "regular";
export type BookingPaymentStatus = "unpaid" | "paid";

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
  paymentStatus: BookingPaymentStatus;
  meetingUrl?: string;
  materials: BookingMaterialDto[];
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
  Pick<BookingDto, "meetingUrl" | "materials"> & {
    paymentStatus: BookingPaymentStatus;
    reschedule: {
      slotId: string;
    };
  }
>;

export type BookingRecord = BookingDto & {
  slotId?: string;
};
