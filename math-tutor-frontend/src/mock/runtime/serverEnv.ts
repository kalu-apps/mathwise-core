export type AppEnv = "local" | "preview" | "stage" | "prod";

export type AuthCookieSameSite = "Lax" | "Strict" | "None";

export type ServerRuntimeEnv = {
  appEnv: AppEnv;
  isLocal: boolean;
  isPreview: boolean;
  isStage: boolean;
  isProd: boolean;
  enableMockApiDev: boolean;
  enableMockApiPreview: boolean;
  allowDevReset: boolean;
  allowTeacherShortcuts: boolean;
  allowInsecureLocalWebhookFallback: boolean;
  cardWebhookSecret: string;
  cardWebhookMaxSkewSec: number;
  cardWebhookReplayTtlSec: number;
  authCookieSecure: boolean;
  authCookieHttpOnly: boolean;
  authCookieSameSite: AuthCookieSameSite;
  authCookieDomain?: string;
  authCookiePath: string;
  authCookieMaxAgeSec: number;
  authSessionTtlMs: number;
};

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

const failFast = (message: string): never => {
  throw new Error(`[mock-runtime] ${message}`);
};

const normalizeAppEnv = (raw: string | undefined): AppEnv => {
  const value = (raw ?? "local").trim().toLowerCase();
  if (value === "local") return "local";
  if (value === "preview") return "preview";
  if (value === "stage" || value === "staging") return "stage";
  if (value === "prod" || value === "production") return "prod";
  return failFast(`Unsupported APP_ENV value: ${raw}`);
};

const parseBoolean = (
  raw: string | undefined,
  fallback: boolean,
  name: string
): boolean => {
  if (raw === undefined || raw === null || raw.trim() === "") return fallback;
  const normalized = raw.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return failFast(`Invalid boolean for ${name}: ${raw}`);
};

const parsePositiveInt = (
  raw: string | undefined,
  fallback: number,
  name: string,
  min = 1,
  max = Number.MAX_SAFE_INTEGER
): number => {
  if (raw === undefined || raw === null || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    failFast(`Invalid number for ${name}: ${raw}`);
  }
  const value = Math.floor(parsed);
  if (value < min || value > max) {
    failFast(`Value for ${name} must be in [${min}, ${max}], got ${value}`);
  }
  return value;
};

const parseSameSite = (raw: string | undefined): AuthCookieSameSite => {
  const normalized = (raw ?? "Lax").trim().toLowerCase();
  if (normalized === "lax") return "Lax";
  if (normalized === "strict") return "Strict";
  if (normalized === "none") return "None";
  return failFast(`Invalid AUTH_COOKIE_SAMESITE value: ${raw}`);
};

const normalizeOptional = (raw: string | undefined) => {
  const value = raw?.trim();
  return value ? value : undefined;
};

const createServerRuntimeEnv = (): ServerRuntimeEnv => {
  const appEnv = normalizeAppEnv(process.env.APP_ENV);
  const isLocal = appEnv === "local";
  const isPreview = appEnv === "preview";
  const isStage = appEnv === "stage";
  const isProd = appEnv === "prod";

  const enableMockApiDev = parseBoolean(
    process.env.ENABLE_MOCK_API_DEV,
    isLocal,
    "ENABLE_MOCK_API_DEV"
  );
  const enableMockApiPreview = parseBoolean(
    process.env.ENABLE_MOCK_API_PREVIEW,
    false,
    "ENABLE_MOCK_API_PREVIEW"
  );

  if (!isLocal && enableMockApiDev) {
    failFast("ENABLE_MOCK_API_DEV cannot be enabled outside local APP_ENV");
  }

  if ((isStage || isProd) && enableMockApiPreview) {
    failFast("ENABLE_MOCK_API_PREVIEW cannot be enabled for stage/prod APP_ENV");
  }

  const allowDevResetRaw = parseBoolean(
    process.env.MOCK_ALLOW_DEV_RESET,
    false,
    "MOCK_ALLOW_DEV_RESET"
  );
  const allowTeacherShortcutsRaw = parseBoolean(
    process.env.MOCK_ALLOW_TEACHER_SHORTCUTS,
    false,
    "MOCK_ALLOW_TEACHER_SHORTCUTS"
  );

  const allowDevReset = isLocal && allowDevResetRaw;
  const allowTeacherShortcuts = isLocal && allowTeacherShortcutsRaw;

  const allowInsecureLocalWebhookFallback =
    isLocal &&
    parseBoolean(
      process.env.MOCK_ALLOW_INSECURE_LOCAL_WEBHOOK_FALLBACK,
      false,
      "MOCK_ALLOW_INSECURE_LOCAL_WEBHOOK_FALLBACK"
    );

  const cardWebhookSecret =
    process.env.CARD_WEBHOOK_SECRET?.trim() ||
    (allowInsecureLocalWebhookFallback
      ? "local-insecure-card-webhook-secret"
      : "");

  const cardWebhookMaxSkewSec = parsePositiveInt(
    process.env.CARD_WEBHOOK_MAX_SKEW_SEC,
    300,
    "CARD_WEBHOOK_MAX_SKEW_SEC",
    30,
    3600
  );
  const cardWebhookReplayTtlSec = parsePositiveInt(
    process.env.CARD_WEBHOOK_REPLAY_TTL_SEC,
    900,
    "CARD_WEBHOOK_REPLAY_TTL_SEC",
    60,
    7200
  );

  const authCookieSecure = parseBoolean(
    process.env.AUTH_COOKIE_SECURE,
    !isLocal,
    "AUTH_COOKIE_SECURE"
  );
  const authCookieHttpOnly = parseBoolean(
    process.env.AUTH_COOKIE_HTTP_ONLY,
    true,
    "AUTH_COOKIE_HTTP_ONLY"
  );
  const authCookieSameSite = parseSameSite(process.env.AUTH_COOKIE_SAMESITE);
  const authCookieDomain = normalizeOptional(process.env.AUTH_COOKIE_DOMAIN);
  const authCookiePath = process.env.AUTH_COOKIE_PATH?.trim() || "/";
  if (!authCookiePath.startsWith("/")) {
    failFast("AUTH_COOKIE_PATH must start with '/'");
  }

  const authCookieMaxAgeSec = parsePositiveInt(
    process.env.AUTH_COOKIE_MAX_AGE_SEC,
    60 * 60 * 24 * 30,
    "AUTH_COOKIE_MAX_AGE_SEC",
    60,
    60 * 60 * 24 * 365
  );

  const mockRuntimeEnabled = enableMockApiDev || enableMockApiPreview;
  if (!isLocal && mockRuntimeEnabled) {
    if (!cardWebhookSecret) {
      failFast("CARD_WEBHOOK_SECRET is required when mock runtime is enabled outside local");
    }
    if (!authCookieSecure) {
      failFast("AUTH_COOKIE_SECURE must be true when mock runtime is enabled outside local");
    }
  }

  if (authCookieSameSite === "None" && !authCookieSecure) {
    failFast("AUTH_COOKIE_SAMESITE=None requires AUTH_COOKIE_SECURE=true");
  }

  return {
    appEnv,
    isLocal,
    isPreview,
    isStage,
    isProd,
    enableMockApiDev,
    enableMockApiPreview,
    allowDevReset,
    allowTeacherShortcuts,
    allowInsecureLocalWebhookFallback,
    cardWebhookSecret,
    cardWebhookMaxSkewSec,
    cardWebhookReplayTtlSec,
    authCookieSecure,
    authCookieHttpOnly,
    authCookieSameSite,
    authCookieDomain,
    authCookiePath,
    authCookieMaxAgeSec,
    authSessionTtlMs: authCookieMaxAgeSec * 1000,
  };
};

export const SERVER_RUNTIME_ENV = createServerRuntimeEnv();

export const shouldEnableMockRuntime = (
  runtime: "dev-server" | "preview-server"
) => {
  if (runtime === "dev-server") {
    return SERVER_RUNTIME_ENV.enableMockApiDev;
  }
  return SERVER_RUNTIME_ENV.enableMockApiPreview;
};
