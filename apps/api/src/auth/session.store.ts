import crypto from "node:crypto";
import { Injectable } from "@nestjs/common";
import { getApiRuntimeConfig } from "../config/runtime.config";
import { RedisService } from "../redis/redis.service";
import type { StoredSession } from "./auth.types";

const SESSION_PREFIX = "auth:session:";
const MAGIC_CODE_PREFIX = "auth:magic:";
const MAGIC_CODE_TTL_SEC = 10 * 60;
const MAGIC_CODE_MAX_ATTEMPTS = 6;

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

  async createSession(userId: string): Promise<StoredSession> {
    const issuedAt = nowIso();
    const expiresAt = new Date(
      Date.now() + this.runtimeConfig.authSessionTtlSec * 1000
    ).toISOString();
    const session: StoredSession = {
      id: ensureId(),
      userId,
      issuedAt,
      expiresAt,
    };
    await this.redisService.set(
      `${SESSION_PREFIX}${session.id}`,
      JSON.stringify(session),
      this.runtimeConfig.authSessionTtlSec
    );
    return session;
  }

  async readSession(sessionId: string): Promise<StoredSession | null> {
    const raw = await this.redisService.get(`${SESSION_PREFIX}${sessionId}`);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as StoredSession;
      if (
        !parsed ||
        typeof parsed !== "object" ||
        typeof parsed.id !== "string" ||
        typeof parsed.userId !== "string" ||
        typeof parsed.expiresAt !== "string"
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.redisService.del(`${SESSION_PREFIX}${sessionId}`);
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
