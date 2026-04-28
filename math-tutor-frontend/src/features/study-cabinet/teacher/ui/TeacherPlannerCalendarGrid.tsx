import { useEffect, useMemo, useRef } from "react";
import type {
  TeacherPlannerDay,
  TeacherPlannerEvent,
  TeacherPlannerViewMode,
} from "@/features/study-cabinet/teacher/model/types";
import {
  PLANNER_END_HOUR,
  PLANNER_HOUR_HEIGHT,
  PLANNER_SLOT_MINUTES,
  PLANNER_START_HOUR,
  PLANNER_WEEKDAY_LABELS,
  minutesToTime,
} from "@/features/study-cabinet/teacher/model/plannerEvents";
import { TeacherPlannerEventCard } from "@/features/study-cabinet/teacher/ui/TeacherPlannerEventCard";

type TeacherPlannerCalendarGridProps = {
  days: TeacherPlannerDay[];
  eventsByDay: Map<string, TeacherPlannerEvent[]>;
  selectedDateKey: string;
  todayKey: string;
  nowMinutes: number;
  mode: TeacherPlannerViewMode;
  selectedEventId: string | null;
  onSelectDate: (dateKey: string) => void;
  onSelectEvent: (event: TeacherPlannerEvent) => void;
  onCreateNoteAtSlot: (dateKey: string, startTime: string) => void;
};

type PlannerEventLane = {
  lane: number;
  laneCount: number;
};

const buildEventLaneMap = (events: TeacherPlannerEvent[]) => {
  const result = new Map<string, PlannerEventLane>();
  const sortedEvents = [...events].sort((a, b) => {
    if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
    return b.endMinutes - a.endMinutes;
  });
  const clusters: TeacherPlannerEvent[][] = [];
  let currentCluster: TeacherPlannerEvent[] = [];
  let currentClusterEnd = -1;

  sortedEvents.forEach((event) => {
    if (currentCluster.length === 0 || event.startMinutes < currentClusterEnd) {
      currentCluster.push(event);
      currentClusterEnd = Math.max(currentClusterEnd, event.endMinutes);
      return;
    }
    clusters.push(currentCluster);
    currentCluster = [event];
    currentClusterEnd = event.endMinutes;
  });

  if (currentCluster.length > 0) clusters.push(currentCluster);

  clusters.forEach((cluster) => {
    const laneEnds: number[] = [];
    const assigned = cluster.map((event) => {
      const laneIndex = laneEnds.findIndex((endMinute) => endMinute <= event.startMinutes);
      const lane = laneIndex >= 0 ? laneIndex : laneEnds.length;
      laneEnds[lane] = event.endMinutes;
      return { event, lane };
    });
    const laneCount = Math.max(1, laneEnds.length);
    assigned.forEach(({ event, lane }) => {
      result.set(event.id, { lane, laneCount });
    });
  });

  return result;
};

export function TeacherPlannerCalendarGrid({
  days,
  eventsByDay,
  selectedDateKey,
  todayKey,
  nowMinutes,
  mode,
  selectedEventId,
  onSelectDate,
  onSelectEvent,
  onCreateNoteAtSlot,
}: TeacherPlannerCalendarGridProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hourLabels = useMemo(() => {
    const count = PLANNER_END_HOUR - PLANNER_START_HOUR + 1;
    return Array.from({ length: count }).map((_, index) => {
      const hour = PLANNER_START_HOUR + index;
      return `${String(hour).padStart(2, "0")}:00`;
    });
  }, []);
  const slotCount = ((PLANNER_END_HOUR - PLANNER_START_HOUR) * 60) / PLANNER_SLOT_MINUTES;
  const nowLineTop =
    ((nowMinutes - PLANNER_START_HOUR * 60) / 60) * PLANNER_HOUR_HEIGHT;

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const hasTodayInView = days.some((day) => day.key === todayKey);
    if (!hasTodayInView) return;
    const targetTop =
      ((nowMinutes - PLANNER_START_HOUR * 60) / 60) * PLANNER_HOUR_HEIGHT -
      PLANNER_HOUR_HEIGHT * 2;
    container.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
  }, [days, nowMinutes, todayKey]);

  return (
    <div
      className={`teacher-planner-grid teacher-planner-grid--${mode}`}
      ref={scrollRef}
      aria-label="Календарное полотно преподавателя"
    >
      <div className="teacher-planner-grid__header">
        <div className="teacher-planner-grid__time-head">Время</div>
        <div
          className="teacher-planner-grid__day-heads"
          style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
        >
          {days.map((day, index) => {
            const dayEvents = eventsByDay.get(day.key) ?? [];
            return (
              <button
                key={day.key}
                type="button"
                className={`teacher-planner-grid__day-head ${
                  selectedDateKey === day.key ? "is-selected" : ""
                } ${day.key === todayKey ? "is-today" : ""}`}
                onClick={() => onSelectDate(day.key)}
              >
                <span>
                  {mode === "week"
                    ? PLANNER_WEEKDAY_LABELS[index]
                    : day.date.toLocaleDateString("ru-RU", { weekday: "short" }).replace(".", "")}
                </span>
                <strong>
                  {day.date.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" })}
                </strong>
                <em>{dayEvents.length}</em>
              </button>
            );
          })}
        </div>
      </div>

      <div className="teacher-planner-grid__body">
        <div className="teacher-planner-grid__time-axis">
          {hourLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div
          className="teacher-planner-grid__days"
          style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
        >
          {days.map((day) => {
            const dayEvents = eventsByDay.get(day.key) ?? [];
            const laneMap = buildEventLaneMap(dayEvents);
            return (
              <div key={day.key} className="teacher-planner-grid__day">
                <div className="teacher-planner-grid__slots">
                  {Array.from({ length: slotCount }).map((_, slotIndex) => {
                    const slotMinutes = PLANNER_START_HOUR * 60 + slotIndex * PLANNER_SLOT_MINUTES;
                    const slotEndMinutes = slotMinutes + PLANNER_SLOT_MINUTES;
                    const startTime = minutesToTime(slotMinutes);
                    const hasEventInSlot = dayEvents.some(
                      (event) =>
                        event.startMinutes < slotEndMinutes && event.endMinutes > slotMinutes
                    );
                    const isPastTodaySlot =
                      day.key === todayKey && slotMinutes < nowMinutes && !hasEventInSlot;
                    return (
                      <button
                        key={`${day.key}-${slotIndex}`}
                        type="button"
                        className={`teacher-planner-grid__slot ${
                          isPastTodaySlot ? "is-disabled" : "is-clickable"
                        }`}
                        onClick={() => {
                          if (!isPastTodaySlot) onCreateNoteAtSlot(day.key, startTime);
                        }}
                        tabIndex={isPastTodaySlot ? -1 : 0}
                        aria-label={`Создать заметку ${day.key} ${startTime}`}
                      />
                    );
                  })}
                </div>

                <div className="teacher-planner-grid__events">
                  {day.key === todayKey ? (
                    <span
                      className="teacher-planner-grid__now-line"
                      style={{ top: `${nowLineTop}px` }}
                      aria-hidden="true"
                    />
                  ) : null}
                  {dayEvents.map((event) => (
                    <TeacherPlannerEventCard
                      key={event.id}
                      event={event}
                      selected={selectedEventId === event.id}
                      lane={laneMap.get(event.id)?.lane ?? 0}
                      laneCount={laneMap.get(event.id)?.laneCount ?? 1}
                      onSelect={onSelectEvent}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
