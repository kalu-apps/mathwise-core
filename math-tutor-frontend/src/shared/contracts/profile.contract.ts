import type { Booking } from "@/entities/booking/model/types";
import type { Course } from "@/entities/course/model/types";
import type { Lesson } from "@/entities/lesson/model/types";
import type { Purchase } from "@/entities/purchase/model/types";
import type { User } from "@/entities/user/model/types";
import type { AvailabilitySlot } from "@/features/teacher-availability/model/types";

export type ProfileMeResponseContract = User | null;

export type StudentProfileContextResponseContract = {
  profile: User | null;
  courses: Course[];
  lessons: Lesson[];
  purchases: Purchase[];
  bookings: Booking[];
  teachers: User[];
  teacherAvailabilityByTeacherId: Record<string, AvailabilitySlot[]>;
};

export type TeacherDashboardContextResponseContract = {
  profile: User | null;
  courses: Course[];
  lessons: Lesson[];
  students: User[];
  bookings: Booking[];
  availability: AvailabilitySlot[];
};
