import type { Course } from "@/entities/course/model/types";
import type { Booking } from "@/entities/booking/model/types";
import type { AvailabilitySlot } from "@/features/teacher-availability/model/types";
import type { TeacherDashboardStudentCardData } from "@/pages/teacher/hooks/useTeacherDashboardData";
import { getBookingEndTimestamp, getBookingStartTimestamp } from "@/shared/lib/time";

export const filterTeacherStudents = (params: {
  students: TeacherDashboardStudentCardData[];
  query: string;
  feedbackStudentIds: string[];
  feedbackFilter: "all" | "with_feedback" | "without_feedback";
}) => {
  const query = params.query.trim().toLowerCase();
  const feedbackSet = new Set(params.feedbackStudentIds);
  return params.students.filter((student) => {
    const byQuery =
      student.name.toLowerCase().includes(query) ||
      student.email.toLowerCase().includes(query);
    const hasFeedback = feedbackSet.has(student.id);
    const byFeedback =
      params.feedbackFilter === "all" ||
      (params.feedbackFilter === "with_feedback" ? hasFeedback : !hasFeedback);
    return byQuery && byFeedback;
  });
};

export const filterTeacherCourses = (params: {
  courses: Course[];
  query: string;
  status: "published" | "draft";
}) =>
  params.courses.filter((course) => {
    const byStatus = course.status === params.status;
    const byQuery = course.title
      .toLowerCase()
      .includes(params.query.trim().toLowerCase());
    return byStatus && byQuery;
  });

export const paginateList = <T,>(items: T[], page: number, pageSize: number) => {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
};

export const TEACHER_TAB_KEYS = [
  "profile",
  "students",
  "courses",
  "booking",
  "study",
  "chat",
  "stats",
] as const;

export const SLOT_TIME_OPTIONS = Array.from({ length: 48 }).map((_, index) => {
  const totalMinutes = index * 30;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
});

export const getTabFromQuery = (value: string | null) => {
  const index = TEACHER_TAB_KEYS.findIndex((tabKey) => tabKey === value);
  return index >= 0 ? index : 0;
};

export const splitTeacherBookingsByCompletion = (
  bookings: Booking[],
  now = Date.now()
) => {
  const isArchivedStatus = (status: Booking["status"]) =>
    status === "canceled" || status === "completed" || status === "no_show";
  const scheduled = [...bookings]
    .filter(
      (booking) =>
        !isArchivedStatus(booking.status) && getBookingEndTimestamp(booking) >= now
    )
    .sort((a, b) => getBookingStartTimestamp(a) - getBookingStartTimestamp(b));
  const completed = [...bookings]
    .filter(
      (booking) =>
        isArchivedStatus(booking.status) || getBookingEndTimestamp(booking) < now
    )
    .sort((a, b) => getBookingEndTimestamp(b) - getBookingEndTimestamp(a));
  return { scheduled, completed };
};

export const selectUpcomingBookingReminder = (
  scheduledBookings: Booking[],
  now = Date.now()
) => {
  const oneDay = 24 * 60 * 60 * 1000;
  return (
    scheduledBookings.find((booking) => {
      const start = getBookingStartTimestamp(booking);
      return start > now && start - now <= oneDay;
    }) ?? null
  );
};

export const formatBookingReminderDate = (booking: Booking) =>
  new Date(`${booking.date}T${booking.startTime}`).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

export type AvailabilityDateGroup = {
  date: string;
  slots: AvailabilitySlot[];
};

export const buildAvailabilityDateGroups = (
  availability: AvailabilitySlot[],
  visibleDates: string[]
): AvailabilityDateGroup[] => {
  const visibleDateSet = new Set(visibleDates);
  const groups = availability.reduce<Record<string, AvailabilitySlot[]>>((acc, slot) => {
    if (!visibleDateSet.has(slot.date)) {
      return acc;
    }
    if (!acc[slot.date]) {
      acc[slot.date] = [];
    }
    acc[slot.date].push(slot);
    return acc;
  }, {});

  return Object.entries(groups)
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, slots]) => ({ date, slots }));
};

export const resolveSelectedAvailabilityDate = (
  groups: AvailabilityDateGroup[],
  slotsDateFilter: string
) => {
  if (slotsDateFilter && groups.some((group) => group.date === slotsDateFilter)) {
    return slotsDateFilter;
  }
  return groups[0]?.date ?? "";
};

export const toMinutes = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
};

export const hasTimeOverlap = (
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
) => aStart < bEnd && bStart < aEnd;
