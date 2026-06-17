import type { CSSProperties } from "react";
import type { Booking } from "@/entities/booking/model/types";
import type { StudyCabinetNote } from "@/shared/lib/studyCabinet";
import type { TeacherPlannerEvent } from "@/features/study-cabinet/teacher/model/types";
import {
  formatPlannerDate,
  getPlannerEventTimeLabel,
} from "@/features/study-cabinet/teacher/model/plannerEvents";
import { TeacherPlannerIcon } from "@/features/study-cabinet/teacher/ui/TeacherPlannerIcons";
import {
  TeacherPlannerButton,
  TeacherPlannerIconButton,
} from "@/features/study-cabinet/teacher/ui/TeacherPlannerPrimitives";

type TeacherPlannerDetailPanelProps = {
  event: TeacherPlannerEvent | null;
  events?: TeacherPlannerEvent[];
  selectedEventId?: string | null;
  id?: string;
  onSelectEvent?: (event: TeacherPlannerEvent) => void;
  onOpenSchedule?: () => void;
  onOpenStudentChat?: (studentId: string) => void;
  onCreatePrepNote: (booking: Booking) => void;
  onEditNote: (note: StudyCabinetNote) => void;
  onDeleteNote?: (noteId: string) => void;
};

const getDetailIcon = (event: TeacherPlannerEvent) => {
  if (event.kind === "availability-slot") return <TeacherPlannerIcon name="lock" />;
  if (event.kind === "note") return <TeacherPlannerIcon name="note" />;
  if (event.kind === "trial-booking") return <TeacherPlannerIcon name="spark" />;
  return <TeacherPlannerIcon name="event" />;
};

export function TeacherPlannerDetailPanel({
  event,
  events = [],
  selectedEventId,
  id,
  onSelectEvent,
  onOpenSchedule,
  onOpenStudentChat,
  onCreatePrepNote,
  onEditNote,
  onDeleteNote,
}: TeacherPlannerDetailPanelProps) {
  const dayEvents = events.length > 0 ? events : event ? [event] : [];

  if (!event && dayEvents.length === 0) {
    return (
      <aside id={id} className="teacher-daily-detail teacher-daily-detail--empty">
        <span className="teacher-daily-detail__empty-icon">
          <TeacherPlannerIcon name="schedule" />
        </span>
        <strong>Выберите событие</strong>
        <p>Детали занятия, свободного слота или напоминания появятся здесь.</p>
      </aside>
    );
  }

  const selectedId = selectedEventId ?? event?.id ?? dayEvents[0]?.id ?? null;
  const leadEvent =
    dayEvents.find((dayEvent) => dayEvent.id === selectedId) ?? dayEvents[0];
  const detailStyle = {
    "--teacher-daily-event-color": leadEvent.color,
  } as CSSProperties;

  return (
    <aside
      id={id}
      className="teacher-daily-detail teacher-daily-detail--list"
      style={detailStyle}
    >
      <div className="teacher-daily-detail__cards-head">
        <strong>{dayEvents.length} событий</strong>
        <span>{formatPlannerDate(leadEvent.dateKey)}</span>
      </div>

      <div className="teacher-daily-detail__cards" aria-label="События выбранного дня">
        {dayEvents.map((dayEvent) => {
          const booking = dayEvent.booking;
          const note = dayEvent.note;
          const availability = dayEvent.availability;
          const isBooking = Boolean(booking);
          const isSelected = dayEvent.id === selectedId;
          const eyebrow = booking
            ? dayEvent.kind === "trial-booking"
              ? "Пробная запись"
              : "Запись ученика"
            : dayEvent.badge;

          return (
            <article
              key={dayEvent.id}
              className={`teacher-daily-detail__card teacher-daily-detail__card--${dayEvent.kind} ${
                isSelected ? "is-active" : ""
              }`}
              style={
                {
                  "--teacher-daily-event-color": dayEvent.color,
                } as CSSProperties
              }
              role={onSelectEvent ? "button" : undefined}
              tabIndex={onSelectEvent ? 0 : undefined}
              onClick={() => onSelectEvent?.(dayEvent)}
              onKeyDown={(keyboardEvent) => {
                if (!onSelectEvent) return;
                if (keyboardEvent.target !== keyboardEvent.currentTarget) return;
                if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                  keyboardEvent.preventDefault();
                  onSelectEvent(dayEvent);
                }
              }}
            >
              <header className="teacher-daily-detail__card-head">
                <span className="teacher-daily-detail__card-icon">{getDetailIcon(dayEvent)}</span>
                <div>
                  <span className="teacher-daily-detail__eyebrow">{eyebrow}</span>
                  <h3>{dayEvent.title}</h3>
                </div>
                {note ? (
                  <div
                    className="teacher-daily-detail__note-actions"
                    aria-label="Действия с заметкой"
                  >
                    <button
                      type="button"
                      className="teacher-daily-detail__note-action"
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation();
                        onEditNote(note);
                      }}
                      aria-label="Редактировать заметку"
                    >
                      <TeacherPlannerIcon name="edit" />
                    </button>
                    {onDeleteNote ? (
                      <button
                        type="button"
                        className="teacher-daily-detail__note-action teacher-daily-detail__note-action--danger"
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          onDeleteNote(note.id);
                        }}
                        aria-label="Удалить заметку"
                      >
                        <TeacherPlannerIcon name="trash" />
                      </button>
                    ) : null}
                  </div>
                ) : booking ? (
                  <div
                    className="teacher-daily-detail__head-actions"
                    aria-label="Действия с занятием"
                  >
                    <TeacherPlannerIconButton
                      label="Открыть занятие"
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation();
                        onOpenSchedule?.();
                      }}
                    >
                      <TeacherPlannerIcon name="event" />
                    </TeacherPlannerIconButton>
                    <TeacherPlannerIconButton
                      label="Подготовка к занятию"
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation();
                        onCreatePrepNote(booking);
                      }}
                    >
                      <TeacherPlannerIcon name="book" />
                    </TeacherPlannerIconButton>
                    {booking.studentId ? (
                      <TeacherPlannerIconButton
                        label="Открыть чат с учеником"
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          onOpenStudentChat?.(booking.studentId);
                        }}
                      >
                        <TeacherPlannerIcon name="chat" />
                      </TeacherPlannerIconButton>
                    ) : null}
                    {booking.meetingUrl ? (
                      <a
                        className="teacher-daily-detail__icon-link"
                        href={booking.meetingUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Открыть ссылку на занятие"
                        title="Открыть ссылку на занятие"
                        onClick={(clickEvent) => clickEvent.stopPropagation()}
                      >
                        <TeacherPlannerIcon name="link" />
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </header>

              <div className="teacher-daily-detail__meta">
                <span>
                  <TeacherPlannerIcon name="clock" />
                  {getPlannerEventTimeLabel(dayEvent)}
                </span>
                {dayEvent.paymentLabel ? (
                  <span className={dayEvent.paymentLabel === "Не оплачено" ? "is-warning" : ""}>
                    <TeacherPlannerIcon name="card" />
                    {dayEvent.paymentLabel}
                  </span>
                ) : null}
              </div>

              {!isBooking ? (
                <section className="teacher-daily-detail__section teacher-daily-detail__section--main">
                  <strong>{dayEvent.subtitle}</strong>
                  <p>{dayEvent.description}</p>
                  {dayEvent.statusLabel ? <em>{dayEvent.statusLabel}</em> : null}
                </section>
              ) : null}

              {availability ? (
                <div className="teacher-daily-detail__actions">
                  <TeacherPlannerButton
                    variant="primary"
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      onOpenSchedule?.();
                    }}
                  >
                    Открыть слоты
                  </TeacherPlannerButton>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </aside>
  );
}
