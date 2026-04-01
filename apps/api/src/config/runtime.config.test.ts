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
