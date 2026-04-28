import { TeacherPlannerIcon } from "@/features/study-cabinet/teacher/ui/TeacherPlannerIcons";
import { TeacherPlannerButton } from "@/features/study-cabinet/teacher/ui/TeacherPlannerPrimitives";

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
          <TeacherPlannerIcon name="calendar" />
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
        <TeacherPlannerIcon name="calendar" />
      </span>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {actionLabel && onAction ? (
        <TeacherPlannerButton
          variant="secondary"
          icon={<TeacherPlannerIcon name="add" />}
          onClick={onAction}
        >
          {actionLabel}
        </TeacherPlannerButton>
      ) : null}
    </div>
  );
}
