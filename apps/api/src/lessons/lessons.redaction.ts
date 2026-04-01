import type { LessonDto } from "./lessons.types";

export const markFullLessonContent = (lesson: LessonDto): LessonDto => ({
  ...lesson,
  contentVisibility: "entitled_full",
});

export const redactLessonForPreview = (lesson: LessonDto): LessonDto => ({
  id: lesson.id,
  courseId: lesson.courseId,
  title: lesson.title,
  order: lesson.order,
  duration: lesson.duration,
  contentVisibility: "public_preview",
  videoPosterUrl: lesson.videoPosterUrl,
});
