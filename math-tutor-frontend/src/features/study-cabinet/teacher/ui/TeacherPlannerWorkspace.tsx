import { useEffect, useMemo, useState } from "react";
import type { Booking } from "@/entities/booking/model/types";
import type { AvailabilitySlot } from "@/features/teacher-availability/model/types";
import type { StudyCabinetNote } from "@/shared/lib/studyCabinet";
import {
  type TeacherPlannerEvent,
  type TeacherPlannerTabId,
  type TeacherStudyNoteDraftRequest,
} from "@/features/study-cabinet/teacher/model/types";
import {
  PLANNER_WEEKDAY_LABELS,
  addDays,
  buildPlannerDays,
  buildTeacherPlannerEvents,
  formatDayTime,
  formatPlannerDate,
  startOfWeek,
  toLocalDateKey,
  fromDateKey,
} from "@/features/study-cabinet/teacher/model/plannerEvents";
import {
  buildPlannerTabCounts,
  filterTeacherPlannerEvents,
  getPlannerEventsForRange,
  selectPlannerEventById,
  selectPlannerSummary,
  TEACHER_PLANNER_TABS,
} from "@/features/study-cabinet/teacher/model/plannerSelectors";
import { TeacherPlannerCalendarGrid } from "@/features/study-cabinet/teacher/ui/TeacherPlannerCalendarGrid";
import { TeacherPlannerDetailPanel } from "@/features/study-cabinet/teacher/ui/TeacherPlannerDetailPanel";
import { TeacherPlannerIcon } from "@/features/study-cabinet/teacher/ui/TeacherPlannerIcons";
import {
  TeacherPlannerButton,
  TeacherPlannerIconButton,
} from "@/features/study-cabinet/teacher/ui/TeacherPlannerPrimitives";

type TeacherPlannerWorkspaceProps = {
  bookings: Booking[];
  availability: AvailabilitySlot[];
  notes: StudyCabinetNote[];
  loading?: boolean;
  onOpenSchedule?: () => void;
  onOpenStudentChat?: (studentId: string) => void;
  onCreateNote: (request?: TeacherStudyNoteDraftRequest) => void;
  onEditNote: (note: StudyCabinetNote) => void;
  onDeleteNote?: (noteId: string) => void;
};

const getFirstVisibleEventId = (events: TeacherPlannerEvent[]) => events[0]?.id ?? null;
const TEACHER_DAILY_DETAIL_PANEL_ID = "teacher-daily-detail-panel";

const isBookingEvent = (event: TeacherPlannerEvent) =>
  event.kind === "trial-booking" || event.kind === "regular-booking";

const useCompactPlannerLayout = () => {
  const [isCompact, setIsCompact] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia("(max-width: 960px)").matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 960px)");
    const handleChange = () => setIsCompact(mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return isCompact;
};

export function TeacherPlannerWorkspace({
  bookings,
  availability,
  notes,
  loading = false,
  onOpenSchedule,
  onOpenStudentChat,
  onCreateNote,
  onEditNote,
  onDeleteNote,
}: TeacherPlannerWorkspaceProps) {
  const isCompactLayout = useCompactPlannerLayout();
  const [activeTab, setActiveTab] = useState<TeacherPlannerTabId>("all");
  const [selectedDateKey, setSelectedDateKey] = useState(() => toLocalDateKey(new Date()));
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const now = new Date();
  const todayKey = toLocalDateKey(now);
  const nowTs = now.getTime();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const selectedDate = useMemo(() => fromDateKey(selectedDateKey), [selectedDateKey]);
  const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate]);

  const weekDays = useMemo(
    () => buildPlannerDays("week", selectedDateKey, weekStart),
    [selectedDateKey, weekStart]
  );
  const weekKeys = useMemo(
    () => new Set(weekDays.map((day) => day.key)),
    [weekDays]
  );
  const selectedDayKeys = useMemo(() => new Set([selectedDateKey]), [selectedDateKey]);
  const allEvents = useMemo(
    () => buildTeacherPlannerEvents({ bookings, availability, notes }),
    [availability, bookings, notes]
  );
  const weekEvents = useMemo(
    () => getPlannerEventsForRange({ events: allEvents, dayKeys: weekKeys, activeTab: "all" }),
    [allEvents, weekKeys]
  );
  const selectedDayAllEvents = useMemo(
    () => getPlannerEventsForRange({ events: allEvents, dayKeys: selectedDayKeys, activeTab: "all" }),
    [allEvents, selectedDayKeys]
  );
  const selectedDayEvents = useMemo(
    () => filterTeacherPlannerEvents(selectedDayAllEvents, activeTab),
    [activeTab, selectedDayAllEvents]
  );
  const tabCounts = useMemo(() => buildPlannerTabCounts(weekEvents), [weekEvents]);
  const selectedEventIdIsVisible = selectedEventId
    ? selectedDayEvents.some((event) => event.id === selectedEventId)
    : false;
  const effectiveSelectedEventId = selectedEventIdIsVisible
    ? selectedEventId
    : getFirstVisibleEventId(selectedDayEvents);
  const selectedEvent = selectPlannerEventById(selectedDayEvents, effectiveSelectedEventId);
  const summary = useMemo(
    () => selectPlannerSummary({ events: allEvents, todayKey, weekKeys, nowTs }),
    [allEvents, nowTs, todayKey, weekKeys]
  );
  const selectedDayBookings = selectedDayAllEvents.filter(isBookingEvent);
  const selectedDaySlots = selectedDayAllEvents.filter((event) => event.kind === "availability-slot");

  const shiftDay = (step: number) => {
    const nextDate = addDays(fromDateKey(selectedDateKey), step);
    setSelectedDateKey(toLocalDateKey(nextDate));
    setSelectedEventId(null);
  };

  const goToday = () => {
    setSelectedDateKey(toLocalDateKey(new Date()));
    setSelectedEventId(null);
  };

  const selectDate = (dateKey: string) => {
    setSelectedDateKey(dateKey);
    setSelectedEventId(null);
  };

  const selectEvent = (event: TeacherPlannerEvent) => {
    setSelectedDateKey(event.dateKey);
    setSelectedEventId(event.id);
    if (event.kind === "note" && event.note) {
      onEditNote(event.note);
      return;
    }
    if (isCompactLayout) {
      window.setTimeout(() => {
        document
          .getElementById(TEACHER_DAILY_DETAIL_PANEL_ID)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    }
  };

  const createNoteAtSlot = (dateKey: string, startTime: string) => {
    selectDate(dateKey);
    onCreateNote({ templateId: "custom", dateKey, startTime });
  };

  return (
    <section className="teacher-daily-planner">
      <header className="teacher-daily-planner__hero">
        <div className="teacher-daily-planner__title">
          <h2>Календарь преподавателя</h2>
          <p>
            {formatPlannerDate(selectedDateKey)} · {selectedDayAllEvents.length} событий ·{" "}
            {selectedDayBookings.length} занятий
          </p>
        </div>
        <div className="teacher-daily-planner__hero-actions">
          <TeacherPlannerButton
            variant="secondary"
            icon={<TeacherPlannerIcon name="calendar" />}
            onClick={goToday}
          >
            Сегодня
          </TeacherPlannerButton>
          <TeacherPlannerButton
            variant="primary"
            icon={<TeacherPlannerIcon name="add" />}
            onClick={() => onCreateNote({ templateId: "custom", dateKey: selectedDateKey })}
          >
            Заметка
          </TeacherPlannerButton>
        </div>
      </header>

      <div className="teacher-daily-planner__week" aria-label="Неделя">
        <TeacherPlannerIconButton label="Предыдущий день" onClick={() => shiftDay(-1)}>
          <TeacherPlannerIcon name="chevron-left" />
        </TeacherPlannerIconButton>
        <div className="teacher-daily-week-strip">
          {weekDays.map((day, index) => {
            const dayEvents = weekEvents.filter((event) => event.dateKey === day.key);
            return (
              <button
                key={day.key}
                type="button"
                className={`teacher-daily-week-strip__day ${
                  selectedDateKey === day.key ? "is-selected" : ""
                } ${day.key === todayKey ? "is-today" : ""}`}
                onClick={() => selectDate(day.key)}
              >
                <span>{PLANNER_WEEKDAY_LABELS[index]}</span>
                <strong>{day.date.toLocaleDateString("ru-RU", { day: "2-digit" })}</strong>
                <em>{dayEvents.length}</em>
              </button>
            );
          })}
        </div>
        <TeacherPlannerIconButton label="Следующий день" onClick={() => shiftDay(1)}>
          <TeacherPlannerIcon name="chevron-right" />
        </TeacherPlannerIconButton>
      </div>

      <div className="teacher-daily-planner__metrics" aria-label="Сводка дня">
        <article>
          <span><TeacherPlannerIcon name="event" /></span>
          <div>
            <small>Ближайшее</small>
            <strong>{summary.nextBooking ? summary.nextBooking.title : "Нет занятий"}</strong>
            <em>{summary.nextBooking ? formatDayTime(summary.nextBooking.startAtMs) : "Свободный фокус"}</em>
          </div>
        </article>
        <article>
          <span><TeacherPlannerIcon name="clock" /></span>
          <div>
            <small>Выбранный день</small>
            <strong>{selectedDayBookings.length}</strong>
            <em>занятий в расписании</em>
          </div>
        </article>
        <article>
          <span><TeacherPlannerIcon name="lock" /></span>
          <div>
            <small>Слоты</small>
            <strong>{selectedDaySlots.length}</strong>
            <em>окон доступности</em>
          </div>
        </article>
      </div>

      <div className="teacher-daily-planner__tabs" role="tablist" aria-label="Типы событий">
        {TEACHER_PLANNER_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "is-active" : ""}
            onClick={() => {
              setActiveTab(tab.id);
              setSelectedEventId(null);
            }}
          >
            <span>{tab.label}</span>
            <em>{tabCounts[tab.id]}</em>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="teacher-daily-planner__loading" aria-live="polite">
          <span><TeacherPlannerIcon name="calendar" /></span>
          <div>
            <strong>Загружаем расписание</strong>
            <p>Собираем занятия, свободные слоты и заметки.</p>
          </div>
        </div>
      ) : null}

      <div className="teacher-daily-planner__body">
        <TeacherPlannerCalendarGrid
          dateKey={selectedDateKey}
          events={selectedDayEvents}
          todayKey={todayKey}
          nowMinutes={nowMinutes}
          selectedEventId={selectedEvent?.id ?? effectiveSelectedEventId}
          detailPanelId={TEACHER_DAILY_DETAIL_PANEL_ID}
          onSelectEvent={selectEvent}
          onCreateNoteAtSlot={createNoteAtSlot}
        />

        <TeacherPlannerDetailPanel
          id={TEACHER_DAILY_DETAIL_PANEL_ID}
          event={selectedEvent}
          onOpenSchedule={onOpenSchedule}
          onOpenStudentChat={onOpenStudentChat}
          onCreatePrepNote={(booking) => onCreateNote({ templateId: "prep", booking })}
          onEditNote={onEditNote}
          onDeleteNote={onDeleteNote}
        />
      </div>
    </section>
  );
}
