import crypto from "node:crypto";
import { Injectable, Logger, type NestMiddleware } from "@nestjs/common";
import { RuntimeDiagnosticsService } from "./runtime-diagnostics.service";

const REQUEST_ID_HEADER = "x-request-id";

const createRequestId = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const toRequestPath = (req: {
  route?: { path?: string };
  baseUrl?: string;
  originalUrl?: string;
  url?: string;
}) => {
  const routePath = req.route?.path;
  if (typeof routePath === "string" && routePath.length > 0) {
    const baseUrl = typeof req.baseUrl === "string" ? req.baseUrl : "";
    return `${baseUrl}${routePath}`;
  }
  const fromOriginal = req.originalUrl?.split("?")[0];
  if (fromOriginal && fromOriginal.length > 0) return fromOriginal;
  return req.url?.split("?")[0] || "unknown";
};

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger("HttpRequest");

  constructor(
    private readonly runtimeDiagnosticsService: RuntimeDiagnosticsService
  ) {}

  use(req: any, res: any, next: () => void) {
    const incomingHeader = req?.headers?.[REQUEST_ID_HEADER];
    const requestId =
      (typeof incomingHeader === "string" && incomingHeader.trim()) ||
      (Array.isArray(incomingHeader) && typeof incomingHeader[0] === "string"
        ? incomingHeader[0].trim()
        : "") ||
      createRequestId();

    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);

    const startedAt = process.hrtime.bigint();
    this.runtimeDiagnosticsService.onRequestStart();

    res.on("finish", () => {
      const elapsedNs = process.hrtime.bigint() - startedAt;
      const durationMs = Number(elapsedNs) / 1_000_000;
      const statusCode =
        typeof res.statusCode === "number" ? Math.floor(res.statusCode) : 0;
      const method = typeof req.method === "string" ? req.method : "UNKNOWN";
      const route = toRequestPath(req);

      this.runtimeDiagnosticsService.onRequestFinish({
        method,
        route,
        statusCode,
        durationMs,
      });

      const payload = {
        event: "http_request",
        requestId,
        method,
        route,
        statusCode,
        durationMs: Number(durationMs.toFixed(2)),
        appEnv: process.env.APP_ENV || "local",
      };
      if (statusCode >= 500) {
        this.logger.error(JSON.stringify(payload));
      } else {
        this.logger.log(JSON.stringify(payload));
      }
    });

    next();
  }
}
