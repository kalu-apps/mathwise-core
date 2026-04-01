import { afterEach, describe, expect, it, vi } from "vitest";

const SNAPSHOT_ENV = { ...process.env };

const restoreEnv = () => {
  for (const key of Object.keys(process.env)) {
    if (!(key in SNAPSHOT_ENV)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(SNAPSHOT_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

afterEach(() => {
  restoreEnv();
  vi.resetModules();
});

describe("stage runtime flags", () => {
  it("enables stage payment confirm only in stage app env", async () => {
    process.env.APP_ENV = "stage";
    process.env.STAGE_PAYMENT_CONFIRM_ENABLED = "true";

    const mod = await import("../../app/runtime/stageRuntime");
    expect(mod.isStagePaymentConfirmEnabled()).toBe(true);
  });

  it("keeps stage payment confirm disabled outside stage", async () => {
    process.env.APP_ENV = "preview";
    process.env.STAGE_PAYMENT_CONFIRM_ENABLED = "true";

    const mod = await import("../../app/runtime/stageRuntime");
    expect(mod.isStagePaymentConfirmEnabled()).toBe(false);
  });
});

