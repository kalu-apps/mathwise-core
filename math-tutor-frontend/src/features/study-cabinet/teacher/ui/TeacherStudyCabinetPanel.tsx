import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  Button,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  MenuItem,
  TextField,
  Tooltip,
  useMediaQuery,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AutoStoriesRoundedIcon from "@mui/icons-material/AutoStoriesRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EventRoundedIcon from "@mui/icons-material/EventRounded";
import ForumRoundedIcon from "@mui/icons-material/ForumRounded";
import PaymentRoundedIcon from "@mui/icons-material/PaymentRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import TimerRoundedIcon from "@mui/icons-material/TimerRounded";
import ViewAgendaRoundedIcon from "@mui/icons-material/ViewAgendaRounded";
import ViewWeekRoundedIcon from "@mui/icons-material/ViewWeekRounded";
import type { Booking } from "@/entities/booking/model/types";
import {
  defaultCabinetTaskState,
  dismissCabinetTask,
  normalizeCabinetTaskState,
  snoozeCabinetTask,
  unsnoozeCabinetTask,
  type CabinetTaskState,
} from "@/features/study-cabinet/shared/model/taskState";
import type { StudyCabinetNote } from "@/shared/lib/studyCabinet";
import { readStorage, writeStorage } from "@/shared/lib/localDb";
import type { TeacherStudyCabinetPanelProps } from "@/features/study-cabinet/teacher/model/types";

const plannerWeekdayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const PLANNER_START_HOUR = 0;
const PLANNER_END_HOUR = 24;
const PLANNER_SLOT_MINUTES = 30;
const PLANNER_HOUR_HEIGHT = 36;
const NOTE_COLORS = [
  "#f59e0b",
  "#38bdf8",
  "#22c55e",
  "#a855f7",
  "#ef4444",
  "#f97316",
  "#14b8a6",
];
const SNOOZE_MS = 1000 * 60 * 60 * 12;

const TASK_STATE_STORAGE_PREFIX = "teacher-cabinet:task-state:";
const FOCUS_MODE_STORAGE_PREFIX = "teacher-cabinet:today-focus:";

type TemplateId = "prep" | "followup" | "office" | "break" | "custom";

type ReminderGroup = "urgent" | "week" | "snoozed";

type TeacherTask = {
  id: string;
  title: string;
  subtitle: string;
  tag: string;
  estimateMinutes: number;
  group: Exclude<ReminderGroup, "snoozed">;
  tone: "accent" | "warning" | "neutral";
  dueAt?: number;
  onDoNow?: () => void;
  onSecondary?: () => void;
  secondaryLabel?: string;
};

type PlannerEvent = {
  id: string;
  kind: "booking" | "note";
  title: string;
  description?: string;
  startAt: string;
  endAt?: string;
  color?: string;
  badge?: string;
  booking?: Booking;
  note?: StudyCabinetNote;
};

const toLocalDateKey = (value: Date | string) => {
  const date = value instanceof Date ? value : new Date(value);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const fromDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

const startOfWeek = (dateValue: Date) => {
  const date = new Date(dateValue);
  const day = (date.getDay() + 6) % 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day);
  return date;
};

const addDays = (dateValue: Date, days: number) => {
  const date = new Date(dateValue);
  date.setDate(date.getDate() + days);
  return date;
};

const buildWeekDays = (weekStart: Date) =>
  Array.from({ length: 7 }).map((_, index) => {
    const date = addDays(weekStart, index);
    return {
      key: toLocalDateKey(date),
      date,
    };
  });

const formatTime = (value: number | Date | string) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDayTime = (value: number | Date | string) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Скоро";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const timeToMinutes = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours === 24 && minutes === 0) return 24 * 60;
  return hours * 60 + minutes;
};

const minutesToTime = (value: number) => {
  if (value >= 24 * 60) return "24:00";
  const safe = Math.max(0, Math.min(value, 23 * 60 + 59));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const buildTimeOptions = (fromMinutes: number, toMinutes: number, stepMinutes: number) => {
  if (toMinutes < fromMinutes) return [];
  const result: string[] = [];
  for (let minute = fromMinutes; minute <= toMinutes; minute += stepMinutes) {
    result.push(minutesToTime(minute));
  }
  return result;
};

const ceilToStep = (value: number, step: number) => {
  if (step <= 0) return value;
  return Math.ceil(value / step) * step;
};

const getPlannerRangeLabel = (days: Array<{ date: Date }>) => {
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

const getPlannerEventLayout = (event: PlannerEvent) => {
  const start = new Date(event.startAt);
  if (Number.isNaN(start.getTime())) return null;
  const end = event.endAt ? new Date(event.endAt) : null;
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes =
    end && !Number.isNaN(end.getTime())
      ? end.getHours() * 60 + end.getMinutes()
      : startMinutes + 60;
  const normalizedEnd = Math.max(startMinutes + PLANNER_SLOT_MINUTES, endMinutes);
  const top = ((startMinutes - PLANNER_START_HOUR * 60) / 60) * PLANNER_HOUR_HEIGHT;
  const height = Math.max(
    28,
    ((normalizedEnd - startMinutes) / 60) * PLANNER_HOUR_HEIGHT - 2
  );
  return { top, height };
};

const getBookingStart = (booking: Booking) => new Date(`${booking.date}T${booking.startTime}`);
const getBookingEnd = (booking: Booking) => new Date(`${booking.date}T${booking.endTime}`);

const getTaskStateKey = (userId: string) => `${TASK_STATE_STORAGE_PREFIX}${userId}`;

const getTemplatePreset = (templateId: TemplateId, booking?: Booking) => {
  if (templateId === "prep") {
    return {
      title: booking ? `Подготовка: ${booking.studentName}` : "Подготовка к занятию",
      body: booking
        ? `План урока, материалы и ключевые точки для ${booking.studentName}.`
        : "План, материалы и ключевые задачи перед занятием.",
      durationMinutes: 15,
      color: "#38bdf8",
    };
  }
  if (templateId === "followup") {
    return {
      title: booking ? `Итог: ${booking.studentName}` : "Итог после занятия",
      body: booking
        ? `Следующие шаги, домашнее задание и рекомендации для ${booking.studentName}.`
        : "Зафиксировать итог и следующие шаги для ученика.",
      durationMinutes: 10,
      color: "#22c55e",
    };
  }
  if (templateId === "office") {
    return {
      title: "Приёмные часы",
      body: "Свободный блок для ответов ученикам и подготовки.",
      durationMinutes: 30,
      color: "#a855f7",
    };
  }
  if (templateId === "break") {
    return {
      title: "Перерыв",
      body: "Короткая пауза между занятиями.",
      durationMinutes: 15,
      color: "#f59e0b",
    };
  }
  return {
    title: "Заметка",
    body: "",
    durationMinutes: 30,
    color: NOTE_COLORS[0],
  };
};

const mapTemplateToNoteKind = (
  templateId: TemplateId
): "prep" | "followup" | "focus" | "break" | "custom" => {
  if (templateId === "prep") return "prep";
  if (templateId === "followup") return "followup";
  if (templateId === "break") return "break";
  if (templateId === "office") return "focus";
  return "custom";
};

const getCountdownLabel = (startAt: Date) => {
  const diff = startAt.getTime() - Date.now();
  if (diff <= 0) return "Начинается сейчас";
  const totalMinutes = Math.round(diff / 60000);
  if (totalMinutes < 60) return `Через ${totalMinutes} мин`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `Через ${hours} ч ${minutes} мин` : `Через ${hours} ч`;
};

export function TeacherStudyCabinetPanel({
  userId,
  bookings,
  availability,
  notes,
  chatUnreadCount,
  onWorkbookClick,
  onChatClick,
  onOpenSchedule,
  onOpenStudentChat,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
}: TeacherStudyCabinetPanelProps) {
  const isCompactLayout = useMediaQuery("(max-width:960px)");
  const [plannerView, setPlannerView] = useState<"day" | "week">("week");
  const [plannerCollapsed, setPlannerCollapsed] = useState(false);
  const [selectedDateKey, setSelectedDateKey] = useState(() => toLocalDateKey(new Date()));
  const [visibleRangeStart, setVisibleRangeStart] = useState(() => startOfWeek(new Date()));
  const [taskGroup, setTaskGroup] = useState<ReminderGroup>("urgent");
  const [taskState, setTaskState] = useState<CabinetTaskState>(() =>
    normalizeCabinetTaskState(
      readStorage<CabinetTaskState>(getTaskStateKey(userId), defaultCabinetTaskState)
    )
  );
  const [todayFocusMode, setTodayFocusMode] = useState<boolean>(() =>
    readStorage<boolean>(`${FOCUS_MODE_STORAGE_PREFIX}${userId}`, false)
  );
  const [sessionDrawerBooking, setSessionDrawerBooking] = useState<Booking | null>(null);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteDate, setNoteDate] = useState(() => toLocalDateKey(new Date()));
  const [noteTime, setNoteTime] = useState("10:00");
  const [noteEndTime, setNoteEndTime] = useState("10:30");
  const [noteColor, setNoteColor] = useState(NOTE_COLORS[0]);
  const [noteTimeError, setNoteTimeError] = useState<string | null>(null);
  const [noteKind, setNoteKind] = useState<
    "prep" | "followup" | "focus" | "break" | "custom"
  >("custom");
  const [linkedBookingId, setLinkedBookingId] = useState<string | null>(null);
  const plannerScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    writeStorage(`${FOCUS_MODE_STORAGE_PREFIX}${userId}`, todayFocusMode);
  }, [todayFocusMode, userId]);

  const now = new Date();
  const nowTimestamp = now.getTime();
  const todayKey = toLocalDateKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const normalizedTaskState = useMemo(
    () => normalizeCabinetTaskState(taskState, nowTimestamp),
    [taskState, nowTimestamp]
  );

  useEffect(() => {
    writeStorage(getTaskStateKey(userId), normalizedTaskState);
  }, [normalizedTaskState, userId]);

  const scheduledBookings = useMemo(
    () =>
      [...bookings]
        .filter((booking) => getBookingEnd(booking).getTime() >= nowTimestamp)
        .sort((a, b) => getBookingStart(a).getTime() - getBookingStart(b).getTime()),
    [bookings, nowTimestamp]
  );

  const nextSession = scheduledBookings[0] ?? null;

  const todayBookings = useMemo(
    () => bookings.filter((booking) => booking.date === todayKey),
    [bookings, todayKey]
  );

  const nextFreeSlot = useMemo(() => {
    const sorted = [...availability]
      .filter((slot) => new Date(`${slot.date}T${slot.startTime}`).getTime() >= nowTimestamp)
      .sort(
        (a, b) =>
          new Date(`${a.date}T${a.startTime}`).getTime() -
          new Date(`${b.date}T${b.startTime}`).getTime()
      );
    return sorted[0] ?? null;
  }, [availability, nowTimestamp]);

  const unpaidQueue = useMemo(
    () => scheduledBookings.filter((booking) => booking.lessonKind === "regular" && booking.paymentStatus === "unpaid"),
    [scheduledBookings]
  );

  const manualReminderNotes = useMemo(
    () =>
      notes
        .filter((note) => note.remind && !note.done && note.dueAt)
        .sort((a, b) => new Date(a.dueAt ?? 0).getTime() - new Date(b.dueAt ?? 0).getTime()),
    [notes]
  );

  const upcomingReminderBookings = useMemo(
    () =>
      scheduledBookings
        .filter((booking) => booking.id !== nextSession?.id)
        .filter((booking) => getBookingStart(booking).getTime() - nowTimestamp <= 7 * 24 * 60 * 60 * 1000)
        .filter((booking) => !(booking.lessonKind === "regular" && booking.paymentStatus === "unpaid"))
        .slice(0, 4),
    [scheduledBookings, nextSession, nowTimestamp]
  );


  const todayOverview = useMemo(() => {
    const trialCount = todayBookings.filter((booking) => booking.lessonKind === "trial").length;
    const paidCount = todayBookings.filter((booking) => booking.lessonKind === "regular").length;
    return {
      total: todayBookings.length,
      trialCount,
      paidCount,
      nextFreeSlot,
    };
  }, [todayBookings, nextFreeSlot]);

  const openTemplateNote = (templateId: TemplateId, booking?: Booking) => {
    const preset = getTemplatePreset(templateId, booking);
    const bookingStart = booking ? getBookingStart(booking) : null;
    const baseDate = bookingStart && bookingStart.getTime() > nowTimestamp ? bookingStart : new Date(Math.max(nowTimestamp, Date.now()));
    const startDate = new Date(baseDate);
    const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
    const roundedStart = ceilToStep(startMinutes, PLANNER_SLOT_MINUTES);
    startDate.setHours(0, 0, 0, 0);
    const normalizedDate = booking ? booking.date : toLocalDateKey(baseDate);
    const startTime = minutesToTime(Math.min(roundedStart, 23 * 60 + 30));
    const endTime = minutesToTime(Math.min((timeToMinutes(startTime) ?? roundedStart) + preset.durationMinutes, 24 * 60));
    setEditingNoteId(null);
    setNoteTitle(preset.title);
    setNoteBody(preset.body);
    setNoteDate(normalizedDate);
    setNoteTime(startTime);
    setNoteEndTime(endTime);
    setNoteColor(preset.color);
    setNoteKind(mapTemplateToNoteKind(templateId));
    setLinkedBookingId(booking?.id ?? null);
    setNoteTimeError(null);
    setNoteModalOpen(true);
  };

  const plannerMode: "day" | "week" = isCompactLayout ? "day" : plannerView;

  const plannerDays = useMemo(() => {
    if (plannerMode === "day") {
      const date = fromDateKey(selectedDateKey);
      return [{ key: selectedDateKey, date }];
    }
    return buildWeekDays(visibleRangeStart);
  }, [plannerMode, selectedDateKey, visibleRangeStart]);

  const plannerRangeLabel = useMemo(() => getPlannerRangeLabel(plannerDays), [plannerDays]);
  const plannerDayKeys = useMemo(() => new Set(plannerDays.map((day) => day.key)), [plannerDays]);
  const plannerHourLabels = useMemo(() => {
    const count = PLANNER_END_HOUR - PLANNER_START_HOUR + 1;
    return Array.from({ length: count }).map((_, index) => {
      const hour = PLANNER_START_HOUR + index;
      return `${String(hour).padStart(2, "0")}:00`;
    });
  }, []);
  const plannerSlotCount = useMemo(
    () => ((PLANNER_END_HOUR - PLANNER_START_HOUR) * 60) / PLANNER_SLOT_MINUTES,
    []
  );

  const calendarEvents = useMemo<PlannerEvent[]>(() => {
    const events: PlannerEvent[] = [];

    scheduledBookings.forEach((booking) => {
      const start = getBookingStart(booking);
      const end = getBookingEnd(booking);
      events.push({
        id: `booking-${booking.id}`,
        kind: "booking",
        title: booking.studentName,
        description:
          booking.lessonKind === "trial"
            ? "Пробное занятие"
            : booking.paymentStatus === "paid"
              ? "Платное занятие"
              : "Платное, не оплачено",
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        badge: booking.lessonKind === "trial" ? "Пробное" : "1:1",
        booking,
      });
    });

    notes.forEach((note) => {
      if (!note.dueAt) return;
      const start = new Date(note.dueAt);
      if (Number.isNaN(start.getTime())) return;
      const end = note.endAt ? new Date(note.endAt) : null;
      events.push({
        id: `note-${note.id}`,
        kind: "note",
        title: note.title,
        description: note.body || undefined,
        startAt: start.toISOString(),
        endAt: end && !Number.isNaN(end.getTime()) ? end.toISOString() : new Date(start.getTime() + 30 * 60 * 1000).toISOString(),
        color: note.color,
        badge: "Заметка",
        note,
      });
    });

    return events.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }, [scheduledBookings, notes]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, PlannerEvent[]>();
    calendarEvents.forEach((event) => {
      const key = toLocalDateKey(event.startAt);
      if (!plannerDayKeys.has(key)) return;
      const current = map.get(key) ?? [];
      current.push(event);
      map.set(key, current);
    });
    return map;
  }, [calendarEvents, plannerDayKeys]);

  const todayRunSheet = useMemo(
    () =>
      calendarEvents
        .filter((event) => toLocalDateKey(event.startAt) === todayKey)
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
    [calendarEvents, todayKey]
  );

  const maxEventTimestamp = useMemo(
    () =>
      calendarEvents.reduce((max, event) => {
        const start = new Date(event.startAt).getTime();
        return Number.isFinite(start) && start > max ? start : max;
      }, nowTimestamp),
    [calendarEvents, nowTimestamp]
  );

  const openEditModal = useCallback((note: StudyCabinetNote) => {
    const due = note.dueAt ? new Date(note.dueAt) : null;
    setEditingNoteId(note.id);
    setNoteTitle(note.title);
    setNoteBody(note.body);
    setNoteDate(due ? toLocalDateKey(due) : selectedDateKey);
    setNoteTime(
      due
        ? `${String(due.getHours()).padStart(2, "0")}:${String(due.getMinutes()).padStart(2, "0")}`
        : "10:00"
    );
    const end = note.endAt ? new Date(note.endAt) : null;
    setNoteEndTime(
      end
        ? `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`
        : "10:30"
    );
    setNoteColor(note.color || NOTE_COLORS[0]);
    setNoteKind(note.kind ?? "custom");
    setLinkedBookingId(note.linkedBookingId ?? null);
    setNoteTimeError(null);
    setNoteModalOpen(true);
  }, [selectedDateKey]);

  const handleCalendarEventClick = (event: PlannerEvent) => {
    if (event.kind === "note" && event.note) {
      openEditModal(event.note);
      return;
    }
    if (event.kind === "booking" && event.booking) {
      setSessionDrawerBooking(event.booking);
    }
  };

  const startTimeOptions = useMemo(() => {
    const minByDay = noteDate === todayKey ? ceilToStep(nowMinutes, PLANNER_SLOT_MINUTES) : 0;
    const maxStart = 23 * 60 + 30;
    return buildTimeOptions(minByDay, maxStart, PLANNER_SLOT_MINUTES);
  }, [noteDate, nowMinutes, todayKey]);

  const resolvedNoteTime = useMemo(() => {
    if (startTimeOptions.includes(noteTime)) return noteTime;
    return startTimeOptions[0] ?? noteTime;
  }, [startTimeOptions, noteTime]);

  const endTimeOptions = useMemo(() => {
    const startMinutes = timeToMinutes(resolvedNoteTime);
    if (startMinutes === null) return [];
    return buildTimeOptions(startMinutes + PLANNER_SLOT_MINUTES, 24 * 60, PLANNER_SLOT_MINUTES);
  }, [resolvedNoteTime]);

  const resolvedNoteEndTime = useMemo(() => {
    if (endTimeOptions.includes(noteEndTime)) return noteEndTime;
    return endTimeOptions[0] ?? noteEndTime;
  }, [endTimeOptions, noteEndTime]);

  const buildLocalDateTime = (dateKey: string, timeValue: string) => {
    if (!dateKey || !timeValue) return null;
    if (timeValue === "24:00") {
      const date = fromDateKey(dateKey);
      date.setDate(date.getDate() + 1);
      date.setHours(0, 0, 0, 0);
      return date;
    }
    const candidate = new Date(`${dateKey}T${timeValue}`);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
  };

  const saveNote = () => {
    if (!noteTitle.trim()) return;
    const startDate = buildLocalDateTime(noteDate, resolvedNoteTime);
    const endDate = buildLocalDateTime(noteDate, resolvedNoteEndTime);
    if (!startDate || Number.isNaN(startDate.getTime())) {
      setNoteTimeError("Укажите корректное время начала.");
      return;
    }
    if (!endDate || Number.isNaN(endDate.getTime()) || endDate.getTime() <= startDate.getTime()) {
      setNoteTimeError("Время окончания должно быть позже времени начала.");
      return;
    }
    if (!editingNoteId && startDate.getTime() < nowTimestamp) {
      setNoteTimeError("Нельзя планировать заметку на прошедшее время.");
      return;
    }
    setNoteTimeError(null);
    const payload = {
      title: noteTitle.trim(),
      body: noteBody.trim(),
      dueAt: startDate.toISOString(),
      endAt: endDate.toISOString(),
      remind: true,
      color: noteColor,
      kind: noteKind,
      linkedBookingId,
    };
    if (editingNoteId && onUpdateNote) {
      onUpdateNote({
        noteId: editingNoteId,
        ...payload,
      });
    } else if (!editingNoteId && onCreateNote) {
      onCreateNote(payload);
    }
    setNoteModalOpen(false);
  };

  const deleteEditingNote = () => {
    if (!editingNoteId || !onDeleteNote) return;
    onDeleteNote(editingNoteId);
    setNoteModalOpen(false);
  };

  const shiftPlannerRange = (step: number) => {
    if (plannerMode === "day") {
      setSelectedDateKey(toLocalDateKey(addDays(fromDateKey(selectedDateKey), step)));
      return;
    }
    setVisibleRangeStart((prev) => addDays(prev, step * 7));
  };

  const handleGoToday = () => {
    const current = new Date();
    setSelectedDateKey(toLocalDateKey(current));
    setVisibleRangeStart(startOfWeek(current));
  };

  useEffect(() => {
    const container = plannerScrollRef.current;
    if (!container || plannerCollapsed || todayFocusMode) return;
    const hasTodayInView =
      plannerMode === "day"
        ? selectedDateKey === todayKey
        : plannerDays.some((day) => day.key === todayKey);
    if (!hasTodayInView) return;
    const targetTop = ((nowMinutes - PLANNER_START_HOUR * 60) / 60) * PLANNER_HOUR_HEIGHT - PLANNER_HOUR_HEIGHT * 2;
    container.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
  }, [plannerCollapsed, plannerMode, plannerDays, selectedDateKey, todayFocusMode, nowMinutes, todayKey]);

  const draftTaskList = useMemo<TeacherTask[]>(() => {
    const tasks: TeacherTask[] = [];

    upcomingReminderBookings.forEach((booking) => {
      const startAt = getBookingStart(booking).getTime();
      const isTrial = booking.lessonKind === "trial";
      tasks.push({
        id: `session-${booking.id}`,
        title: `Сессия: ${booking.studentName}`,
        subtitle: `${formatDayTime(startAt)} · ${isTrial ? "пробное занятие" : "плановая 1:1-сессия"}`,
        tag: isTrial ? "Пробное" : "Платное",
        estimateMinutes: 2,
        group: startAt - nowTimestamp <= 24 * 60 * 60 * 1000 ? "urgent" : "week",
        tone: isTrial ? "accent" : "neutral",
        dueAt: startAt,
        onDoNow: onOpenSchedule,
        onSecondary: () => onOpenStudentChat?.(booking.studentId),
        secondaryLabel: "Написать",
      });
    });

    unpaidQueue.forEach((booking) => {
      tasks.push({
        id: `payment-${booking.id}`,
        title: `Проверить оплату: ${booking.studentName}`,
        subtitle: `${formatDayTime(getBookingStart(booking))} · платное занятие ещё не оплачено`,
        tag: "Не оплачено",
        estimateMinutes: 2,
        group: getBookingStart(booking).getTime() - nowTimestamp <= 24 * 60 * 60 * 1000 ? "urgent" : "week",
        tone: "warning",
        dueAt: getBookingStart(booking).getTime(),
        onDoNow: onOpenSchedule,
        onSecondary: () => onOpenStudentChat?.(booking.studentId),
        secondaryLabel: "Написать",
      });
    });

    manualReminderNotes.forEach((note) => {
      const dueAt = note.dueAt ? new Date(note.dueAt).getTime() : Number.NaN;
      if (!Number.isFinite(dueAt)) return;
      tasks.push({
        id: `note-${note.id}`,
        title: note.title,
        subtitle: note.body || `Заметка на ${formatDayTime(dueAt)}`,
        tag: "Заметка",
        estimateMinutes: 2,
        group: dueAt - nowTimestamp <= 24 * 60 * 60 * 1000 ? "urgent" : "week",
        tone: "neutral",
        dueAt,
        onDoNow: () => openEditModal(note),
      });
    });

    const seen = new Set<string>();
    return tasks.filter((task) => {
      if (seen.has(task.id)) return false;
      seen.add(task.id);
      return true;
    });
  }, [manualReminderNotes, nowTimestamp, onOpenSchedule, onOpenStudentChat, openEditModal, upcomingReminderBookings, unpaidQueue]);

  const dismissedTaskSet = useMemo(
    () => new Set(normalizedTaskState.dismissed),
    [normalizedTaskState.dismissed]
  );

  const reminderTasks = useMemo(() => {
    const active = draftTaskList.filter((task) => {
      if (dismissedTaskSet.has(task.id)) return false;
      const snoozeUntil = normalizedTaskState.snoozed[task.id];
      return !(typeof snoozeUntil === "number" && snoozeUntil > nowTimestamp);
    });
    const snoozed = draftTaskList.filter((task) => {
      if (dismissedTaskSet.has(task.id)) return false;
      const snoozeUntil = normalizedTaskState.snoozed[task.id];
      return typeof snoozeUntil === "number" && snoozeUntil > nowTimestamp;
    });

    return {
      urgent: active.filter((task) => task.group === "urgent"),
      week: active.filter((task) => task.group === "week"),
      snoozed,
    };
  }, [dismissedTaskSet, draftTaskList, normalizedTaskState.snoozed, nowTimestamp]);

  const activeActionCount = reminderTasks.urgent.length + reminderTasks.week.length;

  const handleSnoozeTask = (taskId: string) => {
    setTaskState((prev) =>
      normalizeCabinetTaskState(
        snoozeCabinetTask(prev, taskId, Date.now() + SNOOZE_MS)
      )
    );
  };

  const handleDismissTask = (taskId: string) => {
    setTaskState((prev) => normalizeCabinetTaskState(dismissCabinetTask(prev, taskId)));
  };

  const handleUnsnoozeTask = (taskId: string) => {
    setTaskState((prev) => normalizeCabinetTaskState(unsnoozeCabinetTask(prev, taskId)));
  };

  const currentReminderTasks =
    taskGroup === "urgent"
      ? reminderTasks.urgent
      : taskGroup === "week"
        ? reminderTasks.week
        : reminderTasks.snoozed;

  const renderTaskCard = (task: TeacherTask, isSnoozed: boolean) => (
    <article
      key={task.id}
      className={`study-cabinet-panel__teacher-task study-cabinet-panel__teacher-task--${task.tone}`}
    >
      <div className="study-cabinet-panel__teacher-task-head">
        <span className="study-cabinet-panel__teacher-task-badge">{task.tag}</span>
        <span className="study-cabinet-panel__teacher-task-time">≈ {task.estimateMinutes} мин</span>
      </div>
      <strong>{task.title}</strong>
      <p>{task.subtitle}</p>
      <div className="study-cabinet-panel__teacher-task-actions">
        <Button size="small" onClick={() => task.onDoNow?.()} disabled={!task.onDoNow}>
          {isSnoozed ? "Вернуть" : "Сделать сейчас"}
        </Button>
        {task.secondaryLabel ? (
          <Button size="small" variant="text" onClick={() => task.onSecondary?.()}>
            {task.secondaryLabel}
          </Button>
        ) : null}
        <Button
          size="small"
          variant="text"
          onClick={() => (isSnoozed ? handleUnsnoozeTask(task.id) : handleSnoozeTask(task.id))}
        >
          {isSnoozed ? "Оставить" : "Отложить"}
        </Button>
        <Button size="small" color="inherit" onClick={() => handleDismissTask(task.id)}>
          Скрыть
        </Button>
      </div>
    </article>
  );

  const reminderHint =
    activeActionCount > 0
      ? activeActionCount === 1
        ? "Есть 1 задача, требующая внимания."
        : `Есть ${activeActionCount} задач, требующих внимания.`
      : null;

  return (
    <section className={`study-cabinet-panel study-cabinet-panel--teacher-redesign ${activeActionCount > 0 ? "study-cabinet-panel--alert" : ""}`}>
      {reminderHint ? <div className="study-cabinet-panel__urgent">{reminderHint}</div> : null}

      <div className="study-cabinet-panel__teacher-overview-row">
        <div className="study-cabinet-panel__cover study-cabinet-panel__teacher-cover-card">
          <div className="study-cabinet-panel__veil" />
          <div className="study-cabinet-panel__cover-content">
            <div className="study-cabinet-panel__hero study-cabinet-panel__teacher-hero">
              <div className="study-cabinet-panel__hero-bar">
                <span className="study-cabinet-panel__kicker">Учебный кабинет преподавателя</span>
                <div className="study-cabinet-panel__teacher-indicators">
                  {chatUnreadCount > 0 ? (
                    <span className="study-cabinet-panel__teacher-pill">
                      <ForumRoundedIcon fontSize="inherit" /> Непрочитано: {chatUnreadCount}
                    </span>
                  ) : null}
                  <Tooltip title="Быстрая заметка">
                    <IconButton
                      className="study-cabinet-panel__teacher-icon-action"
                      onClick={() => openTemplateNote("custom")}
                      aria-label="Добавить заметку"
                    >
                      <AddRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </div>
              </div>
              <h2>Командный центр преподавателя</h2>
              <p>
                Операционный центр преподавателя: ближайшие занятия, напоминания и доступ к ключевым разделам без дублирования расписания, чата и аналитики.
              </p>
              <div className="study-cabinet-panel__hero-nav study-cabinet-panel__teacher-hero-nav">
                <button type="button" className="study-cabinet-panel__hero-btn" onClick={onWorkbookClick}>
                  <AutoStoriesRoundedIcon fontSize="small" />
                  <span>Рабочая тетрадь</span>
                </button>
                <button type="button" className="study-cabinet-panel__hero-btn study-cabinet-panel__hero-btn--chat" onClick={onChatClick}>
                  <ForumRoundedIcon fontSize="small" />
                  <span>Чат</span>
                </button>
                <button type="button" className="study-cabinet-panel__hero-btn" onClick={onOpenSchedule}>
                  <CalendarMonthRoundedIcon fontSize="small" />
                  <span>Расписание</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <article className="study-cabinet-panel__smart-card study-cabinet-panel__smart-card--reminders study-cabinet-panel__teacher-reminders-card">
          <div className="study-cabinet-panel__smart-head">
            <div>
              <span className="study-cabinet-panel__kicker">Напоминания</span>
            </div>
            <div className="study-cabinet-panel__teacher-tabset">
              <button type="button" className={taskGroup === "urgent" ? "is-active" : ""} onClick={() => setTaskGroup("urgent")}>Срочно</button>
              <button type="button" className={taskGroup === "week" ? "is-active" : ""} onClick={() => setTaskGroup("week")}>Неделя</button>
              <button type="button" className={taskGroup === "snoozed" ? "is-active" : ""} onClick={() => setTaskGroup("snoozed")}>Отложено</button>
            </div>
          </div>
          <div className="study-cabinet-panel__teacher-task-list">
            {currentReminderTasks.length > 0 ? (
              currentReminderTasks.map((task) => renderTaskCard(task, taskGroup === "snoozed"))
            ) : (
              <div className="study-cabinet-panel__empty">
                {taskGroup === "snoozed" ? "Отложенных задач нет." : "Актуальных задач в этой группе нет."}
              </div>
            )}
          </div>
        </article>
      </div>

      <div className="study-cabinet-panel__teacher-topline">
        <article className="study-cabinet-panel__smart-card study-cabinet-panel__teacher-primary-card">
          <div className="study-cabinet-panel__smart-head">
            <div>
              <span className="study-cabinet-panel__kicker">Следующее занятие</span>
            </div>
            {nextSession ? (
              <span className={`study-cabinet-panel__teacher-session-badge ${nextSession.lessonKind === "trial" ? "is-trial" : "is-paid"}`}>
                {nextSession.lessonKind === "trial" ? "Пробное" : "Платное"}
              </span>
            ) : null}
          </div>
          {nextSession ? (
            <>
              <strong className="study-cabinet-panel__teacher-primary-student">{nextSession.studentName}</strong>
              <div className="study-cabinet-panel__teacher-primary-meta">
                <span><ScheduleRoundedIcon fontSize="inherit" /> {formatDayTime(getBookingStart(nextSession))}</span>
                <span><TimerRoundedIcon fontSize="inherit" /> {getCountdownLabel(getBookingStart(nextSession))}</span>
                <span>
                  <PaymentRoundedIcon fontSize="inherit" />
                  {nextSession.lessonKind === "trial"
                    ? "Бесплатно"
                    : nextSession.paymentStatus === "paid"
                      ? "Оплачено"
                      : "Не оплачено"}
                </span>
              </div>
              <div className="study-cabinet-panel__teacher-primary-actions">
                <Button variant="contained" onClick={onOpenSchedule}>Открыть занятие</Button>
                <Button variant="outlined" onClick={() => openTemplateNote("prep", nextSession)}>Добавить подготовку</Button>
                <Button variant="text" onClick={() => onOpenStudentChat?.(nextSession.studentId)}>Написать</Button>
              </div>
            </>
          ) : (
            <div className="study-cabinet-panel__empty">Ближайших занятий пока нет. Можно открыть расписание и добавить новые слоты.</div>
          )}
        </article>

        <article className="study-cabinet-panel__smart-card study-cabinet-panel__teacher-summary-card">
          <div className="study-cabinet-panel__smart-head">
            <div>
              <span className="study-cabinet-panel__kicker">Оперативная сводка</span>
            </div>
            <Button size="small" variant="text" onClick={onOpenSchedule}>Открыть расписание</Button>
          </div>
          <div className="study-cabinet-panel__teacher-summary-grid">
            <div className="study-cabinet-panel__teacher-summary-pill study-cabinet-panel__teacher-summary-pill--load">
              <div className="study-cabinet-panel__teacher-summary-pill-head">
                <span className="study-cabinet-panel__teacher-summary-icon">
                  <EventRoundedIcon fontSize="inherit" />
                </span>
                <small>Нагрузка</small>
              </div>
              <strong>{todayOverview.total}</strong>
              <span className="study-cabinet-panel__teacher-summary-caption">занятий сегодня</span>
            </div>
            <div className="study-cabinet-panel__teacher-summary-pill study-cabinet-panel__teacher-summary-pill--format">
              <div className="study-cabinet-panel__teacher-summary-pill-head">
                <span className="study-cabinet-panel__teacher-summary-icon">
                  <ScheduleRoundedIcon fontSize="inherit" />
                </span>
                <small>Формат</small>
              </div>
              <strong>{todayOverview.trialCount}/{todayOverview.paidCount}</strong>
              <span className="study-cabinet-panel__teacher-summary-caption">пробные / платные</span>
            </div>
            <div className="study-cabinet-panel__teacher-summary-pill study-cabinet-panel__teacher-summary-pill--slot">
              <div className="study-cabinet-panel__teacher-summary-pill-head">
                <span className="study-cabinet-panel__teacher-summary-icon">
                  <CalendarMonthRoundedIcon fontSize="inherit" />
                </span>
                <small>Окно</small>
              </div>
              <strong>{todayOverview.nextFreeSlot ? `${todayOverview.nextFreeSlot.startTime}` : "—"}</strong>
              <span className="study-cabinet-panel__teacher-summary-caption">ближайшее свободное</span>
            </div>
            <div className="study-cabinet-panel__teacher-summary-pill study-cabinet-panel__teacher-summary-pill--control">
              <div className="study-cabinet-panel__teacher-summary-pill-head">
                <span className="study-cabinet-panel__teacher-summary-icon">
                  <TimerRoundedIcon fontSize="inherit" />
                </span>
                <small>Контроль</small>
              </div>
              <strong>{activeActionCount}</strong>
              <span className="study-cabinet-panel__teacher-summary-caption">активных задач</span>
            </div>
          </div>
        </article>
      </div>

      <article className="study-cabinet-panel__smart-card study-cabinet-panel__smart-card--calendar study-cabinet-panel__teacher-calendar-card">
        <div className="study-cabinet-panel__smart-head">
          <div>
            <span className="study-cabinet-panel__kicker">Календарь</span>
          </div>
          <div className="study-cabinet-panel__teacher-calendar-head-actions">
            <Button
              size="small"
              variant={todayFocusMode ? "contained" : "outlined"}
              onClick={() => setTodayFocusMode((current) => !current)}
              startIcon={todayFocusMode ? <ViewWeekRoundedIcon fontSize="small" /> : <ViewAgendaRoundedIcon fontSize="small" />}
            >
              {todayFocusMode ? "Сетка" : "Сегодня"}
            </Button>
            <Button
              size="small"
              variant={plannerCollapsed ? "outlined" : "text"}
              onClick={() => setPlannerCollapsed((current) => !current)}
            >
              {plannerCollapsed ? "Открыть" : "Свернуть"}
            </Button>
          </div>
        </div>

        {plannerCollapsed ? (
          <div className="study-cabinet-panel__planner-collapsed">
            <strong>Ближайшее событие</strong>
            {nextSession ? (
              <span>{formatDayTime(getBookingStart(nextSession))} · {nextSession.studentName}</span>
            ) : (
              <span>Предстоящих занятий пока нет.</span>
            )}
            <small>Всего событий в горизонте: {calendarEvents.filter((event) => new Date(event.startAt).getTime() <= maxEventTimestamp).length}</small>
          </div>
        ) : null}

        <Collapse in={!plannerCollapsed} timeout="auto">
          <div className="study-cabinet-panel__planner-controls">
            <div className="study-cabinet-panel__planner-switch">
              <Button size="small" variant={plannerMode === "day" ? "contained" : "outlined"} onClick={() => setPlannerView("day")}>День</Button>
              {!isCompactLayout ? (
                <Button
                  size="small"
                  variant={plannerMode === "week" ? "contained" : "outlined"}
                  onClick={() => {
                    setPlannerView("week");
                    setVisibleRangeStart(startOfWeek(fromDateKey(selectedDateKey)));
                  }}
                >
                  Неделя
                </Button>
              ) : null}
            </div>

            <div className="study-cabinet-panel__planner-nav">
              <IconButton size="small" onClick={() => shiftPlannerRange(-1)}>
                <ChevronLeftRoundedIcon fontSize="small" />
              </IconButton>
              <strong>{plannerRangeLabel}</strong>
              <IconButton size="small" onClick={() => shiftPlannerRange(1)}>
                <ChevronRightRoundedIcon fontSize="small" />
              </IconButton>
              <Button size="small" variant="text" onClick={handleGoToday}>Сегодня</Button>
              <Tooltip title="Создать заметку">
                <IconButton size="small" onClick={() => openTemplateNote("custom")}>
                  <AddRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </div>
          </div>

          <Collapse in={todayFocusMode} timeout={220} mountOnEnter unmountOnExit>
            <div className="study-cabinet-panel__teacher-run-sheet">
              {todayRunSheet.length > 0 ? (
                todayRunSheet.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    className={`study-cabinet-panel__teacher-run-item ${event.kind === "booking" ? "is-booking" : "is-note"}`}
                    onClick={() => handleCalendarEventClick(event)}
                  >
                    <div>
                      <strong>{event.title}</strong>
                      <span>{formatTime(event.startAt)}{event.endAt ? ` — ${formatTime(event.endAt)}` : ""}</span>
                    </div>
                    <em>{event.badge ?? (event.kind === "booking" ? "Сессия" : "Заметка")}</em>
                  </button>
                ))
              ) : (
                <div className="study-cabinet-panel__empty">На сегодня событий нет.</div>
              )}
            </div>
          </Collapse>

          <Collapse in={!todayFocusMode} timeout={220} mountOnEnter unmountOnExit>
            <div className="study-cabinet-panel__planner" ref={plannerScrollRef}>
              <div className="study-cabinet-panel__planner-header">
                <div className="study-cabinet-panel__planner-time-head">Время</div>
                <div
                  className="study-cabinet-panel__planner-day-heads"
                  style={{ gridTemplateColumns: `repeat(${plannerDays.length}, minmax(0, 1fr))` }}
                >
                  {plannerDays.map((day, index) => (
                    <button
                      key={day.key}
                      type="button"
                      className={`study-cabinet-panel__planner-day-head ${selectedDateKey === day.key ? "is-selected" : ""}`}
                      onClick={() => {
                        setSelectedDateKey(day.key);
                        setNoteDate(day.key);
                      }}
                    >
                      <span>
                        {plannerMode === "week"
                          ? plannerWeekdayLabels[index]
                          : day.date.toLocaleDateString("ru-RU", { weekday: "short" }).replace(".", "")}
                      </span>
                      <strong>
                        {day.date.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" })}
                      </strong>
                    </button>
                  ))}
                </div>
              </div>

              <div className="study-cabinet-panel__planner-body">
                <div className="study-cabinet-panel__planner-time-axis">
                  {plannerHourLabels.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
                <div
                  className="study-cabinet-panel__planner-days"
                  style={{ gridTemplateColumns: `repeat(${plannerDays.length}, minmax(0, 1fr))` }}
                >
                  {plannerDays.map((day) => {
                    const dayEvents = eventsByDay.get(day.key) ?? [];
                    return (
                      <div key={day.key} className="study-cabinet-panel__planner-day">
                        <div className="study-cabinet-panel__planner-slots" aria-hidden="true">
                          {Array.from({ length: plannerSlotCount }).map((_, slotIndex) => {
                            const hour = PLANNER_START_HOUR + Math.floor(slotIndex / 2);
                            const minute = slotIndex % 2 === 0 ? 0 : 30;
                            const timeValue = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
                            const slotMinutes = hour * 60 + minute;
                            const slotEndMinutes = slotMinutes + PLANNER_SLOT_MINUTES;
                            const hasEventInSlot = dayEvents.some((event) => {
                              const start = new Date(event.startAt);
                              if (Number.isNaN(start.getTime())) return false;
                              const end = event.endAt ? new Date(event.endAt) : null;
                              const eventStart = start.getHours() * 60 + start.getMinutes();
                              const eventEnd =
                                end && !Number.isNaN(end.getTime())
                                  ? end.getHours() * 60 + end.getMinutes()
                                  : eventStart + 60;
                              return eventStart < slotEndMinutes && eventEnd > slotMinutes;
                            });
                            const isPastTodaySlot =
                              day.key === todayKey && slotMinutes < nowMinutes && !hasEventInSlot;
                            if (isPastTodaySlot) {
                              return <div key={`${day.key}-slot-${slotIndex}`} className="study-cabinet-panel__planner-slot is-disabled" />;
                            }
                            return (
                              <button
                                key={`${day.key}-slot-${slotIndex}`}
                                type="button"
                                className="study-cabinet-panel__planner-slot is-clickable"
                                onClick={() => {
                                  setSelectedDateKey(day.key);
                                  openTemplateNote("custom");
                                }}
                                aria-label={`Добавить событие ${day.key} ${timeValue}`}
                              />
                            );
                          })}
                        </div>

                        <div className="study-cabinet-panel__planner-events">
                          {dayEvents.map((event) => {
                            const layout = getPlannerEventLayout(event);
                            if (!layout) return null;
                            return (
                              <button
                                key={event.id}
                                type="button"
                                className={`study-cabinet-panel__planner-event ${event.kind === "booking" ? "is-blue" : "is-custom"}`}
                                style={{
                                  top: `${layout.top}px`,
                                  height: `${layout.height}px`,
                                  "--planner-event-color": event.color ?? "#3b82f6",
                                } as CSSProperties}
                                onClick={() => handleCalendarEventClick(event)}
                              >
                                <strong>{event.title}</strong>
                                <span>
                                  {formatTime(event.startAt)}
                                  {event.endAt ? ` — ${formatTime(event.endAt)}` : ""}
                                </span>
                                {event.description ? <em>{event.description}</em> : null}
                                {event.badge ? <small>{event.badge}</small> : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </Collapse>
        </Collapse>
      </article>

      <Drawer
        anchor={isCompactLayout ? "bottom" : "right"}
        open={Boolean(sessionDrawerBooking)}
        onClose={() => setSessionDrawerBooking(null)}
        PaperProps={{ className: "study-cabinet-panel__teacher-drawer" }}
      >
        {sessionDrawerBooking ? (
          <div className="study-cabinet-panel__teacher-drawer-body">
            <div className="study-cabinet-panel__smart-head">
              <div>
                <span className="study-cabinet-panel__kicker">Сессия</span>
                <h3>{sessionDrawerBooking.studentName}</h3>
              </div>
              <IconButton size="small" onClick={() => setSessionDrawerBooking(null)}>
                <DeleteOutlineRoundedIcon fontSize="small" />
              </IconButton>
            </div>
            <div className="study-cabinet-panel__teacher-drawer-meta">
              <span><ScheduleRoundedIcon fontSize="inherit" /> {formatDayTime(getBookingStart(sessionDrawerBooking))}</span>
              <span>
                <PaymentRoundedIcon fontSize="inherit" />
                {sessionDrawerBooking.lessonKind === "trial"
                  ? "Пробное"
                  : sessionDrawerBooking.paymentStatus === "paid"
                    ? "Платное · оплачено"
                    : "Платное · не оплачено"}
              </span>
            </div>
            <div className="study-cabinet-panel__teacher-drawer-actions">
              <Button variant="contained" onClick={onOpenSchedule}>Открыть занятие</Button>
              <Button variant="outlined" onClick={() => openTemplateNote("prep", sessionDrawerBooking)}>Добавить подготовку</Button>
              <Button variant="text" onClick={() => onOpenStudentChat?.(sessionDrawerBooking.studentId)}>Написать</Button>
            </div>
          </div>
        ) : null}
      </Drawer>

      <Dialog
        open={noteModalOpen}
        onClose={() => setNoteModalOpen(false)}
        fullWidth
        maxWidth="sm"
        className="ui-dialog ui-dialog--compact"
      >
        <DialogTitle>{editingNoteId ? "Редактировать заметку" : "Новая заметка"}</DialogTitle>
        <DialogContent>
          <div className="study-cabinet-panel__note-modal">
            <TextField
              label="Заголовок"
              value={noteTitle}
              onChange={(event) => setNoteTitle(event.target.value)}
              variant="outlined"
              size="small"
              fullWidth
            />
            <TextField
              label="Комментарий"
              value={noteBody}
              onChange={(event) => setNoteBody(event.target.value)}
              variant="outlined"
              size="small"
              fullWidth
              multiline
              minRows={3}
            />
            <div className="study-cabinet-panel__note-modal-row">
              <TextField
                label="Дата"
                type="date"
                value={noteDate}
                onChange={(event) => {
                  const nextDate = event.target.value;
                  const normalizedDate = nextDate && nextDate >= todayKey ? nextDate : todayKey;
                  setNoteDate(normalizedDate);
                  setNoteTimeError(null);
                }}
                variant="outlined"
                size="small"
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: todayKey }}
              />
              <TextField
                label="С"
                select
                value={resolvedNoteTime}
                onChange={(event) => {
                  setNoteTime(event.target.value);
                  setNoteTimeError(null);
                }}
                variant="outlined"
                size="small"
                fullWidth
                error={Boolean(noteTimeError)}
                helperText={noteTimeError ?? " "}
                InputLabelProps={{ shrink: true }}
                disabled={startTimeOptions.length === 0}
              >
                {startTimeOptions.map((option) => (
                  <MenuItem key={option} value={option}>{option}</MenuItem>
                ))}
              </TextField>
              <TextField
                label="До"
                select
                value={resolvedNoteEndTime}
                onChange={(event) => {
                  setNoteEndTime(event.target.value);
                  setNoteTimeError(null);
                }}
                variant="outlined"
                size="small"
                fullWidth
                error={Boolean(noteTimeError)}
                helperText={noteTimeError ? " " : " "}
                InputLabelProps={{ shrink: true }}
                disabled={endTimeOptions.length === 0}
              >
                {endTimeOptions.map((option) => (
                  <MenuItem key={option} value={option}>{option}</MenuItem>
                ))}
              </TextField>
            </div>
            <div className="study-cabinet-panel__note-color">
              <span>Цвет</span>
              <div className="study-cabinet-panel__note-color-palette">
                {NOTE_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`study-cabinet-panel__note-color-swatch ${noteColor === color ? "is-active" : ""}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNoteColor(color)}
                    aria-label={`Выбрать цвет ${color}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
        <DialogActions>
          {editingNoteId && onDeleteNote ? (
            <Button color="error" onClick={deleteEditingNote} startIcon={<DeleteOutlineRoundedIcon />}>
              Удалить
            </Button>
          ) : null}
          <Button onClick={() => setNoteModalOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={saveNote} disabled={!noteTitle.trim()}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </section>
  );
}
