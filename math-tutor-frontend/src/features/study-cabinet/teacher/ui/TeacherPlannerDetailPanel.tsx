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
  onOpenSchedule,
  onOpenStudentChat,
  onCreatePrepNote,
  onEditNote,
  onDeleteNote,
}: TeacherPlannerDetailPanelProps) {
  if (!event) {
    return (
      <aside className="teacher-planner-detail teacher-planner-detail--empty">
        <span className="teacher-planner-detail__empty-icon">
          <TeacherPlannerIcon name="schedule" />
        </span>
        <strong>Выберите событие</strong>
        <p>Здесь появятся детали занятия, свободного слота или напоминания.</p>
      </aside>
    );
  }

  const booking = event.booking;
  const note = event.note;
  const availability = event.availability;
  const detailStyle = {
    "--teacher-planner-event-color": event.color,
  } as CSSProperties;

  return (
    <aside
      className={`teacher-planner-detail teacher-planner-detail--${event.kind}`}
      style={detailStyle}
    >
      <span className="teacher-planner-detail__rail" aria-hidden="true" />
      <div className="teacher-planner-detail__head">
        <span className="teacher-planner-detail__icon">{getDetailIcon(event)}</span>
        <div>
          <span className="teacher-planner-detail__eyebrow">{event.badge}</span>
          <h3>{event.title}</h3>
        </div>
      </div>

      <div className="teacher-planner-detail__meta">
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
        {event.secondaryBadge ? <span>{event.secondaryBadge}</span> : null}
      </div>

      <div className="teacher-planner-detail__body">
        <strong>{event.subtitle}</strong>
        <p>{event.description}</p>
        {event.statusLabel ? <em>{event.statusLabel}</em> : null}
      </div>

      {booking ? (
        <div className="teacher-planner-detail__section">
          <span className="study-cabinet-panel__kicker">Связанные данные</span>
          <div className="teacher-planner-detail__facts">
            <span>{booking.studentEmail}</span>
            {booking.studentPhone ? <span>{booking.studentPhone}</span> : null}
            <span>Материалы: {booking.materials.length}</span>
          </div>
          {booking.meetingUrl ? (
            <a
              className="teacher-planner-detail__link"
              href={booking.meetingUrl}
              target="_blank"
              rel="noreferrer"
            >
              <TeacherPlannerIcon name="link" />
              Открыть ссылку на занятие
            </a>
          ) : null}
        </div>
      ) : null}

      {note ? (
        <div className="teacher-planner-detail__section">
          <span className="study-cabinet-panel__kicker">Заметка</span>
          <div className="teacher-planner-detail__facts">
            <span>{note.remind ? "Напоминание включено" : "Без напоминания"}</span>
            {note.linkedBookingId ? <span>Связано с занятием</span> : null}
          </div>
        </div>
      ) : null}

      {availability ? (
        <div className="teacher-planner-detail__section">
          <span className="study-cabinet-panel__kicker">Слот</span>
          <p>
            Это слой расписания. Управление свободными окнами остаётся во вкладке
            «Индивидуальные занятия».
          </p>
        </div>
      ) : null}

      <div className="teacher-planner-detail__actions">
        {booking ? (
          <>
            <TeacherPlannerButton variant="primary" onClick={onOpenSchedule}>
              Открыть занятие
            </TeacherPlannerButton>
            <TeacherPlannerButton
              variant="secondary"
              icon={<TeacherPlannerIcon name="book" />}
              onClick={() => onCreatePrepNote(booking)}
            >
              Подготовка
            </TeacherPlannerButton>
            {booking.studentId ? (
              <TeacherPlannerButton
                variant="ghost"
                icon={<TeacherPlannerIcon name="chat" />}
                onClick={() => onOpenStudentChat?.(booking.studentId)}
              >
                Чат
              </TeacherPlannerButton>
            ) : null}
          </>
        ) : null}

        {availability ? (
          <TeacherPlannerButton variant="primary" onClick={onOpenSchedule}>
            Открыть слоты
          </TeacherPlannerButton>
        ) : null}

        {note ? (
          <>
            <TeacherPlannerButton
              variant="primary"
              icon={<TeacherPlannerIcon name="edit" />}
              onClick={() => onEditNote(note)}
            >
              Редактировать
            </TeacherPlannerButton>
            {onDeleteNote ? (
              <TeacherPlannerIconButton
                label="Удалить напоминание"
                variant="danger"
                onClick={() => onDeleteNote(note.id)}
              >
                <TeacherPlannerIcon name="trash" />
              </TeacherPlannerIconButton>
            ) : null}
          </>
        ) : null}
      </div>
    </aside>
  );
}
