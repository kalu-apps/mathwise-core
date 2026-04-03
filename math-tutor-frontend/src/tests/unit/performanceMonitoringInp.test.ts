import { describe, expect, it } from "vitest";
import { shouldTrackInpInteraction } from "@/shared/lib/performanceMonitoring";

describe("performance monitoring INP interaction guard", () => {
  it("ignores non-interaction entries without positive interaction id", () => {
    expect(
      shouldTrackInpInteraction({
        duration: 820,
      })
    ).toBe(false);
    expect(
      shouldTrackInpInteraction({
        duration: 820,
        interactionId: 0,
      })
    ).toBe(false);
  });

  it("keeps real interaction entries for INP diagnostics", () => {
    expect(
      shouldTrackInpInteraction({
        duration: 320,
        interactionId: 42,
      })
    ).toBe(true);
  });
});
