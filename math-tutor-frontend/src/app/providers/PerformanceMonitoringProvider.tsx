import type { ReactNode } from "react";
import { startPerformanceMonitoring } from "@/shared/lib/performanceMonitoring";

let stopMonitoringSession: (() => void) | null = null;

const ensurePerformanceMonitoring = () => {
  if (typeof window === "undefined") return;
  if (stopMonitoringSession) return;
  try {
    stopMonitoringSession = startPerformanceMonitoring();
  } catch (error) {
    console.warn("[perf] failed to start monitoring", error);
    stopMonitoringSession = null;
  }
};

ensurePerformanceMonitoring();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (stopMonitoringSession) {
      try {
        stopMonitoringSession();
      } catch {
        // ignore
      }
      stopMonitoringSession = null;
    }
  });
}

export function PerformanceMonitoringProvider({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
