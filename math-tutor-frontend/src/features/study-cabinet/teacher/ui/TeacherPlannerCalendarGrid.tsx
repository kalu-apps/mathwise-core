import { useEffect, useMemo, useRef } from "react";
import type { TeacherPlannerEvent } from "@/features/study-cabinet/teacher/model/types";
import {
  PLANNER_SLOT_MINUTES,
  formatPlannerDate,
  minutesToTime,
} from "@/features/study-cabinet/teacher/model/plannerEvents";
import { TeacherPlannerEventCard } from "@/features/study-cabinet/teacher/ui/TeacherPlannerEventCard";
import { TeacherPlannerIcon } from "@/features/study-cabinet/teacher/ui/TeacherPlannerIcons";

type TeacherPlannerCalendarGridProps = {
  dateKey: string;
  events: TeacherPlannerEvent[];
  todayKey: string;
  nowMinutes: number;
  selectedEventId: string | null;
  detailPanelId?: string;
  onSelectEvent: (event: TeacherPlannerEvent) => void;
  onCreateNoteAtSlot: (dateKey: string, startTime: string) => void;
};

type PlannerEventLane = {
  lane: number;
  laneCount: number;
};

const HOUR_HEIGHT = 62;
const MIN_START_HOUR = 6;
const MIN_END_HOUR = 22;
const SLOT_HEIGHT = (PLANNER_SLOT_MINUTES / 60) * HOUR_HEIGHT;

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

const getTimelineBounds = (events: TeacherPlannerEvent[]) => {
  const startHour = Math.max(
    0,
    Math.min(
      MIN_START_HOUR,
      events.length ? Math.floor(Math.min(...events.map((event) => event.startMinutes)) / 60) - 1 : MIN_START_HOUR
    )
  );
  const endHour = Math.min(
    24,
    Math.max(
      MIN_END_HOUR,
      events.length ? Math.ceil(Math.max(...events.map((event) => event.endMinutes)) / 60) + 1 : MIN_END_HOUR
    )
  );
  return { startHour, endHour };
};

export function TeacherPlannerCalendarGrid({
  dateKey,
  events,
  todayKey,
  nowMinutes,
  selectedEventId,
  detailPanelId,
  onSelectEvent,
  onCreateNoteAtSlot,
}: TeacherPlannerCalendarGridProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { startHour, endHour } = useMemo(() => getTimelineBounds(events), [events]);
  const hourLabels = useMemo(
    () =>
      Array.from({ length: endHour - startHour + 1 }).map((_, index) => {
        const hour = startHour + index;
        return `${String(hour).padStart(2, "0")}:00`;
      }),
    [endHour, startHour]
  );
  const laneMap = useMemo(() => buildEventLaneMap(events), [events]);
  const slotCount = ((endHour - startHour) * 60) / PLANNER_SLOT_MINUTES;
  const canvasHeight = (endHour - startHour) * HOUR_HEIGHT;
  const nowLineTop = ((nowMinutes - startHour * 60) / 60) * HOUR_HEIGHT;
  const showNowLine = dateKey === todayKey && nowLineTop >= 0 && nowLineTop <= canvasHeight;

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || dateKey !== todayKey) return;
    container.scrollTo({
      top: Math.max(0, nowLineTop - HOUR_HEIGHT * 2),
      behavior: "smooth",
    });
  }, [dateKey, nowLineTop, todayKey]);

  return (
    <section className="teacher-daily-timeline" aria-label="Дневное расписание">
      <header className="teacher-daily-timeline__head">
        <div>
          <h3>{formatPlannerDate(dateKey)}</h3>
        </div>
        <span>
          <TeacherPlannerIcon name="clock" />
          {events.length} событий
        </span>
      </header>

      <div className="teacher-daily-timeline__scroll" ref={scrollRef}>
        <div className="teacher-daily-timeline__axis" style={{ height: `${canvasHeight}px` }}>
          {hourLabels.map((label, index) => (
            <span key={label} style={{ top: `${index * HOUR_HEIGHT}px` }}>
              {label}
            </span>
          ))}
        </div>
        <div className="teacher-daily-timeline__canvas" style={{ height: `${canvasHeight}px` }}>
          <div className="teacher-daily-timeline__slots">
            {Array.from({ length: slotCount }).map((_, slotIndex) => {
              const slotMinutes = startHour * 60 + slotIndex * PLANNER_SLOT_MINUTES;
              const slotEndMinutes = slotMinutes + PLANNER_SLOT_MINUTES;
              const startTime = minutesToTime(slotMinutes);
              const hasEventInSlot = events.some(
                (event) => event.startMinutes < slotEndMinutes && event.endMinutes > slotMinutes
              );
              const isPastTodaySlot = dateKey === todayKey && slotMinutes < nowMinutes && !hasEventInSlot;
              return (
                <button
                  key={`${dateKey}-${slotIndex}`}
                  type="button"
                  className={`teacher-daily-timeline__slot ${
                    isPastTodaySlot ? "is-disabled" : "is-clickable"
                  }`}
                  onClick={() => {
                    if (!isPastTodaySlot) onCreateNoteAtSlot(dateKey, startTime);
                  }}
                  tabIndex={isPastTodaySlot ? -1 : 0}
                  aria-label={`Создать заметку ${dateKey} ${startTime}`}
                />
              );
            })}
          </div>

          {showNowLine ? (
            <span
              className="teacher-daily-timeline__now"
              style={{ top: `${nowLineTop}px` }}
              aria-hidden="true"
            />
          ) : null}

          {events.map((event) => {
            const lane = laneMap.get(event.id)?.lane ?? 0;
            const laneCount = laneMap.get(event.id)?.laneCount ?? 1;
            const top = ((event.startMinutes - startHour * 60) / 60) * HOUR_HEIGHT;
            const rawHeight = ((event.endMinutes - event.startMinutes) / 60) * HOUR_HEIGHT;
            const height =
              event.kind === "note"
                ? Math.max(SLOT_HEIGHT, rawHeight)
                : Math.max(34, rawHeight - 6);
            return (
              <TeacherPlannerEventCard
                key={event.id}
                event={event}
                selected={selectedEventId === event.id}
                top={top}
                height={height}
                lane={lane}
                laneCount={laneCount}
                detailPanelId={detailPanelId}
                onSelect={onSelectEvent}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
