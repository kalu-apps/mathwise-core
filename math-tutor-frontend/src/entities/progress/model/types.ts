/**
 * Прогресс одного урока
 */
export type LessonProgress = {
  userId: string;
  courseId: string;
  lessonId: string;
  completed: boolean;
};
