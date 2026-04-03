import { subscribePageLifecycleFlush } from "@/shared/lib/performanceLifecycle";

export const APP_PERFORMANCE_EVENT = "app-performance";

type MetricName = "INP" | "LCP" | "CLS" | "LONG_TASK";
type MetricRating = "good" | "needs-improvement" | "poor";
type LayoutShiftEntry = PerformanceEntry & {
  hadRecentInput?: boolean;
  value?: number;
};
type EventTimingEntry = PerformanceEntry & {
  duration: number;
  interactionId?: number;
  target?: EventTarget | null;
};

export type PerformanceMetricEventDetail = {
  name: MetricName;
  value: number;
  rating: MetricRating;
  timestamp: string;
  details?: {
    route?: string | null;
    screen?: string | null;
    interactionType?: string | null;
    interactionId?: number | null;
    target?: string | null;
    durationMs?: number;
    startTimeMs?: number;
  };
};

const THRESHOLDS = {
  INP: { poor: 500, needsImprovement: 200 },
  LCP: { poor: 4_000, needsImprovement: 2_500 },
  CLS: { poor: 0.25, needsImprovement: 0.1 },
  LONG_TASK: { poor: 500, needsImprovement: 200 },
} as const;

const IS_DEV = typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);
const LOG_THROTTLE_WINDOW_MS = 30_000;
const metricLogAtByKey = new Map<string, number>();

const getPerfContext = () => {
  if (typeof window === "undefined") {
    return {
      route: null,
      screen: null,
    };
  }

  const route = `${window.location.pathname}${window.location.search}`;
  const screen =
    typeof document !== "undefined" && document.body
      ? document.body.dataset.perfScreen ?? null
      : null;

  return {
    route,
    screen,
  };
};

const getRating = (
  name: MetricName,
  value: number
): MetricRating => {
  const threshold = THRESHOLDS[name];
  if (value >= threshold.poor) return "poor";
  if (value >= threshold.needsImprovement) return "needs-improvement";
  return "good";
};

const describeTarget = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return null;
  const tag = target.tagName.toLowerCase();
  const id = target.id ? `#${target.id}` : "";
  const classes = Array.from(target.classList).slice(0, 2).join(".");
  const classSuffix = classes ? `.${classes}` : "";
  return `${tag}${id}${classSuffix}`;
};

const emitMetric = (detail: PerformanceMetricEventDetail) => {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent<PerformanceMetricEventDetail>(APP_PERFORMANCE_EVENT, {
        detail,
      })
    );
  } catch {
    // ignore
  }

  const context = getPerfContext();
  const loggerMeta = {
    route: detail.details?.route ?? context.route,
    screen: detail.details?.screen ?? context.screen,
    value: detail.value,
    threshold: THRESHOLDS[detail.name],
    ...(detail.details ?? {}),
  };
  const logKey = `${detail.name}:${detail.rating}:${loggerMeta.route ?? "unknown"}:${loggerMeta.screen ?? "none"}`;
  const nowMs = Date.now();
  const lastLoggedAt = metricLogAtByKey.get(logKey) ?? 0;
  if (nowMs - lastLoggedAt < LOG_THROTTLE_WINDOW_MS) {
    return;
  }
  metricLogAtByKey.set(logKey, nowMs);

  if (detail.rating === "poor") {
    console.error("[perf] metric:error", detail.name, loggerMeta);
    return;
  }

  if (detail.rating === "needs-improvement") {
    console.warn("[perf] metric:warn", detail.name, loggerMeta);
    return;
  }

  if (IS_DEV) {
    console.info("[perf] metric:ok", detail.name, loggerMeta);
  }
};

const toMetricDetail = (
  name: MetricName,
  value: number,
  details?: PerformanceMetricEventDetail["details"]
): PerformanceMetricEventDetail => ({
  name,
  value,
  rating: getRating(name, value),
  timestamp: new Date().toISOString(),
  details: {
    ...getPerfContext(),
    ...(details ?? {}),
  },
});

const observe = (
  type: string,
  callback: PerformanceObserverCallback,
  options: PerformanceObserverInit & { durationThreshold?: number }
) => {
  if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") {
    return null;
  }
  const supported = PerformanceObserver.supportedEntryTypes?.includes(type);
  if (!supported) return null;
  try {
    const observer = new PerformanceObserver(callback);
    observer.observe(options as PerformanceObserverInit);
    return observer;
  } catch {
    return null;
  }
};

const createMonitoringSession = () => {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const observers: PerformanceObserver[] = [];
  const seenInteractionIds = new Set<number>();
  let currentLcp = 0;
  let clsValue = 0;
  let maxInp = 0;

  const lcpObserver = observe(
    "largest-contentful-paint",
    (list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      if (!lastEntry) return;
      currentLcp = lastEntry.startTime;
    },
    { type: "largest-contentful-paint", buffered: true }
  );
  if (lcpObserver) observers.push(lcpObserver);

  const clsObserver = observe(
    "layout-shift",
    (list) => {
      for (const entry of list.getEntries() as LayoutShiftEntry[]) {
        if (entry.hadRecentInput) continue;
        if (typeof entry.value !== "number") continue;
        clsValue += entry.value;
      }
    },
    { type: "layout-shift", buffered: true }
  );
  if (clsObserver) observers.push(clsObserver);

  const inpObserver = observe(
    "event",
    (list) => {
      for (const rawEntry of list.getEntries() as EventTimingEntry[]) {
        const duration = rawEntry.duration;
        if (!Number.isFinite(duration) || duration <= 0) continue;

        maxInp = Math.max(maxInp, duration);
        const interactionId =
          typeof rawEntry.interactionId === "number" ? rawEntry.interactionId : null;

        // Report each slow interaction once, plus keep max INP snapshot.
        if (interactionId && seenInteractionIds.has(interactionId)) continue;
        if (interactionId) seenInteractionIds.add(interactionId);

        const details = {
          interactionType: rawEntry.name ?? null,
          interactionId,
          target: describeTarget(rawEntry.target ?? null),
          durationMs: duration,
          startTimeMs: rawEntry.startTime,
        };

        emitMetric(toMetricDetail("INP", duration, details));
      }
    },
    {
      type: "event",
      buffered: true,
      durationThreshold: 40,
    }
  );
  if (inpObserver) observers.push(inpObserver);

  const longTaskObserver = observe(
    "longtask",
    (list) => {
      for (const entry of list.getEntries()) {
        emitMetric(
          toMetricDetail("LONG_TASK", entry.duration, {
            durationMs: entry.duration,
            startTimeMs: entry.startTime,
          })
        );
      }
    },
    { type: "longtask", buffered: true }
  );
  if (longTaskObserver) observers.push(longTaskObserver);

  const flush = () => {
    if (currentLcp > 0) {
      emitMetric(toMetricDetail("LCP", currentLcp));
      currentLcp = 0;
    }
    if (clsValue > 0) {
      emitMetric(toMetricDetail("CLS", clsValue));
      clsValue = 0;
    }
    if (maxInp > 0) {
      emitMetric(toMetricDetail("INP", maxInp));
      maxInp = 0;
    }
  };

  const unsubscribeLifecycle = subscribePageLifecycleFlush(() => {
    flush();
  });

  return () => {
    unsubscribeLifecycle();
    flush();
    observers.forEach((observer) => {
      try {
        observer.disconnect();
      } catch {
        // ignore
      }
    });
  };
};

let activeMonitors = 0;
let stopSession: (() => void) | null = null;

export const startPerformanceMonitoring = () => {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  activeMonitors += 1;
  if (activeMonitors === 1) {
    stopSession = createMonitoringSession();
  }

  return () => {
    activeMonitors = Math.max(0, activeMonitors - 1);
    if (activeMonitors === 0 && stopSession) {
      stopSession();
      stopSession = null;
    }
  };
};
