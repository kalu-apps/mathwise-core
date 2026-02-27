import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  Button,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  TextField,
  Tooltip,
  useMediaQuery,
} from "@mui/material";
import AutoGraphRoundedIcon from "@mui/icons-material/AutoGraphRounded";
import TipsAndUpdatesRoundedIcon from "@mui/icons-material/TipsAndUpdatesRounded";
import WorkspacePremiumRoundedIcon from "@mui/icons-material/WorkspacePremiumRounded";
import DashboardCustomizeRoundedIcon from "@mui/icons-material/DashboardCustomizeRounded";
import ForumRoundedIcon from "@mui/icons-material/ForumRounded";
import DiamondRoundedIcon from "@mui/icons-material/DiamondRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import NotificationImportantRoundedIcon from "@mui/icons-material/NotificationImportantRounded";
import EventRoundedIcon from "@mui/icons-material/EventRounded";
import AutoStoriesRoundedIcon from "@mui/icons-material/AutoStoriesRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ExpandLessRoundedIcon from "@mui/icons-material/ExpandLessRounded";
import type { StudyCabinetNote } from "@/shared/lib/studyCabinet";

type StudyCalendarEvent = {
  id: string;
  title: string;
  description?: string;
  startAt: string;
  endAt?: string;
  color?: string;
  badge?: string;
  highlighted?: boolean;
  noteId?: string;
  onClick?: () => void;
};

type StudyCabinetPanelProps = {
  role: "student" | "teacher";
  onWorkbookClick?: () => void;
  onChatClick?: () => void;
  chatDisabled?: boolean;
  chatLocked?: boolean;
  activityDays?: Array<{
    key: string;
    label: string;
    minutes: number;
  }>;
  activityStats?: Array<{
    id: string;
    label: string;
    value: number;
    icon?: ReactNode;
    accent?: boolean;
  }>;
  calendarEvents?: StudyCalendarEvent[];
  generalReminders?: Array<{
    id: string;
    title: string;
    subtitle?: string;
    badge?: string;
    highlighted?: boolean;
    onClick?: () => void;
  }>;
  notes?: StudyCabinetNote[];
  allowNoteEditor?: boolean;
  onCreateNote?: (payload: {
    title: string;
    body: string;
    dueAt: string | null;
    endAt: string | null;
    remind: boolean;
    color: string;
  }) => void;
  onUpdateNote?: (payload: {
    noteId: string;
    title: string;
    body: string;
    dueAt: string | null;
    endAt: string | null;
    remind: boolean;
    color: string;
  }) => void;
  onDeleteNote?: (noteId: string) => void;
  reminderAccent?: boolean;
  reminderHint?: string | null;
};

type StudyCabinetCard = {
  id: string;
  icon: ReactNode;
  title: string;
  description: string;
};

const studentCards: StudyCabinetCard[] = [
  {
    id: "focus",
    icon: <AutoGraphRoundedIcon fontSize="small" />,
    title: "Прогресс",
    description: "Путь обучения без пробелов",
  },
  {
    id: "practice",
    icon: <WorkspacePremiumRoundedIcon fontSize="small" />,
    title: "Практика",
    description: "Курсы и рабочая тетрадь в одном контуре",
  },
  {
    id: "tips",
    icon: <TipsAndUpdatesRoundedIcon fontSize="small" />,
    title: "Планирование",
    description: "Календарь и умные напоминания по задачам",
  },
];

const teacherCards: StudyCabinetCard[] = [
  {
    id: "control",
    icon: <AutoGraphRoundedIcon fontSize="small" />,
    title: "Контроль",
    description: "Актуальные статусы обучения в одном экране",
  },
  {
    id: "materials",
    icon: <WorkspacePremiumRoundedIcon fontSize="small" />,
    title: "Единый контур",
    description: "Курсы, чат и тетрадь работают синхронно",
  },
  {
    id: "engagement",
    icon: <TipsAndUpdatesRoundedIcon fontSize="small" />,
    title: "Планировщик",
    description: "События по времени и напоминания в приоритете",
  },
];

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

const formatEventTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
};

const ceilToStep = (value: number, step: number) => {
  if (step <= 0) return value;
  return Math.ceil(value / step) * step;
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

const getPlannerEventLayout = (event: StudyCalendarEvent) => {
  const start = new Date(event.startAt);
  if (Number.isNaN(start.getTime())) return null;
  const parsedEnd = event.endAt ? new Date(event.endAt) : null;
  const end =
    parsedEnd && !Number.isNaN(parsedEnd.getTime()) && parsedEnd.getTime() > start.getTime()
      ? parsedEnd
      : new Date(start.getTime() + 60 * 60 * 1000);

  const minMinutes = PLANNER_START_HOUR * 60;
  const maxMinutes = PLANNER_END_HOUR * 60;
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  const clampedStart = Math.max(minMinutes, Math.min(startMinutes, maxMinutes - 10));
  const clampedEnd = Math.max(clampedStart + 15, Math.min(endMinutes, maxMinutes));
  const top = ((clampedStart - minMinutes) / 60) * PLANNER_HOUR_HEIGHT;
  const height = Math.max(30, ((clampedEnd - clampedStart) / 60) * PLANNER_HOUR_HEIGHT);

  return { top, height };
};

const getPlannerEventTone = (event: StudyCalendarEvent) => {
  if (event.color) return "is-custom";
  if (event.highlighted) return "is-alert";
  const badge = event.badge?.toLowerCase() ?? "";
  if (badge.includes("занят")) return "is-amber";
  if (badge.includes("коллектив")) return "is-green";
  if (badge.includes("замет")) return "is-purple";
  return "is-blue";
};

const getReminderIcon = (badge?: string) => {
  if (!badge) return <NotificationImportantRoundedIcon fontSize="small" />;
  if (badge.toLowerCase().includes("занят")) return <EventRoundedIcon fontSize="small" />;
  if (badge.toLowerCase().includes("коллектив")) return <AutoStoriesRoundedIcon fontSize="small" />;
  return <NotificationImportantRoundedIcon fontSize="small" />;
};

export function StudyCabinetPanel({
  role,
  onWorkbookClick,
  onChatClick,
  chatDisabled = false,
  chatLocked = false,
  activityDays = [],
  activityStats = [],
  calendarEvents = [],
  generalReminders = [],
  notes = [],
  allowNoteEditor = false,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
  reminderAccent = false,
  reminderHint = null,
}: StudyCabinetPanelProps) {
  const isCompactLayout = useMediaQuery("(max-width:900px)");
  const cards = role === "teacher" ? teacherCards : studentCards;
  const heroTitle =
    role === "teacher" ? "Умный центр преподавателя" : "Умный центр обучения";
  const chatButtonLabel = role === "teacher" ? "Чат со студентами" : "Чат";
  const heroSubtitle =
    role === "teacher"
      ? "Премиальный контур управления: события, активности и учебные сценарии в одном экране."
      : "Премиальный контур обучения: активность, календарь и фокусные напоминания в одном экране.";

  const [plannerView, setPlannerView] = useState<"day" | "week">("week");
  const [selectedDateKey, setSelectedDateKey] = useState(() => toLocalDateKey(new Date()));
  const [visibleRangeStart, setVisibleRangeStart] = useState(() =>
    startOfWeek(new Date())
  );

  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteDate, setNoteDate] = useState(() => toLocalDateKey(new Date()));
  const [noteTime, setNoteTime] = useState("10:00");
  const [noteEndTime, setNoteEndTime] = useState("11:00");
  const [noteColor, setNoteColor] = useState(NOTE_COLORS[0]);
  const [noteTimeError, setNoteTimeError] = useState<string | null>(null);
  const [hoveredDayKey, setHoveredDayKey] = useState<string | null>(null);
  const [remindersPage, setRemindersPage] = useState(1);
  const [showMobileActivityDetails, setShowMobileActivityDetails] = useState(false);
  const [plannerCollapsed, setPlannerCollapsed] = useState(true);

  const maxActivityMinutes = useMemo(
    () => Math.max(1, ...activityDays.map((day) => day.minutes)),
    [activityDays]
  );
  const totalWeeklyMinutes = useMemo(
    () => activityDays.reduce((sum, day) => sum + day.minutes, 0),
    [activityDays]
  );
  const activeDaysCount = useMemo(
    () => activityDays.filter((day) => day.minutes > 0).length,
    [activityDays]
  );
  const averageDailyMinutes = useMemo(
    () => (activeDaysCount > 0 ? Math.round(totalWeeklyMinutes / activeDaysCount) : 0),
    [activeDaysCount, totalWeeklyMinutes]
  );
  const topDay = useMemo(
    () =>
      activityDays.reduce(
        (best, current) => (current.minutes > best.minutes ? current : best),
        { key: "", label: "-", minutes: 0 }
      ),
    [activityDays]
  );

  const visibleStats = useMemo(
    () => activityStats.filter((stat) => stat.value > 0),
    [activityStats]
  );
  const hoveredActivityDay = useMemo(
    () => activityDays.find((day) => day.key === hoveredDayKey) ?? null,
    [activityDays, hoveredDayKey]
  );
  const barChartFocusDay = hoveredActivityDay ?? topDay;
  const remindersPerPage = 5;
  const remindersTotalPages = Math.max(
    1,
    Math.ceil(generalReminders.length / remindersPerPage)
  );
  const safeRemindersPage = Math.min(remindersPage, remindersTotalPages);
  const pagedReminders = useMemo(() => {
    const start = (safeRemindersPage - 1) * remindersPerPage;
    return generalReminders.slice(start, start + remindersPerPage);
  }, [generalReminders, safeRemindersPage]);

  const plannerMode: "day" | "week" = isCompactLayout ? "day" : plannerView;

  const plannerDays = useMemo(() => {
    if (plannerMode === "day") {
      const date = fromDateKey(selectedDateKey);
      return [{ key: selectedDateKey, date }];
    }
    return buildWeekDays(visibleRangeStart);
  }, [plannerMode, selectedDateKey, visibleRangeStart]);
  const plannerRangeLabel = useMemo(() => getPlannerRangeLabel(plannerDays), [plannerDays]);
  const plannerDayKeys = useMemo(
    () => new Set(plannerDays.map((day) => day.key)),
    [plannerDays]
  );
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
  const plannerScrollRef = useRef<HTMLDivElement | null>(null);
  const now = new Date();
  const nowMeta = {
    todayKey: toLocalDateKey(now),
    minutes: now.getHours() * 60 + now.getMinutes(),
  };
  const nowTimestamp = now.getTime();
  const todayKey = nowMeta.todayKey;
  const nextUpcomingEvent = useMemo(() => {
    return [...calendarEvents]
      .filter((event) => new Date(event.startAt).getTime() >= nowTimestamp)
      .sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime())[0];
  }, [calendarEvents, nowTimestamp]);
  const upcomingEventsCount = useMemo(() => {
    return calendarEvents.filter((event) => new Date(event.startAt).getTime() >= nowTimestamp).length;
  }, [calendarEvents, nowTimestamp]);

  const buildLocalDateTime = (dateKey: string, timeValue: string) => {
    if (!dateKey || !timeValue) return null;
    if (timeValue === "24:00") {
      const date = fromDateKey(dateKey);
      date.setDate(date.getDate() + 1);
      date.setHours(0, 0, 0, 0);
      return date;
    }
    const candidate = new Date(`${dateKey}T${timeValue}`);
    if (Number.isNaN(candidate.getTime())) return null;
    return candidate;
  };

  const startTimeOptions = useMemo(() => {
    const minByDay = noteDate === todayKey ? ceilToStep(nowMeta.minutes, PLANNER_SLOT_MINUTES) : 0;
    const maxStart = 23 * 60 + 30;
    return buildTimeOptions(minByDay, maxStart, PLANNER_SLOT_MINUTES);
  }, [noteDate, nowMeta.minutes, todayKey]);

  const resolvedNoteTime = useMemo(() => {
    if (startTimeOptions.includes(noteTime)) return noteTime;
    return startTimeOptions[0] ?? noteTime;
  }, [startTimeOptions, noteTime]);

  const endTimeOptions = useMemo(() => {
    const startMinutes = timeToMinutes(resolvedNoteTime);
    if (startMinutes === null) return [];
    const minEnd = startMinutes + PLANNER_SLOT_MINUTES;
    const maxEnd = 24 * 60;
    return buildTimeOptions(minEnd, maxEnd, PLANNER_SLOT_MINUTES);
  }, [resolvedNoteTime]);

  const resolvedNoteEndTime = useMemo(() => {
    if (endTimeOptions.includes(noteEndTime)) return noteEndTime;
    return endTimeOptions[0] ?? noteEndTime;
  }, [endTimeOptions, noteEndTime]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, StudyCalendarEvent[]>();
    calendarEvents
      .filter((event) => !Number.isNaN(new Date(event.startAt).getTime()))
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
      .forEach((event) => {
        const key = toLocalDateKey(event.startAt);
        if (!plannerDayKeys.has(key)) return;
        const current = map.get(key) ?? [];
        map.set(key, [...current, event]);
      });
    return map;
  }, [calendarEvents, plannerDayKeys]);

  const openCreateModal = (dateKey = selectedDateKey, time = "10:00") => {
    const normalizedDate = dateKey && dateKey >= todayKey ? dateKey : todayKey;
    const minStartMinutes =
      normalizedDate === todayKey ? ceilToStep(nowMeta.minutes, PLANNER_SLOT_MINUTES) : 0;
    let startMinutes = timeToMinutes(time) ?? 10 * 60;
    if (startMinutes < minStartMinutes) {
      startMinutes = minStartMinutes;
    }
    let targetDate = normalizedDate;
    if (startMinutes > 23 * 60 + 30) {
      targetDate = toLocalDateKey(addDays(fromDateKey(normalizedDate), 1));
      startMinutes = 0;
    }
    const normalizedStart = minutesToTime(startMinutes);
    const normalizedEnd = minutesToTime(Math.min(startMinutes + 60, 24 * 60));

    setEditingNoteId(null);
    setNoteTitle("");
    setNoteBody("");
    setNoteDate(targetDate);
    setNoteTime(normalizedStart);
    setNoteEndTime(normalizedEnd);
    setNoteColor(NOTE_COLORS[0]);
    setNoteTimeError(null);
    setNoteModalOpen(true);
  };

  const openEditModal = (note: StudyCabinetNote) => {
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
        : "11:00"
    );
    setNoteColor(note.color || NOTE_COLORS[0]);
    setNoteTimeError(null);
    setNoteModalOpen(true);
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
    if (!editingNoteId && startDate.getTime() < Date.now()) {
      setNoteTimeError("Нельзя запланировать заметку на прошедшее время.");
      return;
    }
    setNoteTimeError(null);
    const dueAt = startDate.toISOString();
    const endAt = endDate.toISOString();

    if (editingNoteId && onUpdateNote) {
      onUpdateNote({
        noteId: editingNoteId,
        title: noteTitle.trim(),
        body: noteBody.trim(),
        dueAt,
        endAt,
        remind: true,
        color: noteColor,
      });
    } else if (!editingNoteId && onCreateNote) {
      onCreateNote({
        title: noteTitle.trim(),
        body: noteBody.trim(),
        dueAt,
        endAt,
        remind: true,
        color: noteColor,
      });
    }
    setNoteModalOpen(false);
  };

  const deleteEditingNote = () => {
    if (!editingNoteId || !onDeleteNote) return;
    onDeleteNote(editingNoteId);
    setNoteModalOpen(false);
  };

  const handleCalendarEventClick = (event: StudyCalendarEvent) => {
    if (event.noteId) {
      const note = notes.find((entry) => entry.id === event.noteId);
      if (note) {
        openEditModal(note);
        return;
      }
    }
    event.onClick?.();
  };

  const shiftPlannerRange = (step: number) => {
    if (plannerMode === "day") {
      const shifted = addDays(fromDateKey(selectedDateKey), step);
      const key = toLocalDateKey(shifted);
      setSelectedDateKey(key);
      return;
    }
    setVisibleRangeStart((prev) => addDays(prev, step * 7));
  };

  const handleGoToday = () => {
    const now = new Date();
    const key = toLocalDateKey(now);
    setSelectedDateKey(key);
    setVisibleRangeStart(startOfWeek(now));
  };

  useEffect(() => {
    const container = plannerScrollRef.current;
    if (!container) return;
    const hasTodayInView =
      plannerMode === "day"
        ? selectedDateKey === todayKey
        : plannerDays.some((day) => day.key === todayKey);
    if (!hasTodayInView) return;
    const targetTop =
      ((nowMeta.minutes - PLANNER_START_HOUR * 60) / 60) * PLANNER_HOUR_HEIGHT -
      PLANNER_HOUR_HEIGHT * 2;
    const nextTop = Math.max(0, targetTop);
    container.scrollTo({ top: nextTop, behavior: "smooth" });
  }, [plannerMode, selectedDateKey, plannerDays, nowMeta.minutes, todayKey]);

  const showActivityDetails = !isCompactLayout || showMobileActivityDetails;
  const isPlannerCollapsed = plannerCollapsed;

  return (
    <section
      className={`study-cabinet-panel ${reminderAccent ? "study-cabinet-panel--alert" : ""}`}
    >
      {reminderHint ? <div className="study-cabinet-panel__urgent">{reminderHint}</div> : null}

      <div className="study-cabinet-panel__cover">
        <div className="study-cabinet-panel__veil" />
        <div className="study-cabinet-panel__cover-content">
          <div className="study-cabinet-panel__hero">
            <div className="study-cabinet-panel__hero-bar">
              <span className="study-cabinet-panel__kicker">Учебный кабинет</span>
            </div>
            <h2>{heroTitle}</h2>
            <p>{heroSubtitle}</p>
            <div className="study-cabinet-panel__hero-nav">
              <button
                type="button"
                className="study-cabinet-panel__hero-btn"
                onClick={onWorkbookClick}
              >
                <DashboardCustomizeRoundedIcon fontSize="small" />
                <span>Рабочая тетрадь</span>
              </button>
              <button
                type="button"
                className="study-cabinet-panel__hero-btn study-cabinet-panel__hero-btn--chat"
                onClick={onChatClick}
                disabled={chatDisabled}
              >
                {role === "student" && chatLocked ? (
                  <DiamondRoundedIcon
                    fontSize="small"
                    className="study-cabinet-panel__hero-chat-lock"
                  />
                ) : (
                  <ForumRoundedIcon fontSize="small" />
                )}
                <span>{chatButtonLabel}</span>
              </button>
            </div>
            <div className="study-cabinet-panel__hero-highlights">
              {cards.map((card) => (
                <article key={card.id} className="study-cabinet-panel__hero-highlight">
                  <span className="study-cabinet-panel__hero-highlight-icon">{card.icon}</span>
                  <div>
                    <strong>{card.title}</strong>
                    <small>{card.description}</small>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="study-cabinet-panel__activity-row">
        <article className="study-cabinet-panel__smart-card study-cabinet-panel__smart-card--activity">
          <div className="study-cabinet-panel__smart-head">
            <h3>
              <AutoGraphRoundedIcon fontSize="small" />
              Активность
            </h3>
            {isCompactLayout ? (
              <Button
                size="small"
                variant="text"
                onClick={() =>
                  setShowMobileActivityDetails((current) => !current)
                }
                endIcon={
                  showMobileActivityDetails ? (
                    <ExpandLessRoundedIcon fontSize="small" />
                  ) : (
                    <ExpandMoreRoundedIcon fontSize="small" />
                  )
                }
              >
                {showMobileActivityDetails ? "Свернуть" : "Подробнее"}
              </Button>
            ) : null}
          </div>

          <Collapse in={showActivityDetails} timeout="auto" unmountOnExit={isCompactLayout}>
            <div className="study-cabinet-panel__activity-insights">
              <div className="study-cabinet-panel__activity-metric">
                <span className="study-cabinet-panel__activity-metric-icon">
                  <AutoGraphRoundedIcon fontSize="small" />
                </span>
                <span>Всего за неделю</span>
                <strong>{totalWeeklyMinutes} мин</strong>
              </div>
              <div className="study-cabinet-panel__activity-metric">
                <span className="study-cabinet-panel__activity-metric-icon">
                  <TipsAndUpdatesRoundedIcon fontSize="small" />
                </span>
                <span>Среднее в активный день</span>
                <strong>{averageDailyMinutes} мин</strong>
              </div>
              <div className="study-cabinet-panel__activity-metric">
                <span className="study-cabinet-panel__activity-metric-icon">
                  <CalendarMonthRoundedIcon fontSize="small" />
                </span>
                <span>Пиковый день</span>
                <strong>
                  {topDay.label} · {topDay.minutes} мин
                </strong>
              </div>
              <div className="study-cabinet-panel__activity-metric">
                <span className="study-cabinet-panel__activity-metric-icon">
                  <EventRoundedIcon fontSize="small" />
                </span>
                <span>Активных дней</span>
                <strong>{activeDaysCount} из 7</strong>
              </div>
            </div>
          </Collapse>

          <div className="study-cabinet-panel__activity-dashboard">
            <div className="study-cabinet-panel__activity-bars">
              {activityDays.length > 0 ? (
                <>
                  <div className="study-cabinet-panel__activity-bars-grid" aria-hidden="true">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <span key={`grid-${index}`} />
                    ))}
                  </div>
                  <div className="study-cabinet-panel__activity-bars-list">
                    {activityDays.map((day, index) => {
                      const height = Math.max(
                        12,
                        Math.round((day.minutes / maxActivityMinutes) * 100)
                      );
                      return (
                        <button
                          key={day.key}
                          type="button"
                          className={`study-cabinet-panel__activity-bar ${
                            barChartFocusDay?.key === day.key ? "is-active" : ""
                          }`}
                          style={
                            {
                              height: `${height}%`,
                              "--activity-bar-delay": `${index * 45}ms`,
                            } as CSSProperties
                          }
                          onMouseEnter={() => setHoveredDayKey(day.key)}
                          onMouseLeave={() => setHoveredDayKey(null)}
                          onFocus={() => setHoveredDayKey(day.key)}
                          onBlur={() => setHoveredDayKey(null)}
                          aria-label={`${day.label}: ${day.minutes} минут`}
                        >
                          <span>{day.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="study-cabinet-panel__activity-bar-tooltip">
                    <strong>
                      {barChartFocusDay?.label ?? "-"} · {barChartFocusDay?.minutes ?? 0} мин
                    </strong>
                    <span>
                      Недельный объём: {totalWeeklyMinutes} мин · Среднее: {averageDailyMinutes} мин
                    </span>
                  </div>
                </>
              ) : (
                <div className="study-cabinet-panel__empty">Нет данных активности за неделю.</div>
              )}
            </div>

            <Collapse in={showActivityDetails} timeout="auto" unmountOnExit={isCompactLayout}>
              {visibleStats.length > 0 ? (
                <div className="study-cabinet-panel__activity-table">
                  <div className="study-cabinet-panel__activity-table-head">
                    <span>Показатель</span>
                    <span>Значение</span>
                  </div>
                  <div className="study-cabinet-panel__activity-table-body">
                    {visibleStats.map((stat) => (
                      <div key={stat.id} className="study-cabinet-panel__activity-table-row">
                        <span className="study-cabinet-panel__activity-table-label">
                          <i>{stat.icon ?? <AutoGraphRoundedIcon fontSize="small" />}</i>
                          <em>{stat.label}</em>
                        </span>
                        <strong>{stat.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="study-cabinet-panel__empty">Пока нет накопленной активности.</div>
              )}
            </Collapse>
          </div>
        </article>

        <article className="study-cabinet-panel__smart-card study-cabinet-panel__smart-card--reminders">
          <div className="study-cabinet-panel__smart-head">
            <h3>
              <NotificationImportantRoundedIcon fontSize="small" />
              Напоминания
            </h3>
            {generalReminders.length > remindersPerPage ? (
              <div className="study-cabinet-panel__reminders-pagination">
                <IconButton
                  size="small"
                  onClick={() => setRemindersPage((prev) => Math.max(1, prev - 1))}
                  disabled={safeRemindersPage <= 1}
                >
                  <ChevronLeftRoundedIcon fontSize="small" />
                </IconButton>
                <span>
                  {safeRemindersPage}/{remindersTotalPages}
                </span>
                <IconButton
                  size="small"
                  onClick={() =>
                    setRemindersPage((prev) => Math.min(remindersTotalPages, prev + 1))
                  }
                  disabled={safeRemindersPage >= remindersTotalPages}
                >
                  <ChevronRightRoundedIcon fontSize="small" />
                </IconButton>
              </div>
            ) : null}
          </div>
          {generalReminders.length > 0 ? (
            <div className="study-cabinet-panel__reminders-list">
              {pagedReminders.map((item) =>
                item.onClick ? (
                  <button
                    key={item.id}
                    type="button"
                    className={`study-cabinet-panel__reminder ${
                      item.highlighted ? "is-highlighted" : ""
                    } is-clickable`}
                    onClick={item.onClick}
                  >
                    <span className="study-cabinet-panel__reminder-icon">
                      {getReminderIcon(item.badge)}
                    </span>
                    <span className="study-cabinet-panel__reminder-main">
                      <strong>{item.title}</strong>
                      {item.subtitle ? <span>{item.subtitle}</span> : null}
                    </span>
                    {item.badge ? (
                      <span className="study-cabinet-panel__reminder-badge">{item.badge}</span>
                    ) : null}
                  </button>
                ) : (
                  <article
                    key={item.id}
                    className={`study-cabinet-panel__reminder ${item.highlighted ? "is-highlighted" : ""}`}
                  >
                    <span className="study-cabinet-panel__reminder-icon">
                      {getReminderIcon(item.badge)}
                    </span>
                    <span className="study-cabinet-panel__reminder-main">
                      <strong>{item.title}</strong>
                      {item.subtitle ? <span>{item.subtitle}</span> : null}
                    </span>
                    {item.badge ? (
                      <span className="study-cabinet-panel__reminder-badge">{item.badge}</span>
                    ) : null}
                  </article>
                )
              )}
            </div>
          ) : (
            <div className="study-cabinet-panel__empty">Нет актуальных напоминаний.</div>
          )}
        </article>
      </div>

      <div className="study-cabinet-panel__schedule-row">
        <article className="study-cabinet-panel__smart-card study-cabinet-panel__smart-card--calendar">
          <div className="study-cabinet-panel__smart-head">
            <h3>
              <CalendarMonthRoundedIcon fontSize="small" />
              Планировщик задач
            </h3>
            <Button
              size="small"
              variant="text"
              onClick={() => setPlannerCollapsed((current) => !current)}
              endIcon={
                isPlannerCollapsed ? (
                  <ExpandMoreRoundedIcon fontSize="small" />
                ) : (
                  <ExpandLessRoundedIcon fontSize="small" />
                )
              }
            >
              {isPlannerCollapsed ? "Открыть" : "Свернуть"}
            </Button>
          </div>

          {isPlannerCollapsed ? (
            <div className="study-cabinet-panel__planner-collapsed">
              <strong>Ближайшее событие</strong>
              {nextUpcomingEvent ? (
                <span>
                  {new Date(nextUpcomingEvent.startAt).toLocaleString("ru-RU", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {nextUpcomingEvent.title}
                </span>
              ) : (
                <span>Нет запланированных событий.</span>
              )}
              <small>Всего предстоящих событий: {upcomingEventsCount}</small>
            </div>
          ) : null}

          <Collapse in={!isPlannerCollapsed} timeout="auto">
            <div className="study-cabinet-panel__planner-controls">
            <div className="study-cabinet-panel__planner-switch">
              <Button
                size="small"
                variant={plannerMode === "day" ? "contained" : "outlined"}
                onClick={() => setPlannerView("day")}
              >
                День
              </Button>
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
              <Button size="small" variant="text" onClick={handleGoToday}>
                Сегодня
              </Button>
              {allowNoteEditor ? (
                <Tooltip title="Создать заметку в выбранном дне">
                  <IconButton size="small" onClick={() => openCreateModal(selectedDateKey)}>
                    <AddRoundedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : null}
            </div>
            </div>

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
                    className={`study-cabinet-panel__planner-day-head ${
                      selectedDateKey === day.key ? "is-selected" : ""
                    }`}
                    onClick={() => {
                      setSelectedDateKey(day.key);
                      setNoteDate(day.key);
                    }}
                  >
                    <span>
                      {plannerMode === "week"
                        ? plannerWeekdayLabels[index]
                        : day.date
                            .toLocaleDateString("ru-RU", { weekday: "short" })
                            .replace(".", "")}
                    </span>
                    <strong>
                      {day.date.toLocaleDateString("ru-RU", {
                        day: "2-digit",
                        month: "short",
                      })}
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
                            day.key === nowMeta.todayKey &&
                            slotMinutes < nowMeta.minutes &&
                            !hasEventInSlot;
                          if (!allowNoteEditor) {
                            return (
                              <div key={`${day.key}-slot-${slotIndex}`} className="study-cabinet-panel__planner-slot" />
                            );
                          }
                          if (isPastTodaySlot) {
                            return (
                              <div
                                key={`${day.key}-slot-${slotIndex}`}
                                className="study-cabinet-panel__planner-slot is-disabled"
                              />
                            );
                          }
                          return (
                            <button
                              key={`${day.key}-slot-${slotIndex}`}
                              type="button"
                              className="study-cabinet-panel__planner-slot is-clickable"
                              onClick={() => {
                                setSelectedDateKey(day.key);
                                openCreateModal(day.key, timeValue);
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
                              className={`study-cabinet-panel__planner-event ${getPlannerEventTone(event)}`}
                              style={
                                {
                                  top: `${layout.top}px`,
                                  height: `${layout.height}px`,
                                  "--planner-event-color": event.color ?? "#3b82f6",
                                } as CSSProperties
                              }
                              onClick={() => handleCalendarEventClick(event)}
                            >
                              <strong>{event.title}</strong>
                              <span>
                                {formatEventTime(event.startAt)}
                                {event.endAt ? ` — ${formatEventTime(event.endAt)}` : ""}
                              </span>
                              {event.description ? <em>{event.description}</em> : null}
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
        </article>
      </div>

      <Dialog
        open={noteModalOpen}
        onClose={() => setNoteModalOpen(false)}
        fullWidth
        maxWidth="sm"
        className="ui-dialog ui-dialog--compact"
      >
        <DialogTitle>
          {editingNoteId ? "Редактировать событие" : "Новая заметка/напоминание"}
        </DialogTitle>
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
                  const minStartMinutes =
                    normalizedDate === todayKey
                      ? ceilToStep(nowMeta.minutes, PLANNER_SLOT_MINUTES)
                      : 0;
                  const availableStarts = buildTimeOptions(
                    minStartMinutes,
                    23 * 60 + 30,
                    PLANNER_SLOT_MINUTES
                  );
                  const nextStart =
                    availableStarts.includes(noteTime) && availableStarts.length > 0
                      ? noteTime
                      : availableStarts[0] ?? noteTime;
                  setNoteTime(nextStart);
                  const nextStartMinutes = timeToMinutes(nextStart) ?? 0;
                  const availableEnds = buildTimeOptions(
                    nextStartMinutes + PLANNER_SLOT_MINUTES,
                    24 * 60,
                    PLANNER_SLOT_MINUTES
                  );
                  const nextEnd =
                    availableEnds.includes(noteEndTime) && availableEnds.length > 0
                      ? noteEndTime
                      : availableEnds[0] ?? noteEndTime;
                  setNoteEndTime(nextEnd);
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
                  const nextStart = event.target.value;
                  setNoteTime(nextStart);
                  const nextStartMinutes = timeToMinutes(nextStart) ?? 0;
                  const availableEnds = buildTimeOptions(
                    nextStartMinutes + PLANNER_SLOT_MINUTES,
                    24 * 60,
                    PLANNER_SLOT_MINUTES
                  );
                  const nextEnd =
                    availableEnds.includes(noteEndTime) && availableEnds.length > 0
                      ? noteEndTime
                      : availableEnds[0] ?? noteEndTime;
                  setNoteEndTime(nextEnd);
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
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
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
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </TextField>
            </div>
            <div className="study-cabinet-panel__note-color">
              <span>Цвет стикера</span>
              <div className="study-cabinet-panel__note-color-palette">
                {NOTE_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`study-cabinet-panel__note-color-swatch ${
                      noteColor === color ? "is-active" : ""
                    }`}
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
