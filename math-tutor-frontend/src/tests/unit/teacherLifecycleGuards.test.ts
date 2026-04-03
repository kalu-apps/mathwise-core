import { describe, expect, it } from "vitest";
import { ApiError } from "@/shared/api/client";
import {
  isTeacherScopeAccessError,
  shouldRunTeacherScopedRequest,
  TEACHER_UNAUTHORIZED_COOLDOWN_MS,
} from "@/pages/teacher/model/lifecycleGuards";

describe("teacher lifecycle guards", () => {
  it("detects unauthorized teacher scope errors", () => {
    const unauthorized = new ApiError(
      "unauthorized",
      401,
      {},
      "unauthorized",
      "req_1",
      false
    );
    const forbidden = new ApiError("forbidden", 403, {}, "forbidden", "req_2", false);

    expect(isTeacherScopeAccessError(unauthorized)).toBe(true);
    expect(isTeacherScopeAccessError(forbidden)).toBe(true);
    expect(
      isTeacherScopeAccessError(
        new ApiError("not found", 404, {}, "not_found", "req_3", false)
      )
    ).toBe(false);
    expect(isTeacherScopeAccessError(new Error("network"))).toBe(false);
  });

  it("stops teacher scoped requests during unauthorized cooldown window", () => {
    const nowTs = Date.now();

    expect(
      shouldRunTeacherScopedRequest({
        userId: "teacher_1",
        isTeacher: true,
        blockedUntilTs: nowTs + TEACHER_UNAUTHORIZED_COOLDOWN_MS,
        nowTs,
      })
    ).toBe(false);

    expect(
      shouldRunTeacherScopedRequest({
        userId: "teacher_1",
        isTeacher: true,
        blockedUntilTs: nowTs - 1,
        nowTs,
      })
    ).toBe(true);
  });
});
