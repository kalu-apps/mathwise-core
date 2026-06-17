import type { Booking } from "@/entities/booking/model/types";
import type { AvailabilitySlot } from "@/features/teacher-availability/model/types";
import type { StudyCabinetNote } from "@/shared/lib/studyCabinet";
import type {
  TeacherPlannerDay,
  TeacherPlannerEvent,
  TeacherPlannerViewMode,
} from "@/features/study-cabinet/teacher/model/types";

export const PLANNER_WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
export const PLANNER_START_HOUR = 0;
export const PLANNER_END_HOUR = 24;
export const PLANNER_SLOT_MINUTES = 30;
export const PLANNER_HOUR_HEIGHT = 38;

export const TEACHER_NOTE_COLORS = [
  "var(--accent-primary)",
  "var(--accent-violet)",
  "var(--accent-secondary)",
  "var(--accent-mint)",
  "var(--feedback-warning)",
  "var(--feedback-danger)",
  "var(--feedback-info)",
];

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const NOTE_KIND_LABELS: Record<NonNullable<StudyCabinetNote["kind"]>, string> = {
  prep: "Подготовка",
  followup: "Итог",
  focus: "Фокус",
  break: "Перерыв",
  custom: "Напоминание",
};

export const toLocalDateKey = (value: Date | string): string => {
  if (typeof value === "string" && DATE_KEY_PATTERN.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return toLocalDateKey(new Date());
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const fromDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

export const addDays = (dateValue: Date, days: number) => {
  const date = new Date(dateValue);
  date.setDate(date.getDate() + days);
  return date;
};

export const startOfWeek = (dateValue: Date) => {
  const date = new Date(dateValue);
  const day = (date.getDay() + 6) % 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day);
  return date;
};

export const buildPlannerDays = (
  mode: TeacherPlannerViewMode,
  selectedDateKey: string,
  visibleRangeStart: Date,
  visibleDayCount = 7
): TeacherPlannerDay[] => {
  if (mode === "day") {
    return [{ key: selectedDateKey, date: fromDateKey(selectedDateKey) }];
  }
  return Array.from({ length: Math.max(1, Math.round(visibleDayCount)) }).map((_, index) => {
    const date = addDays(visibleRangeStart, index);
    return {
      key: toLocalDateKey(date),
      date,
    };
  });
};

export const formatPlannerRangeLabel = (days: TeacherPlannerDay[]) => {
  if (!days.length) return "";
  const first = days[0].date;
  const last = days[days.length - 1].date;
  if (days.length === 1) {
    return first.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }
  const sameMonth = first.getMonth() === last.getMonth();
  const firstPart = first.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: sameMonth ? undefined : "short",
  });
  const lastPart = last.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return `${firstPart} — ${lastPart}`;
};

export const timeToMinutes = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours === 24 && minutes === 0) return 24 * 60;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

export const minutesToTime = (value: number) => {
  if (value >= 24 * 60) return "24:00";
  const safe = Math.max(0, Math.min(value, 23 * 60 + 59));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

export const buildTimeOptions = (
  fromMinutes: number,
  toMinutes: number,
  stepMinutes: number
) => {
  if (toMinutes < fromMinutes) return [];
  const result: string[] = [];
  for (let minute = fromMinutes; minute <= toMinutes; minute += stepMinutes) {
    result.push(minutesToTime(minute));
  }
  return result;
};

export const ceilToStep = (value: number, step: number) => {
  if (step <= 0) return value;
  return Math.ceil(value / step) * step;
};

export const buildLocalDateTime = (dateKey: string, timeValue: string) => {
  if (!DATE_KEY_PATTERN.test(dateKey)) return null;
  const minutes = timeToMinutes(timeValue);
  if (minutes === null) return null;
  const date = fromDateKey(dateKey);
  if (minutes >= 24 * 60) {
    date.setDate(date.getDate() + 1);
    date.setHours(0, 0, 0, 0);
    return date;
  }
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
};

export const formatTime = (value: Date | string | number) => {
  if (typeof value === "string" && /^\d{2}:\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatDayTime = (value: Date | string | number) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Скоро";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatPlannerDate = (dateKey: string) =>
  fromDateKey(dateKey).toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

export const getBookingStart = (booking: Booking) =>
  buildLocalDateTime(booking.date, booking.startTime) ??
  new Date(`${booking.date}T${booking.startTime}`);

export const getBookingEnd = (booking: Booking) => {
  const start = getBookingStart(booking);
  const end =
    buildLocalDateTime(booking.date, booking.endTime) ??
    new Date(`${booking.date}T${booking.endTime}`);
  if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end <= start) {
    end.setDate(end.getDate() + 1);
  }
  return end;
};

const getSlotStart = (slot: AvailabilitySlot) =>
  buildLocalDateTime(slot.date, slot.startTime) ??
  new Date(`${slot.date}T${slot.startTime}`);

const getSlotEnd = (slot: AvailabilitySlot) => {
  const start = getSlotStart(slot);
  const end =
    buildLocalDateTime(slot.date, slot.endTime) ?? new Date(`${slot.date}T${slot.endTime}`);
  if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end <= start) {
    end.setDate(end.getDate() + 1);
  }
  return end;
};

const buildMinutes = (date: Date) => date.getHours() * 60 + date.getMinutes();

const normalizeEndMinutes = (startMinutes: number, endMinutes: number) =>
  Math.max(startMinutes + PLANNER_SLOT_MINUTES, endMinutes);

const buildBookingEvent = (booking: Booking): TeacherPlannerEvent | null => {
  if (booking.status !== "scheduled" && booking.status !== "rescheduled") return null;
  const start = getBookingStart(booking);
  const end = getBookingEnd(booking);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const isTrial = booking.lessonKind === "trial";
  const isUnpaid = booking.lessonKind === "regular" && booking.paymentStatus === "unpaid";
  const startMinutes = buildMinutes(start);
  const endMinutes = normalizeEndMinutes(startMinutes, buildMinutes(end));
  return {
    id: `booking-${booking.id}`,
    sourceId: booking.id,
    kind: isTrial ? "trial-booking" : "regular-booking",
    dateKey: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    startMinutes,
    endMinutes,
    startAtMs: start.getTime(),
    endAtMs: end.getTime(),
    title: booking.studentName || "Ученик",
    subtitle: isTrial ? "Пробное занятие" : "Индивидуальное занятие",
    description: isTrial
      ? "Первичная встреча с учеником"
      : isUnpaid
        ? "Платное занятие, оплату нужно проверить"
        : "Плановая 1:1-сессия",
    badge: isTrial ? "Пробное" : "Платное",
    secondaryBadge: isUnpaid ? "Не оплачено" : booking.paymentStatus === "paid" ? "Оплачено" : undefined,
    statusLabel: booking.status === "rescheduled" ? "Перенесено" : "Запланировано",
    paymentLabel: isTrial
      ? "Бесплатно"
      : booking.paymentStatus === "paid"
        ? "Оплачено"
        : "Не оплачено",
    studentId: booking.studentId,
    studentName: booking.studentName,
    color: isTrial
      ? "var(--accent-mint)"
      : isUnpaid
        ? "var(--feedback-warning)"
        : "var(--accent-primary)",
    booking,
  };
};

const buildAvailabilityEvent = (slot: AvailabilitySlot): TeacherPlannerEvent | null => {
  const start = getSlotStart(slot);
  const end = getSlotEnd(slot);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const startMinutes = buildMinutes(start);
  const endMinutes = normalizeEndMinutes(startMinutes, buildMinutes(end));
  return {
    id: `slot-${slot.id}`,
    sourceId: slot.id,
    kind: "availability-slot",
    dateKey: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    startMinutes,
    endMinutes,
    startAtMs: start.getTime(),
    endAtMs: end.getTime(),
    title: "Свободный слот",
    subtitle: "Окно для записи ученика",
    description: "Слот управляется во вкладке индивидуальных занятий.",
    badge: "Слот",
    statusLabel: "Свободно",
    color: "var(--accent-violet)",
    availability: slot,
  };
};

const buildNoteEvent = (note: StudyCabinetNote): TeacherPlannerEvent | null => {
  if (note.done || !note.dueAt) return null;
  const start = new Date(note.dueAt);
  if (Number.isNaN(start.getTime())) return null;
  const rawEnd = note.endAt ? new Date(note.endAt) : null;
  const end =
    rawEnd && !Number.isNaN(rawEnd.getTime()) && rawEnd > start
      ? rawEnd
      : new Date(start.getTime() + PLANNER_SLOT_MINUTES * 60 * 1000);
  const startMinutes = buildMinutes(start);
  const endMinutes = normalizeEndMinutes(startMinutes, buildMinutes(end));
  const kindLabel = note.kind ? NOTE_KIND_LABELS[note.kind] : "Напоминание";
  return {
    id: `note-${note.id}`,
    sourceId: note.id,
    kind: "note",
    dateKey: toLocalDateKey(start),
    startTime: formatTime(start),
    endTime: formatTime(end),
    startMinutes,
    endMinutes,
    startAtMs: start.getTime(),
    endAtMs: end.getTime(),
    title: note.title,
    subtitle: kindLabel,
    description: note.body || "Личная заметка преподавателя",
    badge: "Напоминание",
    secondaryBadge: undefined,
    statusLabel: undefined,
    color: note.color || TEACHER_NOTE_COLORS[0],
    note,
  };
};

export const buildTeacherPlannerEvents = (params: {
  bookings: Booking[];
  availability: AvailabilitySlot[];
  notes: StudyCabinetNote[];
}) => {
  const events = [
    ...params.bookings.map(buildBookingEvent),
    ...params.availability.map(buildAvailabilityEvent),
    ...params.notes.map(buildNoteEvent),
  ].filter((event): event is TeacherPlannerEvent => Boolean(event));

  return events.sort((a, b) => {
    if (a.startAtMs !== b.startAtMs) return a.startAtMs - b.startAtMs;
    return a.kind.localeCompare(b.kind);
  });
};

export const getPlannerEventLayout = (event: TeacherPlannerEvent) => {
  const top =
    ((event.startMinutes - PLANNER_START_HOUR * 60) / 60) * PLANNER_HOUR_HEIGHT;
  const height = Math.max(
    30,
    ((event.endMinutes - event.startMinutes) / 60) * PLANNER_HOUR_HEIGHT - 4
  );
  return { top, height };
};

export const getPlannerEventTimeLabel = (event: TeacherPlannerEvent) =>
  `${event.startTime} — ${event.endTime}`;
