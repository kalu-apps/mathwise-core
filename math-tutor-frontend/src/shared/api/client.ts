import { dispatchDataUpdate } from "@/shared/lib/dataUpdateBus";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

type ApiErrorCode =
  | "network_offline"
  | "network_error"
  | "timeout"
  | "server_unavailable"
  | "circuit_open"
  | "rate_limited"
  | "conflict"
  | "validation"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "unknown";

type RetryPolicy = {
  enabled?: boolean;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryOnStatuses?: number[];
};

type RequestOptions = {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  notifyDataUpdate?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  retryPolicy?: RetryPolicy;
  dedupe?: boolean;
  cacheTtlMs?: number;
  staleIfErrorMs?: number;
  idempotencyKey?: string;
  idempotencyPrefix?: string;
};

const API_BASE = "/api";
const DEFAULT_TIMEOUT_MS = 12_000;
const CIRCUIT_WINDOW_MS = 30_000;
const CIRCUIT_FAILURE_THRESHOLD = 4;
const CIRCUIT_COOLDOWN_MS = 15_000;
const DEFAULT_GET_CACHE_TTL_MS = 1_500;
const MAX_GET_CACHE_TTL_MS = 20_000;
const DEFAULT_GET_STALE_IF_ERROR_MS = 0;
const MAX_GET_STALE_IF_ERROR_MS = 120_000;
export const APP_API_FAILURE_EVENT = "app-api-failure";
export const APP_API_SUCCESS_EVENT = "app-api-success";

export type ApiFailureEventDetail = {
  code: ApiErrorCode;
  status: number;
  requestId?: string;
  retryable: boolean;
  path: string;
  method: HttpMethod;
  timestamp: string;
};

export type ApiSuccessEventDetail = {
  path: string;
  method: HttpMethod;
  timestamp: string;
};
const DEFAULT_RETRY_POLICY: Required<RetryPolicy> = {
  enabled: true,
  maxRetries: 1,
  baseDelayMs: 250,
  maxDelayMs: 1_250,
  retryOnStatuses: [408, 425, 429, 500, 502, 503, 504],
};

type CircuitEntry = {
  failures: number[];
  openUntil: number;
};

type GetCacheEntry = {
  data: unknown;
  cachedAt: number;
  expiresAt: number;
  staleUntil: number;
};

const circuitState = new Map<string, CircuitEntry>();
const getResponseCache = new Map<string, GetCacheEntry>();
const circuitRecoverableCodes = new Set<ApiErrorCode>([
  "network_offline",
  "network_error",
  "timeout",
  "server_unavailable",
  "rate_limited",
  "circuit_open",
]);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const inflightGetRequests = new Map<string, Promise<unknown>>();

const createRequestId = () => {
  if (
    typeof globalThis !== "undefined" &&
    "crypto" in globalThis &&
    typeof globalThis.crypto?.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
};

const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

const normalizeRetryPolicy = (method: HttpMethod, policy?: RetryPolicy) => {
  const merged: Required<RetryPolicy> = {
    ...DEFAULT_RETRY_POLICY,
    ...(policy ?? {}),
    retryOnStatuses: policy?.retryOnStatuses ?? DEFAULT_RETRY_POLICY.retryOnStatuses,
  };
  // Safety by default: automatic retries only for GET requests.
  if (method !== "GET") {
    merged.enabled = false;
  }
  merged.maxRetries = Math.max(0, Math.floor(merged.maxRetries));
  merged.baseDelayMs = Math.max(100, Math.floor(merged.baseDelayMs));
  merged.maxDelayMs = Math.max(merged.baseDelayMs, Math.floor(merged.maxDelayMs));
  return merged;
};

const classifyStatusCode = (status: number): ApiErrorCode => {
  if (status === 400 || status === 422) return "validation";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_unavailable";
  return "unknown";
};

const isStatusRetryable = (status: number, retryOnStatuses: number[]) =>
  retryOnStatuses.includes(status);

const getRetryDelayMs = (attemptNumber: number, policy: Required<RetryPolicy>) => {
  const base = Math.min(
    policy.maxDelayMs,
    policy.baseDelayMs * Math.pow(2, Math.max(0, attemptNumber - 1))
  );
  const jitter = Math.floor(base * (0.2 + Math.random() * 0.4));
  return Math.min(policy.maxDelayMs + jitter, base + jitter);
};

const clampNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const normalized =
    typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.min(max, Math.max(min, normalized));
};

const createHeadersDedupeSignature = (headers?: Record<string, string>) => {
  if (!headers) return "";
  const entries = Object.entries(headers).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return "";
  return entries.map(([key, value]) => `${key}:${value}`).join("|");
};

const buildDedupeKey = (path: string, headers?: Record<string, string>) =>
  `GET:${path}:${createHeadersDedupeSignature(headers)}`;

const buildCacheKey = (path: string, headers?: Record<string, string>) =>
  `GET:${path}:${createHeadersDedupeSignature(headers)}`;

const hasHeaderCaseInsensitive = (
  headers: Record<string, string> | undefined,
  name: string
) => {
  if (!headers) return false;
  const target = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === target);
};

const resolveIdempotencyHeader = (
  method: HttpMethod,
  options: RequestOptions,
  fallbackRequestId: string
) => {
  if (method === "GET") return null;
  if (hasHeaderCaseInsensitive(options.headers, "x-idempotency-key")) return null;
  const key = options.idempotencyKey?.trim() || fallbackRequestId;
  return {
    "X-Idempotency-Key": `${options.idempotencyPrefix?.trim() || "api"}:${key}`,
  };
};

const normalizeCachePolicy = (method: HttpMethod, options: RequestOptions) => {
  if (method !== "GET") {
    return {
      enabled: false,
      ttlMs: 0,
      staleIfErrorMs: 0,
    };
  }
  const ttlMs = clampNumber(
    options.cacheTtlMs,
    DEFAULT_GET_CACHE_TTL_MS,
    0,
    MAX_GET_CACHE_TTL_MS
  );
  const staleIfErrorMs = clampNumber(
    options.staleIfErrorMs,
    DEFAULT_GET_STALE_IF_ERROR_MS,
    0,
    MAX_GET_STALE_IF_ERROR_MS
  );
  return {
    enabled: ttlMs > 0,
    ttlMs,
    staleIfErrorMs,
  };
};

const getFreshCacheHit = (cacheKey: string, now: number) => {
  const entry = getResponseCache.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt > now) return entry;
  if (entry.staleUntil <= now) {
    getResponseCache.delete(cacheKey);
  }
  return null;
};

const getStaleCacheHit = (cacheKey: string, now: number) => {
  const entry = getResponseCache.get(cacheKey);
  if (!entry) return null;
  if (entry.staleUntil > now) return entry;
  getResponseCache.delete(cacheKey);
  return null;
};

const saveGetCacheEntry = (
  cacheKey: string,
  data: unknown,
  now: number,
  ttlMs: number,
  staleIfErrorMs: number
) => {
  getResponseCache.set(cacheKey, {
    data,
    cachedAt: now,
    expiresAt: now + ttlMs,
    staleUntil: now + Math.max(ttlMs, staleIfErrorMs),
  });
};

const invalidateGetCache = () => {
  getResponseCache.clear();
};

const getCircuitKey = (method: HttpMethod, path: string) => `${method}:${path}`;

const cleanupCircuitFailures = (entry: CircuitEntry, now: number) => {
  const minTs = now - CIRCUIT_WINDOW_MS;
  entry.failures = entry.failures.filter((ts) => ts >= minTs);
};

const getCircuitOpenUntil = (method: HttpMethod, path: string) => {
  if (method !== "GET") return null;
  const now = Date.now();
  const key = getCircuitKey(method, path);
  const entry = circuitState.get(key);
  if (!entry) return null;
  cleanupCircuitFailures(entry, now);
  if (entry.openUntil > now) {
    return entry.openUntil;
  }
  if (entry.openUntil > 0 && entry.openUntil <= now) {
    entry.openUntil = 0;
    entry.failures = [];
    circuitState.set(key, entry);
  }
  return null;
};

const recordCircuitSuccess = (method: HttpMethod, path: string) => {
  if (method !== "GET") return;
  const key = getCircuitKey(method, path);
  if (!circuitState.has(key)) return;
  circuitState.delete(key);
};

const recordCircuitFailure = (
  method: HttpMethod,
  path: string,
  code: ApiErrorCode
) => {
  if (method !== "GET") return;
  if (!circuitRecoverableCodes.has(code)) return;
  const now = Date.now();
  const key = getCircuitKey(method, path);
  const entry = circuitState.get(key) ?? { failures: [], openUntil: 0 };
  cleanupCircuitFailures(entry, now);
  entry.failures.push(now);
  if (entry.failures.length >= CIRCUIT_FAILURE_THRESHOLD) {
    entry.openUntil = now + CIRCUIT_COOLDOWN_MS;
  }
  circuitState.set(key, entry);
};

const parseResponsePayload = async (res: Response) => {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

const emitApiFailure = (detail: ApiFailureEventDetail) => {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent<ApiFailureEventDetail>(APP_API_FAILURE_EVENT, {
        detail,
      })
    );
  } catch {
    // ignore
  }
};

const emitApiSuccess = (detail: ApiSuccessEventDetail) => {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent<ApiSuccessEventDetail>(APP_API_SUCCESS_EVENT, {
        detail,
      })
    );
  } catch {
    // ignore
  }
};

const extractErrorMessage = (statusText: string, data: unknown) => {
  if (typeof data === "object" && data !== null && "error" in data) {
    const maybeError = (data as { error?: unknown }).error;
    if (typeof maybeError === "string" && maybeError.trim().length > 0) {
      return maybeError;
    }
  }
  if (typeof data === "string" && data.trim().length > 0) {
    return data;
  }
  return statusText || "Request failed";
};

export class ApiError extends Error {
  status: number;
  details: unknown;
  code: ApiErrorCode;
  requestId?: string;
  retryable: boolean;

  constructor(
    message: string,
    status: number,
    details?: unknown,
    code: ApiErrorCode = "unknown",
    requestId?: string,
    retryable = false
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
    this.code = code;
    this.requestId = requestId;
    this.retryable = retryable;
  }
}

export const isRecoverableApiError = (error: unknown): boolean => {
  if (!(error instanceof ApiError)) return false;
  if (error.retryable) return true;
  return (
    error.code === "network_offline" ||
    error.code === "network_error" ||
    error.code === "timeout" ||
    error.code === "server_unavailable" ||
    error.code === "circuit_open" ||
    error.code === "rate_limited"
  );
};

const notifyDataUpdate = () => {
  dispatchDataUpdate("api-mutation");
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const requestId = createRequestId();
  const idempotencyHeaders = resolveIdempotencyHeader(method, options, requestId);
  const retryPolicy = normalizeRetryPolicy(method, options.retryPolicy);
  const timeoutMs = Math.max(1_000, Math.floor(options.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  const cachePolicy = normalizeCachePolicy(method, options);
  const cacheKey = method === "GET" ? buildCacheKey(path, options.headers) : null;
  const dedupeEnabled =
    method === "GET" && options.dedupe !== false && !options.signal;
  const dedupeKey = dedupeEnabled ? buildDedupeKey(path, options.headers) : null;

  if (cachePolicy.enabled && cacheKey) {
    const cached = getFreshCacheHit(cacheKey, Date.now());
    if (cached) {
      return cached.data as T;
    }
  }

  const executeRequest = async () => {
    const circuitOpenUntil = getCircuitOpenUntil(method, path);
    if (circuitOpenUntil) {
      const requestId = createRequestId();
      const untilIso = new Date(circuitOpenUntil).toISOString();
      const apiError = new ApiError(
        "Сервис временно нестабилен. Повторите действие через несколько секунд.",
        0,
        { requestId, path, method, openUntil: untilIso },
        "circuit_open",
        requestId,
        true
      );
      emitApiFailure({
        code: apiError.code,
        status: apiError.status,
        requestId: apiError.requestId,
        retryable: apiError.retryable,
        path,
        method,
        timestamp: new Date().toISOString(),
      });
      throw apiError;
    }

    for (let attempt = 0; ; attempt += 1) {
      const controller = new AbortController();
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);

      const onExternalAbort = () => controller.abort();
      if (options.signal) {
        if (options.signal.aborted) {
          clearTimeout(timeoutId);
          throw new ApiError(
            "Запрос отменен пользователем.",
            0,
            { requestId, path, method },
            "unknown",
            requestId,
            false
          );
        }
        options.signal.addEventListener("abort", onExternalAbort, { once: true });
      }

      try {
        const res = await fetch(`${API_BASE}${path}`, {
          method,
          credentials: "include",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "X-Request-Id": requestId,
            "X-Retry-Attempt": String(attempt),
            ...(idempotencyHeaders ?? {}),
            ...(options.headers ?? {}),
          },
          body: options.body ? JSON.stringify(options.body) : undefined,
        });

        const data = await parseResponsePayload(res);

        if (!res.ok) {
          const message = extractErrorMessage(res.statusText, data);
          const code = classifyStatusCode(res.status);
          const retryable = retryPolicy.enabled
            ? isStatusRetryable(res.status, retryPolicy.retryOnStatuses)
            : false;
          throw new ApiError(message, res.status, data, code, requestId, retryable);
        }

        if (method !== "GET" && options.notifyDataUpdate !== false) {
          invalidateGetCache();
          notifyDataUpdate();
        } else if (method !== "GET") {
          invalidateGetCache();
        } else if (cachePolicy.enabled && cacheKey) {
          saveGetCacheEntry(
            cacheKey,
            data,
            Date.now(),
            cachePolicy.ttlMs,
            cachePolicy.staleIfErrorMs
          );
        }
        recordCircuitSuccess(method, path);
        emitApiSuccess({
          path,
          method,
          timestamp: new Date().toISOString(),
        });

        return data as T;
      } catch (error) {
        const apiError =
          error instanceof ApiError
            ? error
            : timedOut
            ? new ApiError(
                "Превышено время ожидания ответа сервера.",
                0,
                { requestId, path, method },
                "timeout",
                requestId,
                retryPolicy.enabled
              )
            : isOffline()
            ? new ApiError(
                "Нет соединения с интернетом.",
                0,
                { requestId, path, method },
                "network_offline",
                requestId,
                retryPolicy.enabled
              )
            : new ApiError(
                "Сетевая ошибка при выполнении запроса.",
                0,
                { requestId, path, method },
                "network_error",
                requestId,
                retryPolicy.enabled
              );

        const shouldRetry =
          retryPolicy.enabled &&
          attempt < retryPolicy.maxRetries &&
          isRecoverableApiError(apiError);

        if (!shouldRetry) {
          if (
            method === "GET" &&
            cacheKey &&
            cachePolicy.staleIfErrorMs > 0 &&
            isRecoverableApiError(apiError)
          ) {
            const stale = getStaleCacheHit(cacheKey, Date.now());
            if (stale) {
              return stale.data as T;
            }
          }
          recordCircuitFailure(method, path, apiError.code);
          emitApiFailure({
            code: apiError.code,
            status: apiError.status,
            requestId: apiError.requestId,
            retryable: apiError.retryable,
            path,
            method,
            timestamp: new Date().toISOString(),
          });
          throw apiError;
        }

        const delayMs = getRetryDelayMs(attempt + 1, retryPolicy);
        await wait(delayMs);
      } finally {
        clearTimeout(timeoutId);
        if (options.signal) {
          options.signal.removeEventListener("abort", onExternalAbort);
        }
      }
    }
  };

  if (dedupeEnabled && dedupeKey) {
    const inflight = inflightGetRequests.get(dedupeKey);
    if (inflight) {
      return inflight as Promise<T>;
    }
    const promise = executeRequest();
    inflightGetRequests.set(dedupeKey, promise);
    try {
      return (await promise) as T;
    } finally {
      if (inflightGetRequests.get(dedupeKey) === promise) {
        inflightGetRequests.delete(dedupeKey);
      }
    }
  }

  return executeRequest();
}

export const api = {
  get: <T>(
    path: string,
    options?: Pick<RequestOptions, "headers" | "dedupe" | "cacheTtlMs" | "staleIfErrorMs">
  ) => request<T>(path, { method: "GET", ...options }),
  post: <T>(
    path: string,
    body?: unknown,
    options?: Pick<RequestOptions, "notifyDataUpdate" | "headers">
  ) => request<T>(path, { method: "POST", body, ...options }),
  put: <T>(
    path: string,
    body?: unknown,
    options?: Pick<RequestOptions, "notifyDataUpdate" | "headers">
  ) => request<T>(path, { method: "PUT", body, ...options }),
  del: <T>(
    path: string,
    options?: Pick<RequestOptions, "notifyDataUpdate" | "headers">
  ) =>
    request<T>(path, { method: "DELETE", ...options }),
};
