import type { Booking } from "@/entities/booking/model/types";
import type { Course } from "@/entities/course/model/types";
import type { Purchase } from "@/entities/purchase/model/types";
import type { StudyCabinetNote } from "@/shared/lib/studyCabinet";

export type StudentStudyCabinetCourseItem = {
  course: Course;
  purchase: Purchase;
  progress: number;
  viewedCount: number;
  viewedLessonSeconds: number;
  totalLessons: number;
  remainingLessons: number;
  remainingLessonSeconds: number;
  totalTests: number;
  completedTests: number;
  remainingTests: number;
  remainingTestSeconds: number;
  remainingSeconds: number;
  testsAveragePercent: number;
  testsKnowledgePercent: number;
  isPremium: boolean;
  purchasedAt: string;
};

export type StudentStudyCabinetActionSource = "cabinet" | "next-step" | "block-map" | "reminder";

export type StudentStudyCabinetCourseOpenOptions = {
  blockId?: string;
  source?: StudentStudyCabinetActionSource;
};

export type StudentStudyCabinetLessonOpenOptions = {
  courseId?: string;
  source?: StudentStudyCabinetActionSource;
};

export type StudentStudyCabinetTestOpenOptions = {
  source?: StudentStudyCabinetActionSource;
};

export type StudentStudyCabinetPanelProps = {
  userId: string;
  courses: StudentStudyCabinetCourseItem[];
  bookings: Booking[];
  notes: StudyCabinetNote[];
  activityDays: Array<{
    key: string;
    label: string;
    minutes: number;
  }>;
  onWorkbookClick?: () => void;
  onChatClick?: () => void;
  onBrowseCourses?: () => void;
  onOpenBooking?: () => void;
  onOpenCourse?: (
    courseId: string,
    options?: StudentStudyCabinetCourseOpenOptions
  ) => void;
  onOpenLesson?: (
    lessonId: string,
    options?: StudentStudyCabinetLessonOpenOptions
  ) => void;
  onOpenTest?: (
    courseId: string,
    testItemId: string,
    options?: StudentStudyCabinetTestOpenOptions
  ) => void;
  chatDisabled?: boolean;
  chatLocked?: boolean;
};
