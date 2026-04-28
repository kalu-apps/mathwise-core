import { describe, expect, it } from "vitest";
import type { Booking } from "@/entities/booking/model/types";
import type { AvailabilitySlot } from "@/features/teacher-availability/model/types";
import type { StudyCabinetNote } from "@/shared/lib/studyCabinet";
import {
  buildLocalDateTime,
  buildTeacherPlannerEvents,
} from "@/features/study-cabinet/teacher/model/plannerEvents";
import {
  buildPlannerTabCounts,
  filterTeacherPlannerEvents,
} from "@/features/study-cabinet/teacher/model/plannerSelectors";

const makeBooking = (overrides: Partial<Booking>): Booking => ({
  id: "booking_1",
  teacherId: "teacher_1",
  teacherName: "Teacher",
  studentId: "student_1",
  studentName: "Student",
  studentEmail: "student@example.com",
  date: "2026-04-28",
  startTime: "10:00",
  endTime: "11:00",
  lessonKind: "regular",
  status: "scheduled",
  paymentStatus: "paid",
  materials: [],
  createdAt: "2026-04-01T10:00:00.000Z",
  ...overrides,
});

const makeNote = (overrides: Partial<StudyCabinetNote>): StudyCabinetNote => ({
  id: "note_1",
  title: "Подготовить материалы",
  body: "Проверить задачи",
  dueAt: "2026-04-28T09:30:00.000",
  endAt: "2026-04-28T10:00:00.000",
  remind: true,
  color: "#38bdf8",
  kind: "prep",
  linkedBookingId: null,
  done: false,
  createdAt: "2026-04-01T10:00:00.000Z",
  updatedAt: "2026-04-01T10:00:00.000Z",
  ...overrides,
});

describe("teacher planner model", () => {
  it("normalizes only real planner entities and excludes inactive bookings", () => {
    const availability: AvailabilitySlot[] = [
      { id: "slot_1", date: "2026-04-28", startTime: "12:00", endTime: "12:30" },
    ];
    const events = buildTeacherPlannerEvents({
      bookings: [
        makeBooking({ id: "booking_regular", lessonKind: "regular" }),
        makeBooking({
          id: "booking_trial",
          lessonKind: "trial",
          startTime: "11:00",
          endTime: "11:30",
        }),
        makeBooking({
          id: "booking_canceled",
          status: "canceled",
          startTime: "13:00",
          endTime: "13:30",
        }),
      ],
      availability,
      notes: [makeNote({})],
    });

    expect(events.map((event) => event.kind)).toEqual([
      "note",
      "regular-booking",
      "trial-booking",
      "availability-slot",
    ]);
    expect(events.some((event) => event.sourceId === "booking_canceled")).toBe(false);
  });

  it("keeps tabs tied to bookings, slots and reminders", () => {
    const events = buildTeacherPlannerEvents({
      bookings: [
        makeBooking({ id: "booking_regular", lessonKind: "regular" }),
        makeBooking({ id: "booking_trial", lessonKind: "trial" }),
      ],
      availability: [
        { id: "slot_1", date: "2026-04-28", startTime: "12:00", endTime: "12:30" },
      ],
      notes: [makeNote({})],
    });
    const counts = buildPlannerTabCounts(events);

    expect(counts).toMatchObject({
      all: 4,
      bookings: 2,
      trial: 1,
      regular: 1,
      availability: 1,
      notes: 1,
    });
    expect(filterTeacherPlannerEvents(events, "regular")).toHaveLength(1);
    expect(filterTeacherPlannerEvents(events, "availability")[0].title).toBe("Свободный слот");
  });

  it("builds local date and time without shifting the selected day", () => {
    const localDate = buildLocalDateTime("2026-04-28", "23:30");

    expect(localDate?.getFullYear()).toBe(2026);
    expect(localDate?.getMonth()).toBe(3);
    expect(localDate?.getDate()).toBe(28);
    expect(localDate?.getHours()).toBe(23);
    expect(localDate?.getMinutes()).toBe(30);
  });
});
