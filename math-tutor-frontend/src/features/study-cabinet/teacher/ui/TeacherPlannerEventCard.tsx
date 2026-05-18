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
  detailPanelId?: string;
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
  detailPanelId,
  onSelect,
}: TeacherPlannerEventCardProps) {
  const timeLabel = getPlannerEventTimeLabel(event);
  const isNote = event.kind === "note";
  const style = {
    top: `${top}px`,
    height: `${height}px`,
    "--teacher-daily-event-color": event.color,
    ...(laneCount > 1
      ? isNote
        ? {
            left: `${(lane / laneCount) * 100}%`,
            right: "auto",
            width: `calc(${100 / laneCount}% - 1px)`,
          }
        : {
            left: `calc(${(lane / laneCount) * 100}% + 2px)`,
            right: "auto",
            width: `calc(${100 / laneCount}% - 4px)`,
          }
      : {}),
  } as CSSProperties;
  const isBooking = event.kind === "regular-booking" || event.kind === "trial-booking";
  const eventTypeLabel = isBooking
    ? event.kind === "trial-booking"
      ? "Пробное"
      : "Занятие"
    : event.badge;
  const densityClass = height <= 58 ? "is-event-tiny" : height <= 78 ? "is-event-compact" : "";

  if (isNote) {
    const noteDensityClass =
      height <= 58 ? "is-note-tiny" : height <= 88 ? "is-note-compact" : "";
    const noteWidthClass = laneCount > 1 ? "is-note-narrow" : "";
    const noteMeta = [event.subtitle, event.secondaryBadge, event.statusLabel]
      .filter((item): item is string => Boolean(item))
      .filter((item, index, list) => list.indexOf(item) === index)
      .slice(0, 2);

    return (
      <button
        type="button"
        className={`teacher-daily-event teacher-daily-event--note ${
          selected ? "is-selected" : ""
        } ${noteDensityClass} ${noteWidthClass}`}
        style={style}
        onClick={() => onSelect(event)}
        aria-pressed={selected}
        aria-controls={detailPanelId}
      >
        <span className="teacher-daily-event__note-topline">
          <span className="teacher-daily-event__note-badge">
            <TeacherPlannerIcon name="note" />
            {event.badge}
          </span>
          <span className="teacher-daily-event__note-time">
            <TeacherPlannerIcon name="clock" />
            {timeLabel}
          </span>
        </span>

        <span className="teacher-daily-event__note-bodyline">
          <strong>{event.title}</strong>
          {event.description ? <span>{event.description}</span> : null}
        </span>

        {noteMeta.length > 0 ? (
          <span className="teacher-daily-event__note-footer">
            <span className="teacher-daily-event__note-meta">
              {noteMeta.map((item) => (
                <em key={item}>{item}</em>
              ))}
            </span>
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`teacher-daily-event teacher-daily-event--${event.kind} ${
        selected ? "is-selected" : ""
      } ${isBooking ? "teacher-daily-event--booking" : ""} ${densityClass}`}
      style={style}
      onClick={() => onSelect(event)}
      aria-pressed={selected}
      aria-controls={detailPanelId}
    >
      <span className="teacher-daily-event__rail" aria-hidden="true" />
      <span className="teacher-daily-event__body">
        <span className="teacher-daily-event__meta">
          <i>{getEventIcon(event)}</i>
          <em>{timeLabel}</em>
          <small>{eventTypeLabel}</small>
        </span>
        <strong>{event.title}</strong>
        {!isBooking ? <span>{event.subtitle}</span> : null}
      </span>
      {!isBooking && event.secondaryBadge ? (
        <span className="teacher-daily-event__badges">
          <small>{event.secondaryBadge}</small>
        </span>
      ) : null}
    </button>
  );
}
