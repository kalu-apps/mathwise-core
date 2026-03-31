import { afterEach, describe, expect, it, vi } from "vitest";

const SNAPSHOT_ENV = { ...process.env };

const restoreEnv = () => {
  for (const key of Object.keys(process.env)) {
    if (!(key in SNAPSHOT_ENV)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(SNAPSHOT_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
};

afterEach(() => {
  restoreEnv();
});

describe("runtime boundary", () => {
  it("keeps preview mock disabled by default and blocks dev reset policy outside local", async () => {
    process.env.APP_ENV = "preview";
    delete process.env.ENABLE_MOCK_API_PREVIEW;
    process.env.MOCK_ALLOW_DEV_RESET = "true";
    process.env.MOCK_ALLOW_TEACHER_SHORTCUTS = "true";

    vi.resetModules();
    const mod = await import("../../mock/runtime/serverEnv");
    expect(mod.shouldEnableMockRuntime("preview-server")).toBe(false);
    expect(mod.SERVER_RUNTIME_ENV.allowDevReset).toBe(false);
    expect(mod.SERVER_RUNTIME_ENV.allowTeacherShortcuts).toBe(false);
  });
});
