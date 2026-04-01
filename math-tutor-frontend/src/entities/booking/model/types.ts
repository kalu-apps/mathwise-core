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
