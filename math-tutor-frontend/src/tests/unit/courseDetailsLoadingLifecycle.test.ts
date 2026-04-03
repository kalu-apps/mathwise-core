import { describe, expect, it } from "vitest";
import { shouldEnterCourseDetailsHardLoading } from "@/pages/courses/model/loadingLifecycle";

describe("course details loading lifecycle", () => {
  it("uses hard loading on initial open", () => {
    expect(
      shouldEnterCourseDetailsHardLoading({
        hasResolvedInitialLoad: false,
      })
    ).toBe(true);
  });

  it("keeps background reloads from resetting page to full loader", () => {
    expect(
      shouldEnterCourseDetailsHardLoading({
        hasResolvedInitialLoad: true,
      })
    ).toBe(false);
  });
});

