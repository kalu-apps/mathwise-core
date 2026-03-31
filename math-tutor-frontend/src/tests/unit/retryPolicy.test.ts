import { describe, expect, it } from "vitest";
import { computeRetryDelayMs } from "../../shared/api/retryPolicy";

describe("retryPolicy", () => {
  it("never exceeds maxDelayMs", () => {
    const maxDelayMs = 1_250;

    for (let attempt = 1; attempt <= 12; attempt += 1) {
      for (const jitterSeed of [0, 0.25, 0.5, 0.75, 1]) {
        const delay = computeRetryDelayMs(
          attempt,
          {
            baseDelayMs: 250,
            maxDelayMs,
          },
          jitterSeed
        );
        expect(delay).toBeLessThanOrEqual(maxDelayMs);
        expect(delay).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
