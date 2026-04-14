import assert from "node:assert/strict";
import test from "node:test";
import { getApiRuntimeConfig } from "./runtime.config";

const restoreEnv = (snapshot: NodeJS.ProcessEnv) => {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
};

test("runtime config: stage mode rejects AUTH_DEBUG_TOKENS=true", () => {
  const snapshot = { ...process.env };
  try {
    process.env.APP_ENV = "stage";
    process.env.API_CORS_ORIGIN = "https://stage.board.mathwise.ru";
    process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/db";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    process.env.CARD_WEBHOOK_SECRET = "test-secret";
    process.env.AUTH_PASSWORD_PEPPER = "pepper";
    process.env.AUTH_COOKIE_SECURE = "true";
    process.env.AUTH_DEBUG_TOKENS = "true";
    process.env.WORKBOOK_LAUNCH_ENABLED = "false";

    assert.throws(
      () => getApiRuntimeConfig(),
      /AUTH_DEBUG_TOKENS must be disabled outside local APP_ENV/
    );
  } finally {
    restoreEnv(snapshot);
  }
});

test("runtime config: provider email mode requires EMAIL_PROVIDER_API_KEY", () => {
  const snapshot = { ...process.env };
  try {
    process.env.APP_ENV = "stage";
    process.env.API_CORS_ORIGIN = "https://stage.board.mathwise.ru";
    process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/db";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    process.env.CARD_WEBHOOK_SECRET = "test-secret";
    process.env.AUTH_PASSWORD_PEPPER = "pepper";
    process.env.AUTH_COOKIE_SECURE = "true";
    process.env.AUTH_DEBUG_TOKENS = "false";
    process.env.EMAIL_DELIVERY_MODE = "provider";
    process.env.WORKBOOK_LAUNCH_ENABLED = "false";
    delete process.env.EMAIL_PROVIDER_API_KEY;

    assert.throws(
      () => getApiRuntimeConfig(),
      /Missing required env: EMAIL_PROVIDER_API_KEY/
    );
  } finally {
    restoreEnv(snapshot);
  }
});

test("runtime config: smtp mode does not require EMAIL_PROVIDER_API_KEY", () => {
  const snapshot = { ...process.env };
  try {
    process.env.APP_ENV = "stage";
    process.env.API_CORS_ORIGIN = "https://stage.board.mathwise.ru";
    process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/db";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    process.env.CARD_WEBHOOK_SECRET = "test-secret";
    process.env.AUTH_PASSWORD_PEPPER = "pepper";
    process.env.AUTH_COOKIE_SECURE = "true";
    process.env.AUTH_DEBUG_TOKENS = "false";
    process.env.EMAIL_DELIVERY_MODE = "smtp";
    process.env.EMAIL_SMTP_HOST = "smtp.timeweb.ru";
    process.env.EMAIL_SMTP_PORT = "465";
    process.env.EMAIL_SMTP_SECURE = "true";
    process.env.EMAIL_SMTP_USER = "auth@mathwise.ru";
    process.env.EMAIL_SMTP_PASS = "secret";
    process.env.MAIL_FROM = "auth@mathwise.ru";
    process.env.WORKBOOK_LAUNCH_ENABLED = "false";
    delete process.env.EMAIL_PROVIDER_API_KEY;

    const config = getApiRuntimeConfig();
    assert.equal(config.emailDeliveryMode, "smtp");
    assert.equal(config.emailProviderApiKey, "");
    assert.equal(config.emailSmtpHost, "smtp.timeweb.ru");
  } finally {
    restoreEnv(snapshot);
  }
});

test("runtime config: smtp mode requires EMAIL_SMTP_HOST", () => {
  const snapshot = { ...process.env };
  try {
    process.env.APP_ENV = "stage";
    process.env.API_CORS_ORIGIN = "https://stage.board.mathwise.ru";
    process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/db";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    process.env.CARD_WEBHOOK_SECRET = "test-secret";
    process.env.AUTH_PASSWORD_PEPPER = "pepper";
    process.env.AUTH_COOKIE_SECURE = "true";
    process.env.AUTH_DEBUG_TOKENS = "false";
    process.env.EMAIL_DELIVERY_MODE = "smtp";
    process.env.EMAIL_SMTP_PORT = "465";
    process.env.EMAIL_SMTP_SECURE = "true";
    process.env.EMAIL_SMTP_USER = "auth@mathwise.ru";
    process.env.EMAIL_SMTP_PASS = "secret";
    process.env.MAIL_FROM = "auth@mathwise.ru";
    process.env.WORKBOOK_LAUNCH_ENABLED = "false";
    delete process.env.EMAIL_SMTP_HOST;

    assert.throws(
      () => getApiRuntimeConfig(),
      /Missing required env: EMAIL_SMTP_HOST/
    );
  } finally {
    restoreEnv(snapshot);
  }
});

test("runtime config: stage mode requires WORKBOOK_BOARD_BASE_URL when launch enabled", () => {
  const snapshot = { ...process.env };
  try {
    process.env.APP_ENV = "stage";
    process.env.API_CORS_ORIGIN = "https://stage.board.mathwise.ru";
    process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/db";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    process.env.CARD_WEBHOOK_SECRET = "test-secret";
    process.env.AUTH_PASSWORD_PEPPER = "pepper";
    process.env.AUTH_COOKIE_SECURE = "true";
    process.env.AUTH_DEBUG_TOKENS = "false";
    process.env.WORKBOOK_LAUNCH_ENABLED = "true";
    delete process.env.WORKBOOK_BOARD_BASE_URL;
    process.env.WORKBOOK_LAUNCH_SECRET = "012345678901234567890123";

    assert.throws(
      () => getApiRuntimeConfig(),
      /Missing required env: WORKBOOK_BOARD_BASE_URL/
    );
  } finally {
    restoreEnv(snapshot);
  }
});

test("runtime config: stage mode rejects PAYMENT_MOCK_ENABLED=true", () => {
  const snapshot = { ...process.env };
  try {
    process.env.APP_ENV = "stage";
    process.env.API_CORS_ORIGIN = "https://stage.board.mathwise.ru";
    process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/db";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    process.env.CARD_WEBHOOK_SECRET = "test-secret";
    process.env.AUTH_PASSWORD_PEPPER = "pepper";
    process.env.AUTH_COOKIE_SECURE = "true";
    process.env.AUTH_DEBUG_TOKENS = "false";
    process.env.WORKBOOK_LAUNCH_ENABLED = "false";
    process.env.PAYMENT_MOCK_ENABLED = "true";

    assert.throws(
      () => getApiRuntimeConfig(),
      /PAYMENT_MOCK_ENABLED must be disabled outside local APP_ENV/
    );
  } finally {
    restoreEnv(snapshot);
  }
});

test("runtime config: stage mode rejects frontend mock seed source", () => {
  const snapshot = { ...process.env };
  try {
    process.env.APP_ENV = "stage";
    process.env.API_CORS_ORIGIN = "https://stage.board.mathwise.ru";
    process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/db";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    process.env.CARD_WEBHOOK_SECRET = "test-secret";
    process.env.AUTH_PASSWORD_PEPPER = "pepper";
    process.env.AUTH_COOKIE_SECURE = "true";
    process.env.AUTH_DEBUG_TOKENS = "false";
    process.env.WORKBOOK_LAUNCH_ENABLED = "false";
    process.env.COURSES_SEED_SOURCE_FILE = "/opt/mathwise-core/math-tutor-frontend/mock-db.json";

    assert.throws(
      () => getApiRuntimeConfig(),
      /COURSES_SEED_SOURCE_FILE points to unsafe frontend\/mock source/
    );
  } finally {
    restoreEnv(snapshot);
  }
});

test("runtime config: STAGE_SITE_GATE_ENABLED is rejected outside stage", () => {
  const snapshot = { ...process.env };
  try {
    process.env.APP_ENV = "preview";
    process.env.API_CORS_ORIGIN = "https://preview.board.mathwise.ru";
    process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/db";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    process.env.CARD_WEBHOOK_SECRET = "test-secret";
    process.env.AUTH_PASSWORD_PEPPER = "pepper";
    process.env.AUTH_COOKIE_SECURE = "true";
    process.env.AUTH_DEBUG_TOKENS = "false";
    process.env.WORKBOOK_LAUNCH_ENABLED = "false";
    process.env.STAGE_SITE_GATE_ENABLED = "true";
    process.env.STAGE_SITE_GATE_SECRET = "stage-access-secret-123";

    assert.throws(
      () => getApiRuntimeConfig(),
      /STAGE_SITE_GATE_ENABLED is allowed only when APP_ENV=stage/
    );
  } finally {
    restoreEnv(snapshot);
  }
});

test("runtime config: stage gate requires secret when enabled", () => {
  const snapshot = { ...process.env };
  try {
    process.env.APP_ENV = "stage";
    process.env.API_CORS_ORIGIN = "https://stage.board.mathwise.ru";
    process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/db";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    process.env.CARD_WEBHOOK_SECRET = "test-secret";
    process.env.AUTH_PASSWORD_PEPPER = "pepper";
    process.env.AUTH_COOKIE_SECURE = "true";
    process.env.AUTH_DEBUG_TOKENS = "false";
    process.env.WORKBOOK_LAUNCH_ENABLED = "false";
    process.env.STAGE_SITE_GATE_ENABLED = "true";
    delete process.env.STAGE_SITE_GATE_SECRET;

    assert.throws(
      () => getApiRuntimeConfig(),
      /Missing required env: STAGE_SITE_GATE_SECRET/
    );
  } finally {
    restoreEnv(snapshot);
  }
});

test("runtime config: STAGE_PAYMENT_CONFIRM_ENABLED is rejected outside stage", () => {
  const snapshot = { ...process.env };
  try {
    process.env.APP_ENV = "preview";
    process.env.API_CORS_ORIGIN = "https://preview.board.mathwise.ru";
    process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/db";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    process.env.CARD_WEBHOOK_SECRET = "test-secret";
    process.env.AUTH_PASSWORD_PEPPER = "pepper";
    process.env.AUTH_COOKIE_SECURE = "true";
    process.env.AUTH_DEBUG_TOKENS = "false";
    process.env.WORKBOOK_LAUNCH_ENABLED = "false";
    process.env.STAGE_PAYMENT_CONFIRM_ENABLED = "true";

    assert.throws(
      () => getApiRuntimeConfig(),
      /STAGE_PAYMENT_CONFIRM_ENABLED is allowed only when APP_ENV=stage/
    );
  } finally {
    restoreEnv(snapshot);
  }
});

test("runtime config: yookassa disabled does not require credentials", () => {
  const snapshot = { ...process.env };
  try {
    process.env.APP_ENV = "stage";
    process.env.API_CORS_ORIGIN = "https://stage.board.mathwise.ru";
    process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/db";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    process.env.CARD_WEBHOOK_SECRET = "test-secret";
    process.env.AUTH_PASSWORD_PEPPER = "pepper";
    process.env.AUTH_COOKIE_SECURE = "true";
    process.env.AUTH_DEBUG_TOKENS = "false";
    process.env.WORKBOOK_LAUNCH_ENABLED = "false";
    process.env.YOOKASSA_MODE = "disabled";
    delete process.env.YOOKASSA_SHOP_ID;
    delete process.env.YOOKASSA_SECRET_KEY;
    delete process.env.YOOKASSA_RETURN_URL;

    const config = getApiRuntimeConfig();
    assert.equal(config.yookassaMode, "disabled");
    assert.equal(config.yookassaShopId, "");
    assert.equal(config.yookassaSecretKey, "");
    assert.equal(config.yookassaReturnUrl, "");
  } finally {
    restoreEnv(snapshot);
  }
});

test("runtime config: yookassa test mode requires shop id, secret and return url", () => {
  const snapshot = { ...process.env };
  try {
    process.env.APP_ENV = "stage";
    process.env.API_CORS_ORIGIN = "https://stage.board.mathwise.ru";
    process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/db";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    process.env.CARD_WEBHOOK_SECRET = "test-secret";
    process.env.AUTH_PASSWORD_PEPPER = "pepper";
    process.env.AUTH_COOKIE_SECURE = "true";
    process.env.AUTH_DEBUG_TOKENS = "false";
    process.env.WORKBOOK_LAUNCH_ENABLED = "false";
    process.env.YOOKASSA_MODE = "test";
    process.env.YOOKASSA_API_BASE = "https://api.yookassa.ru/v3";
    delete process.env.YOOKASSA_SHOP_ID;
    delete process.env.YOOKASSA_SECRET_KEY;
    delete process.env.YOOKASSA_RETURN_URL;

    assert.throws(
      () => getApiRuntimeConfig(),
      /Missing required env: YOOKASSA_SHOP_ID/
    );
  } finally {
    restoreEnv(snapshot);
  }
});

test("runtime config: yookassa test mode reads and normalizes config", () => {
  const snapshot = { ...process.env };
  try {
    process.env.APP_ENV = "stage";
    process.env.API_CORS_ORIGIN = "https://stage.board.mathwise.ru";
    process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/db";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    process.env.CARD_WEBHOOK_SECRET = "test-secret";
    process.env.AUTH_PASSWORD_PEPPER = "pepper";
    process.env.AUTH_COOKIE_SECURE = "true";
    process.env.AUTH_DEBUG_TOKENS = "false";
    process.env.WORKBOOK_LAUNCH_ENABLED = "false";
    process.env.YOOKASSA_MODE = "test";
    process.env.YOOKASSA_SHOP_ID = "test_shop_id";
    process.env.YOOKASSA_SECRET_KEY = "test_secret_key";
    process.env.YOOKASSA_RETURN_URL = "https://stage.mathwise.ru/courses/course_1";
    process.env.YOOKASSA_API_BASE = "https://api.yookassa.ru";
    process.env.YOOKASSA_WEBHOOK_PATH = "/api/payments/providers/yookassa/webhook";
    process.env.YOOKASSA_CAPTURE_IMMEDIATELY = "true";
    process.env.YOOKASSA_WEBHOOK_ENABLED = "true";

    const config = getApiRuntimeConfig();
    assert.equal(config.yookassaMode, "test");
    assert.equal(config.yookassaShopId, "test_shop_id");
    assert.equal(config.yookassaSecretKey, "test_secret_key");
    assert.equal(config.yookassaApiBase, "https://api.yookassa.ru/v3");
    assert.equal(
      config.yookassaWebhookPath,
      "/api/payments/providers/yookassa/webhook"
    );
    assert.equal(config.yookassaCaptureImmediately, true);
    assert.equal(config.yookassaWebhookEnabled, true);
  } finally {
    restoreEnv(snapshot);
  }
});

test("runtime config: enabled social oauth provider requires credentials", () => {
  const snapshot = { ...process.env };
  try {
    process.env.APP_ENV = "stage";
    process.env.API_CORS_ORIGIN = "https://stage.board.mathwise.ru";
    process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/db";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    process.env.CARD_WEBHOOK_SECRET = "test-secret";
    process.env.AUTH_PASSWORD_PEPPER = "pepper";
    process.env.AUTH_COOKIE_SECURE = "true";
    process.env.AUTH_DEBUG_TOKENS = "false";
    process.env.WORKBOOK_LAUNCH_ENABLED = "false";
    process.env.AUTH_OAUTH_GOOGLE_ENABLED = "true";
    process.env.AUTH_OAUTH_GOOGLE_CLIENT_ID = "google-client-id";
    delete process.env.AUTH_OAUTH_GOOGLE_CLIENT_SECRET;

    assert.throws(
      () => getApiRuntimeConfig(),
      /Missing required env for google oauth/
    );
  } finally {
    restoreEnv(snapshot);
  }
});

test("runtime config: enabled social oauth provider is parsed and exposed", () => {
  const snapshot = { ...process.env };
  try {
    process.env.APP_ENV = "stage";
    process.env.API_CORS_ORIGIN = "https://stage.board.mathwise.ru";
    process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/db";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    process.env.CARD_WEBHOOK_SECRET = "test-secret";
    process.env.AUTH_PASSWORD_PEPPER = "pepper";
    process.env.AUTH_COOKIE_SECURE = "true";
    process.env.AUTH_DEBUG_TOKENS = "false";
    process.env.WORKBOOK_LAUNCH_ENABLED = "false";
    process.env.AUTH_OAUTH_REDIRECT_BASE_URL = "https://stage.board.mathwise.ru";
    process.env.AUTH_OAUTH_GOOGLE_ENABLED = "true";
    process.env.AUTH_OAUTH_GOOGLE_CLIENT_ID = "google-client-id";
    process.env.AUTH_OAUTH_GOOGLE_CLIENT_SECRET = "google-client-secret";

    const config = getApiRuntimeConfig();
    assert.equal(config.authOauthRedirectBaseUrl, "https://stage.board.mathwise.ru");
    assert.equal(config.authOauthProviders.google.enabled, true);
    assert.equal(config.authOauthProviders.google.clientId, "google-client-id");
    assert.equal(
      config.authOauthProviders.google.authorizeUrl,
      "https://accounts.google.com/o/oauth2/v2/auth"
    );
  } finally {
    restoreEnv(snapshot);
  }
});

test("runtime config: identity intents are disabled by default", () => {
  const snapshot = { ...process.env };
  try {
    process.env.APP_ENV = "stage";
    process.env.API_CORS_ORIGIN = "https://stage.board.mathwise.ru";
    process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/db";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    process.env.CARD_WEBHOOK_SECRET = "test-secret";
    process.env.AUTH_PASSWORD_PEPPER = "pepper";
    process.env.AUTH_COOKIE_SECURE = "true";
    process.env.AUTH_DEBUG_TOKENS = "false";
    process.env.WORKBOOK_LAUNCH_ENABLED = "false";
    delete process.env.AUTH_IDENTITY_INTENTS_ENABLED;
    delete process.env.AUTH_IDENTITY_INTENT_TTL_SEC;
    delete process.env.AUTH_IDENTITY_INTENT_MAX_ATTEMPTS;
    delete process.env.AUTH_IDENTITY_INTENT_RATE_LIMIT_PER_HOUR;
    delete process.env.AUTH_PURCHASE_IDENTITY_INTENT_GATING_ENABLED;

    const config = getApiRuntimeConfig();
    assert.equal(config.authIdentityIntentsEnabled, false);
    assert.equal(config.authIdentityIntentTtlSec, 900);
    assert.equal(config.authIdentityIntentMaxAttempts, 6);
    assert.equal(config.authIdentityIntentRateLimitPerHour, 20);
    assert.equal(config.authPurchaseIdentityIntentGatingEnabled, false);
  } finally {
    restoreEnv(snapshot);
  }
});

test("runtime config: identity intents env overrides are parsed", () => {
  const snapshot = { ...process.env };
  try {
    process.env.APP_ENV = "stage";
    process.env.API_CORS_ORIGIN = "https://stage.board.mathwise.ru";
    process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/db";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    process.env.CARD_WEBHOOK_SECRET = "test-secret";
    process.env.AUTH_PASSWORD_PEPPER = "pepper";
    process.env.AUTH_COOKIE_SECURE = "true";
    process.env.AUTH_DEBUG_TOKENS = "false";
    process.env.WORKBOOK_LAUNCH_ENABLED = "false";
    process.env.AUTH_IDENTITY_INTENTS_ENABLED = "true";
    process.env.AUTH_IDENTITY_INTENT_TTL_SEC = "1200";
    process.env.AUTH_IDENTITY_INTENT_MAX_ATTEMPTS = "9";
    process.env.AUTH_IDENTITY_INTENT_RATE_LIMIT_PER_HOUR = "45";
    process.env.AUTH_PURCHASE_IDENTITY_INTENT_GATING_ENABLED = "true";

    const config = getApiRuntimeConfig();
    assert.equal(config.authIdentityIntentsEnabled, true);
    assert.equal(config.authIdentityIntentTtlSec, 1200);
    assert.equal(config.authIdentityIntentMaxAttempts, 9);
    assert.equal(config.authIdentityIntentRateLimitPerHour, 45);
    assert.equal(config.authPurchaseIdentityIntentGatingEnabled, true);
  } finally {
    restoreEnv(snapshot);
  }
});

test("runtime config: purchase identity-intent gating requires identity intents", () => {
  const snapshot = { ...process.env };
  try {
    process.env.APP_ENV = "stage";
    process.env.API_CORS_ORIGIN = "https://stage.board.mathwise.ru";
    process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/db";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    process.env.CARD_WEBHOOK_SECRET = "test-secret";
    process.env.AUTH_PASSWORD_PEPPER = "pepper";
    process.env.AUTH_COOKIE_SECURE = "true";
    process.env.AUTH_DEBUG_TOKENS = "false";
    process.env.WORKBOOK_LAUNCH_ENABLED = "false";
    process.env.AUTH_IDENTITY_INTENTS_ENABLED = "false";
    process.env.AUTH_PURCHASE_IDENTITY_INTENT_GATING_ENABLED = "true";

    assert.throws(
      () => getApiRuntimeConfig(),
      /AUTH_PURCHASE_IDENTITY_INTENT_GATING_ENABLED requires AUTH_IDENTITY_INTENTS_ENABLED=true/
    );
  } finally {
    restoreEnv(snapshot);
  }
});

test("runtime config: teacher invites are disabled by default", () => {
  const snapshot = { ...process.env };
  try {
    process.env.APP_ENV = "stage";
    process.env.API_CORS_ORIGIN = "https://stage.board.mathwise.ru";
    process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/db";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    process.env.CARD_WEBHOOK_SECRET = "test-secret";
    process.env.AUTH_PASSWORD_PEPPER = "pepper";
    process.env.AUTH_COOKIE_SECURE = "true";
    process.env.AUTH_DEBUG_TOKENS = "false";
    process.env.WORKBOOK_LAUNCH_ENABLED = "false";
    delete process.env.TEACHER_INVITES_ENABLED;
    delete process.env.TEACHER_INVITE_TTL_SEC;

    const config = getApiRuntimeConfig();
    assert.equal(config.teacherInvitesEnabled, false);
    assert.equal(config.teacherInviteTtlSec, 7 * 24 * 60 * 60);
  } finally {
    restoreEnv(snapshot);
  }
});

test("runtime config: teacher invites env overrides are parsed", () => {
  const snapshot = { ...process.env };
  try {
    process.env.APP_ENV = "stage";
    process.env.API_CORS_ORIGIN = "https://stage.board.mathwise.ru";
    process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/db";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    process.env.CARD_WEBHOOK_SECRET = "test-secret";
    process.env.AUTH_PASSWORD_PEPPER = "pepper";
    process.env.AUTH_COOKIE_SECURE = "true";
    process.env.AUTH_DEBUG_TOKENS = "false";
    process.env.WORKBOOK_LAUNCH_ENABLED = "false";
    process.env.TEACHER_INVITES_ENABLED = "true";
    process.env.TEACHER_INVITE_TTL_SEC = "1800";

    const config = getApiRuntimeConfig();
    assert.equal(config.teacherInvitesEnabled, true);
    assert.equal(config.teacherInviteTtlSec, 1800);
  } finally {
    restoreEnv(snapshot);
  }
});
