import type { Lesson } from "./types";
import { api } from "@/shared/api/client";
import { buildIdempotencyHeaders } from "@/shared/lib/idempotency";

export async function getLessons(options?: { forceFresh?: boolean }): Promise<Lesson[]> {
  return api.get<Lesson[]>("/lessons", {
    dedupe: options?.forceFresh ? false : undefined,
    cacheTtlMs: options?.forceFresh ? 0 : undefined,
  });
}

export async function getLessonById(id: string): Promise<Lesson | null> {
  return api.get<Lesson | null>(`/lessons/${id}`);
}

export async function getLessonsByCourse(
  courseId: string,
  options?: { forceFresh?: boolean }
): Promise<Lesson[]> {
  return api.get<Lesson[]>(`/lessons?courseId=${encodeURIComponent(courseId)}`, {
    dedupe: options?.forceFresh ? false : undefined,
    cacheTtlMs: options?.forceFresh ? 0 : undefined,
  });
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
