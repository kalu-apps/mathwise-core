import { describe, expect, it, vi } from "vitest";
import { deleteCourseWithCascade } from "@/pages/teacher/model/courseDeleteFlow";

describe("course delete flow", () => {
  it("deletes course once and runs cleanup without redundant lessons delete", async () => {
    const calls: string[] = [];
    const deps = {
      deleteCourse: vi.fn(async () => {
        calls.push("deleteCourse");
      }),
      deleteCourseContentItems: vi.fn(async () => {
        calls.push("deleteCourseContentItems");
      }),
      deletePurchasesByCourse: vi.fn(async () => {
        calls.push("deletePurchasesByCourse");
      }),
      deleteProgressByCourse: vi.fn(async () => {
        calls.push("deleteProgressByCourse");
      }),
      refreshAll: vi.fn(async () => {
        calls.push("refreshAll");
      }),
    };

    await deleteCourseWithCascade("course_1", deps);

    expect(deps.deleteCourse).toHaveBeenCalledTimes(1);
    expect(deps.deleteCourseContentItems).toHaveBeenCalledTimes(1);
    expect(deps.deletePurchasesByCourse).toHaveBeenCalledTimes(1);
    expect(deps.deleteProgressByCourse).toHaveBeenCalledTimes(1);
    expect(deps.refreshAll).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      "deleteCourse",
      "deleteCourseContentItems",
      "deletePurchasesByCourse",
      "deleteProgressByCourse",
      "refreshAll",
    ]);
  });

  it("stops chain when course deletion fails", async () => {
    const deps = {
      deleteCourse: vi.fn(async () => {
        throw new Error("forbidden");
      }),
      deleteCourseContentItems: vi.fn(async () => undefined),
      deletePurchasesByCourse: vi.fn(async () => undefined),
      deleteProgressByCourse: vi.fn(async () => undefined),
      refreshAll: vi.fn(async () => undefined),
    };

    await expect(deleteCourseWithCascade("course_2", deps)).rejects.toThrow("forbidden");
    expect(deps.deleteCourseContentItems).not.toHaveBeenCalled();
    expect(deps.deletePurchasesByCourse).not.toHaveBeenCalled();
    expect(deps.deleteProgressByCourse).not.toHaveBeenCalled();
    expect(deps.refreshAll).not.toHaveBeenCalled();
  });
});
