import crypto from "node:crypto";
import { HttpException, Injectable, OnModuleInit } from "@nestjs/common";
import { getApiRuntimeConfig } from "../config/runtime.config";
import { ensureId, normalizeEmail, validateEmailFormat } from "../purchases/purchases.helpers";
import { RedisService } from "../redis/redis.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AuthRepository } from "./auth.repository";
import {
  type AuthIdentityIntentChannel,
  type AuthIdentityIntentConflictReason,
  type AuthIdentityIntentPurchaseResolutionDto,
  type AuthIdentityIntentStartResponseDto,
  type AuthIdentityIntentState,
  type AuthIdentityIntentStatusResponseDto,
  type AuthIdentityIntentVerifyResponseDto,
} from "./auth.types";
import {
  AuthIdentityIntentRepository,
  type AuthIdentityIntentRecord,
} from "./auth.identity-intent.repository";

const IDENTITY_INTENT_CHANNELS: AuthIdentityIntentChannel[] = [
  "email",
  "google",
  "yandex",
  "vk",
];

const buildEmailVerificationCode = () =>
  `${Math.floor(100000 + Math.random() * 900000)}`;

const hashSensitive = (value: string, pepper: string) =>
  crypto.createHash("sha256").update(`${value}:${pepper}`).digest("hex");

const nowIso = () => new Date().toISOString();

@Injectable()
export class AuthIdentityIntentService implements OnModuleInit {
  private readonly runtimeConfig = getApiRuntimeConfig();

  constructor(
    private readonly identityIntentRepository: AuthIdentityIntentRepository,
    private readonly authRepository: AuthRepository,
    private readonly notificationsService: NotificationsService,
    private readonly redisService: RedisService
  ) {}

  async onModuleInit() {
    await this.identityIntentRepository.ensureSchema();
  }

  async start(params: {
    channel?: string;
    email?: string;
    ip?: string;
    metadata?: Record<string, unknown>;
  }): Promise<AuthIdentityIntentStartResponseDto> {
    this.ensureFeatureEnabled();
    const channel = this.parseChannel(params.channel);
    if (channel !== "email") {
      return {
        ok: false,
        intentId: null,
        state: "conflict",
        expiresAt: null,
        message: "Этот канал pre-verification пока не поддержан.",
      };
    }

    const email = normalizeEmail(params.email);
    const uniformMessage =
      "Если email корректен, мы отправили код подтверждения identity.";
    if (!email || !validateEmailFormat(email)) {
      return {
        ok: true,
        intentId: null,
        state: "pending",
        expiresAt: null,
        message: uniformMessage,
        debugCode: null,
      };
    }

    const ip = (params.ip || "unknown").trim() || "unknown";
    const ttlSec = 60 * 60;
    const [emailCount, ipCount] = await Promise.all([
      this.redisService.incrementWithTtl(
        `auth:identity-intent:start:email:${email}`,
        ttlSec
      ),
      this.redisService.incrementWithTtl(`auth:identity-intent:start:ip:${ip}`, ttlSec),
    ]);

    if (
      emailCount > this.runtimeConfig.authIdentityIntentRateLimitPerHour ||
      ipCount > this.runtimeConfig.authIdentityIntentRateLimitPerHour
    ) {
      return {
        ok: true,
        intentId: null,
        state: "pending",
        expiresAt: null,
        message: uniformMessage,
        debugCode: null,
      };
    }

    const code = buildEmailVerificationCode();
    const codeHash = hashSensitive(code, this.runtimeConfig.authPasswordPepper);
    const now = nowIso();
    const expiresAt = new Date(
      Date.now() + this.runtimeConfig.authIdentityIntentTtlSec * 1000
    ).toISOString();
    await this.identityIntentRepository.expireActiveByIdentity({
      channel: "email",
      identityValue: email,
      now,
    });
    const intent = await this.identityIntentRepository.createPendingEmailIntent({
      id: ensureId("intent"),
      email,
      codeHash,
      expiresAt,
      maxAttempts: this.runtimeConfig.authIdentityIntentMaxAttempts,
      metadata: params.metadata,
    });

    await this.notificationsService.enqueueAndDispatch({
      id: ensureId("outbox"),
      template: "login_hint",
      dedupeKey: `identity_intent:email:${intent.id}:${intent.expiresAt}`,
      recipientEmail: email,
      payload: {
        purpose: "identity_intent_email_verify",
        intentId: intent.id,
        expiresAt: intent.expiresAt,
        code,
      },
    });

    return {
      ok: true,
      intentId: intent.id,
      state: "pending",
      expiresAt: intent.expiresAt,
      message: uniformMessage,
      debugCode: this.runtimeConfig.authDebugTokens ? code : null,
    };
  }

  async verify(params: {
    intentId?: string;
    code?: string;
  }): Promise<AuthIdentityIntentVerifyResponseDto> {
    this.ensureFeatureEnabled();
    const intentId = params.intentId?.trim() || "";
    const code = params.code?.trim() || "";
    if (!intentId || !code) {
      return {
        ok: false,
        intentId: intentId || null,
        state: "pending",
        expiresAt: null,
        message: "Введите intentId и код подтверждения.",
      };
    }

    const loaded = await this.identityIntentRepository.findById(intentId);
    if (!loaded) {
      return {
        ok: false,
        intentId: null,
        state: "expired",
        expiresAt: null,
        message: "Intent недействителен или истек.",
        nextAction: "restart",
      };
    }

    const intent = await this.materializeLifecycleState(loaded);
    if (intent.verificationState === "consumed") {
      return {
        ok: false,
        intentId: intent.id,
        state: "consumed",
        expiresAt: intent.expiresAt,
        message: "Intent уже использован. Начните заново.",
        nextAction: "restart",
      };
    }
    if (intent.verificationState === "expired") {
      return {
        ok: false,
        intentId: intent.id,
        state: "expired",
        expiresAt: intent.expiresAt,
        message: "Intent недействителен или истек.",
        nextAction: "restart",
      };
    }
    if (intent.verificationState === "conflict") {
      return {
        ok: false,
        intentId: intent.id,
        state: "conflict",
        expiresAt: intent.expiresAt,
        message:
          "Identity в конфликтном состоянии. Войдите в существующий кабинет или начните заново.",
        conflictReason: intent.conflictReason ?? "unknown",
        nextAction: "login",
      };
    }
    if (intent.verificationState === "verified") {
      return {
        ok: true,
        intentId: intent.id,
        state: "verified",
        expiresAt: intent.expiresAt,
        message: "Identity подтвержден.",
      };
    }

    if (intent.channel !== "email" || !intent.challengeCodeHash) {
      const conflicted = await this.identityIntentRepository.markConflict({
        intentId: intent.id,
        now: nowIso(),
        reason: "channel_not_supported",
      });
      return {
        ok: false,
        intentId: intent.id,
        state: conflicted?.verificationState ?? "conflict",
        expiresAt: intent.expiresAt,
        message: "Этот канал pre-verification пока не поддержан.",
        conflictReason: "channel_not_supported",
      };
    }

    const candidateHash = hashSensitive(code, this.runtimeConfig.authPasswordPepper);
    if (candidateHash !== intent.challengeCodeHash) {
      const updated = await this.identityIntentRepository.incrementChallengeAttempts({
        intentId: intent.id,
        now: nowIso(),
      });
      const attempts = updated?.challengeAttempts ?? intent.challengeAttempts + 1;
      const maxAttempts = updated?.challengeMaxAttempts ?? intent.challengeMaxAttempts;
      if (attempts >= maxAttempts) {
        await this.identityIntentRepository.markExpired({
          intentId: intent.id,
          now: nowIso(),
        });
        return {
          ok: false,
          intentId: intent.id,
          state: "expired",
          expiresAt: intent.expiresAt,
          message: "Intent недействителен или истек.",
          nextAction: "restart",
        };
      }
      return {
        ok: false,
        intentId: intent.id,
        state: "pending",
        expiresAt: intent.expiresAt,
        message: "Неверный код подтверждения.",
      };
    }

    const email = intent.identityEmail ?? intent.identityValue;
    const existingUser = await this.authRepository.findByEmail(email);
    if (existingUser) {
      await this.identityIntentRepository.markConflict({
        intentId: intent.id,
        now: nowIso(),
        reason: "existing_account",
        existingUserId: existingUser.id,
      });
      return {
        ok: false,
        intentId: intent.id,
        state: "conflict",
        expiresAt: intent.expiresAt,
        message: "Для этого email уже существует кабинет. Войдите в аккаунт.",
        conflictReason: "existing_account",
        nextAction: "login",
      };
    }

    const verified = await this.identityIntentRepository.markVerified({
      intentId: intent.id,
      now: nowIso(),
    });
    return {
      ok: true,
      intentId: intent.id,
      state: verified?.verificationState ?? "verified",
      expiresAt: verified?.expiresAt ?? intent.expiresAt,
      message: "Identity подтвержден.",
    };
  }

  async getStatus(intentIdRaw: string): Promise<AuthIdentityIntentStatusResponseDto> {
    this.ensureFeatureEnabled();
    const intentId = intentIdRaw.trim();
    if (!intentId) {
      throw new HttpException({ error: "intentId обязателен." }, 400);
    }
    const loaded = await this.identityIntentRepository.findById(intentId);
    if (!loaded) {
      throw new HttpException({ error: "Intent не найден." }, 404);
    }
    const intent = await this.materializeLifecycleState(loaded);
    return {
      ok: true,
      intentId: intent.id,
      channel: intent.channel,
      state: intent.verificationState,
      expiresAt: intent.expiresAt,
      verifiedAt: intent.verifiedAt ?? null,
      consumedAt: intent.consumedAt ?? null,
      conflictReason: intent.conflictReason,
      canConsume: intent.verificationState === "verified",
    };
  }

  async resolveVerifiedForPurchase(
    intentIdRaw: string
  ): Promise<AuthIdentityIntentPurchaseResolutionDto> {
    this.ensureFeatureEnabled();
    const intentId = intentIdRaw.trim();
    if (!intentId) {
      throw new HttpException(
        {
          error: "Для checkout требуется подтвержденный identity intent.",
          code: "identity_intent_required",
        },
        400
      );
    }

    const loaded = await this.identityIntentRepository.findById(intentId);
    if (!loaded) {
      throw new HttpException(
        {
          error: "Identity intent недействителен или устарел.",
          code: "identity_intent_invalid",
        },
        409
      );
    }

    const intent = await this.materializeLifecycleState(loaded);
    if (intent.verificationState === "verified") {
      const email = normalizeEmail(intent.identityEmail ?? intent.identityValue);
      if (!email || !validateEmailFormat(email)) {
        throw new HttpException(
          {
            error: "Identity intent содержит некорректный identity context.",
            code: "identity_intent_context_invalid",
          },
          409
        );
      }

      return {
        intentId: intent.id,
        channel: intent.channel,
        email,
        verifiedAt: intent.verifiedAt ?? null,
        expiresAt: intent.expiresAt,
      };
    }

    const codeByState: Record<AuthIdentityIntentState, string> = {
      pending: "identity_intent_not_verified",
      verified: "identity_intent_not_verified",
      expired: "identity_intent_expired",
      consumed: "identity_intent_consumed",
      conflict: "identity_intent_conflict",
    };

    throw new HttpException(
      {
        error: "Identity intent недействителен или устарел.",
        code: codeByState[intent.verificationState],
      },
      409
    );
  }

  async consume(intentIdRaw: string): Promise<{
    ok: boolean;
    intentId: string | null;
    state: AuthIdentityIntentState;
    message: string;
    conflictReason?: AuthIdentityIntentConflictReason;
  }> {
    this.ensureFeatureEnabled();
    const intentId = intentIdRaw.trim();
    if (!intentId) {
      return {
        ok: false,
        intentId: null,
        state: "pending",
        message: "intentId обязателен.",
      };
    }
    const loaded = await this.identityIntentRepository.findById(intentId);
    if (!loaded) {
      return {
        ok: false,
        intentId: null,
        state: "expired",
        message: "Intent недействителен или истек.",
      };
    }
    const intent = await this.materializeLifecycleState(loaded);
    if (intent.verificationState === "consumed") {
      return {
        ok: false,
        intentId: intent.id,
        state: "consumed",
        message: "Intent уже использован.",
      };
    }
    if (intent.verificationState !== "verified") {
      return {
        ok: false,
        intentId: intent.id,
        state: intent.verificationState,
        message: "Intent не готов к consume.",
        conflictReason: intent.conflictReason,
      };
    }

    const consumed = await this.identityIntentRepository.consumeVerifiedIntent({
      intentId: intent.id,
      now: nowIso(),
    });
    if (!consumed) {
      return {
        ok: false,
        intentId: intent.id,
        state: "consumed",
        message: "Intent уже использован.",
      };
    }
    return {
      ok: true,
      intentId: consumed.id,
      state: consumed.verificationState,
      message: "Intent помечен как consumed.",
    };
  }

  private ensureFeatureEnabled() {
    if (!this.runtimeConfig.authIdentityIntentsEnabled) {
      throw new HttpException(
        {
          error: "Identity intents отключены в этом runtime.",
          code: "identity_intents_disabled",
        },
        404
      );
    }
  }

  private parseChannel(raw: string | undefined): AuthIdentityIntentChannel {
    const value = raw?.trim().toLowerCase() || "email";
    if (IDENTITY_INTENT_CHANNELS.includes(value as AuthIdentityIntentChannel)) {
      return value as AuthIdentityIntentChannel;
    }
    throw new HttpException(
      {
        error: "Неподдерживаемый канал identity verification.",
        code: "channel_not_supported",
      },
      400
    );
  }

  private async materializeLifecycleState(
    intent: AuthIdentityIntentRecord
  ): Promise<AuthIdentityIntentRecord> {
    if (
      (intent.verificationState === "pending" || intent.verificationState === "verified") &&
      this.isExpired(intent.expiresAt)
    ) {
      const expired = await this.identityIntentRepository.markExpired({
        intentId: intent.id,
        now: nowIso(),
      });
      if (expired) return expired;
      return {
        ...intent,
        verificationState: "expired",
      };
    }
    return intent;
  }

  private isExpired(expiresAt: string) {
    const expiresAtMs = Date.parse(expiresAt);
    return !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now();
  }
}
