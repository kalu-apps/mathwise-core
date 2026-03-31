import path from "path";

export type ApiAppEnv = "local" | "preview" | "stage" | "prod";

export type ApiRuntimeConfig = {
  port: number;
  host: string;
  appEnv: ApiAppEnv;
  corsOrigin: string;
  databaseUrl: string;
  redisUrl: string;
  coursesSeedOnBoot: boolean;
  coursesSeedSourceFile: string;
  authSessionCookieName: string;
  authSessionTtlSec: number;
  authDebugTokens: boolean;
  authPasswordPepper: string;
};

type RuntimeConfigOptions = {
  requireDatabase?: boolean;
  requireRedis?: boolean;
};

const normalizeAppEnv = (raw: string | undefined): ApiAppEnv => {
  const value = (raw ?? "local").trim().toLowerCase();
  if (value === "local") return "local";
  if (value === "preview") return "preview";
  if (value === "stage" || value === "staging") return "stage";
  if (value === "prod" || value === "production") return "prod";
  return "local";
};

const parsePort = (raw: string | undefined) => {
  const parsed = Number(raw ?? 3001);
  if (!Number.isFinite(parsed)) return 3001;
  return Math.max(1, Math.floor(parsed));
};

const parseBoolean = (raw: string | undefined, fallback: boolean) => {
  const normalized = raw?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const parsePositiveInteger = (raw: string | undefined, fallback: number) => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  if (normalized <= 0) return fallback;
  return normalized;
};

const ensureRequiredEnv = (name: string, value: string | undefined) => {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`[api-runtime] Missing required env: ${name}`);
  }
  return normalized;
};

const resolveCoursesSeedSourceFile = (raw: string | undefined) => {
  const explicit = raw?.trim();
  if (explicit) {
    return path.isAbsolute(explicit)
      ? explicit
      : path.resolve(process.cwd(), explicit);
  }

  const candidates = [
    path.resolve(process.cwd(), "../../math-tutor-frontend/mock-db.json"),
    path.resolve(process.cwd(), "../math-tutor-frontend/mock-db.json"),
    path.resolve(process.cwd(), "math-tutor-frontend/mock-db.json"),
    path.resolve(process.cwd(), "mock-db.json"),
  ];

  return candidates[0];
};

export const getApiRuntimeConfig = (
  options: RuntimeConfigOptions = {}
): ApiRuntimeConfig => {
  const appEnv = normalizeAppEnv(process.env.APP_ENV);
  const requireDatabase = options.requireDatabase ?? true;
  const requireRedis = options.requireRedis ?? true;
  return {
    port: parsePort(process.env.API_PORT),
    host: process.env.API_HOST?.trim() || "0.0.0.0",
    appEnv,
    corsOrigin: process.env.API_CORS_ORIGIN?.trim() || "http://localhost:5173",
    databaseUrl: requireDatabase
      ? ensureRequiredEnv("DATABASE_URL", process.env.DATABASE_URL)
      : process.env.DATABASE_URL?.trim() || "",
    redisUrl: requireRedis
      ? ensureRequiredEnv("REDIS_URL", process.env.REDIS_URL)
      : process.env.REDIS_URL?.trim() || "",
    coursesSeedOnBoot: parseBoolean(process.env.COURSES_SEED_ON_BOOT, false),
    coursesSeedSourceFile: resolveCoursesSeedSourceFile(
      process.env.COURSES_SEED_SOURCE_FILE ?? process.env.COURSES_SOURCE_FILE
    ),
    authSessionCookieName:
      process.env.AUTH_SESSION_COOKIE_NAME?.trim() || "mt_auth_session",
    authSessionTtlSec: parsePositiveInteger(process.env.AUTH_SESSION_TTL_SEC, 30 * 24 * 60 * 60),
    authDebugTokens: parseBoolean(process.env.AUTH_DEBUG_TOKENS, appEnv === "local"),
    authPasswordPepper:
      process.env.AUTH_PASSWORD_PEPPER?.trim() || "api-auth-pepper-v1",
  };
};
