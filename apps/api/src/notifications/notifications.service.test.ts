import assert from "node:assert/strict";
import test from "node:test";
import { NotificationsService } from "./notifications.service";

const REQUIRED_ENV: Record<string, string> = {
  APP_ENV: "stage",
  API_CORS_ORIGIN: "https://stage.board.mathwise.ru",
  DATABASE_URL: "postgres://u:p@127.0.0.1:5432/db",
  REDIS_URL: "redis://127.0.0.1:6379",
  CARD_WEBHOOK_SECRET: "test-secret",
  AUTH_PASSWORD_PEPPER: "test-pepper",
  AUTH_COOKIE_SECURE: "true",
  AUTH_DEBUG_TOKENS: "false",
  EMAIL_DELIVERY_MODE: "disabled",
  WORKBOOK_LAUNCH_ENABLED: "false",
};

const applyEnv = () => {
  for (const [key, value] of Object.entries(REQUIRED_ENV)) {
    process.env[key] = value;
  }
};

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

test("notifications: disabled delivery mode never marks outbox message as sent", async () => {
  const snapshot = { ...process.env };
  try {
    applyEnv();
    const calls: string[] = [];
    const repository = {
      ensureSchema: async () => undefined,
      enqueue: async () => {
        throw new Error("not-used");
      },
      list: async () => [],
      findById: async (id: string) => ({
        id,
        template: "purchase_confirmed" as const,
        dedupeKey: "dedupe",
        recipientEmail: "student@example.test",
        status: "queued" as const,
        payload: {},
        attemptCount: 0,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      markSent: async () => {
        calls.push("markSent");
      },
      markFailed: async (_id: string, reason: string) => {
        calls.push(`markFailed:${reason}`);
      },
      markQueued: async () => {
        calls.push("markQueued");
      },
    };

    const service = new NotificationsService(repository as never);
    const result = await service.dispatchById("outbox_1");
    assert.deepEqual(result, { ok: true, delivered: 0 });
    assert.deepEqual(calls, ["markFailed:dispatch_disabled"]);
  } finally {
    restoreEnv(snapshot);
  }
});
