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
  it("forces backend-only http mode even when legacy mode is requested", async () => {
    process.env.GATEWAY_MODE = "mock";
    vi.resetModules();
    const mod = await import("../../shared/gateway");
    expect(mod.gatewayRuntimeConfig).toEqual({
      mode: "http",
      authTransport: "http",
      coursesTransport: "http",
      lessonsTransport: "http",
      accessTransport: "http",
      profileTransport: "http",
      purchasesTransport: "http",
      bookingsTransport: "http",
    });
  });

  it("uses http gateway instances for all domains", async () => {
    vi.resetModules();
    const gatewayModule = await import("../../shared/gateway");
    const httpModule = await import("../../shared/gateway/httpGateway");

    expect(gatewayModule.authGateway).toBe(httpModule.httpGateway);
    expect(gatewayModule.coursesGateway).toBe(httpModule.httpCoursesGateway);
    expect(gatewayModule.lessonsGateway).toBe(httpModule.httpLessonsGateway);
    expect(gatewayModule.accessGateway).toBe(httpModule.httpAccessGateway);
    expect(gatewayModule.profileGateway).toBe(httpModule.httpProfileGateway);
    expect(gatewayModule.purchaseGateway).toBe(httpModule.httpPurchasesGateway);
    expect(gatewayModule.bookingGateway).toBe(httpModule.httpBookingsGateway);
  });
});
