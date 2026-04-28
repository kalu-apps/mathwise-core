import { useMemo, useState } from "react";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import NotificationsActiveRoundedIcon from "@mui/icons-material/NotificationsActiveRounded";
import PaymentRoundedIcon from "@mui/icons-material/PaymentRounded";
import TimelapseRoundedIcon from "@mui/icons-material/TimelapseRounded";
import { useMediaQuery } from "@mui/material";
import type { Booking } from "@/entities/booking/model/types";
import type { AvailabilitySlot } from "@/features/teacher-availability/model/types";
import type { StudyCabinetNote } from "@/shared/lib/studyCabinet";
import {
  type TeacherPlannerEvent,
  type TeacherPlannerTabId,
  type TeacherPlannerViewMode,
  type TeacherStudyNoteDraftRequest,
} from "@/features/study-cabinet/teacher/model/types";
import {
  addDays,
  buildPlannerDays,
  buildTeacherPlannerEvents,
  formatDayTime,
  formatPlannerRangeLabel,
  getPlannerEventTimeLabel,
  startOfWeek,
  toLocalDateKey,
  fromDateKey,
} from "@/features/study-cabinet/teacher/model/plannerEvents";
import {
  buildPlannerTabCounts,
  getPlannerEmptyState,
  getPlannerEventsForRange,
  groupPlannerEventsByDay,
  selectPlannerEventById,
  selectPlannerSummary,
  TEACHER_PLANNER_TABS,
} from "@/features/study-cabinet/teacher/model/plannerSelectors";
import { TeacherPlannerCalendarGrid } from "@/features/study-cabinet/teacher/ui/TeacherPlannerCalendarGrid";
import { TeacherPlannerDetailPanel } from "@/features/study-cabinet/teacher/ui/TeacherPlannerDetailPanel";
import { TeacherPlannerEmptyState } from "@/features/study-cabinet/teacher/ui/TeacherPlannerEmptyState";
import { TeacherPlannerTabs } from "@/features/study-cabinet/teacher/ui/TeacherPlannerTabs";
import { TeacherPlannerToolbar } from "@/features/study-cabinet/teacher/ui/TeacherPlannerToolbar";

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
  const isCompactLayout = useMediaQuery("(max-width:960px)");
  const [requestedMode, setRequestedMode] = useState<TeacherPlannerViewMode>("week");
  const [activeTab, setActiveTab] = useState<TeacherPlannerTabId>("all");
  const [selectedDateKey, setSelectedDateKey] = useState(() => toLocalDateKey(new Date()));
  const [visibleRangeStart, setVisibleRangeStart] = useState(() => startOfWeek(new Date()));
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const now = new Date();
  const todayKey = toLocalDateKey(now);
  const nowTs = now.getTime();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const mode: TeacherPlannerViewMode = isCompactLayout ? "day" : requestedMode;

  const plannerDays = useMemo(
    () => buildPlannerDays(mode, selectedDateKey, visibleRangeStart),
    [mode, selectedDateKey, visibleRangeStart]
  );
  const dayKeys = useMemo(
    () => new Set(plannerDays.map((day) => day.key)),
    [plannerDays]
  );
  const weekKeys = useMemo(() => {
    const weekStart = startOfWeek(fromDateKey(selectedDateKey));
    return new Set(
      Array.from({ length: 7 }).map((_, index) => toLocalDateKey(addDays(weekStart, index)))
    );
  }, [selectedDateKey]);

  const allEvents = useMemo(
    () => buildTeacherPlannerEvents({ bookings, availability, notes }),
    [availability, bookings, notes]
  );
  const rangeEvents = useMemo(
    () => getPlannerEventsForRange({ events: allEvents, dayKeys, activeTab: "all" }),
    [allEvents, dayKeys]
  );
  const visibleEvents = useMemo(
    () => getPlannerEventsForRange({ events: allEvents, dayKeys, activeTab }),
    [activeTab, allEvents, dayKeys]
  );
  const eventsByDay = useMemo(
    () => groupPlannerEventsByDay(visibleEvents),
    [visibleEvents]
  );
  const tabCounts = useMemo(() => buildPlannerTabCounts(rangeEvents), [rangeEvents]);
  const selectedEventIdIsVisible = selectedEventId
    ? visibleEvents.some((event) => event.id === selectedEventId)
    : false;
  const effectiveSelectedEventId = selectedEventIdIsVisible
    ? selectedEventId
    : getFirstVisibleEventId(visibleEvents);
  const selectedEvent = selectPlannerEventById(visibleEvents, effectiveSelectedEventId);
  const summary = useMemo(
    () => selectPlannerSummary({ events: allEvents, todayKey, weekKeys, nowTs }),
    [allEvents, nowTs, todayKey, weekKeys]
  );
  const rangeLabel = useMemo(() => formatPlannerRangeLabel(plannerDays), [plannerDays]);
  const emptyState = getPlannerEmptyState(activeTab);

  const handleModeChange = (nextMode: TeacherPlannerViewMode) => {
    setRequestedMode(nextMode);
    if (nextMode === "week") {
      setVisibleRangeStart(startOfWeek(fromDateKey(selectedDateKey)));
    }
  };

  const shiftRange = (step: number) => {
    if (mode === "day") {
      const nextDate = addDays(fromDateKey(selectedDateKey), step);
      const nextKey = toLocalDateKey(nextDate);
      setSelectedDateKey(nextKey);
      setVisibleRangeStart(startOfWeek(nextDate));
      return;
    }
    setVisibleRangeStart((prev) => addDays(prev, step * 7));
  };

  const goToday = () => {
    const current = new Date();
    setSelectedDateKey(toLocalDateKey(current));
    setVisibleRangeStart(startOfWeek(current));
  };

  const selectDate = (dateKey: string) => {
    setSelectedDateKey(dateKey);
    if (mode === "week") {
      setVisibleRangeStart(startOfWeek(fromDateKey(dateKey)));
    }
  };

  const selectEvent = (event: TeacherPlannerEvent) => {
    setSelectedDateKey(event.dateKey);
    setSelectedEventId(event.id);
  };

  const createNoteAtSlot = (dateKey: string, startTime: string) => {
    selectDate(dateKey);
    onCreateNote({ templateId: "custom", dateKey, startTime });
  };

  return (
    <section className="teacher-planner-workspace">
      <div className="teacher-planner-workspace__head">
        <div>
          <span className="study-cabinet-panel__kicker">Planner</span>
          <h2>Расписание преподавателя</h2>
        </div>
        <p>
          {rangeEvents.length} событий в периоде · {tabCounts.bookings} занятий ·{" "}
          {tabCounts.availability} слотов
        </p>
      </div>

      <div className="teacher-planner-summary" aria-label="Сводка расписания">
        <div className="teacher-planner-summary__item teacher-planner-summary__item--next">
          <span>
            <EventAvailableRoundedIcon fontSize="inherit" />
          </span>
          <div>
            <small>Ближайшее занятие</small>
            <strong>{summary.nextBooking ? summary.nextBooking.title : "Нет в горизонте"}</strong>
            <em>
              {summary.nextBooking
                ? `${formatDayTime(summary.nextBooking.startAtMs)} · ${summary.nextBooking.badge}`
                : "Добавьте слоты или дождитесь записи"}
            </em>
          </div>
        </div>
        <div className="teacher-planner-summary__item">
          <span>
            <TimelapseRoundedIcon fontSize="inherit" />
          </span>
          <div>
            <small>Сегодня</small>
            <strong>{summary.todayBookings.length}</strong>
            <em>занятий в текущем дне</em>
          </div>
        </div>
        <div className="teacher-planner-summary__item teacher-planner-summary__item--payment">
          <span>
            <PaymentRoundedIcon fontSize="inherit" />
          </span>
          <div>
            <small>Оплата</small>
            <strong>{summary.unpaidBookings.length}</strong>
            <em>неоплаченных платных занятий</em>
          </div>
        </div>
        <div className="teacher-planner-summary__item teacher-planner-summary__item--notes">
          <span>
            <NotificationsActiveRoundedIcon fontSize="inherit" />
          </span>
          <div>
            <small>Неделя</small>
            <strong>{summary.reminderEvents.length}</strong>
            <em>напоминаний в фокусе</em>
          </div>
        </div>
      </div>

      <TeacherPlannerToolbar
        mode={mode}
        compact={isCompactLayout}
        rangeLabel={rangeLabel}
        onModeChange={handleModeChange}
        onPrevious={() => shiftRange(-1)}
        onNext={() => shiftRange(1)}
        onToday={goToday}
        onCreateNote={() => onCreateNote({ templateId: "custom", dateKey: selectedDateKey })}
      />

      <TeacherPlannerTabs
        tabs={TEACHER_PLANNER_TABS}
        activeTab={activeTab}
        counts={tabCounts}
        onChange={setActiveTab}
      />

      {visibleEvents.length === 0 || loading ? (
        <TeacherPlannerEmptyState
          title={emptyState.title}
          description={emptyState.description}
          actionLabel={activeTab === "availability" ? "Открыть слоты" : "Создать заметку"}
          onAction={activeTab === "availability" ? onOpenSchedule : () => onCreateNote({ templateId: "custom", dateKey: selectedDateKey })}
          loading={loading}
        />
      ) : null}

      <div className="teacher-planner-layout">
        <TeacherPlannerCalendarGrid
          days={plannerDays}
          eventsByDay={eventsByDay}
          selectedDateKey={selectedDateKey}
          todayKey={todayKey}
          nowMinutes={nowMinutes}
          mode={mode}
          selectedEventId={selectedEvent?.id ?? effectiveSelectedEventId}
          onSelectDate={selectDate}
          onSelectEvent={selectEvent}
          onCreateNoteAtSlot={createNoteAtSlot}
        />
        <TeacherPlannerDetailPanel
          event={selectedEvent}
          onOpenSchedule={onOpenSchedule}
          onOpenStudentChat={onOpenStudentChat}
          onCreatePrepNote={(booking) => onCreateNote({ templateId: "prep", booking })}
          onEditNote={onEditNote}
          onDeleteNote={onDeleteNote}
        />
      </div>

      {summary.nextEvent && visibleEvents.length > 0 ? (
        <div className="teacher-planner-footnote">
          Следующее событие: {summary.nextEvent.title}, {getPlannerEventTimeLabel(summary.nextEvent)}
        </div>
      ) : null}
    </section>
  );
}
