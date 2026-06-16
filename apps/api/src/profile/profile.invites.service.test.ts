import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import { ProfileService } from "./profile.service";
import type { AuthUserDto } from "../auth/auth.types";

const hashInviteToken = (token: string, pepper: string) =>
  crypto
    .createHash("sha256")
    .update(`teacher_invite:${token}:${pepper}`)
    .digest("hex");

let envSnapshot: Record<string, string | undefined> = {};

test.beforeEach(() => {
  envSnapshot = { ...process.env };
  process.env.APP_ENV = "local";
  process.env.DATABASE_URL = "postgres://local:local@127.0.0.1:5432/mathwise_test";
  process.env.REDIS_URL = "redis://127.0.0.1:6379";
  process.env.TEACHER_INVITES_ENABLED = "true";
  process.env.TEACHER_INVITE_TTL_SEC = "86400";
  process.env.AUTH_PASSWORD_PEPPER = "pepper-test";
  process.env.API_CORS_ORIGIN = "https://stage.mathwise.ru";
});

test.afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in envSnapshot)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(envSnapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

const teacherActor: AuthUserDto = {
  id: "teacher_1",
  email: "teacher@example.com",
  firstName: "Teach",
  lastName: "Er",
  role: "teacher",
};

const studentActor: AuthUserDto = {
  id: "student_1",
  email: "student@example.com",
  firstName: "Stu",
  lastName: "Dent",
  role: "student",
};

const createService = (overrides?: {
  profileRepository?: Record<string, unknown>;
  authRepository?: Record<string, unknown>;
  authService?: Record<string, unknown>;
  sessionStore?: Record<string, unknown>;
}) => {
  const profileRepository = {
    ensureSchema: async () => undefined,
    hasAnyProfileData: async () => false,
    attachGuestBookingsToStudentByEmail: async () => 0,
    findPurchasesByUser: async () => [],
    findBookingsByStudent: async () => [],
    findTeacherAvailabilityByTeacherIds: async () => [],
    findBookingsByTeacher: async () => [],
    findTeacherAvailabilityByTeacherId: async () => [],
    findTeacherRelationStudentIds: async () => [],
    createTeacherInvite: async (params: Record<string, unknown>) => ({
      id: String(params.id),
      teacherId: String(params.teacherId),
      status: "active",
      targetEmailCanonical:
        typeof params.targetEmailCanonical === "string"
          ? params.targetEmailCanonical
          : undefined,
      note: typeof params.note === "string" ? params.note : undefined,
      maxUses: 1,
      useCount: 0,
      createdAt: String(params.createdAt),
      expiresAt: String(params.expiresAt),
    }),
    findTeacherInviteByTokenHash: async () => null,
    markTeacherInviteExpired: async () => null,
    consumeTeacherInviteAndLinkStudentAtomic: async () => ({ outcome: "missing" as const }),
    ...(overrides?.profileRepository ?? {}),
  };

  const authRepository = {
    findById: async () => null,
    findByRole: async () => [],
    findByEmail: async () => null,
    ...(overrides?.authRepository ?? {}),
  };

  const authService = {
    ensureUserByEmail: async () => ({ user: studentActor, isNew: true }),
    setPassword: async () => ({ ok: true, message: "ok" }),
    syncIdentityCompletionAfterPurchase: async () => undefined,
    ...(overrides?.authService ?? {}),
  };

  const sessionStore = {
    createSession: async () => ({
      ok: true as const,
      session: {
        id: "sid_1",
        userId: studentActor.id,
        issuedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        idleExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      },
    }),
    ...(overrides?.sessionStore ?? {}),
  };

  const databaseService = {
    execute: async () => undefined,
    query: async () => [],
  };

  const coursesRepository = {
    findAllPublishedCatalog: async () => [],
    findAllDraftsByTeacher: async () => [],
  };

  const lessonsRepository = {
    findPublishedAll: async () => [],
    findDraftByCourse: async () => [],
  };

  return new ProfileService(
    databaseService as never,
    profileRepository as never,
    authRepository as never,
    coursesRepository as never,
    lessonsRepository as never,
    undefined,
    authService as never,
    sessionStore as never
  );
};

test("teacher invite: teacher can create invite and token is persisted hashed", async () => {
  let capturedTokenHash = "";
  const service = createService({
    profileRepository: {
      createTeacherInvite: async (params: Record<string, unknown>) => {
        capturedTokenHash = String(params.tokenHash ?? "");
        return {
          id: String(params.id),
          teacherId: String(params.teacherId),
          status: "active",
          maxUses: 1,
          useCount: 0,
          createdAt: String(params.createdAt),
          expiresAt: String(params.expiresAt),
        };
      },
    },
  });

  const created = await service.createTeacherInvite({
    actorUser: teacherActor,
    payload: { targetEmail: "student@example.com", note: "new student" },
  });

  assert.equal(created.ok, true);
  assert.ok(created.inviteUrl.startsWith("https://stage.mathwise.ru/invite?token="));
  const token = new URL(created.inviteUrl).searchParams.get("token") ?? "";
  assert.ok(token.length > 20);
  assert.equal(capturedTokenHash, hashInviteToken(token, "pepper-test"));
  assert.notEqual(capturedTokenHash, token);
});

test("teacher invite: inspect returns expired and marks invite", async () => {
  let expiredMarked = false;
  const service = createService({
    profileRepository: {
      findTeacherInviteByTokenHash: async () => ({
        id: "invite_1",
        teacherId: "teacher_1",
        tokenHash: "h",
        status: "active",
        targetEmailCanonical: null,
        note: null,
        maxUses: 1,
        useCount: 0,
        createdAt: new Date(Date.now() - 7200_000).toISOString(),
        expiresAt: new Date(Date.now() - 3600_000).toISOString(),
        consumedAt: null,
        consumedByUserId: null,
        revokedAt: null,
        metadata: {},
        teacherFirstName: "Teach",
        teacherLastName: "Er",
        teacherPhoto: null,
      }),
      markTeacherInviteExpired: async () => {
        expiredMarked = true;
        return null;
      },
    },
  });

  const inspected = await service.inspectTeacherInvite("token_1");
  assert.equal(inspected.status, "expired");
  assert.equal(inspected.canAccept, false);
  assert.equal(expiredMarked, true);
});

test("teacher invite: authenticated student can consume invite once", async () => {
  const service = createService({
    profileRepository: {
      findTeacherInviteByTokenHash: async () => ({
        id: "invite_1",
        teacherId: "teacher_1",
        tokenHash: "h",
        status: "active",
        targetEmailCanonical: null,
        note: null,
        maxUses: 1,
        useCount: 0,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        consumedAt: null,
        consumedByUserId: null,
        revokedAt: null,
        metadata: {},
        teacherFirstName: "Teach",
        teacherLastName: "Er",
        teacherPhoto: null,
      }),
      consumeTeacherInviteAndLinkStudentAtomic: async () => ({
        outcome: "consumed" as const,
        invite: {
          id: "invite_1",
          teacherId: "teacher_1",
          status: "consumed",
          maxUses: 1,
          useCount: 1,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          consumedAt: new Date().toISOString(),
          consumedByUserId: "student_1",
        },
      }),
    },
  });

  const accepted = await service.acceptTeacherInvite({
    actorUser: studentActor,
    payload: { token: "token_1" },
  });

  assert.equal(accepted.ok, true);
  assert.equal(accepted.studentId, "student_1");
  assert.equal(accepted.sessionEstablished, false);
});

test("teacher invite: consumed by another user is blocked", async () => {
  const service = createService({
    profileRepository: {
      findTeacherInviteByTokenHash: async () => ({
        id: "invite_1",
        teacherId: "teacher_1",
        tokenHash: "h",
        status: "active",
        targetEmailCanonical: null,
        note: null,
        maxUses: 1,
        useCount: 0,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        consumedAt: null,
        consumedByUserId: null,
        revokedAt: null,
        metadata: {},
        teacherFirstName: "Teach",
        teacherLastName: "Er",
        teacherPhoto: null,
      }),
      consumeTeacherInviteAndLinkStudentAtomic: async () => ({
        outcome: "already_consumed" as const,
        invite: {
          id: "invite_1",
          teacherId: "teacher_1",
          status: "consumed",
          maxUses: 1,
          useCount: 1,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          consumedAt: new Date().toISOString(),
          consumedByUserId: "student_other",
        },
      }),
    },
  });

  await assert.rejects(
    () =>
      service.acceptTeacherInvite({
        actorUser: studentActor,
        payload: { token: "token_1" },
      }),
    (error: unknown) => {
      if (!(error instanceof HttpException)) return false;
      if (error.getStatus() !== 409) return false;
      const response = error.getResponse() as { code?: string };
      return response.code === "invite_consumed";
    }
  );
});

test("teacher invite: registration path creates session for new student", async () => {
  let ensureCalled = 0;
  let passwordSetCalled = 0;
  let completionSyncCalled = 0;
  let createdSessionFor = "";

  const service = createService({
    profileRepository: {
      findTeacherInviteByTokenHash: async () => ({
        id: "invite_1",
        teacherId: "teacher_1",
        tokenHash: "h",
        status: "active",
        targetEmailCanonical: "student@example.com",
        note: null,
        maxUses: 1,
        useCount: 0,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        consumedAt: null,
        consumedByUserId: null,
        revokedAt: null,
        metadata: {},
        teacherFirstName: "Teach",
        teacherLastName: "Er",
        teacherPhoto: null,
      }),
      consumeTeacherInviteAndLinkStudentAtomic: async () => ({
        outcome: "consumed" as const,
      }),
    },
    authRepository: {
      findByEmail: async () => null,
    },
    authService: {
      ensureUserByEmail: async () => {
        ensureCalled += 1;
        return {
          user: {
            id: "student_22",
            email: "student@example.com",
            firstName: "New",
            lastName: "Student",
            role: "student",
          },
          isNew: true,
        };
      },
      setPassword: async () => {
        passwordSetCalled += 1;
        return { ok: true, message: "ok" };
      },
      syncIdentityCompletionAfterPurchase: async () => {
        completionSyncCalled += 1;
      },
    },
    sessionStore: {
      createSession: async (userId: string) => {
        createdSessionFor = userId;
        return {
          ok: true as const,
          session: {
            id: "sid_created",
            userId,
            issuedAt: new Date().toISOString(),
            lastActivityAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
            idleExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          },
        };
      },
    },
  });

  const accepted = await service.acceptTeacherInvite({
    actorUser: null,
    payload: {
      token: "token_1",
      registration: {
        email: "student@example.com",
        firstName: "New",
        lastName: "Student",
        password: "StrongPass123!",
      },
    },
  });

  assert.equal(accepted.ok, true);
  assert.equal(accepted.studentId, "student_22");
  assert.equal(accepted.sessionEstablished, true);
  assert.equal(accepted.sessionId, "sid_created");
  assert.equal(ensureCalled, 1);
  assert.equal(passwordSetCalled, 1);
  assert.equal(completionSyncCalled, 1);
  assert.equal(createdSessionFor, "student_22");
});

test("teacher invite: existing account with password requires login and avoids duplicate", async () => {
  let ensureCalled = 0;
  const service = createService({
    profileRepository: {
      findTeacherInviteByTokenHash: async () => ({
        id: "invite_1",
        teacherId: "teacher_1",
        tokenHash: "h",
        status: "active",
        targetEmailCanonical: null,
        note: null,
        maxUses: 1,
        useCount: 0,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        consumedAt: null,
        consumedByUserId: null,
        revokedAt: null,
        metadata: {},
        teacherFirstName: "Teach",
        teacherLastName: "Er",
        teacherPhoto: null,
      }),
    },
    authRepository: {
      findByEmail: async () => ({
        id: "student_exists",
        role: "student",
        email: "existing@example.com",
        firstName: "Ex",
        lastName: "Ist",
        phone: null,
        photo: null,
        passwordHash: "hash",
      }),
    },
    authService: {
      ensureUserByEmail: async () => {
        ensureCalled += 1;
        return { user: studentActor, isNew: false };
      },
    },
  });

  await assert.rejects(
    () =>
      service.acceptTeacherInvite({
        actorUser: null,
        payload: {
          token: "token_1",
          registration: {
            email: "existing@example.com",
            password: "StrongPass123!",
          },
        },
      }),
    (error: unknown) => {
      if (!(error instanceof HttpException)) return false;
      if (error.getStatus() !== 409) return false;
      const response = error.getResponse() as { code?: string; nextAction?: string };
      return (
        response.code === "identity_conflict_auth_required" &&
        response.nextAction === "login_required_existing_account"
      );
    }
  );

  assert.equal(ensureCalled, 0);
});
