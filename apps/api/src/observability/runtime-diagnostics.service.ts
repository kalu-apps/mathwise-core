import { Injectable } from "@nestjs/common";
import { getApiRuntimeConfig } from "../config/runtime.config";

type RouteCounter = {
  route: string;
  total: number;
  errors: number;
  lastStatus: number;
  lastDurationMs: number;
  lastSeenAt: string;
};

const MAX_ROUTE_COUNTERS = 120;

@Injectable()
export class RuntimeDiagnosticsService {
  private readonly runtimeConfig = getApiRuntimeConfig();
  private readonly startedAt = Date.now();
  private readonly routeCounters = new Map<string, RouteCounter>();
  private totalRequests = 0;
  private totalErrors = 0;
  private inFlight = 0;

  onRequestStart() {
    this.inFlight += 1;
  }

  onRequestFinish(params: {
    method: string;
    route: string;
    statusCode: number;
    durationMs: number;
  }) {
    this.totalRequests += 1;
    this.inFlight = Math.max(0, this.inFlight - 1);
    if (params.statusCode >= 500) {
      this.totalErrors += 1;
    }

    const key = `${params.method.toUpperCase()} ${params.route}`;
    const current = this.routeCounters.get(key);
    const next: RouteCounter = current
      ? {
          ...current,
          total: current.total + 1,
          errors: current.errors + (params.statusCode >= 500 ? 1 : 0),
          lastStatus: params.statusCode,
          lastDurationMs: params.durationMs,
          lastSeenAt: new Date().toISOString(),
        }
      : {
          route: key,
          total: 1,
          errors: params.statusCode >= 500 ? 1 : 0,
          lastStatus: params.statusCode,
          lastDurationMs: params.durationMs,
          lastSeenAt: new Date().toISOString(),
        };
    this.routeCounters.set(key, next);
    if (this.routeCounters.size > MAX_ROUTE_COUNTERS) {
      const oldestKey = this.routeCounters.keys().next().value as string | undefined;
      if (oldestKey) {
        this.routeCounters.delete(oldestKey);
      }
    }
  }

  snapshot() {
    const uptimeSec = Math.max(0, Math.floor((Date.now() - this.startedAt) / 1000));
    const total = this.totalRequests;
    const errorRate = total > 0 ? Number((this.totalErrors / total).toFixed(4)) : 0;
    const topRoutes = [...this.routeCounters.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);

    return {
      service: "mathwise-api-pilot",
      appEnv: this.runtimeConfig.appEnv,
      releaseVersion: this.runtimeConfig.releaseVersion,
      uptimeSec,
      requests: {
        total: this.totalRequests,
        errors5xx: this.totalErrors,
        inFlight: this.inFlight,
        errorRate,
      },
      routes: topRoutes,
      timestamp: new Date().toISOString(),
    };
  }
}
