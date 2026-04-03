import { ApiError } from "@/shared/api/client";

export type CourseDetailsEmptyState = "not_found" | "load_error";

export const resolveCourseDetailsEmptyState = (
  loadError: unknown
): CourseDetailsEmptyState => {
  if (!loadError) return "not_found";
  if (loadError instanceof ApiError && loadError.status === 404) {
    return "not_found";
  }
  if (
    typeof loadError === "object" &&
    loadError !== null &&
    "status" in loadError &&
    (loadError as { status?: unknown }).status === 404
  ) {
    return "not_found";
  }
  return "load_error";
};
