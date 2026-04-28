import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import TodayRoundedIcon from "@mui/icons-material/TodayRounded";
import ViewAgendaRoundedIcon from "@mui/icons-material/ViewAgendaRounded";
import ViewWeekRoundedIcon from "@mui/icons-material/ViewWeekRounded";
import { Button, IconButton, Tooltip } from "@mui/material";
import type { TeacherPlannerViewMode } from "@/features/study-cabinet/teacher/model/types";

type TeacherPlannerToolbarProps = {
  mode: TeacherPlannerViewMode;
  compact: boolean;
  rangeLabel: string;
  onModeChange: (mode: TeacherPlannerViewMode) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onCreateNote: () => void;
};

export function TeacherPlannerToolbar({
  mode,
  compact,
  rangeLabel,
  onModeChange,
  onPrevious,
  onNext,
  onToday,
  onCreateNote,
}: TeacherPlannerToolbarProps) {
  return (
    <div className="teacher-planner-toolbar">
      <div className="teacher-planner-view-switch" aria-label="Вид календаря">
        <button
          type="button"
          className={mode === "day" ? "is-active" : ""}
          onClick={() => onModeChange("day")}
        >
          <ViewAgendaRoundedIcon fontSize="small" />
          <span>День</span>
        </button>
        {!compact ? (
          <button
            type="button"
            className={mode === "week" ? "is-active" : ""}
            onClick={() => onModeChange("week")}
          >
            <ViewWeekRoundedIcon fontSize="small" />
            <span>Неделя</span>
          </button>
        ) : null}
      </div>

      <div className="teacher-planner-period">
        <Tooltip title="Предыдущий период">
          <IconButton size="small" onClick={onPrevious} aria-label="Предыдущий период">
            <ChevronLeftRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <strong>{rangeLabel}</strong>
        <Tooltip title="Следующий период">
          <IconButton size="small" onClick={onNext} aria-label="Следующий период">
            <ChevronRightRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </div>

      <div className="teacher-planner-actions">
        <Button size="small" variant="outlined" startIcon={<TodayRoundedIcon />} onClick={onToday}>
          Сегодня
        </Button>
        <Button size="small" variant="contained" startIcon={<AddRoundedIcon />} onClick={onCreateNote}>
          Заметка
        </Button>
      </div>
    </div>
  );
}
