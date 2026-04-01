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
        message: "Если аккаунт существует, код входа будет отправлен на email.",
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
        code: this.runtimeConfig.authDebugTokens ? issued.rawCode : undefined,
      },
    });
    return {
      ok: true,
      message: "Код входа отправлен. Введите его для подтверждения входа.",
      expiresAt: issued.expiresAt,
      debugCode: this.runtimeConfig.authDebugTokens ? issued.rawCode : null,
    };
  }

  async confirmMagicLink(params: {
    email: string;
    code: string;
  }): Promise<
    | { ok: true; user: AuthUserDto; sessionId: string }
    | { ok: false; status: number; error: string }
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
    return {
      ok: true,
      user,
      sessionId: session.id,
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
      return {
        ok: false,
        status: 409,
        code: "password_not_set",
        error:
          "Для этого аккаунта пароль пока не задан. Используйте вход по коду из email.",
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
    return { ok: true, user, sessionId: session.id };
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
        recoveryCode: this.runtimeConfig.authDebugTokens ? code : undefined,
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

    return { ok: true, message: "Пароль обновлен." };
  }

  async getSession(sessionId: string | null): Promise<AuthUserDto | null> {
    if (!sessionId) return null;
    const session = await this.sessionStore.readSession(sessionId);
    if (!session) return null;
    const expiresAtMs = Date.parse(session.expiresAt);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      await this.sessionStore.revokeSession(session.id);
      return null;
    }
    const user = await this.authRepository.findById(session.userId);
    if (!user) {
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
