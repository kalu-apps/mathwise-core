import path from "path";

export type ApiAppEnv = "local" | "preview" | "stage" | "prod";
export type ApiCookieSameSite = "Lax" | "Strict" | "None";
export type ApiEmailDeliveryMode = "disabled" | "provider" | "smtp";
export type ApiYooKassaMode = "disabled" | "test" | "prod";

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
  authSessionIdleTimeoutSec: number;
  authCookieSecure: boolean;
  authCookieHttpOnly: boolean;
  authCookieSameSite: ApiCookieSameSite;
  authCookieDomain?: string;
  authCookiePath: string;
  authCookieMaxAgeSec: number;
  authDebugTokens: boolean;
  authPasswordPepper: string;
  cardWebhookSecret: string;
  cardWebhookMaxSkewSec: number;
  cardWebhookReplayTtlSec: number;
  paymentProviderAutoConfirmLocal: boolean;
  paymentMockEnabled: boolean;
  stageSiteGateEnabled: boolean;
  stageSiteGateSecret: string;
  stageSiteGateCookieName: string;
  stageSiteGateTtlSec: number;
  stagePaymentConfirmEnabled: boolean;
  teacherBootstrapEnabled: boolean;
  teacherBootstrapEmail: string;
  teacherBootstrapPassword: string;
  teacherBootstrapFirstName: string;
  teacherBootstrapLastName: string;
  authRecoveryCodeTtlSec: number;
  authRecoveryTokenTtlSec: number;
  authRecoveryMaxAttempts: number;
  authRecoveryRateLimitPerHour: number;
  authIdentityIntentsEnabled: boolean;
  authIdentityIntentTtlSec: number;
  authIdentityIntentMaxAttempts: number;
  authIdentityIntentRateLimitPerHour: number;
  authPurchaseIdentityIntentGatingEnabled: boolean;
  emailDeliveryMode: ApiEmailDeliveryMode;
  emailProviderApiKey: string;
  emailSmtpHost: string;
  emailSmtpPort: number;
  emailSmtpSecure: boolean;
  emailSmtpUser: string;
  emailSmtpPass: string;
  mailFromName: string;
  mailFrom: string;
  mailReplyTo: string;
  mailSubjectPrefix: string;
  mailAppendStageFooter: boolean;
  mailConnectTimeoutMs: number;
  mailSocketTimeoutMs: number;
  mailBcc: string[];
  mailDryRun: boolean;
  yookassaMode: ApiYooKassaMode;
  yookassaShopId: string;
  yookassaSecretKey: string;
  yookassaApiBase: string;
  yookassaReturnUrl: string;
  yookassaWebhookPath: string;
  yookassaCaptureImmediately: boolean;
  yookassaWebhookEnabled: boolean;
  mediaStorageEnabled: boolean;
  s3Endpoint: string;
  s3Region: string;
  s3Bucket: string;
  s3AccessKey: string;
  s3SecretKey: string;
  s3ForcePathStyle: boolean;
  mediaSignedUrlTtlSec: number;
  mediaLessonVideoMaxUploadBytes: number;
  mediaGcIntervalSec: number;
  mediaGcBatchLimit: number;
  workbookLaunchEnabled: boolean;
  workbookBoardBaseUrl: string;
  workbookLaunchSecret: string;
  workbookLaunchTtlSec: number;
  bookingV2Enabled: boolean;
  bookingV2GuestCompatibilityEnabled: boolean;
  bookingSlotHoldTtlSec: number;
  teacherInvitesEnabled: boolean;
  teacherInviteTtlSec: number;
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

const parseEmailDeliveryMode = (
  raw: string | undefined,
  fallback: ApiEmailDeliveryMode
): ApiEmailDeliveryMode => {
  const normalized = (raw ?? fallback).trim().toLowerCase();
  if (normalized === "disabled") return "disabled";
  if (normalized === "provider") return "provider";
  if (normalized === "smtp") return "smtp";
  throw new Error(
    `[api-runtime] Invalid EMAIL_DELIVERY_MODE value: ${raw}. Allowed: disabled|provider|smtp`
  );
};

const parseYooKassaMode = (
  raw: string | undefined,
  fallback: ApiYooKassaMode = "disabled"
): ApiYooKassaMode => {
  const normalized = (raw ?? fallback).trim().toLowerCase();
  if (
    normalized === "" ||
    normalized === "disabled" ||
    normalized === "off" ||
    normalized === "none"
  ) {
    return "disabled";
  }
  if (normalized === "test") return "test";
  if (normalized === "prod" || normalized === "production") return "prod";
  throw new Error(
    `[api-runtime] Invalid YOOKASSA_MODE value: ${raw}. Allowed: disabled|test|prod`
  );
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

const parseCsv = (raw: string | undefined) =>
  (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

const resolveCoursesSeedSourceFile = (raw: string | undefined) => {
  const explicit = raw?.trim();
  if (explicit) {
    return path.isAbsolute(explicit)
      ? explicit
      : path.resolve(process.cwd(), explicit);
  }

  const candidates = [
    path.resolve(process.cwd(), "apps/api/data/seed.json"),
    path.resolve(process.cwd(), "data/seed.json"),
    path.resolve(process.cwd(), "seed.json"),
  ];

  return candidates[0];
};

const isUnsafeNonLocalSeedSource = (sourceFile: string) => {
  const normalized = sourceFile.replace(/\\/g, "/").toLowerCase();
  const filename = normalized.split("/").pop() ?? "";
  if (normalized.includes("/math-tutor-frontend/")) return true;
  if (filename === "mock-db.json") return true;
  return false;
};

const normalizeUrlOrigin = (
  raw: string | undefined,
  fallback: string,
  envName: string
) => {
  const candidate = raw?.trim() || fallback;
  if (!candidate) {
    throw new Error(`[api-runtime] ${envName} is missing.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`[api-runtime] Invalid ${envName} value: ${candidate}`);
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error(`[api-runtime] ${envName} must use http/https: ${candidate}`);
  }
  return parsed.origin;
};

export const getApiRuntimeConfig = (
  options: RuntimeConfigOptions = {}
): ApiRuntimeConfig => {
  const appEnv = normalizeAppEnv(process.env.APP_ENV);
  const requireDatabase = options.requireDatabase ?? true;
  const requireRedis = options.requireRedis ?? true;
  const isLocal = appEnv === "local";
  const isStage = appEnv === "stage";
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

  const corsOriginRaw = process.env.API_CORS_ORIGIN?.trim();
  if (!isLocal && !corsOriginRaw) {
    throw new Error("[api-runtime] Missing required env: API_CORS_ORIGIN");
  }
  const corsOrigin = normalizeUrlOrigin(
    corsOriginRaw,
    "http://localhost:5173",
    "API_CORS_ORIGIN"
  );
  if (!isLocal && /(localhost|127\.0\.0\.1|\[::1\]|::1)/i.test(corsOrigin)) {
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
  const coursesSeedSourceFile = resolveCoursesSeedSourceFile(
    process.env.COURSES_SEED_SOURCE_FILE ?? process.env.COURSES_SOURCE_FILE
  );
  if (!isLocal && isUnsafeNonLocalSeedSource(coursesSeedSourceFile)) {
    throw new Error(
      "[api-runtime] Non-local startup blocked: COURSES_SEED_SOURCE_FILE points to unsafe frontend/mock source."
    );
  }

  const cardWebhookSecret = process.env.CARD_WEBHOOK_SECRET?.trim();
  if (!isLocal && !cardWebhookSecret) {
    throw new Error("[api-runtime] Missing required env: CARD_WEBHOOK_SECRET");
  }

  const paymentProviderAutoConfirmLocal = parseBoolean(
    process.env.PAYMENT_PROVIDER_AUTO_CONFIRM_LOCAL,
    isLocal
  );
  if (!isLocal && paymentProviderAutoConfirmLocal) {
    throw new Error(
      "[api-runtime] PAYMENT_PROVIDER_AUTO_CONFIRM_LOCAL must be disabled outside local APP_ENV"
    );
  }

  const paymentMockEnabled = parseBoolean(
    process.env.PAYMENT_MOCK_ENABLED,
    isLocal
  );
  if (!isLocal && paymentMockEnabled) {
    throw new Error(
      "[api-runtime] PAYMENT_MOCK_ENABLED must be disabled outside local APP_ENV"
    );
  }
  const stageSiteGateEnabled = parseBoolean(
    process.env.STAGE_SITE_GATE_ENABLED,
    false
  );
  if (stageSiteGateEnabled && !isStage) {
    throw new Error(
      "[api-runtime] STAGE_SITE_GATE_ENABLED is allowed only when APP_ENV=stage"
    );
  }
  const stageSiteGateSecret = process.env.STAGE_SITE_GATE_SECRET?.trim() || "";
  if (stageSiteGateEnabled) {
    if (!stageSiteGateSecret) {
      throw new Error("[api-runtime] Missing required env: STAGE_SITE_GATE_SECRET");
    }
    if (stageSiteGateSecret.length < 16) {
      throw new Error(
        "[api-runtime] STAGE_SITE_GATE_SECRET must be at least 16 characters"
      );
    }
  }
  const stageSiteGateCookieName =
    process.env.STAGE_SITE_GATE_COOKIE_NAME?.trim() || "mt_stage_access";
  if (!/^[A-Za-z0-9_.-]+$/.test(stageSiteGateCookieName)) {
    throw new Error(
      "[api-runtime] STAGE_SITE_GATE_COOKIE_NAME contains unsupported symbols"
    );
  }
  const stageSiteGateTtlSec = parsePositiveInteger(
    process.env.STAGE_SITE_GATE_TTL_SEC,
    12 * 60 * 60
  );
  const stagePaymentConfirmEnabled = parseBoolean(
    process.env.STAGE_PAYMENT_CONFIRM_ENABLED,
    false
  );
  if (stagePaymentConfirmEnabled && !isStage) {
    throw new Error(
      "[api-runtime] STAGE_PAYMENT_CONFIRM_ENABLED is allowed only when APP_ENV=stage"
    );
  }

  const teacherBootstrapEnabled = parseBoolean(
    process.env.TEACHER_BOOTSTRAP_ENABLED,
    false
  );
  const teacherBootstrapEmail =
    process.env.TEACHER_BOOTSTRAP_EMAIL?.trim().toLowerCase() || "";
  const teacherBootstrapPassword =
    process.env.TEACHER_BOOTSTRAP_PASSWORD?.trim() || "";
  if (teacherBootstrapEnabled) {
    if (!teacherBootstrapEmail) {
      throw new Error(
        "[api-runtime] Missing required env: TEACHER_BOOTSTRAP_EMAIL"
      );
    }
    if (!teacherBootstrapPassword) {
      throw new Error(
        "[api-runtime] Missing required env: TEACHER_BOOTSTRAP_PASSWORD"
      );
    }
    if (!isLocal && teacherBootstrapPassword.length < 12) {
      throw new Error(
        "[api-runtime] TEACHER_BOOTSTRAP_PASSWORD must be at least 12 characters outside local APP_ENV"
      );
    }
  }

  const authIdentityIntentsEnabled = parseBoolean(
    process.env.AUTH_IDENTITY_INTENTS_ENABLED,
    false
  );
  const authIdentityIntentTtlSec = parsePositiveInteger(
    process.env.AUTH_IDENTITY_INTENT_TTL_SEC,
    15 * 60
  );
  const authIdentityIntentMaxAttempts = parsePositiveInteger(
    process.env.AUTH_IDENTITY_INTENT_MAX_ATTEMPTS,
    6
  );
  const authIdentityIntentRateLimitPerHour = parsePositiveInteger(
    process.env.AUTH_IDENTITY_INTENT_RATE_LIMIT_PER_HOUR,
    20
  );
  const authPurchaseIdentityIntentGatingEnabled = parseBoolean(
    process.env.AUTH_PURCHASE_IDENTITY_INTENT_GATING_ENABLED,
    false
  );
  if (authPurchaseIdentityIntentGatingEnabled && !authIdentityIntentsEnabled) {
    throw new Error(
      "[api-runtime] AUTH_PURCHASE_IDENTITY_INTENT_GATING_ENABLED requires AUTH_IDENTITY_INTENTS_ENABLED=true"
    );
  }

  const emailDeliveryMode = parseEmailDeliveryMode(
    process.env.EMAIL_DELIVERY_MODE,
    "disabled"
  );
  const emailProviderApiKey = process.env.EMAIL_PROVIDER_API_KEY?.trim() || "";
  if (emailDeliveryMode === "provider" && !emailProviderApiKey) {
    throw new Error("[api-runtime] Missing required env: EMAIL_PROVIDER_API_KEY");
  }
  const emailSmtpHost =
    emailDeliveryMode === "smtp"
      ? ensureRequiredEnv("EMAIL_SMTP_HOST", process.env.EMAIL_SMTP_HOST)
      : process.env.EMAIL_SMTP_HOST?.trim() || "";
  const emailSmtpPort = parsePositiveInteger(process.env.EMAIL_SMTP_PORT, 465);
  const emailSmtpSecure = parseBoolean(process.env.EMAIL_SMTP_SECURE, true);
  const emailSmtpUser =
    emailDeliveryMode === "smtp"
      ? ensureRequiredEnv("EMAIL_SMTP_USER", process.env.EMAIL_SMTP_USER)
      : process.env.EMAIL_SMTP_USER?.trim() || "";
  const emailSmtpPass =
    emailDeliveryMode === "smtp"
      ? ensureRequiredEnv("EMAIL_SMTP_PASS", process.env.EMAIL_SMTP_PASS)
      : process.env.EMAIL_SMTP_PASS?.trim() || "";
  const mailFromName = process.env.MAIL_FROM_NAME?.trim() || "Mathwise";
  const mailFromRaw = process.env.MAIL_FROM?.trim() || emailSmtpUser;
  if (emailDeliveryMode === "smtp" && !mailFromRaw) {
    throw new Error("[api-runtime] Missing required env: MAIL_FROM");
  }
  const mailReplyTo = process.env.MAIL_REPLY_TO?.trim() || mailFromRaw;
  const mailSubjectPrefix = process.env.MAIL_SUBJECT_PREFIX?.trim() || "";
  const mailAppendStageFooter = parseBoolean(
    process.env.MAIL_APPEND_STAGE_FOOTER,
    isStage
  );
  const mailConnectTimeoutMs = parsePositiveInteger(
    process.env.MAIL_CONNECT_TIMEOUT_MS,
    10_000
  );
  const mailSocketTimeoutMs = parsePositiveInteger(
    process.env.MAIL_SOCKET_TIMEOUT_MS,
    20_000
  );
  const mailBcc = parseCsv(process.env.MAIL_BCC);
  const mailDryRun = parseBoolean(process.env.MAIL_DRY_RUN, false);

  const yookassaMode = parseYooKassaMode(
    process.env.YOOKASSA_MODE,
    "disabled"
  );
  const yookassaEnabled = yookassaMode !== "disabled";
  const yookassaShopId = yookassaEnabled
    ? ensureRequiredEnv("YOOKASSA_SHOP_ID", process.env.YOOKASSA_SHOP_ID)
    : process.env.YOOKASSA_SHOP_ID?.trim() || "";
  const yookassaSecretKey = yookassaEnabled
    ? ensureRequiredEnv("YOOKASSA_SECRET_KEY", process.env.YOOKASSA_SECRET_KEY)
    : process.env.YOOKASSA_SECRET_KEY?.trim() || "";
  const yookassaApiBaseRaw =
    process.env.YOOKASSA_API_BASE?.trim() || "https://api.yookassa.ru/v3";
  let yookassaApiBase = yookassaApiBaseRaw.replace(/\/+$/, "");
  try {
    const parsed = new URL(yookassaApiBase);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error();
    }
  } catch {
    throw new Error(
      "[api-runtime] YOOKASSA_API_BASE must be a valid absolute URL"
    );
  }
  if (!yookassaApiBase.endsWith("/v3")) {
    yookassaApiBase = `${yookassaApiBase}/v3`;
  }
  const yookassaReturnUrl = yookassaEnabled
    ? ensureRequiredEnv("YOOKASSA_RETURN_URL", process.env.YOOKASSA_RETURN_URL)
    : process.env.YOOKASSA_RETURN_URL?.trim() || "";
  let yookassaReturnOrigin: string | null = null;
  if (yookassaReturnUrl) {
    try {
      const parsed = new URL(yookassaReturnUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error();
      }
      yookassaReturnOrigin = parsed.origin;
    } catch {
      throw new Error(
        "[api-runtime] YOOKASSA_RETURN_URL must be a valid absolute URL"
      );
    }
  }
  if (
    yookassaEnabled &&
    yookassaReturnOrigin &&
    yookassaReturnOrigin !== corsOrigin
  ) {
    throw new Error(
      "[api-runtime] YOOKASSA_RETURN_URL origin must match API_CORS_ORIGIN"
    );
  }
  const yookassaWebhookPath =
    process.env.YOOKASSA_WEBHOOK_PATH?.trim() ||
    "/api/payments/providers/yookassa/webhook";
  if (!yookassaWebhookPath.startsWith("/")) {
    throw new Error(
      "[api-runtime] YOOKASSA_WEBHOOK_PATH must start with '/'"
    );
  }
  const yookassaCaptureImmediately = parseBoolean(
    process.env.YOOKASSA_CAPTURE_IMMEDIATELY,
    true
  );
  const yookassaWebhookEnabled = parseBoolean(
    process.env.YOOKASSA_WEBHOOK_ENABLED,
    true
  );

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
  const mediaLessonVideoMaxUploadMb = Math.min(
    4096,
    Math.max(
      1024,
      parsePositiveInteger(process.env.MEDIA_LESSON_VIDEO_MAX_UPLOAD_MB, 2048)
    )
  );
  const mediaGcIntervalSec = Math.max(
    60,
    parsePositiveInteger(process.env.MEDIA_GC_INTERVAL_SEC, 300)
  );
  const mediaGcBatchLimit = Math.max(
    10,
    Math.min(1000, parsePositiveInteger(process.env.MEDIA_GC_BATCH_LIMIT, 200))
  );
  const workbookLaunchEnabled = parseBoolean(
    process.env.WORKBOOK_LAUNCH_ENABLED,
    true
  );
  const workbookBoardBaseUrl =
    process.env.WORKBOOK_BOARD_BASE_URL?.trim() || "";
  const workbookLaunchSecret = process.env.WORKBOOK_LAUNCH_SECRET?.trim() || "";
  if (workbookLaunchEnabled) {
    if (!isLocal && !workbookBoardBaseUrl) {
      throw new Error(
        "[api-runtime] Missing required env: WORKBOOK_BOARD_BASE_URL"
      );
    }
    if (workbookBoardBaseUrl) {
      let parsed: URL;
      try {
        parsed = new URL(workbookBoardBaseUrl);
      } catch {
        throw new Error(
          "[api-runtime] WORKBOOK_BOARD_BASE_URL must be a valid absolute URL"
        );
      }
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error(
          "[api-runtime] WORKBOOK_BOARD_BASE_URL must use http or https"
        );
      }
    }
    if (!isLocal && workbookLaunchSecret.length < 24) {
      throw new Error(
        "[api-runtime] WORKBOOK_LAUNCH_SECRET must be at least 24 chars outside local APP_ENV"
      );
    }
  }
  const workbookLaunchTtlSec = parsePositiveInteger(
    process.env.WORKBOOK_LAUNCH_TTL_SEC,
    120
  );
  const bookingV2Enabled = parseBoolean(
    process.env.BOOKING_V2_ENABLED,
    false
  );
  const bookingV2GuestCompatibilityEnabled = parseBoolean(
    process.env.BOOKING_V2_GUEST_COMPAT_ENABLED,
    true
  );
  const bookingSlotHoldTtlSec = parsePositiveInteger(
    process.env.BOOKING_SLOT_HOLD_TTL_SEC,
    15 * 60
  );
  const teacherInvitesEnabled = parseBoolean(
    process.env.TEACHER_INVITES_ENABLED,
    false
  );
  const teacherInviteTtlSec = parsePositiveInteger(
    process.env.TEACHER_INVITE_TTL_SEC,
    7 * 24 * 60 * 60
  );

  const releaseVersion =
    process.env.RELEASE_VERSION?.trim() ||
    process.env.GIT_SHA?.trim() ||
    "dev";

  return {
    port: parsePort(process.env.API_PORT),
    host: process.env.API_HOST?.trim() || "0.0.0.0",
    appEnv,
    corsOrigin,
    databaseUrl: requireDatabase
      ? ensureRequiredEnv("DATABASE_URL", process.env.DATABASE_URL)
      : process.env.DATABASE_URL?.trim() || "",
    redisUrl: requireRedis
      ? ensureRequiredEnv("REDIS_URL", process.env.REDIS_URL)
      : process.env.REDIS_URL?.trim() || "",
    coursesSeedOnBoot,
    coursesSeedSourceFile,
    authSessionCookieName:
      process.env.AUTH_SESSION_COOKIE_NAME?.trim() || "mt_auth_session",
    authSessionTtlSec: parsePositiveInteger(
      process.env.AUTH_SESSION_TTL_SEC,
      authCookieMaxAgeSec
    ),
    authSessionIdleTimeoutSec: parsePositiveInteger(
      process.env.AUTH_SESSION_IDLE_TIMEOUT_SEC,
      60 * 60
    ),
    authCookieSecure,
    authCookieHttpOnly,
    authCookieSameSite,
    authCookieDomain,
    authCookiePath,
    authCookieMaxAgeSec,
    authDebugTokens,
    authPasswordPepper: authPasswordPepper || "local-auth-pepper-dev-only",
    cardWebhookSecret: cardWebhookSecret || "local-card-webhook-secret-dev-only",
    cardWebhookMaxSkewSec: parsePositiveInteger(
      process.env.CARD_WEBHOOK_MAX_SKEW_SEC,
      300
    ),
    cardWebhookReplayTtlSec: parsePositiveInteger(
      process.env.CARD_WEBHOOK_REPLAY_TTL_SEC,
      15 * 60
    ),
    paymentProviderAutoConfirmLocal,
    paymentMockEnabled,
    stageSiteGateEnabled,
    stageSiteGateSecret,
    stageSiteGateCookieName,
    stageSiteGateTtlSec,
    stagePaymentConfirmEnabled,
    teacherBootstrapEnabled,
    teacherBootstrapEmail,
    teacherBootstrapPassword,
    teacherBootstrapFirstName:
      process.env.TEACHER_BOOTSTRAP_FIRST_NAME?.trim() || "Teacher",
    teacherBootstrapLastName:
      process.env.TEACHER_BOOTSTRAP_LAST_NAME?.trim() || "Account",
    authRecoveryCodeTtlSec: parsePositiveInteger(
      process.env.AUTH_RECOVERY_CODE_TTL_SEC,
      10 * 60
    ),
    authRecoveryTokenTtlSec: parsePositiveInteger(
      process.env.AUTH_RECOVERY_TOKEN_TTL_SEC,
      15 * 60
    ),
    authRecoveryMaxAttempts: parsePositiveInteger(
      process.env.AUTH_RECOVERY_MAX_ATTEMPTS,
      6
    ),
    authRecoveryRateLimitPerHour: parsePositiveInteger(
      process.env.AUTH_RECOVERY_RATE_LIMIT_PER_HOUR,
      20
    ),
    authIdentityIntentsEnabled,
    authIdentityIntentTtlSec,
    authIdentityIntentMaxAttempts,
    authIdentityIntentRateLimitPerHour,
    authPurchaseIdentityIntentGatingEnabled,
    emailDeliveryMode,
    emailProviderApiKey,
    emailSmtpHost,
    emailSmtpPort,
    emailSmtpSecure,
    emailSmtpUser,
    emailSmtpPass,
    mailFromName,
    mailFrom: mailFromRaw,
    mailReplyTo,
    mailSubjectPrefix,
    mailAppendStageFooter,
    mailConnectTimeoutMs,
    mailSocketTimeoutMs,
    mailBcc,
    mailDryRun,
    yookassaMode,
    yookassaShopId,
    yookassaSecretKey,
    yookassaApiBase,
    yookassaReturnUrl,
    yookassaWebhookPath,
    yookassaCaptureImmediately,
    yookassaWebhookEnabled,
    mediaStorageEnabled,
    s3Endpoint,
    s3Region,
    s3Bucket,
    s3AccessKey,
    s3SecretKey,
    s3ForcePathStyle,
    mediaSignedUrlTtlSec,
    mediaLessonVideoMaxUploadBytes: mediaLessonVideoMaxUploadMb * 1024 * 1024,
    mediaGcIntervalSec,
    mediaGcBatchLimit,
    workbookLaunchEnabled,
    workbookBoardBaseUrl,
    workbookLaunchSecret:
      workbookLaunchSecret || "local-workbook-launch-secret-dev-only",
    workbookLaunchTtlSec,
    bookingV2Enabled,
    bookingV2GuestCompatibilityEnabled,
    bookingSlotHoldTtlSec,
    teacherInvitesEnabled,
    teacherInviteTtlSec,
    releaseVersion,
  };
};
