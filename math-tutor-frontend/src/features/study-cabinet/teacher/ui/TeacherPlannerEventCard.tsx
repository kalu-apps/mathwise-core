import type { CSSProperties } from "react";
import type { TeacherPlannerEvent } from "@/features/study-cabinet/teacher/model/types";
import { getPlannerEventTimeLabel } from "@/features/study-cabinet/teacher/model/plannerEvents";
import { TeacherPlannerIcon } from "@/features/study-cabinet/teacher/ui/TeacherPlannerIcons";

type TeacherPlannerEventCardProps = {
  event: TeacherPlannerEvent;
  selected: boolean;
  top: number;
  height: number;
  lane?: number;
  laneCount?: number;
  onSelect: (event: TeacherPlannerEvent) => void;
};

const getEventIcon = (event: TeacherPlannerEvent) => {
  if (event.kind === "trial-booking") return <TeacherPlannerIcon name="spark" />;
  if (event.kind === "regular-booking") return <TeacherPlannerIcon name="event" />;
  if (event.kind === "availability-slot") return <TeacherPlannerIcon name="lock" />;
  return <TeacherPlannerIcon name="note" />;
};

export function TeacherPlannerEventCard({
  event,
  selected,
  top,
  height,
  lane = 0,
  laneCount = 1,
  onSelect,
}: TeacherPlannerEventCardProps) {
  const style = {
    top: `${top}px`,
    height: `${height}px`,
    "--teacher-daily-event-color": event.color,
    ...(laneCount > 1
      ? {
          left: `calc(${(lane / laneCount) * 100}% + 2px)`,
          right: "auto",
          width: `calc(${100 / laneCount}% - 4px)`,
        }
      : {}),
  } as CSSProperties;

  return (
    <button
      type="button"
      className={`teacher-daily-event teacher-daily-event--${event.kind} ${
        selected ? "is-selected" : ""
      }`}
      style={style}
      onClick={() => onSelect(event)}
      aria-pressed={selected}
    >
      <span className="teacher-daily-event__rail" aria-hidden="true" />
      <span className="teacher-daily-event__body">
        <span className="teacher-daily-event__meta">
          <i>{getEventIcon(event)}</i>
          <em>{getPlannerEventTimeLabel(event)}</em>
          <small>{event.badge}</small>
        </span>
        <strong>{event.title}</strong>
        <span>{event.subtitle}</span>
      </span>
      {event.secondaryBadge ? (
        <span className="teacher-daily-event__badges">
          <small>{event.secondaryBadge}</small>
        </span>
      ) : null}
    </button>
  );
}
