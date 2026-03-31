import type { Lesson } from "./types";
import { api } from "@/shared/api/client";
import { buildIdempotencyHeaders } from "@/shared/lib/idempotency";
import { lessonsGateway } from "@/shared/gateway";

export async function getLessons(options?: { forceFresh?: boolean }): Promise<Lesson[]> {
  return lessonsGateway.getLessons(options);
}

export async function getLessonById(
  id: string,
  options?: { forceFresh?: boolean }
): Promise<Lesson | null> {
  return lessonsGateway.getLessonById(id, options);
}

export async function getLessonsByCourse(
  courseId: string,
  options?: { forceFresh?: boolean }
): Promise<Lesson[]> {
  return lessonsGateway.getLessonsByCourse(courseId, options);
}

export async function saveLesson(
  lesson: Lesson,
  options?: { idempotencyKey?: string }
): Promise<Lesson> {
  return api.post<Lesson>("/lessons", lesson, {
    headers: buildIdempotencyHeaders("lesson_create", options?.idempotencyKey),
  });
}

export async function replaceLessonsByCourse(
  courseId: string,
  lessons: Lesson[],
  options?: { idempotencyKey?: string }
): Promise<void> {
  await api.put(`/lessons?courseId=${encodeURIComponent(courseId)}`, lessons, {
    headers: buildIdempotencyHeaders("lessons_replace", options?.idempotencyKey),
  });
}

export async function deleteLessonsByCourse(courseId: string): Promise<void> {
  await api.del(`/lessons?courseId=${encodeURIComponent(courseId)}`);
}
