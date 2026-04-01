import { afterEach, describe, expect, it, vi } from "vitest";
import { logCollectionPressure } from "@/shared/lib/perfScreen";

const originalWindow = globalThis.window;

describe("perf diagnostics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", {
        value: originalWindow,
        configurable: true,
      });
      return;
    }
    Reflect.deleteProperty(globalThis, "window");
  });

  it("emits warn-level log for large collections", () => {
    Object.defineProperty(globalThis, "window", {
      value: { location: { pathname: "/profile", search: "" } },
      configurable: true,
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logCollectionPressure({
      screen: "StudentProfile",
      metric: "student-dashboard-collections",
      size: 160,
      warnAt: 120,
      errorAt: 240,
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("emits error-level log for critical collection pressure", () => {
    Object.defineProperty(globalThis, "window", {
      value: { location: { pathname: "/teacher", search: "?tab=students" } },
      configurable: true,
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logCollectionPressure({
      screen: "TeacherDashboard",
      metric: "teacher-dashboard-collections",
      size: 400,
      warnAt: 180,
      errorAt: 360,
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
