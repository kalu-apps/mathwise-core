import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import { AuthIdentityIntentService } from "./auth.identity-intent.service";
import type {
  AuthIdentityIntentChannel,
  AuthIdentityIntentConflictReason,
  AuthIdentityIntentState,
  AuthUserDto,
} from "./auth.types";

type IntentRecord = {
  id: string;
  channel: AuthIdentityIntentChannel;
  identityValue: string;
  identityEmail?: string;
  verificationState: AuthIdentityIntentState;
  conflictReason?: AuthIdentityIntentConflictReason;
  existingUserId?: string;
  challengeCodeHash?: string;
  challengeAttempts: number;
  challengeMaxAttempts: number;
  metadata: Record<string, unknown>;
  verifiedAt?: string;
  expiresAt: string;
  consumedAt?: string;
  createdAt: string;
  updatedAt: string;
};

class FakeIdentityIntentRepository {
  readonly intents = new Map<string, IntentRecord>();

  async ensureSchema() {}

  async expireActiveByIdentity(params: {
    channel: AuthIdentityIntentChannel;
    identityValue: string;
    now: string;
  }) {
    for (const intent of this.intents.values()) {
      if (
        intent.channel === params.channel &&
        intent.identityValue === params.identityValue &&
        (intent.verificationState === "pending" || intent.verificationState === "verified") &&
        !intent.consumedAt
      ) {
        intent.verificationState = "expired";
        intent.updatedAt = params.now;
      }
    }
  }

  async createPendingEmailIntent(params: {
    id: string;
    email: string;
    codeHash: string;
    expiresAt: string;
    maxAttempts: number;
    metadata?: Record<string, unknown>;
  }): Promise<IntentRecord> {
    const now = new Date().toISOString();
    const record: IntentRecord = {
      id: params.id,
      channel: "email",
      identityValue: params.email,
      identityEmail: params.email,
      verificationState: "pending",
      challengeCodeHash: params.codeHash,
      challengeAttempts: 0,
      challengeMaxAttempts: params.maxAttempts,
      metadata: params.metadata ?? {},
      expiresAt: params.expiresAt,
      createdAt: now,
      updatedAt: now,
    };
    this.intents.set(record.id, record);
    return { ...record };
  }

  async findById(intentId: string): Promise<IntentRecord | null> {
    const record = this.intents.get(intentId);
    return record ? { ...record } : null;
  }

  async incrementChallengeAttempts(params: { intentId: string; now: string }) {
    const record = this.intents.get(params.intentId);
    if (!record) return null;
    record.challengeAttempts += 1;
    record.updatedAt = params.now;
    return { ...record };
  }

  async markVerified(params: { intentId: string; now: string }) {
    const record = this.intents.get(params.intentId);
    if (!record) return null;
    if (record.verificationState !== "pending" || record.consumedAt) return null;
    record.verificationState = "verified";
    record.verifiedAt = params.now;
    record.updatedAt = params.now;
    return { ...record };
  }

  async markConflict(params: {
    intentId: string;
    now: string;
    reason: AuthIdentityIntentConflictReason;
    existingUserId?: string;
  }) {
    const record = this.intents.get(params.intentId);
    if (!record) return null;
    if (
      (record.verificationState !== "pending" && record.verificationState !== "verified") ||
      record.consumedAt
    ) {
      return null;
    }
    record.verificationState = "conflict";
    record.conflictReason = params.reason;
    record.existingUserId = params.existingUserId;
    record.updatedAt = params.now;
    return { ...record };
  }

  async markExpired(params: { intentId: string; now: string }) {
    const record = this.intents.get(params.intentId);
    if (!record) return null;
    if (
      (record.verificationState !== "pending" && record.verificationState !== "verified") ||
      record.consumedAt
    ) {
      return null;
    }
    record.verificationState = "expired";
    record.updatedAt = params.now;
    return { ...record };
  }

  async consumeVerifiedIntent(params: { intentId: string; now: string }) {
    const record = this.intents.get(params.intentId);
    if (!record) return null;
    if (record.verificationState !== "verified" || record.consumedAt) return null;
    record.verificationState = "consumed";
    record.consumedAt = params.now;
    record.updatedAt = params.now;
    return { ...record };
  }
}

class FakeRedisService {
  private readonly counters = new Map<string, number>();

  async incrementWithTtl(key: string): Promise<number> {
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }
}

const REQUIRED_ENV: Record<string, string> = {
  APP_ENV: "local",
  API_CORS_ORIGIN: "http://localhost:5173",
  DATABASE_URL: "postgres://u:p@127.0.0.1:5432/db",
  REDIS_URL: "redis://127.0.0.1:6379",
  CARD_WEBHOOK_SECRET: "test-secret",
  AUTH_PASSWORD_PEPPER: "test-pepper",
  AUTH_DEBUG_TOKENS: "true",
  EMAIL_DELIVERY_MODE: "disabled",
  WORKBOOK_LAUNCH_ENABLED: "false",
  AUTH_IDENTITY_INTENTS_ENABLED: "true",
  AUTH_IDENTITY_INTENT_TTL_SEC: "900",
  AUTH_IDENTITY_INTENT_MAX_ATTEMPTS: "3",
  AUTH_IDENTITY_INTENT_RATE_LIMIT_PER_HOUR: "20",
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

const makeService = (options?: {
  existingUserByEmail?: Record<string, AuthUserDto>;
  notificationsSpy?: Array<{ recipientEmail: string; payload: Record<string, unknown> }>;
}) => {
  const repo = new FakeIdentityIntentRepository();
  const existingMap = options?.existingUserByEmail ?? {};
  const notificationsSpy = options?.notificationsSpy ?? [];
  const service = new AuthIdentityIntentService(
    repo as never,
    {
      findByEmail: async (email: string) => {
        const found = existingMap[email];
        if (!found) return null;
        return {
          ...found,
          passwordHash: null,
        };
      },
    } as never,
    {
      enqueueAndDispatch: async (input: {
        recipientEmail: string;
        payload: Record<string, unknown>;
      }) => {
        notificationsSpy.push({
          recipientEmail: input.recipientEmail,
          payload: input.payload,
        });
      },
    } as never,
    new FakeRedisService() as never
  );
  return { service, repo, notificationsSpy };
};

test("identity intent: feature flag off returns 404", async () => {
  const snapshot = { ...process.env };
  try {
    applyEnv();
    process.env.AUTH_IDENTITY_INTENTS_ENABLED = "false";
    const { service } = makeService();
    await assert.rejects(
      () => service.start({ channel: "email", email: "new@axiom.test", ip: "127.0.0.1" }),
      (error: unknown) =>
        error instanceof HttpException &&
        error.getStatus() === 404 &&
        String((error.getResponse() as { code?: string })?.code) ===
          "identity_intents_disabled"
    );
  } finally {
    restoreEnv(snapshot);
  }
});

test("identity intent: verify success then consume once", async () => {
  const snapshot = { ...process.env };
  try {
    applyEnv();
    const { service } = makeService();
    const started = await service.start({
      channel: "email",
      email: "new@axiom.test",
      ip: "127.0.0.1",
    });
    assert.equal(started.ok, true);
    assert.equal(started.state, "pending");
    assert.ok(started.intentId);
    assert.ok(started.debugCode);

    const verified = await service.verify({
      intentId: started.intentId!,
      code: started.debugCode!,
    });
    assert.equal(verified.ok, true);
    assert.equal(verified.state, "verified");

    const consumedFirst = await service.consume(started.intentId!);
    assert.equal(consumedFirst.ok, true);
    assert.equal(consumedFirst.state, "consumed");

    const consumedReplay = await service.consume(started.intentId!);
    assert.equal(consumedReplay.ok, false);
    assert.equal(consumedReplay.state, "consumed");
  } finally {
    restoreEnv(snapshot);
  }
});

test("identity intent: verify on existing account yields conflict", async () => {
  const snapshot = { ...process.env };
  try {
    applyEnv();
    const { service } = makeService({
      existingUserByEmail: {
        "existing@axiom.test": {
          id: "user_1",
          email: "existing@axiom.test",
          firstName: "Existing",
          lastName: "User",
          role: "student",
        },
      },
    });
    const started = await service.start({
      channel: "email",
      email: "existing@axiom.test",
      ip: "127.0.0.1",
    });
    assert.equal(started.ok, true);
    assert.ok(started.intentId);
    assert.ok(started.debugCode);

    const verified = await service.verify({
      intentId: started.intentId!,
      code: started.debugCode!,
    });
    assert.equal(verified.ok, false);
    assert.equal(verified.state, "conflict");
    assert.equal(verified.conflictReason, "existing_account");
    assert.equal(verified.nextAction, "login");
  } finally {
    restoreEnv(snapshot);
  }
});

test("identity intent: ttl expiration moves pending intent to expired", async () => {
  const snapshot = { ...process.env };
  try {
    applyEnv();
    const { service, repo } = makeService();
    const started = await service.start({
      channel: "email",
      email: "ttl@axiom.test",
      ip: "127.0.0.1",
    });
    assert.ok(started.intentId);
    const record = repo.intents.get(started.intentId!);
    assert.ok(record);
    record!.expiresAt = new Date(Date.now() - 1_000).toISOString();

    const status = await service.getStatus(started.intentId!);
    assert.equal(status.state, "expired");
    assert.equal(status.canConsume, false);
  } finally {
    restoreEnv(snapshot);
  }
});

test("identity intent: expired intent cannot be verified (anti-replay)", async () => {
  const snapshot = { ...process.env };
  try {
    applyEnv();
    const { service, repo } = makeService();
    const started = await service.start({
      channel: "email",
      email: "replay@axiom.test",
      ip: "127.0.0.1",
    });
    assert.ok(started.intentId);
    assert.ok(started.debugCode);
    const record = repo.intents.get(started.intentId!);
    assert.ok(record);
    record!.expiresAt = new Date(Date.now() - 1_000).toISOString();

    const firstAttempt = await service.verify({
      intentId: started.intentId!,
      code: started.debugCode!,
    });
    assert.equal(firstAttempt.ok, false);
    assert.equal(firstAttempt.state, "expired");

    const replayAttempt = await service.verify({
      intentId: started.intentId!,
      code: started.debugCode!,
    });
    assert.equal(replayAttempt.ok, false);
    assert.equal(replayAttempt.state, "expired");
    assert.equal(replayAttempt.nextAction, "restart");
  } finally {
    restoreEnv(snapshot);
  }
});
