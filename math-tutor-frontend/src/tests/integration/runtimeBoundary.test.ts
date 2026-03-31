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
  it("keeps backend-only runtime config in preview", async () => {
    process.env.APP_ENV = "preview";
    process.env.GATEWAY_MODE = "mock";

    vi.resetModules();
    const mod = await import("../../shared/gateway");
    expect(mod.gatewayRuntimeConfig.mode).toBe("http");
    expect(mod.gatewayRuntimeConfig.authTransport).toBe("http");
    expect(mod.gatewayRuntimeConfig.coursesTransport).toBe("http");
    expect(mod.gatewayRuntimeConfig.lessonsTransport).toBe("http");
  });

  it("keeps backend-only runtime config in local too", async () => {
    process.env.APP_ENV = "local";
    process.env.GATEWAY_MODE = "hybrid";

    vi.resetModules();
    const mod = await import("../../shared/gateway");
    expect(mod.gatewayRuntimeConfig.mode).toBe("http");
    expect(mod.gatewayRuntimeConfig.bookingsTransport).toBe("http");
    expect(mod.gatewayRuntimeConfig.purchasesTransport).toBe("http");
  });
});
