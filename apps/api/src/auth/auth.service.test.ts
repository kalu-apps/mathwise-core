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
