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
    process.env.AUTH_PASSWORD_PEPPER = "pepper";
    process.env.AUTH_COOKIE_SECURE = "true";
    process.env.AUTH_DEBUG_TOKENS = "true";

    assert.throws(
      () => getApiRuntimeConfig(),
      /AUTH_DEBUG_TOKENS must be disabled outside local APP_ENV/
    );
  } finally {
    restoreEnv(snapshot);
  }
});
