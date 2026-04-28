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
  onSelect,
}: TeacherPlannerEventCardProps) {
  const layout = getPlannerEventLayout(event);
  const style = {
    top: `${layout.top}px`,
    height: `${layout.height}px`,
    "--teacher-planner-event-color": event.color,
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
      <span className="teacher-planner-event__icon">{getEventIcon(event)}</span>
      <span className="teacher-planner-event__body">
        <strong>{event.title}</strong>
        <span>{getPlannerEventTimeLabel(event)}</span>
        <em>{event.subtitle}</em>
      </span>
      <span className="teacher-planner-event__badges">
        <small>{event.badge}</small>
        {event.secondaryBadge ? <small>{event.secondaryBadge}</small> : null}
      </span>
    </button>
  );
}
