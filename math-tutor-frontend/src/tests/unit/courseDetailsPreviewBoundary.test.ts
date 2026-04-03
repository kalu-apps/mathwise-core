import { describe, expect, it } from "vitest";
import { ApiError } from "@/shared/api/client";
import {
  buildPublicPreviewCourseContentItems,
  buildPublicPreviewCourseBlocks,
  getCourseDetailsContentMode,
  shouldUseAssessmentsReadPath,
} from "@/pages/courses/model/previewBoundary";
import { resolveCourseDetailsEmptyState } from "@/pages/courses/model/errorMapping";
import {
  isCourseLessonLocked,
  isCourseTestLockedByAccess,
} from "@/pages/courses/model/courseDetailsHelpers";

describe("course details preview boundary", () => {
  it("routes anonymous user into public preview mode", () => {
    const mode = getCourseDetailsContentMode(null);

    expect(mode).toBe("public_preview");
    expect(shouldUseAssessmentsReadPath(mode)).toBe(false);
  });

  it("keeps assessments read path for teacher and student", () => {
    expect(shouldUseAssessmentsReadPath(getCourseDetailsContentMode("student"))).toBe(
      true
    );
    expect(shouldUseAssessmentsReadPath(getCourseDetailsContentMode("teacher"))).toBe(
      true
    );
  });

  it("builds deterministic lesson-only preview content from lesson order", () => {
    const lessons = [
      {
        id: "lesson_2",
        courseId: "course_1",
        title: "Lesson 2",
        order: 2,
        duration: 30,
      },
      {
        id: "lesson_1",
        courseId: "course_1",
        title: "Lesson 1",
        order: 1,
        duration: 25,
      },
    ];

    const blocks = buildPublicPreviewCourseBlocks("course_1");
    const queue = buildPublicPreviewCourseContentItems("course_1", lessons, {
      createdAt: "2026-04-03T00:00:00.000Z",
    });

    expect(blocks).toHaveLength(1);
    expect(queue.map((item) => item.id)).toEqual([
      "lesson-item-lesson_1",
      "lesson-item-lesson_2",
    ]);
    expect(queue.map((item) => item.order)).toEqual([1, 2]);
    expect(queue.every((item) => item.type === "lesson")).toBe(true);
  });

  it("maps non-404 load errors to load_error state", () => {
    const unauthorized = new ApiError(
      "Требуется авторизация.",
      401,
      { error: "Требуется авторизация." },
      "unauthorized"
    );

    expect(resolveCourseDetailsEmptyState(unauthorized)).toBe("load_error");
    expect(resolveCourseDetailsEmptyState(null)).toBe("not_found");
    expect(
      resolveCourseDetailsEmptyState(
        new ApiError("Курс не найден.", 404, { error: "Курс не найден." }, "not_found")
      )
    ).toBe("not_found");
  });

  it("keeps first lesson unlocked in preview mode and locks tests without full access", () => {
    expect(
      isCourseLessonLocked({
        hasDomainAccess: false,
        canAccessPreviewLesson: true,
        lessonOrder: 1,
        isBnplSuspended: false,
        isBnplRestricted: false,
        wasOpened: false,
      })
    ).toBe(false);

    expect(
      isCourseLessonLocked({
        hasDomainAccess: false,
        canAccessPreviewLesson: true,
        lessonOrder: 2,
        isBnplSuspended: false,
        isBnplRestricted: false,
        wasOpened: false,
      })
    ).toBe(true);

    expect(
      isCourseTestLockedByAccess({
        hasDomainAccess: false,
        isBnplSuspended: false,
      })
    ).toBe(true);
  });
});
