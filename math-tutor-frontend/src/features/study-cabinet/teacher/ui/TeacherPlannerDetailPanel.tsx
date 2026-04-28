import type { CSSProperties } from "react";
import AutoStoriesRoundedIcon from "@mui/icons-material/AutoStoriesRounded";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import LockClockRoundedIcon from "@mui/icons-material/LockClockRounded";
import NotesRoundedIcon from "@mui/icons-material/NotesRounded";
import PaymentRoundedIcon from "@mui/icons-material/PaymentRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import { Button, IconButton, Tooltip } from "@mui/material";
import type { Booking } from "@/entities/booking/model/types";
import type { StudyCabinetNote } from "@/shared/lib/studyCabinet";
import type { TeacherPlannerEvent } from "@/features/study-cabinet/teacher/model/types";
import {
  formatPlannerDate,
  getPlannerEventTimeLabel,
} from "@/features/study-cabinet/teacher/model/plannerEvents";

type TeacherPlannerDetailPanelProps = {
  event: TeacherPlannerEvent | null;
  onOpenSchedule?: () => void;
  onOpenStudentChat?: (studentId: string) => void;
  onCreatePrepNote: (booking: Booking) => void;
  onEditNote: (note: StudyCabinetNote) => void;
  onDeleteNote?: (noteId: string) => void;
};

const getDetailIcon = (event: TeacherPlannerEvent) => {
  if (event.kind === "availability-slot") return <LockClockRoundedIcon fontSize="small" />;
  if (event.kind === "note") return <NotesRoundedIcon fontSize="small" />;
  return <EventAvailableRoundedIcon fontSize="small" />;
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
          <ScheduleRoundedIcon fontSize="small" />
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
          <ScheduleRoundedIcon fontSize="inherit" />
          {formatPlannerDate(event.dateKey)}
        </span>
        <span>
          <ScheduleRoundedIcon fontSize="inherit" />
          {getPlannerEventTimeLabel(event)}
        </span>
        {event.paymentLabel ? (
          <span className={event.paymentLabel === "Не оплачено" ? "is-warning" : ""}>
            <PaymentRoundedIcon fontSize="inherit" />
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
              <LinkRoundedIcon fontSize="small" />
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
            <Button size="small" variant="contained" onClick={onOpenSchedule}>
              Открыть занятие
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<AutoStoriesRoundedIcon />}
              onClick={() => onCreatePrepNote(booking)}
            >
              Подготовка
            </Button>
            {booking.studentId ? (
              <Button
                size="small"
                variant="text"
                startIcon={<ChatBubbleOutlineRoundedIcon />}
                onClick={() => onOpenStudentChat?.(booking.studentId)}
              >
                Чат
              </Button>
            ) : null}
          </>
        ) : null}

        {availability ? (
          <Button size="small" variant="contained" onClick={onOpenSchedule}>
            Открыть слоты
          </Button>
        ) : null}

        {note ? (
          <>
            <Button
              size="small"
              variant="contained"
              startIcon={<EditRoundedIcon />}
              onClick={() => onEditNote(note)}
            >
              Редактировать
            </Button>
            {onDeleteNote ? (
              <Tooltip title="Удалить напоминание">
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => onDeleteNote(note.id)}
                  aria-label="Удалить напоминание"
                >
                  <DeleteOutlineRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : null}
          </>
        ) : null}
      </div>
    </aside>
  );
}
