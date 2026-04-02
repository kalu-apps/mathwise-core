import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AuthService } from "./auth.service";

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

test("auth bootstrap: non-local runtime blocks teacher from seed ingestion", async () => {
  const snapshot = { ...process.env };
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "auth-seed-test-"));
  const seedFile = path.join(tempDir, "seed.json");
  try {
    fs.writeFileSync(
      seedFile,
      JSON.stringify(
        {
          users: [
            {
              id: "teacher_seed_1",
              email: "teacher.seed@example.test",
              firstName: "Seed",
              lastName: "Teacher",
              role: "teacher",
              password: "seed-password",
            },
          ],
        },
        null,
        2
      ),
      "utf-8"
    );
    applyEnv();
    process.env.COURSES_SEED_ON_BOOT = "true";
    process.env.COURSES_SEED_SOURCE_FILE = seedFile;
    process.env.TEACHER_BOOTSTRAP_ENABLED = "false";

    const authRepository = {
      ensureSchema: async () => undefined,
      hasAnyUsers: async () => false,
      ensureTeacherBootstrap: async () => undefined,
    };
    const service = new AuthService(
      { execute: async () => undefined } as never,
      authRepository as never,
      {} as never,
      {} as never,
      {} as never
    );

    await assert.rejects(
      () => service.onModuleInit(),
      /teacher seed users are forbidden/
    );
  } finally {
    restoreEnv(snapshot);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("magic-link request returns uniform message for existing and missing users", async () => {
  const snapshot = { ...process.env };
  try {
    applyEnv();
    process.env.COURSES_SEED_ON_BOOT = "false";
    process.env.TEACHER_BOOTSTRAP_ENABLED = "false";

    const existingEmail = "teacher@axiom.demo";
    const authRepository = {
      findByEmail: async (email: string) =>
        email === existingEmail
          ? ({
              id: "teacher_1",
              email,
              firstName: "Teacher",
              lastName: "Axiom",
              role: "teacher",
            } as const)
          : null,
    };
    const sessionStore = {
      issueMagicCode: async () => ({
        rawCode: "123456",
        expiresAt: "2026-04-03T00:00:00.000Z",
      }),
    };
    const notificationsService = {
      enqueueAndDispatch: async () => undefined,
    };

    const service = new AuthService(
      { execute: async () => undefined } as never,
      authRepository as never,
      sessionStore as never,
      notificationsService as never,
      {} as never
    );

    const missing = await service.requestMagicLink("missing@axiom.demo");
    const existing = await service.requestMagicLink(existingEmail);

    assert.equal(missing.ok, true);
    assert.equal(existing.ok, true);
    assert.equal(missing.message, existing.message);
    assert.equal(missing.debugCode, null);
    assert.equal(existing.debugCode, null);
    assert.equal(missing.expiresAt, null);
    assert.equal(existing.expiresAt, "2026-04-03T00:00:00.000Z");
  } finally {
    restoreEnv(snapshot);
  }
});
