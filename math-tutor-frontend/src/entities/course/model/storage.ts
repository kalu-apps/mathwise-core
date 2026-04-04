import type { Course } from "./types";
import { api } from "@/shared/api/client";
import { buildIdempotencyHeaders } from "@/shared/lib/idempotency";
import { coursesGateway } from "@/shared/gateway";
import type {
  CourseAssessmentReleaseSnapshotContract,
  CourseAssessmentReleaseItemContract,
  PublishCourseResponseContract,
} from "@/shared/contracts/course.contract";

export async function getCourses(options?: { forceFresh?: boolean }): Promise<Course[]> {
  return coursesGateway.getCourses(options);
}

export async function getCourseById(
  id: string,
  options?: { forceFresh?: boolean }
): Promise<Course | null> {
  return coursesGateway.getCourseById(id, options);
}

export async function getCourseReleaseContent(
  id: string,
  options?: { forceFresh?: boolean }
): Promise<CourseAssessmentReleaseSnapshotContract> {
  return coursesGateway.getCourseReleaseContent(id, options);
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

export async function publishCourse(
  courseId: string,
  options?: {
    assessmentsSnapshot?:
      | CourseAssessmentReleaseItemContract[]
      | CourseAssessmentReleaseSnapshotContract;
    idempotencyKey?: string;
  }
): Promise<PublishCourseResponseContract> {
  return api.post<PublishCourseResponseContract>(
    `/courses/${encodeURIComponent(courseId)}/publish`,
    {
      assessmentsSnapshot: options?.assessmentsSnapshot ?? [],
    },
    {
      headers: buildIdempotencyHeaders(
        "course_publish",
        options?.idempotencyKey
      ),
    }
  );
}
