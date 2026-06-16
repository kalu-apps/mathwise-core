import crypto from "node:crypto";
import { Injectable } from "@nestjs/common";
import { getApiRuntimeConfig } from "../config/runtime.config";
import { RedisService } from "../redis/redis.service";
import type { StoredSession } from "./auth.types";

const SESSION_PREFIX = "auth:session:";
const ACTIVE_SESSION_PREFIX = "auth:active-session:";
const MAGIC_CODE_PREFIX = "auth:magic:";
const MAGIC_CODE_TTL_SEC = 10 * 60;
const MAGIC_CODE_MAX_ATTEMPTS = 6;
const SECOND_MS = 1000;

export type CreateSessionResult =
  | {
      ok: true;
      session: StoredSession;
    }
  | {
      ok: false;
      reason: "already_active";
      activeSessionId: string | null;
    };

type StoredMagicCode = {
  code: string;
  userId: string;
  attempts: number;
  issuedAt: string;
  expiresAt: string;
};

const ensureId = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `sid_${Math.random().toString(36).slice(2, 10)}`;

const nowIso = () => new Date().toISOString();

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const createMagicCode = () => `${Math.floor(100000 + Math.random() * 900000)}`;

@Injectable()
export class SessionStore {
  private readonly runtimeConfig = getApiRuntimeConfig();

  constructor(private readonly redisService: RedisService) {}

  async createSession(userId: string): Promise<CreateSessionResult> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const activeSession = await this.readActiveSession(userId);
      if (activeSession) {
        return {
          ok: false,
          reason: "already_active",
          activeSessionId: activeSession.id,
        };
      }

      const session = this.buildSession(userId);
      const ttlSec = this.getSessionTtlSec(session);
      await this.redisService.set(
        this.sessionKey(session.id),
        JSON.stringify(session),
        ttlSec
      );

      const claimed = await this.redisService.setIfAbsent(
        this.activeSessionKey(userId),
        session.id,
        ttlSec
      );
      if (claimed) {
        return { ok: true, session };
      }

      await this.redisService.del(this.sessionKey(session.id));
    }

    const activeSessionId = await this.redisService.get(this.activeSessionKey(userId));
    return {
      ok: false,
      reason: "already_active",
      activeSessionId,
    };
  }

  async readSession(sessionId: string): Promise<StoredSession | null> {
    const raw = await this.redisService.get(this.sessionKey(sessionId));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<StoredSession>;
      if (
        !parsed ||
        typeof parsed !== "object" ||
        typeof parsed.id !== "string" ||
        typeof parsed.userId !== "string" ||
        typeof parsed.issuedAt !== "string" ||
        typeof parsed.expiresAt !== "string"
      ) {
        return null;
      }

      const issuedAtMs = Date.parse(parsed.issuedAt);
      const expiresAtMs = Date.parse(parsed.expiresAt);
      if (!Number.isFinite(issuedAtMs) || !Number.isFinite(expiresAtMs)) {
        return null;
      }

      const lastActivityAt =
        typeof parsed.lastActivityAt === "string" &&
        Number.isFinite(Date.parse(parsed.lastActivityAt))
          ? parsed.lastActivityAt
          : parsed.issuedAt;
      const lastActivityAtMs = Date.parse(lastActivityAt);
      const idleExpiresAt =
        typeof parsed.idleExpiresAt === "string" &&
        Number.isFinite(Date.parse(parsed.idleExpiresAt))
          ? parsed.idleExpiresAt
          : new Date(
              lastActivityAtMs +
                this.runtimeConfig.authSessionIdleTimeoutSec * SECOND_MS
            ).toISOString();

      return {
        id: parsed.id,
        userId: parsed.userId,
        issuedAt: parsed.issuedAt,
        lastActivityAt,
        expiresAt: parsed.expiresAt,
        idleExpiresAt,
      };
    } catch {
      return null;
    }
  }

  async revokeSession(sessionId: string): Promise<void> {
    const session = await this.readSession(sessionId);
    await this.redisService.del(this.sessionKey(sessionId));
    if (session) {
      await this.redisService.releaseLock(
        this.activeSessionKey(session.userId),
        session.id
      );
    }
  }

  isSessionExpired(session: StoredSession, nowMs = Date.now()): boolean {
    const expiresAtMs = Date.parse(session.expiresAt);
    const idleExpiresAtMs = Date.parse(session.idleExpiresAt);
    return (
      !Number.isFinite(expiresAtMs) ||
      !Number.isFinite(idleExpiresAtMs) ||
      expiresAtMs <= nowMs ||
      idleExpiresAtMs <= nowMs
    );
  }

  async isActiveSession(session: StoredSession): Promise<boolean> {
    if (this.isSessionExpired(session)) {
      await this.revokeSession(session.id);
      return false;
    }

    const activeKey = this.activeSessionKey(session.userId);
    const activeSessionId = await this.redisService.get(activeKey);
    if (!activeSessionId) {
      return this.redisService.setIfAbsent(
        activeKey,
        session.id,
        this.getSessionTtlSec(session)
      );
    }
    if (activeSessionId === session.id) {
      return true;
    }

    const activeSession = await this.readSession(activeSessionId);
    if (
      !activeSession ||
      activeSession.userId !== session.userId ||
      this.isSessionExpired(activeSession)
    ) {
      if (activeSession?.userId === session.userId) {
        await this.revokeSession(activeSession.id);
      } else {
        await this.redisService.releaseLock(activeKey, activeSessionId);
      }
      return this.redisService.setIfAbsent(
        activeKey,
        session.id,
        this.getSessionTtlSec(session)
      );
    }

    return false;
  }

  async touchSessionActivity(session: StoredSession): Promise<StoredSession | null> {
    if (!(await this.isActiveSession(session))) {
      return null;
    }

    const nowMs = Date.now();
    if (this.isSessionExpired(session, nowMs)) {
      await this.revokeSession(session.id);
      return null;
    }

    const activeKey = this.activeSessionKey(session.userId);
    const activeSessionId = await this.redisService.get(activeKey);
    if (activeSessionId !== session.id) {
      return null;
    }
    const sessionKey = this.sessionKey(session.id);
    const currentRaw = await this.redisService.get(sessionKey);
    if (!currentRaw) {
      return null;
    }
    const currentSession = await this.readSession(session.id);
    if (
      !currentSession ||
      currentSession.userId !== session.userId ||
      currentSession.id !== session.id ||
      this.isSessionExpired(currentSession, nowMs)
    ) {
      return null;
    }

    const absoluteExpiresAtMs = Date.parse(session.expiresAt);
    const idleExpiresAtMs = Math.min(
      absoluteExpiresAtMs,
      nowMs + this.runtimeConfig.authSessionIdleTimeoutSec * SECOND_MS
    );
    const updated: StoredSession = {
      ...session,
      lastActivityAt: new Date(nowMs).toISOString(),
      idleExpiresAt: new Date(idleExpiresAtMs).toISOString(),
    };
    const ttlSec = this.getSessionTtlSec(updated, nowMs);
    const updatedRaw = JSON.stringify(updated);
    const sessionUpdated = await this.redisService.setIfValue(
      sessionKey,
      currentRaw,
      updatedRaw,
      ttlSec
    );
    if (!sessionUpdated) {
      const latestSession = await this.readSession(session.id);
      const latestActiveSessionId = await this.redisService.get(activeKey);
      if (
        latestSession &&
        latestActiveSessionId === session.id &&
        !this.isSessionExpired(latestSession)
      ) {
        return latestSession;
      }
      return null;
    }
    const activeRefreshed = await this.redisService.setIfValue(
      activeKey,
      updated.id,
      updated.id,
      ttlSec
    );
    if (!activeRefreshed) {
      await this.redisService.del(sessionKey);
      return null;
    }
    return updated;
  }

  private async readActiveSession(userId: string): Promise<StoredSession | null> {
    const activeKey = this.activeSessionKey(userId);
    const activeSessionId = await this.redisService.get(activeKey);
    if (!activeSessionId) return null;

    const activeSession = await this.readSession(activeSessionId);
    if (
      !activeSession ||
      activeSession.userId !== userId ||
      this.isSessionExpired(activeSession)
    ) {
      if (activeSession?.userId === userId) {
        await this.revokeSession(activeSession.id);
      } else {
        await this.redisService.releaseLock(activeKey, activeSessionId);
      }
      return null;
    }

    return activeSession;
  }

  private buildSession(userId: string): StoredSession {
    const issuedAtMs = Date.now();
    const issuedAt = new Date(issuedAtMs).toISOString();
    const absoluteExpiresAtMs =
      issuedAtMs + this.runtimeConfig.authSessionTtlSec * SECOND_MS;
    const idleExpiresAtMs = Math.min(
      absoluteExpiresAtMs,
      issuedAtMs + this.runtimeConfig.authSessionIdleTimeoutSec * SECOND_MS
    );
    return {
      id: ensureId(),
      userId,
      issuedAt,
      lastActivityAt: issuedAt,
      expiresAt: new Date(absoluteExpiresAtMs).toISOString(),
      idleExpiresAt: new Date(idleExpiresAtMs).toISOString(),
    };
  }

  private getSessionTtlSec(session: StoredSession, nowMs = Date.now()): number {
    const expiresAtMs = Date.parse(session.expiresAt);
    const idleExpiresAtMs = Date.parse(session.idleExpiresAt);
    const remainingMs = Math.min(expiresAtMs, idleExpiresAtMs) - nowMs;
    if (!Number.isFinite(remainingMs)) {
      return 1;
    }
    return Math.max(1, Math.ceil(remainingMs / SECOND_MS));
  }

  private sessionKey(sessionId: string): string {
    return `${SESSION_PREFIX}${sessionId}`;
  }

  private activeSessionKey(userId: string): string {
    return `${ACTIVE_SESSION_PREFIX}${userId}`;
  }

  async issueMagicCode(email: string, userId: string) {
    const normalizedEmail = normalizeEmail(email);
    const issuedAt = nowIso();
    const expiresAt = new Date(Date.now() + MAGIC_CODE_TTL_SEC * 1000).toISOString();
    const code = createMagicCode();
    const payload: StoredMagicCode = {
      code,
      userId,
      attempts: 0,
      issuedAt,
      expiresAt,
    };
    await this.redisService.set(
      `${MAGIC_CODE_PREFIX}${normalizedEmail}`,
      JSON.stringify(payload),
      MAGIC_CODE_TTL_SEC
    );
    return {
      rawCode: code,
      expiresAt,
    };
  }

  async confirmMagicCode(params: {
    email: string;
    code: string;
  }): Promise<
    | {
        ok: true;
        userId: string;
      }
    | {
        ok: false;
        reason: "not_found" | "expired" | "invalid_code" | "too_many_attempts";
      }
  > {
    const normalizedEmail = normalizeEmail(params.email);
    const key = `${MAGIC_CODE_PREFIX}${normalizedEmail}`;
    const raw = await this.redisService.get(key);
    if (!raw) {
      return { ok: false, reason: "not_found" };
    }

    let parsed: StoredMagicCode;
    try {
      parsed = JSON.parse(raw) as StoredMagicCode;
    } catch {
      await this.redisService.del(key);
      return { ok: false, reason: "not_found" };
    }

    const nowMs = Date.now();
    const expiresMs = Date.parse(parsed.expiresAt);
    if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) {
      await this.redisService.del(key);
      return { ok: false, reason: "expired" };
    }

    if (parsed.attempts >= MAGIC_CODE_MAX_ATTEMPTS) {
      await this.redisService.del(key);
      return { ok: false, reason: "too_many_attempts" };
    }

    if (params.code.trim() !== parsed.code) {
      const nextAttempts = parsed.attempts + 1;
      if (nextAttempts >= MAGIC_CODE_MAX_ATTEMPTS) {
        await this.redisService.del(key);
        return { ok: false, reason: "too_many_attempts" };
      }
      await this.redisService.set(
        key,
        JSON.stringify({
          ...parsed,
          attempts: nextAttempts,
        }),
        Math.max(1, Math.floor((expiresMs - nowMs) / 1000))
      );
      return { ok: false, reason: "invalid_code" };
    }

    await this.redisService.del(key);
    return { ok: true, userId: parsed.userId };
  }
}
