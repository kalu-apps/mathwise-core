import type { Lesson } from "@/entities/lesson/model/types";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import LockIcon from "@mui/icons-material/Lock";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { useNavigate } from "react-router-dom";
import { formatLessonDuration } from "@/shared/lib/duration";

type Props = {
  lesson: Lesson;
  locked?: boolean;
  viewed?: boolean;
  isNew?: boolean;
  navigationState?: unknown;
  onLockedClick?: () => void;
  onOpen?: (lesson: Lesson) => void;
};

export function LessonItem({
  lesson,
  locked = false,
  viewed = false,
  isNew = false,
  navigationState,
  onLockedClick,
  onOpen,
}: Props) {
  const navigate = useNavigate();
  const durationText = formatLessonDuration(lesson.duration);

  const handleClick = () => {
    if (locked) {
      onLockedClick?.();
      return;
    }
    onOpen?.(lesson);
    navigate(`/lessons/${lesson.id}`, {
      state: navigationState,
    });
  };

  return (
    <div
      className={`lesson-item
        ${locked ? "lesson-item--locked" : ""}
        ${viewed ? "lesson-item--viewed" : ""}
        ${isNew ? "lesson-item--new" : ""}
      `}
      onClick={handleClick}
    >
      <div className="lesson-item__left">
        {locked ? (
          <LockIcon className="lesson-item__icon lesson-item__icon--locked" />
        ) : viewed ? (
          <CheckCircleIcon className="lesson-item__icon lesson-item__icon--viewed" />
        ) : (
          <PlayArrowIcon className="lesson-item__icon" />
        )}
        <div className="lesson-item__text">
          <div className="lesson-item__title-row">
            <span className="lesson-item__title">{lesson.title}</span>
            {isNew ? <span className="lesson-item__new-badge">Новое</span> : null}
          </div>
          <span className="lesson-item__subtitle">
            {locked
              ? "Доступно после покупки"
              : viewed
                ? "Урок просмотрен"
                : isNew
                  ? "Обновлен после покупки"
                  : "Готов к просмотру"}
          </span>
        </div>
      </div>

      <span className="lesson-item__duration" title="Длительность урока">
        <span className="lesson-item__duration-label">Длительность</span>
        <strong>{durationText}</strong>
      </span>
    </div>
  );
}
