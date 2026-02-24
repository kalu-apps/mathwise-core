import type { CourseContentItem } from "@/features/assessments/model/types";

export const getAssessmentGradeLabel = (percent: number) => {
  if (percent >= 85) return "Отлично";
  if (percent >= 70) return "Хорошо";
  if (percent >= 50) return "Удовлетворительно";
  return "Неудовлетворительно";
};

export const getAssessmentGradeTone = (percent: number) => {
  if (percent >= 85) return "success";
  if (percent >= 70) return "info";
  if (percent >= 50) return "warning";
  return "error";
};

export const formatSpentTime = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(safe / 3600);
  const mm = Math.floor((safe % 3600) / 60);
  const ss = safe % 60;
  if (hh > 0) return `${hh} ч ${mm} мин ${ss} сек`;
  if (mm > 0) return `${mm} мин ${ss} сек`;
  return `${ss} сек`;
};

export const getUnansweredQuestionIndexes = (
  questionIds: string[],
  answers: Record<string, string>
) =>
  questionIds.reduce<number[]>((acc, questionId, index) => {
    if (!String(answers[questionId] ?? "").trim()) {
      acc.push(index + 1);
    }
    return acc;
  }, []);

export const getMissingPrerequisites = (params: {
  queue: CourseContentItem[];
  testItemId: string;
  viewedLessonIds: string[];
}) => {
  const targetIndex = params.queue.findIndex((item) => item.id === params.testItemId);
  if (targetIndex <= 0) return [];
  const previousItems = params.queue.slice(0, targetIndex);
  return previousItems.filter((item) => {
    if (item.type !== "lesson") return false;
    return !params.viewedLessonIds.includes(item.lessonId);
  });
};
