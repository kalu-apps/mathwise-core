import type { TeacherPlannerViewMode } from "@/features/study-cabinet/teacher/model/types";
import { TeacherPlannerIcon } from "@/features/study-cabinet/teacher/ui/TeacherPlannerIcons";
import {
  TeacherPlannerButton,
  TeacherPlannerIconButton,
} from "@/features/study-cabinet/teacher/ui/TeacherPlannerPrimitives";

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
          <TeacherPlannerIcon name="day" />
          <span>День</span>
        </button>
        {!compact ? (
          <button
            type="button"
            className={mode === "week" ? "is-active" : ""}
            onClick={() => onModeChange("week")}
          >
            <TeacherPlannerIcon name="week" />
            <span>Неделя</span>
          </button>
        ) : null}
      </div>

      <div className="teacher-planner-period">
        <TeacherPlannerIconButton label="Предыдущий период" onClick={onPrevious}>
          <TeacherPlannerIcon name="chevron-left" />
        </TeacherPlannerIconButton>
        <strong>{rangeLabel}</strong>
        <TeacherPlannerIconButton label="Следующий период" onClick={onNext}>
          <TeacherPlannerIcon name="chevron-right" />
        </TeacherPlannerIconButton>
      </div>

      <div className="teacher-planner-actions">
        <TeacherPlannerButton
          variant="secondary"
          icon={<TeacherPlannerIcon name="calendar" />}
          onClick={onToday}
        >
          Сегодня
        </TeacherPlannerButton>
        <TeacherPlannerButton
          variant="primary"
          icon={<TeacherPlannerIcon name="add" />}
          onClick={onCreateNote}
        >
          Заметка
        </TeacherPlannerButton>
      </div>
    </div>
  );
}
