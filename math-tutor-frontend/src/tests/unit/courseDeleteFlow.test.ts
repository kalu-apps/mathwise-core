import { describe, expect, it, vi } from "vitest";
import { deleteCourseFromTeacherWorkspace } from "@/pages/teacher/model/courseDeleteFlow";

describe("course delete flow", () => {
  it("hides course from the teacher workspace without deleting student-owned data", async () => {
    const calls: string[] = [];
    const deps = {
      deleteCourse: vi.fn(async () => {
        calls.push("deleteCourse");
      }),
      refreshAll: vi.fn(async () => {
        calls.push("refreshAll");
      }),
    };

    await deleteCourseFromTeacherWorkspace("course_1", deps);

    expect(deps.deleteCourse).toHaveBeenCalledTimes(1);
    expect(deps.refreshAll).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      "deleteCourse",
      "refreshAll",
    ]);
  });

  it("stops chain when course deletion fails", async () => {
    const deps = {
      deleteCourse: vi.fn(async () => {
        throw new Error("forbidden");
      }),
      refreshAll: vi.fn(async () => undefined),
    };

    await expect(deleteCourseFromTeacherWorkspace("course_2", deps)).rejects.toThrow("forbidden");
    expect(deps.refreshAll).not.toHaveBeenCalled();
  });
});
