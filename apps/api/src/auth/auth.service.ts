import crypto from "node:crypto";
import { Injectable, OnModuleInit } from "@nestjs/common";
import { getApiRuntimeConfig } from "../config/runtime.config";
import { DatabaseService } from "../db/database.service";
import { ensureId, normalizeEmail, validateEmailFormat } from "../purchases/purchases.helpers";
import { NotificationsService } from "../notifications/notifications.service";
import { RedisService } from "../redis/redis.service";
import { hashPassword, verifyPassword } from "./auth.password";
import { AuthRepository } from "./auth.repository";
import { readAuthSeedUsers, upsertAuthUsers } from "./auth.seed";
import { SessionStore } from "./session.store";
import type {
  AuthFirstPasswordCompleteResponseDto,
  AuthFirstPasswordStatusResponseDto,
  AuthIdentityCompletionStateDto,
  AuthIdentityCompletionStatusResponseDto,
  AuthLogoutResponseDto,
  AuthPasswordSaveResponseDto,
  AuthPasswordStatusResponseDto,
  AuthPasswordResetResponseDto,
  AuthRecoveryRequestResponseDto,
  AuthRecoveryVerifyResponseDto,
  AuthUserDto,
  RequestMagicCodeResponseDto,
} from "./auth.types";

const normalizePassword = (password: string) => password.normalize("NFKC");

const nowIso = () => new Date().toISOString();

const hashSensitive = (value: string, pepper: string) =>
  crypto.createHash("sha256").update(`${value}:${pepper}`).digest("hex");

const buildRecoveryCode = () => `${Math.floor(100000 + Math.random() * 900000)}`;

const buildOpaqueToken = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replace(/-/g, "")
    : crypto.randomBytes(16).toString("hex");

type PasswordChangeReason = "first_password_set" | "password_changed" | "password_reset";

const SESSION_ALREADY_ACTIVE_CODE = "session_already_active";
const SESSION_ALREADY_ACTIVE_MESSAGE =
  "Этот аккаунт уже открыт на другом устройстве или в другом браузере. Выйдите из предыдущей сессии либо повторите попытку после автоматического выхода при бездействии.";

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly runtimeConfig = getApiRuntimeConfig();

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly authRepository: AuthRepository,
    private readonly sessionStore: SessionStore,
    private readonly notificationsService: NotificationsService,
    private readonly redisService: RedisService
  ) {}

  async onModuleInit() {
    await this.authRepository.ensureSchema();
    if (this.runtimeConfig.coursesSeedOnBoot) {
      const hasUsers = await this.authRepository.hasAnyUsers();
      if (!hasUsers) {
        const seedUsers = readAuthSeedUsers(this.runtimeConfig.coursesSeedSourceFile);
        const seedContainsTeacher = seedUsers.some((user) => user.role === "teacher");
        if (this.runtimeConfig.appEnv !== "local" && seedContainsTeacher) {
          throw new Error(
            "[auth-runtime] Non-local startup blocked: teacher seed users are forbidden. Use TEACHER_BOOTSTRAP_* env bootstrap only."
          );
        }
        const normalized = seedUsers.map((user) => ({
          ...user,
          passwordHash: user.password
            ? hashPassword(user.password, this.runtimeConfig.authPasswordPepper)
            : null,
        }));
        await upsertAuthUsers(
          {
            execute: async (text, params = []) => {
              await this.databaseService.execute(text, params);
            },
          },
          normalized
        );
      }
    }

    if (this.runtimeConfig.teacherBootstrapEnabled) {
      const bootstrapId = `teacher_${hashSensitive(
        this.runtimeConfig.teacherBootstrapEmail,
        this.runtimeConfig.authPasswordPepper
      ).slice(0, 16)}`;
      await this.authRepository.ensureTeacherBootstrap({
        id: bootstrapId,
        email: this.runtimeConfig.teacherBootstrapEmail,
        firstName: this.runtimeConfig.teacherBootstrapFirstName,
        lastName: this.runtimeConfig.teacherBootstrapLastName,
        passwordHash: hashPassword(
          this.runtimeConfig.teacherBootstrapPassword,
          this.runtimeConfig.authPasswordPepper
        ),
      });
    }
  }

  async ensureUserByEmail(params: {
    email: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  }): Promise<{ user: AuthUserDto; isNew: boolean }> {
    const email = normalizeEmail(params.email);
    if (!email || !validateEmailFormat(email)) {
      throw new Error("Некорректный email для привязки пользователя.");
    }

    const existing = await this.authRepository.findByEmail(email);
    if (existing) {
      await this.authRepository.ensureProfileBootstrap({
        userId: existing.id,
        email: existing.email,
        firstName: existing.firstName,
        lastName: existing.lastName,
        phone: existing.phone,
      });
      return {
        user: {
          id: existing.id,
          email: existing.email,
          firstName: existing.firstName,
          lastName: existing.lastName,
          role: existing.role,
          phone: existing.phone,
          photo: existing.photo,
        },
        isNew: false,
      };
    }

    const created = await this.authRepository.createUser({
      id: ensureId("user"),
      email,
      firstName: params.firstName?.trim() || "Ученик",
      lastName: params.lastName?.trim() || "",
      phone: params.phone?.trim() || undefined,
      role: "student",
      passwordHash: null,
    });

    return { user: created, isNew: true };
  }

  async requestMagicLink(email: string): Promise<RequestMagicCodeResponseDto> {
    const normalizedEmail = normalizeEmail(email);
    const uniformMessage =
      "Если аккаунт с таким email существует, мы отправили код для входа.";
    if (!normalizedEmail) {
      return {
        ok: false,
        message: "Email обязателен.",
        expiresAt: null,
        debugCode: null,
      };
    }

    const user = await this.authRepository.findByEmail(normalizedEmail);
    if (!user) {
      return {
        ok: true,
        message: uniformMessage,
        expiresAt: null,
        debugCode: null,
      };
    }

    const issued = await this.sessionStore.issueMagicCode(normalizedEmail, user.id);
    await this.notificationsService.enqueueAndDispatch({
      id: ensureId("outbox"),
      template: "login_hint",
      dedupeKey: `login_hint:${user.id}:${issued.expiresAt}`,
      recipientEmail: user.email,
      userId: user.id,
      payload: {
        purpose: "magic_link",
        expiresAt: issued.expiresAt,
        code: issued.rawCode,
      },
    });
    return {
      ok: true,
      message: uniformMessage,
      expiresAt: issued.expiresAt,
      debugCode: this.runtimeConfig.authDebugTokens ? issued.rawCode : null,
    };
  }

  async confirmMagicLink(params: {
    email: string;
    code: string;
  }): Promise<
    | { ok: true; user: AuthUserDto; sessionId: string }
    | { ok: false; status: number; error: string; code?: string }
  > {
    const normalizedEmail = normalizeEmail(params.email);
    const code = params.code.trim();
    if (!normalizedEmail || !code) {
      return { ok: false, status: 400, error: "Введите email и код подтверждения." };
    }
    const confirmResult = await this.sessionStore.confirmMagicCode({
      email: normalizedEmail,
      code,
    });
    if (!confirmResult.ok) {
      if (confirmResult.reason === "expired") {
        return {
          ok: false,
          status: 409,
          error: "Срок действия кода истек. Запросите новый код.",
        };
      }
      if (confirmResult.reason === "too_many_attempts") {
        return {
          ok: false,
          status: 429,
          error: "Слишком много неверных попыток. Запросите новый код.",
        };
      }
      return {
        ok: false,
        status: 401,
        error: "Неверный код подтверждения.",
      };
    }
    const user = await this.authRepository.findById(confirmResult.userId);
    if (!user) {
      return {
        ok: false,
        status: 404,
        error: "Пользователь не найден.",
      };
    }
    const session = await this.sessionStore.createSession(user.id);
    if (!session.ok) {
      return {
        ok: false,
        status: 409,
        code: SESSION_ALREADY_ACTIVE_CODE,
        error: SESSION_ALREADY_ACTIVE_MESSAGE,
      };
    }
    return {
      ok: true,
      user,
      sessionId: session.session.id,
    };
  }

  async passwordLogin(params: {
    email: string;
    password: string;
  }): Promise<
    | { ok: true; user: AuthUserDto; sessionId: string }
    | { ok: false; status: number; error: string; code?: string }
  > {
    const email = normalizeEmail(params.email);
    const password = normalizePassword(params.password);
    if (!email || !password) {
      return {
        ok: false,
        status: 400,
        error: "Введите email и пароль.",
      };
    }
    const userWithCredential = await this.authRepository.findByEmail(email);
    if (!userWithCredential) {
      return {
        ok: false,
        status: 401,
        error: "Неверный email или пароль.",
      };
    }
    if (!userWithCredential.passwordHash) {
      await this.safeReconcileIdentityCompletion({
        userId: userWithCredential.id,
        identityVerifiedHint: true,
        accountFinalizedHint: true,
        source: "password_login_blocked",
      });
      return {
        ok: false,
        status: 409,
        code: "password_not_set",
        error:
          "Для этого аккаунта пароль пока не задан. Используйте восстановление пароля через код из email.",
      };
    }

    const valid = verifyPassword(
      password,
      userWithCredential.passwordHash,
      this.runtimeConfig.authPasswordPepper
    );
    if (!valid) {
      return {
        ok: false,
        status: 401,
        error: "Неверный email или пароль.",
      };
    }

    const user: AuthUserDto = {
      id: userWithCredential.id,
      email: userWithCredential.email,
      firstName: userWithCredential.firstName,
      lastName: userWithCredential.lastName,
      role: userWithCredential.role,
      phone: userWithCredential.phone,
      photo: userWithCredential.photo,
    };
    const session = await this.sessionStore.createSession(user.id);
    if (!session.ok) {
      return {
        ok: false,
        status: 409,
        code: SESSION_ALREADY_ACTIVE_CODE,
        error: SESSION_ALREADY_ACTIVE_MESSAGE,
      };
    }
    return { ok: true, user, sessionId: session.session.id };
  }

  async getPasswordStatus(userId: string): Promise<AuthPasswordStatusResponseDto> {
    const user = await this.authRepository.findByIdWithCredential(userId);
    if (!user) {
      return {
        ok: false,
        hasPassword: false,
        state: "none",
        lockedUntil: null,
        lastPasswordChangeAt: null,
      };
    }
    const hasPassword = Boolean(user.passwordHash);
    return {
      ok: true,
      hasPassword,
      state: hasPassword ? "active" : "none",
      lockedUntil: null,
      lastPasswordChangeAt: hasPassword ? user.updatedAt : null,
    };
  }

  async getIdentityCompletionStatus(
    userId: string
  ): Promise<AuthIdentityCompletionStatusResponseDto> {
    const status = await this.reconcileIdentityCompletion({
      userId,
      source: null,
    });
    return {
      ok: true,
      userId: status.userId,
      identityVerified: status.identityVerified,
      accountFinalized: status.accountFinalized,
      hasPassword: status.hasPassword,
      firstPasswordRequired: status.firstPasswordRequired,
      completionState: status.completionState,
      identityVerifiedAt: status.identityVerifiedAt,
      accountFinalizedAt: status.accountFinalizedAt,
      firstPasswordSetAt: status.firstPasswordSetAt,
      completedAt: status.completedAt,
      source: status.source,
    };
  }

  async getFirstPasswordStatus(userId: string): Promise<AuthFirstPasswordStatusResponseDto> {
    const completion = await this.getIdentityCompletionStatus(userId);
    return {
      ok: true,
      userId: completion.userId,
      required: completion.firstPasswordRequired,
      hasPassword: completion.hasPassword,
      completionState: completion.completionState,
      completed: completion.completionState === "completed",
    };
  }

  async completeFirstPassword(params: {
    userId: string;
    newPassword: string;
  }): Promise<AuthFirstPasswordCompleteResponseDto> {
    const saved = await this.setPassword(params);
    const completion = await this.getIdentityCompletionStatus(params.userId);
    return {
      ok: saved.ok,
      message: saved.message,
      firstPasswordRequired: completion.firstPasswordRequired,
      completionState: completion.completionState,
      completed: completion.completionState === "completed",
    };
  }

  async syncIdentityCompletionAfterPurchase(params: {
    userId: string;
    identityVerifiedHint: boolean;
    source?: string;
  }): Promise<void> {
    await this.safeReconcileIdentityCompletion({
      userId: params.userId,
      identityVerifiedHint: params.identityVerifiedHint,
      accountFinalizedHint: true,
      source: params.source ?? "purchase_finalization",
    });
  }

  async setPassword(params: {
    userId: string;
    newPassword: string;
  }): Promise<AuthPasswordSaveResponseDto> {
    const user = await this.authRepository.findByIdWithCredential(params.userId);
    if (!user) {
      return { ok: false, message: "Пользователь не найден." };
    }
    if (user.passwordHash) {
      return {
        ok: false,
        message: "Пароль уже задан. Используйте смену пароля.",
      };
    }
    const normalizedPassword = normalizePassword(params.newPassword);
    const validationError = this.validatePasswordPolicy(normalizedPassword);
    if (validationError) {
      return { ok: false, message: validationError };
    }
    const passwordHash = hashPassword(
      normalizedPassword,
      this.runtimeConfig.authPasswordPepper
    );
    await this.authRepository.updatePasswordHash(user.id, passwordHash);
    await this.safeReconcileIdentityCompletion({
      userId: user.id,
      identityVerifiedHint: true,
      accountFinalizedHint: true,
      passwordSetAtHint: nowIso(),
      source: "first_password_set",
    });
    await this.enqueuePasswordChangedNotification({
      userId: user.id,
      email: user.email,
      reason: "first_password_set",
    });
    return { ok: true, message: "Пароль успешно сохранен." };
  }

  async changePassword(params: {
    userId: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<AuthPasswordSaveResponseDto> {
    const user = await this.authRepository.findByIdWithCredential(params.userId);
    if (!user) {
      return { ok: false, message: "Пользователь не найден." };
    }
    if (!user.passwordHash) {
      return {
        ok: false,
        message: "Пароль еще не задан. Используйте создание пароля.",
      };
    }
    const currentPassword = normalizePassword(params.currentPassword);
    const nextPassword = normalizePassword(params.newPassword);
    if (!currentPassword || !nextPassword) {
      return { ok: false, message: "Введите текущий и новый пароль." };
    }
    if (
      !verifyPassword(
        currentPassword,
        user.passwordHash,
        this.runtimeConfig.authPasswordPepper
      )
    ) {
      return { ok: false, message: "Текущий пароль указан неверно." };
    }
    const validationError = this.validatePasswordPolicy(nextPassword);
    if (validationError) {
      return { ok: false, message: validationError };
    }
    if (currentPassword === nextPassword) {
      return {
        ok: false,
        message: "Новый пароль должен отличаться от текущего.",
      };
    }
    const passwordHash = hashPassword(nextPassword, this.runtimeConfig.authPasswordPepper);
    await this.authRepository.updatePasswordHash(user.id, passwordHash);
    await this.safeReconcileIdentityCompletion({
      userId: user.id,
      identityVerifiedHint: true,
      accountFinalizedHint: true,
      passwordSetAtHint: nowIso(),
      source: "password_changed",
    });
    await this.enqueuePasswordChangedNotification({
      userId: user.id,
      email: user.email,
      reason: "password_changed",
    });
    return { ok: true, message: "Пароль успешно обновлен." };
  }

  async requestRecovery(
    emailRaw: string,
    ipRaw?: string
  ): Promise<AuthRecoveryRequestResponseDto> {
    const email = normalizeEmail(emailRaw);
    const ip = (ipRaw || "unknown").trim() || "unknown";

    const uniformResponse: AuthRecoveryRequestResponseDto = {
      ok: true,
      message:
        "Если аккаунт с таким email существует, мы отправили код восстановления.",
      debugCode: null,
    };

    if (!email || !validateEmailFormat(email)) {
      return uniformResponse;
    }

    const emailRateKey = `auth:recovery:req:email:${email}`;
    const ipRateKey = `auth:recovery:req:ip:${ip}`;
    const ttlSec = 60 * 60;
    const [emailCount, ipCount] = await Promise.all([
      this.redisService.incrementWithTtl(emailRateKey, ttlSec),
      this.redisService.incrementWithTtl(ipRateKey, ttlSec),
    ]);

    if (
      emailCount > this.runtimeConfig.authRecoveryRateLimitPerHour ||
      ipCount > this.runtimeConfig.authRecoveryRateLimitPerHour
    ) {
      return uniformResponse;
    }

    const user = await this.authRepository.findByEmail(email);
    if (!user) {
      return uniformResponse;
    }

    await this.authRepository.expireRecoveryArtifactsForEmail(email);

    const code = buildRecoveryCode();
    const codeHash = hashSensitive(code, this.runtimeConfig.authPasswordPepper);
    const expiresAt = new Date(
      Date.now() + this.runtimeConfig.authRecoveryCodeTtlSec * 1000
    ).toISOString();

    await this.authRepository.insertRecoveryArtifact({
      id: ensureId("recovery"),
      email,
      userId: user.id,
      codeHash,
      maxAttempts: this.runtimeConfig.authRecoveryMaxAttempts,
      expiresAt,
    });

    await this.notificationsService.enqueueAndDispatch({
      id: ensureId("outbox"),
      template: "recovery_requested",
      dedupeKey: `recovery_requested:${user.id}:${expiresAt}`,
      recipientEmail: user.email,
      userId: user.id,
      payload: {
        expiresAt,
        recoveryCode: code,
      },
    });

    return {
      ...uniformResponse,
      debugCode: this.runtimeConfig.authDebugTokens ? code : null,
    };
  }

  async verifyRecovery(params: {
    email: string;
    code: string;
  }): Promise<AuthRecoveryVerifyResponseDto> {
    const email = normalizeEmail(params.email);
    const code = params.code.trim();
    if (!email || !code) {
      return { ok: false, message: "Введите email и код восстановления." };
    }

    const artifact = await this.authRepository.findLatestRecoveryArtifactByEmail(email);
    if (!artifact || artifact.state !== "issued") {
      return { ok: false, message: "Неверный или истекший код восстановления." };
    }

    const expiresAtMs = Date.parse(artifact.expiresAt);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      await this.authRepository.expireRecoveryArtifactsForEmail(email);
      return { ok: false, message: "Неверный или истекший код восстановления." };
    }

    if (artifact.attempts >= artifact.maxAttempts) {
      await this.authRepository.expireRecoveryArtifactsForEmail(email);
      return {
        ok: false,
        message: "Слишком много неверных попыток. Запросите новый код.",
      };
    }

    const candidateHash = hashSensitive(code, this.runtimeConfig.authPasswordPepper);
    if (candidateHash !== artifact.codeHash) {
      await this.authRepository.incrementRecoveryAttempts(artifact.id);
      const nextAttempts = artifact.attempts + 1;
      if (nextAttempts >= artifact.maxAttempts) {
        await this.authRepository.expireRecoveryArtifactsForEmail(email);
      }
      return { ok: false, message: "Неверный или истекший код восстановления." };
    }

    const recoveryToken = buildOpaqueToken();
    const recoveryTokenHash = hashSensitive(
      recoveryToken,
      this.runtimeConfig.authPasswordPepper
    );
    const tokenExpiresAt = new Date(
      Date.now() + this.runtimeConfig.authRecoveryTokenTtlSec * 1000
    ).toISOString();

    await this.authRepository.setRecoveryVerified({
      id: artifact.id,
      recoveryTokenHash,
      tokenExpiresAt,
    });

    return {
      ok: true,
      message: "Код подтвержден. Установите новый пароль.",
      recoveryToken,
    };
  }

  async resetPassword(params: {
    email: string;
    recoveryToken: string;
    newPassword: string;
  }): Promise<AuthPasswordResetResponseDto> {
    const email = normalizeEmail(params.email);
    const recoveryToken = params.recoveryToken.trim();
    const password = normalizePassword(params.newPassword);

    if (!email || !recoveryToken || !password) {
      return {
        ok: false,
        message: "Введите email, recovery token и новый пароль.",
      };
    }

    if (password.length < 8) {
      return {
        ok: false,
        message: "Пароль должен содержать минимум 8 символов.",
      };
    }

    const artifact = await this.authRepository.findVerifiedRecoveryArtifactByEmail(email);
    if (!artifact || artifact.state !== "verified" || !artifact.recoveryTokenHash) {
      return { ok: false, message: "Токен восстановления недействителен." };
    }

    const tokenExpiresAtMs = Date.parse(artifact.tokenExpiresAt || "");
    if (!Number.isFinite(tokenExpiresAtMs) || tokenExpiresAtMs <= Date.now()) {
      await this.authRepository.expireRecoveryArtifactsForEmail(email);
      return { ok: false, message: "Токен восстановления истек." };
    }

    const candidateHash = hashSensitive(
      recoveryToken,
      this.runtimeConfig.authPasswordPepper
    );
    if (candidateHash !== artifact.recoveryTokenHash) {
      return { ok: false, message: "Токен восстановления недействителен." };
    }

    const passwordHash = hashPassword(
      password,
      this.runtimeConfig.authPasswordPepper
    );
    await this.authRepository.updatePasswordHash(artifact.userId, passwordHash);
    await this.authRepository.consumeRecoveryArtifact(artifact.id);
    await this.authRepository.expireRecoveryArtifactsForEmail(email);
    await this.safeReconcileIdentityCompletion({
      userId: artifact.userId,
      identityVerifiedHint: true,
      accountFinalizedHint: true,
      passwordSetAtHint: nowIso(),
      source: "password_reset",
    });
    await this.enqueuePasswordChangedNotification({
      userId: artifact.userId,
      email,
      reason: "password_reset",
    });

    return { ok: true, message: "Пароль обновлен." };
  }

  private computeIdentityCompletionState(params: {
    identityVerified: boolean;
    accountFinalized: boolean;
    hasPassword: boolean;
  }): AuthIdentityCompletionStateDto {
    if (!params.identityVerified) {
      return "pending_identity_verification";
    }
    if (!params.accountFinalized) {
      return "pending_account_finalization";
    }
    if (!params.hasPassword) {
      return "pending_first_password";
    }
    return "completed";
  }

  private async reconcileIdentityCompletion(params: {
    userId: string;
    identityVerifiedHint?: boolean;
    accountFinalizedHint?: boolean;
    passwordSetAtHint?: string;
    source?: string | null;
  }): Promise<{
    userId: string;
    identityVerified: boolean;
    accountFinalized: boolean;
    hasPassword: boolean;
    firstPasswordRequired: boolean;
    completionState: AuthIdentityCompletionStateDto;
    identityVerifiedAt: string | null;
    accountFinalizedAt: string | null;
    firstPasswordSetAt: string | null;
    completedAt: string | null;
    source: string | null;
  }> {
    const user = await this.authRepository.findByIdWithCredential(params.userId);
    if (!user) {
      throw new Error("Пользователь не найден.");
    }

    const existing = await this.authRepository.findIdentityCompletionByUserId(user.id);
    const now = nowIso();
    const hasPassword = Boolean(user.passwordHash);
    const defaultTimestamp = user.updatedAt || now;

    const identityVerifiedAt =
      existing?.identityVerifiedAt ??
      (params.identityVerifiedHint ? now : hasPassword ? defaultTimestamp : null);
    const accountFinalizedAt =
      existing?.accountFinalizedAt ??
      (params.accountFinalizedHint ? now : hasPassword ? defaultTimestamp : null);
    const firstPasswordSetAt =
      existing?.firstPasswordSetAt ??
      (hasPassword ? params.passwordSetAtHint ?? defaultTimestamp : null);

    const completionState = this.computeIdentityCompletionState({
      identityVerified: Boolean(identityVerifiedAt),
      accountFinalized: Boolean(accountFinalizedAt),
      hasPassword,
    });
    const completedAt =
      completionState === "completed"
        ? existing?.completedAt ?? firstPasswordSetAt ?? now
        : null;

    await this.authRepository.upsertIdentityCompletion({
      userId: user.id,
      identityVerifiedAt,
      accountFinalizedAt,
      firstPasswordSetAt,
      completionState,
      completedAt,
      source: params.source ?? null,
    });

    const stored = await this.authRepository.findIdentityCompletionByUserId(user.id);
    const effective = stored ?? {
      userId: user.id,
      identityVerifiedAt: identityVerifiedAt ?? undefined,
      accountFinalizedAt: accountFinalizedAt ?? undefined,
      firstPasswordSetAt: firstPasswordSetAt ?? undefined,
      completionState,
      completedAt: completedAt ?? undefined,
      source: params.source ?? undefined,
      createdAt: now,
      updatedAt: now,
    };

    const identityVerified = Boolean(effective.identityVerifiedAt);
    const accountFinalized = Boolean(effective.accountFinalizedAt);
    const completion = this.computeIdentityCompletionState({
      identityVerified,
      accountFinalized,
      hasPassword,
    });

    return {
      userId: effective.userId,
      identityVerified,
      accountFinalized,
      hasPassword,
      firstPasswordRequired: completion === "pending_first_password",
      completionState: completion,
      identityVerifiedAt: effective.identityVerifiedAt ?? null,
      accountFinalizedAt: effective.accountFinalizedAt ?? null,
      firstPasswordSetAt: effective.firstPasswordSetAt ?? null,
      completedAt:
        completion === "completed" ? effective.completedAt ?? null : null,
      source: effective.source ?? null,
    };
  }

  private async safeReconcileIdentityCompletion(params: {
    userId: string;
    identityVerifiedHint?: boolean;
    accountFinalizedHint?: boolean;
    passwordSetAtHint?: string;
    source?: string | null;
  }): Promise<void> {
    try {
      await this.reconcileIdentityCompletion(params);
    } catch {
      // Do not block auth/purchase critical path on lifecycle bookkeeping.
    }
  }

  private async enqueuePasswordChangedNotification(params: {
    userId: string;
    email: string;
    reason: PasswordChangeReason;
  }): Promise<void> {
    await this.notificationsService.enqueueAndDispatch({
      id: ensureId("outbox"),
      template: "password_changed",
      dedupeKey: `password_changed:${params.userId}:${params.reason}:${Date.now()}`,
      recipientEmail: params.email,
      userId: params.userId,
      payload: {
        reason: params.reason,
        changedAt: nowIso(),
      },
    });
  }

  async getSession(sessionId: string | null): Promise<AuthUserDto | null> {
    if (!sessionId) return null;
    const session = await this.sessionStore.readSession(sessionId);
    if (!session) return null;
    if (this.sessionStore.isSessionExpired(session)) {
      await this.sessionStore.revokeSession(session.id);
      return null;
    }
    if (!(await this.sessionStore.isActiveSession(session))) {
      await this.sessionStore.revokeSession(session.id);
      return null;
    }
    const user = await this.authRepository.findById(session.userId);
    if (!user) {
      await this.sessionStore.revokeSession(session.id);
      return null;
    }
    const touchedSession = await this.sessionStore.touchSessionActivity(session);
    if (!touchedSession) {
      await this.sessionStore.revokeSession(session.id);
      return null;
    }
    return user;
  }

  async logout(sessionId: string | null): Promise<AuthLogoutResponseDto> {
    if (sessionId) {
      await this.sessionStore.revokeSession(sessionId);
    }
    return { ok: true };
  }

  getCurrentTimestamp() {
    return nowIso();
  }

  private validatePasswordPolicy(password: string): string | null {
    if (password.length < 10) {
      return "Минимальная длина пароля — 10 символов.";
    }
    if (password.length > 64) {
      return "Максимальная длина пароля — 64 символа.";
    }
    if (/\s/.test(password)) {
      return "Пароль не должен содержать пробелы.";
    }
    if (!/^[\x21-\x7E]+$/.test(password)) {
      return "Используйте только латиницу, цифры и специальные символы.";
    }
    if (!/[a-z]/.test(password)) {
      return "Добавьте хотя бы одну строчную букву.";
    }
    if (!/[A-Z]/.test(password)) {
      return "Добавьте хотя бы одну заглавную букву.";
    }
    if (!/\d/.test(password)) {
      return "Добавьте хотя бы одну цифру.";
    }
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
      return "Добавьте хотя бы один специальный символ.";
    }
    return null;
  }
}
