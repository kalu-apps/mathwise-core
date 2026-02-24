import type { ReactNode } from "react";
import {
  APP_API_FAILURE_EVENT,
  APP_API_SUCCESS_EVENT,
  type ApiFailureEventDetail,
  type ApiSuccessEventDetail,
} from "@/shared/api/client";
import {
  APP_PERFORMANCE_EVENT,
  type PerformanceMetricEventDetail,
} from "@/shared/lib/performanceMonitoring";
import {
  APP_ACTION_GUARD_EVENT,
  type ActionGuardEventDetail,
} from "@/shared/lib/useActionGuard";

type RumEvent = {
  type: "performance" | "api_failure" | "api_success" | "action_guard";
  at: string;
  route: string;
  payload: unknown;
};

const RUM_ENDPOINT = "/api/telemetry/rum";
const RUM_FLUSH_INTERVAL_MS = 12_000;
const RUM_MAX_BUFFER_SIZE = 200;
const RUM_BATCH_SIZE = 40;
const RUM_TIMEOUT_MS = 4_000;

const IS_DEV = typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);
const RUM_ENABLED =
  typeof import.meta !== "undefined" &&
  (Boolean(import.meta.env?.DEV) ||
    String(import.meta.env?.VITE_RUM_ENABLED ?? "").toLowerCase() === "true");

const getRouteSnapshot = () => {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
};

const createRumReporterSession = () => {
  if (typeof window === "undefined") return () => undefined;

  const buffer: RumEvent[] = [];
  let flushing = false;

  const flushBatch = async () => {
    if (flushing || buffer.length === 0) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;

    flushing = true;
    const batch = buffer.splice(0, RUM_BATCH_SIZE);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), RUM_TIMEOUT_MS);

    try {
      await fetch(RUM_ENDPOINT, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: batch }),
        signal: controller.signal,
        keepalive: true,
      });
    } catch {
      buffer.unshift(...batch);
    } finally {
      window.clearTimeout(timeoutId);
      flushing = false;
    }
  };

  const pushEvent = (event: RumEvent) => {
    buffer.push(event);
    if (buffer.length > RUM_MAX_BUFFER_SIZE) {
      buffer.splice(0, buffer.length - RUM_MAX_BUFFER_SIZE);
    }
    if (buffer.length >= RUM_BATCH_SIZE) {
      void flushBatch();
    }
  };

  const flushOnHidden = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      return;
    }
    if (buffer.length === 0) return;

    const batch = buffer.splice(0, Math.min(buffer.length, RUM_BATCH_SIZE));
    try {
      if (typeof navigator.sendBeacon === "function") {
        const payload = new Blob([JSON.stringify({ events: batch })], {
          type: "application/json",
        });
        const accepted = navigator.sendBeacon(RUM_ENDPOINT, payload);
        if (!accepted) {
          buffer.unshift(...batch);
        }
      } else {
        buffer.unshift(...batch);
      }
    } catch {
      buffer.unshift(...batch);
    }
  };

  const onPerf = (event: Event) => {
    const detail = (event as CustomEvent<PerformanceMetricEventDetail>).detail;
    if (!detail) return;
    if (IS_DEV && detail.rating === "good") return;
    pushEvent({
      type: "performance",
      at: new Date().toISOString(),
      route: getRouteSnapshot(),
      payload: detail,
    });
  };

  const onApiFailure = (event: Event) => {
    const detail = (event as CustomEvent<ApiFailureEventDetail>).detail;
    if (!detail) return;
    pushEvent({
      type: "api_failure",
      at: new Date().toISOString(),
      route: getRouteSnapshot(),
      payload: detail,
    });
  };

  const onApiSuccess = (event: Event) => {
    const detail = (event as CustomEvent<ApiSuccessEventDetail>).detail;
    if (!detail) return;
    pushEvent({
      type: "api_success",
      at: new Date().toISOString(),
      route: getRouteSnapshot(),
      payload: detail,
    });
  };

  const onActionGuard = (event: Event) => {
    const detail = (event as CustomEvent<ActionGuardEventDetail>).detail;
    if (!detail) return;
    pushEvent({
      type: "action_guard",
      at: new Date().toISOString(),
      route: getRouteSnapshot(),
      payload: detail,
    });
  };

  const flushTimer = window.setInterval(() => {
    void flushBatch();
  }, RUM_FLUSH_INTERVAL_MS);

  const onOnline = () => {
    void flushBatch();
  };

  window.addEventListener(APP_PERFORMANCE_EVENT, onPerf as EventListener);
  window.addEventListener(APP_API_FAILURE_EVENT, onApiFailure as EventListener);
  window.addEventListener(APP_API_SUCCESS_EVENT, onApiSuccess as EventListener);
  window.addEventListener(APP_ACTION_GUARD_EVENT, onActionGuard as EventListener);
  window.addEventListener("online", onOnline);
  window.addEventListener("visibilitychange", flushOnHidden);
  window.addEventListener("pagehide", flushOnHidden);

  return () => {
    window.clearInterval(flushTimer);
    window.removeEventListener(APP_PERFORMANCE_EVENT, onPerf as EventListener);
    window.removeEventListener(APP_API_FAILURE_EVENT, onApiFailure as EventListener);
    window.removeEventListener(APP_API_SUCCESS_EVENT, onApiSuccess as EventListener);
    window.removeEventListener(APP_ACTION_GUARD_EVENT, onActionGuard as EventListener);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("visibilitychange", flushOnHidden);
    window.removeEventListener("pagehide", flushOnHidden);
    flushOnHidden();
  };
};

let stopRumReporterSession: (() => void) | null = null;

const ensureRumReporter = () => {
  if (typeof window === "undefined" || !RUM_ENABLED || stopRumReporterSession) return;
  try {
    stopRumReporterSession = createRumReporterSession();
  } catch (error) {
    console.warn("[rum] failed to start reporter", error);
    stopRumReporterSession = null;
  }
};

ensureRumReporter();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (!stopRumReporterSession) return;
    try {
      stopRumReporterSession();
    } catch {
      // ignore
    }
    stopRumReporterSession = null;
  });
}

export function RumReporterProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
