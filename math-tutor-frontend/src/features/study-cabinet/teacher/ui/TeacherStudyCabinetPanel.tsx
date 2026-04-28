import { useCallback, useMemo, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
} from "@mui/material";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import type { Booking } from "@/entities/booking/model/types";
import type { StudyCabinetNote } from "@/shared/lib/studyCabinet";
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
  getBookingStart,
  minutesToTime,
  timeToMinutes,
  toLocalDateKey,
} from "@/features/study-cabinet/teacher/model/plannerEvents";
import { TeacherPlannerWorkspace } from "@/features/study-cabinet/teacher/ui/TeacherPlannerWorkspace";

const getTemplatePreset = (templateId: TeacherStudyNoteTemplateId, booking?: Booking) => {
  if (templateId === "prep") {
    return {
      title: booking ? `Подготовка: ${booking.studentName}` : "Подготовка к занятию",
      body: booking
        ? `План урока, материалы и ключевые точки для ${booking.studentName}.`
        : "План, материалы и ключевые задачи перед занятием.",
      durationMinutes: 15,
      color: "#0ea5e9",
    };
  }
  if (templateId === "followup") {
    return {
      title: booking ? `Итог: ${booking.studentName}` : "Итог после занятия",
      body: booking
        ? `Следующие шаги, домашнее задание и рекомендации для ${booking.studentName}.`
        : "Зафиксировать итог и следующие шаги для ученика.",
      durationMinutes: 10,
      color: "#10b981",
    };
  }
  if (templateId === "office") {
    return {
      title: "Приёмные часы",
      body: "Свободный блок для ответов ученикам и подготовки.",
      durationMinutes: 30,
      color: "#8b5cf6",
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

const TEACHER_NOTE_KIND_OPTIONS: Array<{
  value: "prep" | "followup" | "focus" | "break" | "custom";
  label: string;
}> = [
  { value: "prep", label: "Подготовка" },
  { value: "followup", label: "Итог" },
  { value: "focus", label: "Фокус" },
  { value: "break", label: "Перерыв" },
  { value: "custom", label: "Напоминание" },
];

export function TeacherStudyCabinetPanel({
  bookings,
  availability,
  notes,
  loading = false,
  onOpenSchedule,
  onOpenStudentChat,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
}: TeacherStudyCabinetPanelProps) {
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

  return (
    <section className="study-cabinet-panel study-cabinet-panel--teacher-redesign">
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
        className="ui-dialog ui-dialog--compact teacher-note-dialog"
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
            <TextField
              label="Тип"
              select
              value={noteKind}
              onChange={(event) =>
                setNoteKind(
                  event.target.value as "prep" | "followup" | "focus" | "break" | "custom"
                )
              }
              variant="outlined"
              size="small"
              fullWidth
            >
              {TEACHER_NOTE_KIND_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
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
