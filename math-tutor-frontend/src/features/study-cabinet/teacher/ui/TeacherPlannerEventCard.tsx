import type { CSSProperties } from "react";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import LockClockRoundedIcon from "@mui/icons-material/LockClockRounded";
import NotesRoundedIcon from "@mui/icons-material/NotesRounded";
import WorkspacePremiumRoundedIcon from "@mui/icons-material/WorkspacePremiumRounded";
import type { TeacherPlannerEvent } from "@/features/study-cabinet/teacher/model/types";
import {
  getPlannerEventLayout,
  getPlannerEventTimeLabel,
} from "@/features/study-cabinet/teacher/model/plannerEvents";

type TeacherPlannerEventCardProps = {
  event: TeacherPlannerEvent;
  selected: boolean;
  lane?: number;
  laneCount?: number;
  onSelect: (event: TeacherPlannerEvent) => void;
};

const getEventIcon = (event: TeacherPlannerEvent) => {
  if (event.kind === "trial-booking") return <WorkspacePremiumRoundedIcon fontSize="inherit" />;
  if (event.kind === "regular-booking") return <EventAvailableRoundedIcon fontSize="inherit" />;
  if (event.kind === "availability-slot") return <LockClockRoundedIcon fontSize="inherit" />;
  return <NotesRoundedIcon fontSize="inherit" />;
};

export function TeacherPlannerEventCard({
  event,
  selected,
  lane = 0,
  laneCount = 1,
  onSelect,
}: TeacherPlannerEventCardProps) {
  const layout = getPlannerEventLayout(event);
  const style = {
    top: `${layout.top}px`,
    height: `${layout.height}px`,
    "--teacher-planner-event-color": event.color,
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
      className={`teacher-planner-event teacher-planner-event--${event.kind} ${
        selected ? "is-selected" : ""
      }`}
      style={style}
      onClick={() => onSelect(event)}
      aria-pressed={selected}
    >
      <span className="teacher-planner-event__rail" aria-hidden="true" />
      <span className="teacher-planner-event__icon">{getEventIcon(event)}</span>
      <span className="teacher-planner-event__body">
        <span className="teacher-planner-event__meta">
          <em>{getPlannerEventTimeLabel(event)}</em>
          <small>{event.badge}</small>
        </span>
        <strong>{event.title}</strong>
        <span>{event.subtitle}</span>
      </span>
      {event.secondaryBadge ? (
        <span className="teacher-planner-event__badges">
          <small>{event.secondaryBadge}</small>
        </span>
      ) : null}
    </button>
  );
}
