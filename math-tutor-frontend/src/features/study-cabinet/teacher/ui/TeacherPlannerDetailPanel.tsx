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
  id?: string;
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
  id,
  onOpenSchedule,
  onOpenStudentChat,
  onCreatePrepNote,
  onEditNote,
  onDeleteNote,
}: TeacherPlannerDetailPanelProps) {
  if (!event) {
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

  const booking = event.booking;
  const note = event.note;
  const availability = event.availability;
  const isBooking = Boolean(booking);
  const eyebrow = booking
    ? event.kind === "trial-booking"
      ? "Пробная запись"
      : "Запись ученика"
    : event.badge;
  const detailStyle = {
    "--teacher-daily-event-color": event.color,
  } as CSSProperties;

  return (
    <aside
      id={id}
      className={`teacher-daily-detail teacher-daily-detail--${event.kind}`}
      style={detailStyle}
    >
      <span className="teacher-daily-detail__rail" aria-hidden="true" />
      <header className="teacher-daily-detail__head">
        <span className="teacher-daily-detail__icon">{getDetailIcon(event)}</span>
        <div>
          <span className="teacher-daily-detail__eyebrow">{eyebrow}</span>
          <h3>{event.title}</h3>
        </div>
        {note ? (
          <div className="teacher-daily-detail__note-actions" aria-label="Действия с заметкой">
            <button
              type="button"
              className="teacher-daily-detail__note-action"
              onClick={() => onEditNote(note)}
              aria-label="Редактировать заметку"
            >
              <TeacherPlannerIcon name="edit" />
            </button>
            {onDeleteNote ? (
              <button
                type="button"
                className="teacher-daily-detail__note-action teacher-daily-detail__note-action--danger"
                onClick={() => onDeleteNote(note.id)}
                aria-label="Удалить заметку"
              >
                <TeacherPlannerIcon name="trash" />
              </button>
            ) : null}
          </div>
        ) : booking ? (
          <div className="teacher-daily-detail__head-actions" aria-label="Действия с занятием">
            <TeacherPlannerIconButton label="Открыть занятие" onClick={onOpenSchedule}>
              <TeacherPlannerIcon name="event" />
            </TeacherPlannerIconButton>
            <TeacherPlannerIconButton
              label="Подготовка к занятию"
              onClick={() => onCreatePrepNote(booking)}
            >
              <TeacherPlannerIcon name="book" />
            </TeacherPlannerIconButton>
            {booking.studentId ? (
              <TeacherPlannerIconButton
                label="Открыть чат с учеником"
                onClick={() => onOpenStudentChat?.(booking.studentId)}
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
              >
                <TeacherPlannerIcon name="link" />
              </a>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="teacher-daily-detail__meta">
        <span>
          <TeacherPlannerIcon name="calendar" />
          {formatPlannerDate(event.dateKey)}
        </span>
        <span>
          <TeacherPlannerIcon name="clock" />
          {getPlannerEventTimeLabel(event)}
        </span>
        {event.paymentLabel ? (
          <span className={event.paymentLabel === "Не оплачено" ? "is-warning" : ""}>
            <TeacherPlannerIcon name="card" />
            {event.paymentLabel}
          </span>
        ) : null}
      </div>

      {!isBooking ? (
        <section className="teacher-daily-detail__section teacher-daily-detail__section--main">
          <strong>{event.subtitle}</strong>
          <p>{event.description}</p>
          {event.statusLabel ? <em>{event.statusLabel}</em> : null}
        </section>
      ) : null}

      {availability ? (
        <section className="teacher-daily-detail__section">
          <span className="study-cabinet-panel__kicker">Слот</span>
          <p>
            Это слой расписания. Управление свободными окнами остаётся во вкладке
            «Индивидуальные занятия».
          </p>
        </section>
      ) : null}

      {availability ? (
        <div className="teacher-daily-detail__actions">
          <TeacherPlannerButton variant="primary" onClick={onOpenSchedule}>
            Открыть слоты
          </TeacherPlannerButton>
        </div>
      ) : null}
    </aside>
  );
}
