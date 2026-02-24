import { api } from "@/shared/api/client";

export async function markLessonViewed(
  userId: string,
  courseId: string,
  lessonId: string
): Promise<void> {
  await api.post("/progress/viewed", { userId, courseId, lessonId });
}

export async function getViewedLessonIds(
  userId: string,
  courseId: string,
  options?: { forceFresh?: boolean }
): Promise<string[]> {
  return api.get<string[]>(
    `/progress?userId=${encodeURIComponent(userId)}&courseId=${encodeURIComponent(
      courseId
    )}`,
    {
      dedupe: options?.forceFresh ? false : undefined,
      cacheTtlMs: options?.forceFresh ? 0 : undefined,
    }
  );
}

export async function getCourseProgress(
  userId: string,
  courseId: string,
  totalLessons: number
): Promise<number> {
  if (totalLessons === 0) return 0;
  const viewed = await getViewedLessonIds(userId, courseId);
  return Math.round((viewed.length / totalLessons) * 100);
}

export async function deleteProgressByCourse(courseId: string): Promise<void> {
  await api.del(`/progress?courseId=${encodeURIComponent(courseId)}`);
}
