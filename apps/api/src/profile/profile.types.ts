import type { AuthUserDto } from "../auth/auth.types";
import type { CourseCatalogItemDto } from "../courses/courses.types";
import type { LessonDto } from "../lessons/lessons.types";

export type PurchaseContextDto = {
  id: string;
  userId: string;
  courseId: string;
  price: number;
  tariff?: "standard" | "premium";
  purchasedAt: string;
  paymentMethod?: string;
  checkoutId?: string;
  bnpl?: unknown;
  courseSnapshot?: CourseCatalogItemDto;
  lessonsSnapshot?: LessonDto[];
  purchasedTestItemIds?: string[];
};

export type BookingMaterialDto = {
  id: string;
  name: string;
  type: "pdf" | "doc" | "video";
  url: string;
};

export type BookingContextDto = {
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
  lessonKind: "trial" | "regular";
  status: "scheduled" | "rescheduled" | "canceled" | "completed" | "no_show";
  paymentStatus: "unpaid" | "paid";
  meetingUrl?: string;
  materials: BookingMaterialDto[];
  consentSnapshot?: {
    acceptedScopes: string[];
    source: "public_booking" | "student_booking";
    acceptedAt: string;
  };
  createdAt: string;
};

export type TeacherAvailabilityContextDto = {
  id: string;
  teacherId: string;
  date: string;
  startTime: string;
  endTime: string;
};

export type StudentProfileContextDto = {
  profile: AuthUserDto | null;
  courses: CourseCatalogItemDto[];
  lessons: LessonDto[];
  purchases: PurchaseContextDto[];
  bookings: BookingContextDto[];
  teachers: AuthUserDto[];
  teacherAvailabilityByTeacherId: Record<string, Array<Omit<TeacherAvailabilityContextDto, "teacherId">>>;
};

export type TeacherDashboardContextDto = {
  profile: AuthUserDto | null;
  courses: CourseCatalogItemDto[];
  lessons: LessonDto[];
  students: AuthUserDto[];
  bookings: BookingContextDto[];
  availability: Array<Omit<TeacherAvailabilityContextDto, "teacherId">>;
};
