import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  TextField,
  Tooltip,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AutoStoriesRoundedIcon from "@mui/icons-material/AutoStoriesRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import ForumRoundedIcon from "@mui/icons-material/ForumRounded";
import type { Booking } from "@/entities/booking/model/types";
import {
  defaultCabinetTaskState,
  dismissCabinetTask,
  normalizeCabinetTaskState,
  snoozeCabinetTask,
  unsnoozeCabinetTask,
  type CabinetTaskState,
} from "@/features/study-cabinet/shared/model/taskState";
import type { StudyCabinetNote } from "@/shared/lib/studyCabinet";
import { readStorage, writeStorage } from "@/shared/lib/localDb";
import type {
  TeacherStudyCabinetPanelProps,
  TeacherStudyNoteDraftRequest,
  TeacherStudyNoteTemplateId,
} from "@/features/study-cabinet/teacher/model/types";
import {
  PLANNER_SLOT_MINUTES,
  TEACHER_NOTE_COLORS,
  buildLocalDateTime,
  buildTimeOptions,
  ceilToStep,
  formatDayTime,
  getBookingEnd,
  getBookingStart,
  minutesToTime,
  timeToMinutes,
  toLocalDateKey,
} from "@/features/study-cabinet/teacher/model/plannerEvents";
import { TeacherPlannerWorkspace } from "@/features/study-cabinet/teacher/ui/TeacherPlannerWorkspace";

const SNOOZE_MS = 1000 * 60 * 60 * 12;

const TASK_STATE_STORAGE_PREFIX = "teacher-cabinet:task-state:";

type ReminderGroup = "urgent" | "week" | "snoozed";

type TeacherTask = {
  id: string;
  title: string;
  subtitle: string;
  tag: string;
  estimateMinutes: number;
  group: Exclude<ReminderGroup, "snoozed">;
  tone: "accent" | "warning" | "neutral";
  dueAt?: number;
  onDoNow?: () => void;
  onSecondary?: () => void;
  secondaryLabel?: string;
};

const getTaskStateKey = (userId: string) => `${TASK_STATE_STORAGE_PREFIX}${userId}`;

const getTemplatePreset = (templateId: TeacherStudyNoteTemplateId, booking?: Booking) => {
  if (templateId === "prep") {
    return {
      title: booking ? `Подготовка: ${booking.studentName}` : "Подготовка к занятию",
      body: booking
        ? `План урока, материалы и ключевые точки для ${booking.studentName}.`
        : "План, материалы и ключевые задачи перед занятием.",
      durationMinutes: 15,
      color: "#38bdf8",
    };
  }
  if (templateId === "followup") {
    return {
      title: booking ? `Итог: ${booking.studentName}` : "Итог после занятия",
      body: booking
        ? `Следующие шаги, домашнее задание и рекомендации для ${booking.studentName}.`
        : "Зафиксировать итог и следующие шаги для ученика.",
      durationMinutes: 10,
      color: "#22c55e",
    };
  }
  if (templateId === "office") {
    return {
      title: "Приёмные часы",
      body: "Свободный блок для ответов ученикам и подготовки.",
      durationMinutes: 30,
      color: "#a855f7",
    };
  }
  if (templateId === "break") {
    return {
      title: "Перерыв",
      body: "Короткая пауза между занятиями.",
      durationMinutes: 15,
      color: "#f59e0b",
    };
  }
  return {
    title: "Заметка",
    body: "",
    durationMinutes: 30,
    color: TEACHER_NOTE_COLORS[0],
  };
};

const mapTemplateToNoteKind = (
  templateId: TeacherStudyNoteTemplateId
): "prep" | "followup" | "focus" | "break" | "custom" => {
  if (templateId === "prep") return "prep";
  if (templateId === "followup") return "followup";
  if (templateId === "break") return "break";
  if (templateId === "office") return "focus";
  return "custom";
};

export function TeacherStudyCabinetPanel({
  userId,
  bookings,
  availability,
  notes,
  chatUnreadCount,
  loading = false,
  onWorkbookClick,
  onChatClick,
  onOpenSchedule,
  onOpenStudentChat,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
}: TeacherStudyCabinetPanelProps) {
  const [taskGroup, setTaskGroup] = useState<ReminderGroup>("urgent");
  const [taskState, setTaskState] = useState<CabinetTaskState>(() =>
    normalizeCabinetTaskState(
      readStorage<CabinetTaskState>(getTaskStateKey(userId), defaultCabinetTaskState)
    )
  );
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteDate, setNoteDate] = useState(() => toLocalDateKey(new Date()));
  const [noteTime, setNoteTime] = useState("10:00");
  const [noteEndTime, setNoteEndTime] = useState("10:30");
  const [noteColor, setNoteColor] = useState(TEACHER_NOTE_COLORS[0]);
  const [noteTimeError, setNoteTimeError] = useState<string | null>(null);
  const [noteKind, setNoteKind] = useState<
    "prep" | "followup" | "focus" | "break" | "custom"
  >("custom");
  const [linkedBookingId, setLinkedBookingId] = useState<string | null>(null);

  const now = new Date();
  const nowTimestamp = now.getTime();
  const todayKey = toLocalDateKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const normalizedTaskState = useMemo(
    () => normalizeCabinetTaskState(taskState, nowTimestamp),
    [taskState, nowTimestamp]
  );

  useEffect(() => {
    writeStorage(getTaskStateKey(userId), normalizedTaskState);
  }, [normalizedTaskState, userId]);

  const scheduledBookings = useMemo(
    () =>
      [...bookings]
        .filter((booking) => getBookingEnd(booking).getTime() >= nowTimestamp)
        .sort((a, b) => getBookingStart(a).getTime() - getBookingStart(b).getTime()),
    [bookings, nowTimestamp]
  );

  const nextSession = scheduledBookings[0] ?? null;

  const unpaidQueue = useMemo(
    () => scheduledBookings.filter((booking) => booking.lessonKind === "regular" && booking.paymentStatus === "unpaid"),
    [scheduledBookings]
  );

  const manualReminderNotes = useMemo(
    () =>
      notes
        .filter((note) => note.remind && !note.done && note.dueAt)
        .sort((a, b) => new Date(a.dueAt ?? 0).getTime() - new Date(b.dueAt ?? 0).getTime()),
    [notes]
  );

  const upcomingReminderBookings = useMemo(
    () =>
      scheduledBookings
        .filter((booking) => booking.id !== nextSession?.id)
        .filter((booking) => getBookingStart(booking).getTime() - nowTimestamp <= 7 * 24 * 60 * 60 * 1000)
        .filter((booking) => !(booking.lessonKind === "regular" && booking.paymentStatus === "unpaid"))
        .slice(0, 4),
    [scheduledBookings, nextSession, nowTimestamp]
  );

  const openTemplateNote = useCallback((request: TeacherStudyNoteDraftRequest = {}) => {
    const templateId = request.templateId ?? "custom";
    const booking = request.booking;
    const preset = getTemplatePreset(templateId, booking);
    const bookingStart = booking ? getBookingStart(booking) : null;
    const baseDate = bookingStart && bookingStart.getTime() > nowTimestamp ? bookingStart : new Date(Math.max(nowTimestamp, Date.now()));
    const startMinutes = baseDate.getHours() * 60 + baseDate.getMinutes();
    const roundedStart = ceilToStep(startMinutes, PLANNER_SLOT_MINUTES);
    const normalizedDate = request.dateKey ?? (booking ? booking.date : toLocalDateKey(baseDate));
    const startTime = request.startTime ?? minutesToTime(Math.min(roundedStart, 23 * 60 + 30));
    const endTime =
      request.endTime ??
      minutesToTime(
        Math.min((timeToMinutes(startTime) ?? roundedStart) + preset.durationMinutes, 24 * 60)
      );
    setEditingNoteId(null);
    setNoteTitle(preset.title);
    setNoteBody(preset.body);
    setNoteDate(normalizedDate);
    setNoteTime(startTime);
    setNoteEndTime(endTime);
    setNoteColor(preset.color);
    setNoteKind(mapTemplateToNoteKind(templateId));
    setLinkedBookingId(booking?.id ?? null);
    setNoteTimeError(null);
    setNoteModalOpen(true);
  }, [nowTimestamp]);

  const openEditModal = useCallback((note: StudyCabinetNote) => {
    const due = note.dueAt ? new Date(note.dueAt) : null;
    setEditingNoteId(note.id);
    setNoteTitle(note.title);
    setNoteBody(note.body);
    setNoteDate(due ? toLocalDateKey(due) : todayKey);
    setNoteTime(
      due
        ? `${String(due.getHours()).padStart(2, "0")}:${String(due.getMinutes()).padStart(2, "0")}`
        : "10:00"
    );
    const end = note.endAt ? new Date(note.endAt) : null;
    setNoteEndTime(
      end
        ? `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`
        : "10:30"
    );
    setNoteColor(note.color || TEACHER_NOTE_COLORS[0]);
    setNoteKind(note.kind ?? "custom");
    setLinkedBookingId(note.linkedBookingId ?? null);
    setNoteTimeError(null);
    setNoteModalOpen(true);
  }, [todayKey]);

  const startTimeOptions = useMemo(() => {
    const minByDay = noteDate === todayKey ? ceilToStep(nowMinutes, PLANNER_SLOT_MINUTES) : 0;
    const maxStart = 23 * 60 + 30;
    return buildTimeOptions(minByDay, maxStart, PLANNER_SLOT_MINUTES);
  }, [noteDate, nowMinutes, todayKey]);

  const resolvedNoteTime = useMemo(() => {
    if (startTimeOptions.includes(noteTime)) return noteTime;
    return startTimeOptions[0] ?? noteTime;
  }, [startTimeOptions, noteTime]);

  const endTimeOptions = useMemo(() => {
    const startMinutes = timeToMinutes(resolvedNoteTime);
    if (startMinutes === null) return [];
    return buildTimeOptions(startMinutes + PLANNER_SLOT_MINUTES, 24 * 60, PLANNER_SLOT_MINUTES);
  }, [resolvedNoteTime]);

  const resolvedNoteEndTime = useMemo(() => {
    if (endTimeOptions.includes(noteEndTime)) return noteEndTime;
    return endTimeOptions[0] ?? noteEndTime;
  }, [endTimeOptions, noteEndTime]);

  const saveNote = () => {
    if (!noteTitle.trim()) return;
    const startDate = buildLocalDateTime(noteDate, resolvedNoteTime);
    const endDate = buildLocalDateTime(noteDate, resolvedNoteEndTime);
    if (!startDate || Number.isNaN(startDate.getTime())) {
      setNoteTimeError("Укажите корректное время начала.");
      return;
    }
    if (!endDate || Number.isNaN(endDate.getTime()) || endDate.getTime() <= startDate.getTime()) {
      setNoteTimeError("Время окончания должно быть позже времени начала.");
      return;
    }
    if (!editingNoteId && startDate.getTime() < nowTimestamp) {
      setNoteTimeError("Нельзя планировать заметку на прошедшее время.");
      return;
    }
    setNoteTimeError(null);
    const payload = {
      title: noteTitle.trim(),
      body: noteBody.trim(),
      dueAt: startDate.toISOString(),
      endAt: endDate.toISOString(),
      remind: true,
      color: noteColor,
      kind: noteKind,
      linkedBookingId,
    };
    if (editingNoteId && onUpdateNote) {
      onUpdateNote({
        noteId: editingNoteId,
        ...payload,
      });
    } else if (!editingNoteId && onCreateNote) {
      onCreateNote(payload);
    }
    setNoteModalOpen(false);
  };

  const deleteEditingNote = () => {
    if (!editingNoteId || !onDeleteNote) return;
    onDeleteNote(editingNoteId);
    setNoteModalOpen(false);
  };

  const draftTaskList = useMemo<TeacherTask[]>(() => {
    const tasks: TeacherTask[] = [];

    upcomingReminderBookings.forEach((booking) => {
      const startAt = getBookingStart(booking).getTime();
      const isTrial = booking.lessonKind === "trial";
      tasks.push({
        id: `session-${booking.id}`,
        title: `Сессия: ${booking.studentName}`,
        subtitle: `${formatDayTime(startAt)} · ${isTrial ? "пробное занятие" : "плановая 1:1-сессия"}`,
        tag: isTrial ? "Пробное" : "Платное",
        estimateMinutes: 2,
        group: startAt - nowTimestamp <= 24 * 60 * 60 * 1000 ? "urgent" : "week",
        tone: isTrial ? "accent" : "neutral",
        dueAt: startAt,
        onDoNow: onOpenSchedule,
        onSecondary: () => onOpenStudentChat?.(booking.studentId),
        secondaryLabel: "Написать",
      });
    });

    unpaidQueue.forEach((booking) => {
      tasks.push({
        id: `payment-${booking.id}`,
        title: `Проверить оплату: ${booking.studentName}`,
        subtitle: `${formatDayTime(getBookingStart(booking))} · платное занятие ещё не оплачено`,
        tag: "Не оплачено",
        estimateMinutes: 2,
        group: getBookingStart(booking).getTime() - nowTimestamp <= 24 * 60 * 60 * 1000 ? "urgent" : "week",
        tone: "warning",
        dueAt: getBookingStart(booking).getTime(),
        onDoNow: onOpenSchedule,
        onSecondary: () => onOpenStudentChat?.(booking.studentId),
        secondaryLabel: "Написать",
      });
    });

    manualReminderNotes.forEach((note) => {
      const dueAt = note.dueAt ? new Date(note.dueAt).getTime() : Number.NaN;
      if (!Number.isFinite(dueAt)) return;
      tasks.push({
        id: `note-${note.id}`,
        title: note.title,
        subtitle: note.body || `Заметка на ${formatDayTime(dueAt)}`,
        tag: "Заметка",
        estimateMinutes: 2,
        group: dueAt - nowTimestamp <= 24 * 60 * 60 * 1000 ? "urgent" : "week",
        tone: "neutral",
        dueAt,
        onDoNow: () => openEditModal(note),
      });
    });

    const seen = new Set<string>();
    return tasks.filter((task) => {
      if (seen.has(task.id)) return false;
      seen.add(task.id);
      return true;
    });
  }, [manualReminderNotes, nowTimestamp, onOpenSchedule, onOpenStudentChat, openEditModal, upcomingReminderBookings, unpaidQueue]);

  const dismissedTaskSet = useMemo(
    () => new Set(normalizedTaskState.dismissed),
    [normalizedTaskState.dismissed]
  );

  const reminderTasks = useMemo(() => {
    const active = draftTaskList.filter((task) => {
      if (dismissedTaskSet.has(task.id)) return false;
      const snoozeUntil = normalizedTaskState.snoozed[task.id];
      return !(typeof snoozeUntil === "number" && snoozeUntil > nowTimestamp);
    });
    const snoozed = draftTaskList.filter((task) => {
      if (dismissedTaskSet.has(task.id)) return false;
      const snoozeUntil = normalizedTaskState.snoozed[task.id];
      return typeof snoozeUntil === "number" && snoozeUntil > nowTimestamp;
    });

    return {
      urgent: active.filter((task) => task.group === "urgent"),
      week: active.filter((task) => task.group === "week"),
      snoozed,
    };
  }, [dismissedTaskSet, draftTaskList, normalizedTaskState.snoozed, nowTimestamp]);

  const activeActionCount = reminderTasks.urgent.length + reminderTasks.week.length;

  const handleSnoozeTask = (taskId: string) => {
    setTaskState((prev) =>
      normalizeCabinetTaskState(
        snoozeCabinetTask(prev, taskId, Date.now() + SNOOZE_MS)
      )
    );
  };

  const handleDismissTask = (taskId: string) => {
    setTaskState((prev) => normalizeCabinetTaskState(dismissCabinetTask(prev, taskId)));
  };

  const handleUnsnoozeTask = (taskId: string) => {
    setTaskState((prev) => normalizeCabinetTaskState(unsnoozeCabinetTask(prev, taskId)));
  };

  const currentReminderTasks =
    taskGroup === "urgent"
      ? reminderTasks.urgent
      : taskGroup === "week"
        ? reminderTasks.week
        : reminderTasks.snoozed;

  const renderTaskCard = (task: TeacherTask, isSnoozed: boolean) => (
    <article
      key={task.id}
      className={`study-cabinet-panel__teacher-task study-cabinet-panel__teacher-task--${task.tone}`}
    >
      <div className="study-cabinet-panel__teacher-task-head">
        <span className="study-cabinet-panel__teacher-task-badge">{task.tag}</span>
        <span className="study-cabinet-panel__teacher-task-time">≈ {task.estimateMinutes} мин</span>
      </div>
      <strong>{task.title}</strong>
      <p>{task.subtitle}</p>
      <div className="study-cabinet-panel__teacher-task-actions">
        <Button size="small" onClick={() => task.onDoNow?.()} disabled={!task.onDoNow}>
          {isSnoozed ? "Вернуть" : "Сделать сейчас"}
        </Button>
        {task.secondaryLabel ? (
          <Button size="small" variant="text" onClick={() => task.onSecondary?.()}>
            {task.secondaryLabel}
          </Button>
        ) : null}
        <Button
          size="small"
          variant="text"
          onClick={() => (isSnoozed ? handleUnsnoozeTask(task.id) : handleSnoozeTask(task.id))}
        >
          {isSnoozed ? "Оставить" : "Отложить"}
        </Button>
        <Button size="small" color="inherit" onClick={() => handleDismissTask(task.id)}>
          Скрыть
        </Button>
      </div>
    </article>
  );

  const reminderHint =
    activeActionCount > 0
      ? activeActionCount === 1
        ? "Есть 1 задача, требующая внимания."
        : `Есть ${activeActionCount} задач, требующих внимания.`
      : null;

  return (
    <section className={`study-cabinet-panel study-cabinet-panel--teacher-redesign ${activeActionCount > 0 ? "study-cabinet-panel--alert" : ""}`}>
      {reminderHint ? <div className="study-cabinet-panel__urgent">{reminderHint}</div> : null}

      <div className="study-cabinet-panel__teacher-overview-row">
        <div className="study-cabinet-panel__cover study-cabinet-panel__teacher-cover-card">
          <div className="study-cabinet-panel__veil" />
          <div className="study-cabinet-panel__cover-content">
            <div className="study-cabinet-panel__hero study-cabinet-panel__teacher-hero">
              <div className="study-cabinet-panel__hero-bar">
                <span className="study-cabinet-panel__kicker">Учебный кабинет преподавателя</span>
                <div className="study-cabinet-panel__teacher-indicators">
                  {chatUnreadCount > 0 ? (
                    <span className="study-cabinet-panel__teacher-pill">
                      <ForumRoundedIcon fontSize="inherit" /> Непрочитано: {chatUnreadCount}
                    </span>
                  ) : null}
                  <Tooltip title="Быстрая заметка">
                    <IconButton
                      className="study-cabinet-panel__teacher-icon-action"
                      onClick={() => openTemplateNote({ templateId: "custom" })}
                      aria-label="Добавить заметку"
                    >
                      <AddRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </div>
              </div>
              <h2>Командный центр преподавателя</h2>
              <p>
                Операционный центр преподавателя: ближайшие занятия, напоминания и доступ к ключевым разделам без дублирования расписания, чата и аналитики.
              </p>
              <div className="study-cabinet-panel__hero-nav study-cabinet-panel__teacher-hero-nav">
                {onWorkbookClick ? (
                  <button
                    type="button"
                    className="study-cabinet-panel__hero-btn"
                    onClick={onWorkbookClick}
                  >
                    <AutoStoriesRoundedIcon fontSize="small" />
                    <span>Рабочая тетрадь</span>
                  </button>
                ) : null}
                {onChatClick ? (
                  <button
                    type="button"
                    className="study-cabinet-panel__hero-btn study-cabinet-panel__hero-btn--chat"
                    onClick={onChatClick}
                  >
                    <ForumRoundedIcon fontSize="small" />
                    <span>Чат</span>
                  </button>
                ) : null}
                <button type="button" className="study-cabinet-panel__hero-btn" onClick={onOpenSchedule}>
                  <CalendarMonthRoundedIcon fontSize="small" />
                  <span>Расписание</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <article className="study-cabinet-panel__smart-card study-cabinet-panel__smart-card--reminders study-cabinet-panel__teacher-reminders-card">
          <div className="study-cabinet-panel__smart-head">
            <div>
              <span className="study-cabinet-panel__kicker">Напоминания</span>
            </div>
            <div className="study-cabinet-panel__teacher-tabset">
              <button type="button" className={taskGroup === "urgent" ? "is-active" : ""} onClick={() => setTaskGroup("urgent")}>Срочно</button>
              <button type="button" className={taskGroup === "week" ? "is-active" : ""} onClick={() => setTaskGroup("week")}>Неделя</button>
              <button type="button" className={taskGroup === "snoozed" ? "is-active" : ""} onClick={() => setTaskGroup("snoozed")}>Отложено</button>
            </div>
          </div>
          <div className="study-cabinet-panel__teacher-task-list">
            {currentReminderTasks.length > 0 ? (
              currentReminderTasks.map((task) => renderTaskCard(task, taskGroup === "snoozed"))
            ) : (
              <div className="study-cabinet-panel__empty">
                {taskGroup === "snoozed" ? "Отложенных задач нет." : "Актуальных задач в этой группе нет."}
              </div>
            )}
          </div>
        </article>
      </div>

      <TeacherPlannerWorkspace
        bookings={bookings}
        availability={availability}
        notes={notes}
        loading={loading}
        onOpenSchedule={onOpenSchedule}
        onOpenStudentChat={onOpenStudentChat}
        onCreateNote={openTemplateNote}
        onEditNote={openEditModal}
        onDeleteNote={onDeleteNote}
      />

      <Dialog
        open={noteModalOpen}
        onClose={() => setNoteModalOpen(false)}
        fullWidth
        maxWidth="sm"
        className="ui-dialog ui-dialog--compact"
      >
        <DialogTitle>{editingNoteId ? "Редактировать заметку" : "Новая заметка"}</DialogTitle>
        <DialogContent>
          <div className="study-cabinet-panel__note-modal">
            <TextField
              label="Заголовок"
              value={noteTitle}
              onChange={(event) => setNoteTitle(event.target.value)}
              variant="outlined"
              size="small"
              fullWidth
            />
            <TextField
              label="Комментарий"
              value={noteBody}
              onChange={(event) => setNoteBody(event.target.value)}
              variant="outlined"
              size="small"
              fullWidth
              multiline
              minRows={3}
            />
            <div className="study-cabinet-panel__note-modal-row">
              <TextField
                label="Дата"
                type="date"
                value={noteDate}
                onChange={(event) => {
                  const nextDate = event.target.value;
                  const normalizedDate = nextDate && nextDate >= todayKey ? nextDate : todayKey;
                  setNoteDate(normalizedDate);
                  setNoteTimeError(null);
                }}
                variant="outlined"
                size="small"
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: todayKey }}
              />
              <TextField
                label="С"
                select
                value={resolvedNoteTime}
                onChange={(event) => {
                  setNoteTime(event.target.value);
                  setNoteTimeError(null);
                }}
                variant="outlined"
                size="small"
                fullWidth
                error={Boolean(noteTimeError)}
                helperText={noteTimeError ?? " "}
                InputLabelProps={{ shrink: true }}
                disabled={startTimeOptions.length === 0}
              >
                {startTimeOptions.map((option) => (
                  <MenuItem key={option} value={option}>{option}</MenuItem>
                ))}
              </TextField>
              <TextField
                label="До"
                select
                value={resolvedNoteEndTime}
                onChange={(event) => {
                  setNoteEndTime(event.target.value);
                  setNoteTimeError(null);
                }}
                variant="outlined"
                size="small"
                fullWidth
                error={Boolean(noteTimeError)}
                helperText={noteTimeError ? " " : " "}
                InputLabelProps={{ shrink: true }}
                disabled={endTimeOptions.length === 0}
              >
                {endTimeOptions.map((option) => (
                  <MenuItem key={option} value={option}>{option}</MenuItem>
                ))}
              </TextField>
            </div>
            <div className="study-cabinet-panel__note-color">
              <span>Цвет</span>
              <div className="study-cabinet-panel__note-color-palette">
                {TEACHER_NOTE_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`study-cabinet-panel__note-color-swatch ${noteColor === color ? "is-active" : ""}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNoteColor(color)}
                    aria-label={`Выбрать цвет ${color}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
        <DialogActions>
          {editingNoteId && onDeleteNote ? (
            <Button color="error" onClick={deleteEditingNote} startIcon={<DeleteOutlineRoundedIcon />}>
              Удалить
            </Button>
          ) : null}
          <Button onClick={() => setNoteModalOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={saveNote} disabled={!noteTitle.trim()}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </section>
  );
}
