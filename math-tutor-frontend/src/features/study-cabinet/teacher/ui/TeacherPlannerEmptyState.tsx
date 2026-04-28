import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import { Button } from "@mui/material";

type TeacherPlannerEmptyStateProps = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  loading?: boolean;
};

export function TeacherPlannerEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  loading = false,
}: TeacherPlannerEmptyStateProps) {
  if (loading) {
    return (
      <div className="teacher-planner-empty teacher-planner-empty--loading" aria-live="polite">
        <span className="teacher-planner-empty__icon">
          <CalendarMonthRoundedIcon fontSize="small" />
        </span>
        <div>
          <strong>Загружаем расписание</strong>
          <p>Собираем занятия, свободные слоты и напоминания.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="teacher-planner-empty">
      <span className="teacher-planner-empty__icon">
        <CalendarMonthRoundedIcon fontSize="small" />
      </span>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {actionLabel && onAction ? (
        <Button size="small" variant="outlined" startIcon={<AddRoundedIcon />} onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
