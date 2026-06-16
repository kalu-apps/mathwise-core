import assert from "node:assert/strict";
import test from "node:test";
import { SessionStore, type CreateSessionResult } from "./session.store";

const BASE_ENV: Record<string, string> = {
  APP_ENV: "local",
  API_CORS_ORIGIN: "http://localhost:5173",
  DATABASE_URL: "postgres://u:p@127.0.0.1:5432/db",
  REDIS_URL: "redis://127.0.0.1:6379",
  CARD_WEBHOOK_SECRET: "test-secret",
  AUTH_PASSWORD_PEPPER: "test-pepper",
  EMAIL_DELIVERY_MODE: "disabled",
  WORKBOOK_LAUNCH_ENABLED: "false",
  AUTH_SESSION_TTL_SEC: "86400",
  AUTH_SESSION_IDLE_TIMEOUT_SEC: "3600",
};

class FakeRedisService {
  private readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async setIfAbsent(key: string, value: string): Promise<boolean> {
    if (this.values.has(key)) {
      return false;
    }
    this.values.set(key, value);
    return true;
  }

  async setIfValue(
    key: string,
    expectedValue: string,
    nextValue: string
  ): Promise<boolean> {
    if (this.values.get(key) !== expectedValue) {
      return false;
    }
    this.values.set(key, nextValue);
    return true;
  }

  async releaseLock(key: string, token: string): Promise<void> {
    if (this.values.get(key) === token) {
      this.values.delete(key);
    }
  }

  async del(key: string): Promise<void> {
    this.values.delete(key);
  }
}

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

const applyBaseEnv = (overrides: Record<string, string> = {}) => {
  for (const [key, value] of Object.entries({
    ...BASE_ENV,
    ...overrides,
  })) {
    process.env[key] = value;
  }
};

const requireSession = (result: CreateSessionResult) => {
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Expected session creation to succeed");
  }
  return result.session;
};

test("session store: blocks a second active session for the same user", async () => {
  const snapshot = { ...process.env };
  try {
    applyBaseEnv();
    const store = new SessionStore(new FakeRedisService() as never);

    const first = requireSession(await store.createSession("user_1"));
    const second = await store.createSession("user_1");

    assert.equal(second.ok, false);
    if (second.ok) {
      throw new Error("Expected duplicate login to be rejected");
    }
    assert.equal(second.reason, "already_active");
    assert.equal(second.activeSessionId, first.id);

    await store.revokeSession(first.id);
    const third = requireSession(await store.createSession("user_1"));
    assert.notEqual(third.id, first.id);
  } finally {
    restoreEnv(snapshot);
  }
});

test("session store: stale idle session is revoked before creating a new one", async () => {
  const snapshot = { ...process.env };
  const originalNow = Date.now;
  try {
    applyBaseEnv({ AUTH_SESSION_IDLE_TIMEOUT_SEC: "60" });
    const baseMs = Date.parse("2026-06-16T12:00:00.000Z");
    Date.now = () => baseMs;
    const store = new SessionStore(new FakeRedisService() as never);

    const first = requireSession(await store.createSession("user_1"));
    Date.now = () => baseMs + 61_000;
    const second = requireSession(await store.createSession("user_1"));

    assert.notEqual(second.id, first.id);
    assert.equal(await store.readSession(first.id), null);
  } finally {
    Date.now = originalNow;
    restoreEnv(snapshot);
  }
});

test("session store: touching active session extends idle expiration", async () => {
  const snapshot = { ...process.env };
  const originalNow = Date.now;
  try {
    applyBaseEnv({ AUTH_SESSION_IDLE_TIMEOUT_SEC: "60" });
    const baseMs = Date.parse("2026-06-16T12:00:00.000Z");
    Date.now = () => baseMs;
    const store = new SessionStore(new FakeRedisService() as never);
    const session = requireSession(await store.createSession("user_1"));

    Date.now = () => baseMs + 30_000;
    const current = await store.readSession(session.id);
    assert.ok(current);
    const touched = await store.touchSessionActivity(current);

    assert.ok(touched);
    assert.equal(touched.lastActivityAt, new Date(baseMs + 30_000).toISOString());
    assert.equal(touched.idleExpiresAt, new Date(baseMs + 90_000).toISOString());
  } finally {
    Date.now = originalNow;
    restoreEnv(snapshot);
  }
});
