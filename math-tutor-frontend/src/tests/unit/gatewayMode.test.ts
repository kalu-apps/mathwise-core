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

describe("gateway mode runtime config", () => {
  it("uses mock mode when GATEWAY_MODE=mock", async () => {
    process.env.GATEWAY_MODE = "mock";
    delete process.env.GATEWAY_AUTH_TRANSPORT;

    vi.resetModules();
    const mod = await import("../../shared/gateway");
    expect(mod.gatewayRuntimeConfig.mode).toBe("mock");
    expect(mod.gatewayRuntimeConfig.authTransport).toBe("mock");
    expect(mod.gatewayRuntimeConfig.coursesTransport).toBe("mock");
    expect(mod.gatewayRuntimeConfig.lessonsTransport).toBe("mock");
    expect(mod.gatewayRuntimeConfig.accessTransport).toBe("mock");
    expect(mod.gatewayRuntimeConfig.profileTransport).toBe("mock");
    expect(mod.gatewayRuntimeConfig.purchasesTransport).toBe("mock");
    expect(mod.gatewayRuntimeConfig.bookingsTransport).toBe("mock");
  });

  it("uses hybrid auth transport override when configured", async () => {
    process.env.GATEWAY_MODE = "hybrid";
    process.env.GATEWAY_AUTH_MODE = "http";
    delete process.env.GATEWAY_AUTH_TRANSPORT;
    process.env.GATEWAY_COURSES_MODE = "http";

    vi.resetModules();
    const mod = await import("../../shared/gateway");
    expect(mod.gatewayRuntimeConfig.mode).toBe("hybrid");
    expect(mod.gatewayRuntimeConfig.authTransport).toBe("http");
    expect(mod.gatewayRuntimeConfig.coursesTransport).toBe("http");
    expect(mod.gatewayRuntimeConfig.lessonsTransport).toBe("http");
    expect(mod.gatewayRuntimeConfig.accessTransport).toBe("http");
    expect(mod.gatewayRuntimeConfig.profileTransport).toBe("http");
    expect(mod.gatewayRuntimeConfig.purchasesTransport).toBe("http");
    expect(mod.gatewayRuntimeConfig.bookingsTransport).toBe("http");
  });

  it("routes courses through http in hybrid mode by default", async () => {
    process.env.GATEWAY_MODE = "hybrid";
    delete process.env.GATEWAY_COURSES_MODE;

    vi.resetModules();
    const mod = await import("../../shared/gateway");
    expect(mod.gatewayRuntimeConfig.mode).toBe("hybrid");
    expect(mod.gatewayRuntimeConfig.coursesTransport).toBe("http");
    expect(mod.gatewayRuntimeConfig.lessonsTransport).toBe("http");
    expect(mod.gatewayRuntimeConfig.accessTransport).toBe("http");
    expect(mod.gatewayRuntimeConfig.profileTransport).toBe(
      mod.gatewayRuntimeConfig.authTransport
    );
    expect(mod.gatewayRuntimeConfig.purchasesTransport).toBe("http");
    expect(mod.gatewayRuntimeConfig.bookingsTransport).toBe(
      mod.gatewayRuntimeConfig.profileTransport
    );
  });
});
