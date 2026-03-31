import path from "path";

export type ApiAppEnv = "local" | "preview" | "stage" | "prod";
export type ApiCookieSameSite = "Lax" | "Strict" | "None";

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
  authCookieSecure: boolean;
  authCookieHttpOnly: boolean;
  authCookieSameSite: ApiCookieSameSite;
  authCookieDomain?: string;
  authCookiePath: string;
  authCookieMaxAgeSec: number;
  authDebugTokens: boolean;
  authPasswordPepper: string;
  mediaStorageEnabled: boolean;
  s3Endpoint: string;
  s3Region: string;
  s3Bucket: string;
  s3AccessKey: string;
  s3SecretKey: string;
  s3ForcePathStyle: boolean;
  mediaSignedUrlTtlSec: number;
  releaseVersion: string;
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

const parseCookieSameSite = (raw: string | undefined): ApiCookieSameSite => {
  const normalized = (raw ?? "Lax").trim().toLowerCase();
  if (normalized === "lax") return "Lax";
  if (normalized === "strict") return "Strict";
  if (normalized === "none") return "None";
  throw new Error(`[api-runtime] Invalid AUTH_COOKIE_SAMESITE value: ${raw}`);
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

const normalizeOptional = (raw: string | undefined) => {
  const normalized = raw?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
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
  const isLocal = appEnv === "local";
  const authCookieMaxAgeSec = parsePositiveInteger(
    process.env.AUTH_COOKIE_MAX_AGE_SEC,
    30 * 24 * 60 * 60
  );
  const authCookiePath = process.env.AUTH_COOKIE_PATH?.trim() || "/";
  if (!authCookiePath.startsWith("/")) {
    throw new Error("[api-runtime] AUTH_COOKIE_PATH must start with '/'");
  }

  const authCookieSecure = parseBoolean(
    process.env.AUTH_COOKIE_SECURE,
    !isLocal
  );
  const authCookieHttpOnly = parseBoolean(
    process.env.AUTH_COOKIE_HTTP_ONLY,
    true
  );
  const authCookieSameSite = parseCookieSameSite(process.env.AUTH_COOKIE_SAMESITE);
  const authCookieDomain = normalizeOptional(process.env.AUTH_COOKIE_DOMAIN);

  if (!isLocal && !authCookieSecure) {
    throw new Error(
      "[api-runtime] AUTH_COOKIE_SECURE must be true outside local APP_ENV"
    );
  }
  if (authCookieSameSite === "None" && !authCookieSecure) {
    throw new Error(
      "[api-runtime] AUTH_COOKIE_SAMESITE=None requires AUTH_COOKIE_SECURE=true"
    );
  }

  const corsOrigin = process.env.API_CORS_ORIGIN?.trim();
  if (!isLocal && !corsOrigin) {
    throw new Error("[api-runtime] Missing required env: API_CORS_ORIGIN");
  }
  if (!isLocal && corsOrigin && /(localhost|127\.0\.0\.1)/i.test(corsOrigin)) {
    throw new Error(
      "[api-runtime] API_CORS_ORIGIN cannot point to localhost outside local APP_ENV"
    );
  }

  const authPasswordPepper = process.env.AUTH_PASSWORD_PEPPER?.trim();
  if (!isLocal && !authPasswordPepper) {
    throw new Error("[api-runtime] Missing required env: AUTH_PASSWORD_PEPPER");
  }

  const authDebugTokens = parseBoolean(process.env.AUTH_DEBUG_TOKENS, isLocal);
  if (!isLocal && authDebugTokens) {
    throw new Error(
      "[api-runtime] AUTH_DEBUG_TOKENS must be disabled outside local APP_ENV"
    );
  }

  const coursesSeedOnBoot = parseBoolean(process.env.COURSES_SEED_ON_BOOT, false);
  if (appEnv === "prod" && coursesSeedOnBoot) {
    throw new Error("[api-runtime] COURSES_SEED_ON_BOOT cannot be enabled in prod");
  }

  const mediaStorageEnabled = parseBoolean(
    process.env.MEDIA_STORAGE_ENABLED,
    false
  );

  const s3Endpoint = mediaStorageEnabled
    ? ensureRequiredEnv("S3_ENDPOINT", process.env.S3_ENDPOINT)
    : process.env.S3_ENDPOINT?.trim() || "";
  const s3Region = mediaStorageEnabled
    ? ensureRequiredEnv("S3_REGION", process.env.S3_REGION)
    : process.env.S3_REGION?.trim() || "";
  const s3Bucket = mediaStorageEnabled
    ? ensureRequiredEnv("S3_BUCKET", process.env.S3_BUCKET)
    : process.env.S3_BUCKET?.trim() || "";
  const s3AccessKey = mediaStorageEnabled
    ? ensureRequiredEnv("S3_ACCESS_KEY", process.env.S3_ACCESS_KEY)
    : process.env.S3_ACCESS_KEY?.trim() || "";
  const s3SecretKey = mediaStorageEnabled
    ? ensureRequiredEnv("S3_SECRET_KEY", process.env.S3_SECRET_KEY)
    : process.env.S3_SECRET_KEY?.trim() || "";
  const s3ForcePathStyle = parseBoolean(
    process.env.S3_FORCE_PATH_STYLE,
    true
  );
  const mediaSignedUrlTtlSec = parsePositiveInteger(
    process.env.MEDIA_SIGNED_URL_TTL_SEC,
    900
  );

  const releaseVersion =
    process.env.RELEASE_VERSION?.trim() ||
    process.env.GIT_SHA?.trim() ||
    "dev";

  return {
    port: parsePort(process.env.API_PORT),
    host: process.env.API_HOST?.trim() || "0.0.0.0",
    appEnv,
    corsOrigin: corsOrigin || "http://localhost:5173",
    databaseUrl: requireDatabase
      ? ensureRequiredEnv("DATABASE_URL", process.env.DATABASE_URL)
      : process.env.DATABASE_URL?.trim() || "",
    redisUrl: requireRedis
      ? ensureRequiredEnv("REDIS_URL", process.env.REDIS_URL)
      : process.env.REDIS_URL?.trim() || "",
    coursesSeedOnBoot,
    coursesSeedSourceFile: resolveCoursesSeedSourceFile(
      process.env.COURSES_SEED_SOURCE_FILE ?? process.env.COURSES_SOURCE_FILE
    ),
    authSessionCookieName:
      process.env.AUTH_SESSION_COOKIE_NAME?.trim() || "mt_auth_session",
    authSessionTtlSec: parsePositiveInteger(
      process.env.AUTH_SESSION_TTL_SEC,
      authCookieMaxAgeSec
    ),
    authCookieSecure,
    authCookieHttpOnly,
    authCookieSameSite,
    authCookieDomain,
    authCookiePath,
    authCookieMaxAgeSec,
    authDebugTokens,
    authPasswordPepper: authPasswordPepper || "local-auth-pepper-dev-only",
    mediaStorageEnabled,
    s3Endpoint,
    s3Region,
    s3Bucket,
    s3AccessKey,
    s3SecretKey,
    s3ForcePathStyle,
    mediaSignedUrlTtlSec,
    releaseVersion,
  };
};
