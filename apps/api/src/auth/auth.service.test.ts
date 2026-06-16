import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { hashPassword } from "./auth.password";
import { AuthService } from "./auth.service";

const REQUIRED_ENV: Record<string, string> = {
  APP_ENV: "stage",
  API_CORS_ORIGIN: "https://stage.mathwise.ru",
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

test("password login rejects when account already has an active session", async () => {
  const snapshot = { ...process.env };
  try {
    applyEnv();
    process.env.COURSES_SEED_ON_BOOT = "false";
    process.env.TEACHER_BOOTSTRAP_ENABLED = "false";
    const email = "student@axiom.demo";
    const authRepository = {
      findByEmail: async () => ({
        id: "student_1",
        email,
        firstName: "Student",
        lastName: "Axiom",
        role: "student",
        phone: null,
        photo: null,
        passwordHash: hashPassword("StrongPass123!", "test-pepper"),
      }),
    };
    const sessionStore = {
      createSession: async () => ({
        ok: false as const,
        reason: "already_active" as const,
        activeSessionId: "sid_existing",
      }),
    };

    const service = new AuthService(
      { execute: async () => undefined } as never,
      authRepository as never,
      sessionStore as never,
      { enqueueAndDispatch: async () => undefined } as never,
      {} as never
    );

    const result = await service.passwordLogin({
      email,
      password: "StrongPass123!",
    });

    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error("Expected login to be rejected");
    }
    assert.equal(result.status, 409);
    assert.equal(result.code, "session_already_active");
    assert.match(result.error, /уже открыт/);
  } finally {
    restoreEnv(snapshot);
  }
});

test("magic-link confirmation rejects when account already has an active session", async () => {
  const snapshot = { ...process.env };
  try {
    applyEnv();
    process.env.COURSES_SEED_ON_BOOT = "false";
    process.env.TEACHER_BOOTSTRAP_ENABLED = "false";
    const authRepository = {
      findById: async () => ({
        id: "student_1",
        email: "student@axiom.demo",
        firstName: "Student",
        lastName: "Axiom",
        role: "student",
      }),
    };
    const sessionStore = {
      confirmMagicCode: async () => ({
        ok: true as const,
        userId: "student_1",
      }),
      createSession: async () => ({
        ok: false as const,
        reason: "already_active" as const,
        activeSessionId: "sid_existing",
      }),
    };

    const service = new AuthService(
      { execute: async () => undefined } as never,
      authRepository as never,
      sessionStore as never,
      { enqueueAndDispatch: async () => undefined } as never,
      {} as never
    );

    const result = await service.confirmMagicLink({
      email: "student@axiom.demo",
      code: "123456",
    });

    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error("Expected login to be rejected");
    }
    assert.equal(result.status, 409);
    assert.equal(result.code, "session_already_active");
    assert.match(result.error, /уже открыт/);
  } finally {
    restoreEnv(snapshot);
  }
});

test("identity completion: purchase-finalized user without password requires first password", async () => {
  const snapshot = { ...process.env };
  try {
    applyEnv();
    const lifecycle = new Map<string, Record<string, unknown>>();
    const users = new Map<string, Record<string, unknown>>([
      [
        "user_new_1",
        {
          id: "user_new_1",
          email: "new@axiom.demo",
          firstName: "New",
          lastName: "User",
          role: "student",
          updatedAt: "2026-04-14T00:00:00.000Z",
          passwordHash: null,
        },
      ],
    ]);

    const authRepository = {
      findByIdWithCredential: async (userId: string) => users.get(userId) ?? null,
      findIdentityCompletionByUserId: async (userId: string) =>
        (lifecycle.get(userId) as Record<string, unknown> | undefined) ?? null,
      upsertIdentityCompletion: async (payload: Record<string, unknown>) => {
        lifecycle.set(String(payload.userId), {
          userId: payload.userId,
          identityVerifiedAt: payload.identityVerifiedAt ?? null,
          accountFinalizedAt: payload.accountFinalizedAt ?? null,
          firstPasswordSetAt: payload.firstPasswordSetAt ?? null,
          completionState: payload.completionState,
          completedAt: payload.completedAt ?? null,
          source: payload.source ?? null,
          createdAt: "2026-04-14T00:00:00.000Z",
          updatedAt: "2026-04-14T00:00:00.000Z",
        });
      },
    };

    const service = new AuthService(
      { execute: async () => undefined } as never,
      authRepository as never,
      {} as never,
      { enqueueAndDispatch: async () => undefined } as never,
      {} as never
    );

    await service.syncIdentityCompletionAfterPurchase({
      userId: "user_new_1",
      identityVerifiedHint: true,
      source: "purchase_finalization_identity_intent",
    });
    const status = await service.getIdentityCompletionStatus("user_new_1");

    assert.equal(status.ok, true);
    assert.equal(status.identityVerified, true);
    assert.equal(status.accountFinalized, true);
    assert.equal(status.hasPassword, false);
    assert.equal(status.firstPasswordRequired, true);
    assert.equal(status.completionState, "pending_first_password");
  } finally {
    restoreEnv(snapshot);
  }
});

test("identity completion: complete first password marks lifecycle completed and sends notification", async () => {
  const snapshot = { ...process.env };
  try {
    applyEnv();
    const lifecycle = new Map<string, Record<string, unknown>>();
    const users = new Map<string, Record<string, unknown>>([
      [
        "user_first_pwd_1",
        {
          id: "user_first_pwd_1",
          email: "student@axiom.demo",
          firstName: "Student",
          lastName: "One",
          role: "student",
          updatedAt: "2026-04-14T00:00:00.000Z",
          passwordHash: null,
        },
      ],
    ]);
    const notifications: Array<{ template: string; payload: Record<string, unknown> }> = [];

    const authRepository = {
      findByIdWithCredential: async (userId: string) => users.get(userId) ?? null,
      findIdentityCompletionByUserId: async (userId: string) =>
        (lifecycle.get(userId) as Record<string, unknown> | undefined) ?? null,
      upsertIdentityCompletion: async (payload: Record<string, unknown>) => {
        lifecycle.set(String(payload.userId), {
          userId: payload.userId,
          identityVerifiedAt: payload.identityVerifiedAt ?? null,
          accountFinalizedAt: payload.accountFinalizedAt ?? null,
          firstPasswordSetAt: payload.firstPasswordSetAt ?? null,
          completionState: payload.completionState,
          completedAt: payload.completedAt ?? null,
          source: payload.source ?? null,
          createdAt: "2026-04-14T00:00:00.000Z",
          updatedAt: "2026-04-14T00:00:00.000Z",
        });
      },
      updatePasswordHash: async (userId: string, passwordHash: string) => {
        const current = users.get(userId);
        if (!current) return;
        users.set(userId, {
          ...current,
          passwordHash,
          updatedAt: "2026-04-14T00:10:00.000Z",
        });
      },
    };

    const service = new AuthService(
      { execute: async () => undefined } as never,
      authRepository as never,
      {} as never,
      {
        enqueueAndDispatch: async (input: {
          template: string;
          payload: Record<string, unknown>;
        }) => {
          notifications.push({
            template: input.template,
            payload: input.payload,
          });
        },
      } as never,
      {} as never
    );

    await service.syncIdentityCompletionAfterPurchase({
      userId: "user_first_pwd_1",
      identityVerifiedHint: true,
    });
    const completed = await service.completeFirstPassword({
      userId: "user_first_pwd_1",
      newPassword: "VeryStrong123!",
    });
    const status = await service.getIdentityCompletionStatus("user_first_pwd_1");

    assert.equal(completed.ok, true);
    assert.equal(completed.completed, true);
    assert.equal(completed.completionState, "completed");
    assert.equal(status.firstPasswordRequired, false);
    assert.equal(status.completionState, "completed");
    assert.equal(status.hasPassword, true);
    assert.equal(
      notifications.some(
        (item) =>
          item.template === "password_changed" &&
          String(item.payload.reason) === "first_password_set"
      ),
      true
    );
  } finally {
    restoreEnv(snapshot);
  }
});

test("identity completion: existing user with password stays completed", async () => {
  const snapshot = { ...process.env };
  try {
    applyEnv();
    const users = new Map<string, Record<string, unknown>>([
      [
        "user_existing_1",
        {
          id: "user_existing_1",
          email: "existing@axiom.demo",
          firstName: "Existing",
          lastName: "User",
          role: "student",
          updatedAt: "2026-04-14T00:00:00.000Z",
          passwordHash: "hashed",
        },
      ],
    ]);

    const authRepository = {
      findByIdWithCredential: async (userId: string) => users.get(userId) ?? null,
      findIdentityCompletionByUserId: async () => null,
      upsertIdentityCompletion: async () => undefined,
    };

    const service = new AuthService(
      { execute: async () => undefined } as never,
      authRepository as never,
      {} as never,
      { enqueueAndDispatch: async () => undefined } as never,
      {} as never
    );

    const status = await service.getIdentityCompletionStatus("user_existing_1");
    assert.equal(status.identityVerified, true);
    assert.equal(status.accountFinalized, true);
    assert.equal(status.hasPassword, true);
    assert.equal(status.firstPasswordRequired, false);
    assert.equal(status.completionState, "completed");
  } finally {
    restoreEnv(snapshot);
  }
});
