import type { Course } from "./types";
import { api } from "@/shared/api/client";
import { buildIdempotencyHeaders } from "@/shared/lib/idempotency";

export async function getCourses(options?: { forceFresh?: boolean }): Promise<Course[]> {
  return api.get<Course[]>("/courses", {
    dedupe: options?.forceFresh ? false : undefined,
    cacheTtlMs: options?.forceFresh ? 0 : undefined,
  });
}

export async function getCourseById(
  id: string,
  options?: { forceFresh?: boolean }
): Promise<Course | null> {
  return api.get<Course | null>(`/courses/${id}`, {
    dedupe: options?.forceFresh ? false : undefined,
    cacheTtlMs: options?.forceFresh ? 0 : undefined,
  });
}

export async function createCourse(
  course: Course,
  options?: { idempotencyKey?: string }
): Promise<Course> {
  return api.post<Course>("/courses", course, {
    headers: buildIdempotencyHeaders("course_create", options?.idempotencyKey),
  });
}

export async function updateCourse(
  course: Course,
  options?: { idempotencyKey?: string }
): Promise<Course> {
  return api.put<Course>(`/courses/${course.id}`, course, {
    headers: buildIdempotencyHeaders("course_update", options?.idempotencyKey),
  });
}

export async function deleteCourse(courseId: string): Promise<void> {
  await api.del(`/courses/${courseId}`);
}
