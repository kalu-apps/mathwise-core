export type MarkLessonViewedPayloadDto = {
  userId?: string;
  courseId: string;
  lessonId: string;
};

export type DeleteProgressPayloadDto = {
  userId?: string;
  courseId: string;
};

export type ProgressViewedIdsResponseDto = string[];
