import crypto from "node:crypto";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  getApiRuntimeConfig,
  type ApiAuthSocialProviderConfig,
} from "../config/runtime.config";
import { DatabaseService } from "../db/database.service";
import { ensureId, normalizeEmail, validateEmailFormat } from "../purchases/purchases.helpers";
import { NotificationsService } from "../notifications/notifications.service";
import { RedisService } from "../redis/redis.service";
import { hashPassword, verifyPassword } from "./auth.password";
import { AuthRepository } from "./auth.repository";
import { readAuthSeedUsers, upsertAuthUsers } from "./auth.seed";
import { SessionStore } from "./session.store";
import {
  OAUTH_STATE_PREFIX,
  SOCIAL_PROVIDERS,
  type OauthProviderDiagnostics,
  type OauthProfileResult,
  type OauthStatePayload,
  buildAuthorizationUrl as buildOauthAuthorizationUrl,
  buildClientRedirectUrl as buildOauthClientRedirectUrl,
  buildPkceCodeChallenge as buildOauthPkceCodeChallenge,
  consumeOauthState as consumeOauthStatePayload,
  fetchSocialProfile as fetchOauthSocialProfile,
  fingerprint as fingerprintOauthState,
  generatePkceCodeVerifier as generateOauthPkceCodeVerifier,
  getOauthCallbackUrl as getOauthProviderCallbackUrl,
  parseSocialProvider as parseOauthProvider,
  sanitizeClientRedirectPath as sanitizeOauthClientRedirectPath,
} from "./auth.oauth-orchestration";
import type {
  AuthFirstPasswordCompleteResponseDto,
  AuthFirstPasswordStatusResponseDto,
  AuthIdentityCompletionStateDto,
  AuthOauthWidgetConfigResponseDto,
  AuthIdentityCompletionStatusResponseDto,
  AuthLogoutResponseDto,
  AuthPasswordSaveResponseDto,
  AuthPasswordStatusResponseDto,
  AuthPasswordResetResponseDto,
  AuthRecoveryRequestResponseDto,
  AuthRecoveryVerifyResponseDto,
  AuthSocialProvider,
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

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly runtimeConfig = getApiRuntimeConfig();
  private readonly logger = new Logger(AuthService.name);

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

  getEnabledSocialProviders(): AuthSocialProvider[] {
    return SOCIAL_PROVIDERS.filter(
      (provider) => this.runtimeConfig.authOauthProviders[provider]?.enabled
    );
  }

  getOauthWidgetConfig(): AuthOauthWidgetConfigResponseDto {
    const widgetsEnabled = this.runtimeConfig.authOauthWidgets.enabled;
    const providers = SOCIAL_PROVIDERS.map((provider) => {
      const oauthProviderConfig = this.runtimeConfig.authOauthProviders[provider];
      const widgetProviderConfig =
        this.runtimeConfig.authOauthWidgets.providers[provider];
      const ready = Boolean(
        widgetsEnabled &&
          widgetProviderConfig?.enabled &&
          widgetProviderConfig?.clientId &&
          widgetProviderConfig?.scriptUrl
      );
      const interactive = Boolean(ready && oauthProviderConfig?.enabled);
      return {
        provider,
        oauthEnabled: Boolean(oauthProviderConfig?.enabled),
        widgetEnabled: Boolean(widgetProviderConfig?.enabled),
        ready,
        interactive,
        clientId: ready ? widgetProviderConfig.clientId : null,
        scriptUrl: ready ? widgetProviderConfig.scriptUrl : null,
        mode: widgetProviderConfig.mode,
      };
    });

    return {
      ok: true,
      widgetsEnabled,
      providers,
    };
  }

  async buildSocialLoginStartUrl(params: {
    provider: string;
    redirectPath?: string;
  }): Promise<
    | { ok: true; redirectUrl: string }
    | {
        ok: false;
        redirectUrl: string;
        errorCode:
          | "provider_not_supported"
          | "provider_disabled"
          | "provider_misconfigured";
      }
  > {
    const provider = this.parseSocialProvider(params.provider);
    const redirectPath = this.sanitizeClientRedirectPath(params.redirectPath);

    if (!provider) {
      return {
        ok: false,
        errorCode: "provider_not_supported",
        redirectUrl: this.buildClientRedirectUrl({
          redirectPath,
          errorCode: "provider_not_supported",
        }),
      };
    }

    const providerConfig = this.runtimeConfig.authOauthProviders[provider];
    if (!providerConfig?.enabled) {
      return {
        ok: false,
        errorCode: "provider_disabled",
        redirectUrl: this.buildClientRedirectUrl({
          redirectPath,
          provider,
          errorCode: "provider_disabled",
        }),
      };
    }
    if (!providerConfig.clientId || !providerConfig.clientSecret) {
      this.logger.warn(`[oauth:start] provider=${provider} provider_misconfigured`);
      return {
        ok: false,
        errorCode: "provider_misconfigured",
        redirectUrl: this.buildClientRedirectUrl({
          redirectPath,
          provider,
          errorCode: "provider_misconfigured",
        }),
      };
    }

    const state = buildOpaqueToken();
    const codeVerifier =
      provider === "vk" ? this.generatePkceCodeVerifier() : undefined;
    const payload: OauthStatePayload = {
      provider,
      redirectPath,
      issuedAt: nowIso(),
      codeVerifier,
    };
    await this.redisService.set(
      `${OAUTH_STATE_PREFIX}${state}`,
      JSON.stringify(payload),
      this.runtimeConfig.authOauthStateTtlSec
    );
    this.logger.log(
      `[oauth:start] provider=${provider} pkce=${codeVerifier ? "enabled" : "disabled"} state=${this.fingerprint(state)}`
    );

    const authorizationUrl = this.buildAuthorizationUrl({
      provider,
      providerConfig,
      state,
      codeChallenge: codeVerifier
        ? this.buildPkceCodeChallenge(codeVerifier)
        : undefined,
    });

    return {
      ok: true,
      redirectUrl: authorizationUrl.toString(),
    };
  }

  async completeSocialLogin(params: {
    provider: string;
    code?: string;
    state?: string;
    providerError?: string;
  }): Promise<{
    ok: boolean;
    redirectUrl: string;
    sessionId?: string;
    errorCode?: string;
  }> {
    const provider = this.parseSocialProvider(params.provider);
    if (!provider) {
      return {
        ok: false,
        errorCode: "provider_not_supported",
        redirectUrl: this.buildClientRedirectUrl({
          redirectPath: "/",
          errorCode: "provider_not_supported",
        }),
      };
    }

    const state = params.state?.trim() || "";
    if (!state) {
      this.logger.warn(`[oauth:callback] provider=${provider} missing_state`);
      return {
        ok: false,
        errorCode: "invalid_state",
        redirectUrl: this.buildClientRedirectUrl({
          redirectPath: "/",
          provider,
          errorCode: "invalid_state",
        }),
      };
    }

    const statePayload = await this.consumeOauthState(state);
    if (!statePayload || statePayload.provider !== provider) {
      this.logger.warn(
        `[oauth:callback] provider=${provider} invalid_state state=${this.fingerprint(state)}`
      );
      return {
        ok: false,
        errorCode: "invalid_state",
        redirectUrl: this.buildClientRedirectUrl({
          redirectPath: "/",
          provider,
          errorCode: "invalid_state",
        }),
      };
    }
    const redirectPath = statePayload.redirectPath;
    this.logger.log(
      `[oauth:callback] provider=${provider} state=${this.fingerprint(state)} has_code=${
        params.code?.trim() ? "yes" : "no"
      }`
    );

    if (params.providerError?.trim()) {
      this.logger.warn(
        `[oauth:callback] provider=${provider} provider_error=${params.providerError.trim()}`
      );
      return {
        ok: false,
        errorCode: "provider_rejected",
        redirectUrl: this.buildClientRedirectUrl({
          redirectPath,
          provider,
          errorCode: "provider_rejected",
        }),
      };
    }

    const providerConfig = this.runtimeConfig.authOauthProviders[provider];
    if (!providerConfig?.enabled || !providerConfig.clientId || !providerConfig.clientSecret) {
      this.logger.warn(
        `[oauth:callback] provider=${provider} state=${this.fingerprint(state)} provider_misconfigured`
      );
      return {
        ok: false,
        errorCode: "provider_misconfigured",
        redirectUrl: this.buildClientRedirectUrl({
          redirectPath,
          provider,
          errorCode: "provider_misconfigured",
        }),
      };
    }

    const code = params.code?.trim() || "";
    if (!code) {
      this.logger.warn(
        `[oauth:callback] provider=${provider} state=${this.fingerprint(state)} missing_code`
      );
      return {
        ok: false,
        errorCode: "token_exchange_failed",
        redirectUrl: this.buildClientRedirectUrl({
          redirectPath,
          provider,
          errorCode: "token_exchange_failed",
        }),
      };
    }

    if (provider === "vk" && !statePayload.codeVerifier) {
      this.logger.warn(
        `[oauth:callback] provider=vk state=${this.fingerprint(state)} missing_pkce_verifier`
      );
      return {
        ok: false,
        errorCode: "invalid_state",
        redirectUrl: this.buildClientRedirectUrl({
          redirectPath,
          provider,
          errorCode: "invalid_state",
        }),
      };
    }

    const profileResult = await this.fetchSocialProfile(
      provider,
      providerConfig,
      code,
      {
        codeVerifier: statePayload.codeVerifier,
      }
    );
    if (!profileResult.ok) {
      const diagnosticsDetails = this.formatOauthDiagnostics(profileResult.diagnostics);
      this.logger.warn(
        `[oauth:callback] provider=${provider} state=${this.fingerprint(state)} profile_result=${profileResult.errorCode}${diagnosticsDetails}`
      );
      return {
        ok: false,
        errorCode: profileResult.errorCode,
        redirectUrl: this.buildClientRedirectUrl({
          redirectPath,
          provider,
          errorCode: profileResult.errorCode,
        }),
      };
    }

    const normalizedEmail = normalizeEmail(profileResult.profile.email);
    if (!normalizedEmail || !validateEmailFormat(normalizedEmail)) {
      this.logger.warn(
        `[oauth:callback] provider=${provider} state=${this.fingerprint(state)} invalid_email`
      );
      return {
        ok: false,
        errorCode: "email_missing",
        redirectUrl: this.buildClientRedirectUrl({
          redirectPath,
          provider,
          errorCode: "email_missing",
        }),
      };
    }
    if (!profileResult.profile.emailVerified) {
      this.logger.warn(
        `[oauth:callback] provider=${provider} state=${this.fingerprint(state)} email_not_verified`
      );
      return {
        ok: false,
        errorCode: "email_not_verified",
        redirectUrl: this.buildClientRedirectUrl({
          redirectPath,
          provider,
          errorCode: "email_not_verified",
        }),
      };
    }

    const user = await this.authRepository.findByEmail(normalizedEmail);
    if (!user) {
      this.logger.warn(
        `[oauth:callback] provider=${provider} state=${this.fingerprint(state)} account_not_found`
      );
      return {
        ok: false,
        errorCode: "account_not_found",
        redirectUrl: this.buildClientRedirectUrl({
          redirectPath,
          provider,
          errorCode: "account_not_found",
        }),
      };
    }

    const identityByProvider = await this.authRepository.findIdentityByProvider({
      provider,
      providerUserId: profileResult.profile.providerUserId,
    });
    if (identityByProvider && identityByProvider.userId !== user.id) {
      this.logger.warn(
        `[oauth:callback] provider=${provider} state=${this.fingerprint(state)} identity_conflict_provider_user`
      );
      return {
        ok: false,
        errorCode: "identity_conflict",
        redirectUrl: this.buildClientRedirectUrl({
          redirectPath,
          provider,
          errorCode: "identity_conflict",
        }),
      };
    }

    const identityByUser = await this.authRepository.findIdentityByUserAndProvider({
      userId: user.id,
      provider,
    });
    if (
      identityByUser &&
      identityByUser.providerUserId !== profileResult.profile.providerUserId
    ) {
      this.logger.warn(
        `[oauth:callback] provider=${provider} state=${this.fingerprint(state)} identity_conflict_user_provider`
      );
      return {
        ok: false,
        errorCode: "identity_conflict",
        redirectUrl: this.buildClientRedirectUrl({
          redirectPath,
          provider,
          errorCode: "identity_conflict",
        }),
      };
    }

    await this.authRepository.upsertIdentity({
      id: identityByUser?.id ?? identityByProvider?.id ?? ensureId("identity"),
      userId: user.id,
      provider,
      providerUserId: profileResult.profile.providerUserId,
      email: normalizedEmail,
    });

    const session = await this.sessionStore.createSession(user.id);
    await this.safeReconcileIdentityCompletion({
      userId: user.id,
      identityVerifiedHint: true,
      accountFinalizedHint: true,
      source: `social_login:${provider}`,
    });
    this.logger.log(
      `[oauth:callback] provider=${provider} state=${this.fingerprint(state)} success user_id=${user.id}`
    );
    return {
      ok: true,
      sessionId: session.id,
      redirectUrl: this.buildClientRedirectUrl({
        redirectPath,
      }),
    };
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

  private parseSocialProvider(value: string): AuthSocialProvider | null {
    return parseOauthProvider(value);
  }

  private sanitizeClientRedirectPath(raw: string | undefined): string {
    return sanitizeOauthClientRedirectPath(raw);
  }

  private buildClientRedirectUrl(params: {
    redirectPath: string;
    provider?: AuthSocialProvider;
    errorCode?: string;
  }): string {
    return buildOauthClientRedirectUrl(this.runtimeConfig.authOauthRedirectBaseUrl, params);
  }

  private getOauthCallbackUrl(provider: AuthSocialProvider): string {
    return getOauthProviderCallbackUrl(
      this.runtimeConfig.authOauthRedirectBaseUrl,
      provider
    );
  }

  private buildAuthorizationUrl(params: {
    provider: AuthSocialProvider;
    providerConfig: ApiAuthSocialProviderConfig;
    state: string;
    codeChallenge?: string;
  }): URL {
    return buildOauthAuthorizationUrl({
      ...params,
      redirectBaseUrl: this.runtimeConfig.authOauthRedirectBaseUrl,
    });
  }

  private async consumeOauthState(state: string): Promise<OauthStatePayload | null> {
    return consumeOauthStatePayload({
      redisService: this.redisService,
      state,
    });
  }

  private async fetchSocialProfile(
    provider: AuthSocialProvider,
    providerConfig: ApiAuthSocialProviderConfig,
    code: string,
    options?: { codeVerifier?: string }
  ): Promise<OauthProfileResult> {
    return fetchOauthSocialProfile({
      provider,
      providerConfig,
      code,
      redirectBaseUrl: this.runtimeConfig.authOauthRedirectBaseUrl,
      codeVerifier: options?.codeVerifier,
    });
  }

  private generatePkceCodeVerifier(): string {
    return generateOauthPkceCodeVerifier();
  }

  private buildPkceCodeChallenge(codeVerifier: string): string {
    return buildOauthPkceCodeChallenge(codeVerifier);
  }

  private fingerprint(value: string): string {
    return fingerprintOauthState(value);
  }

  private formatOauthDiagnostics(diagnostics?: OauthProviderDiagnostics): string {
    if (!diagnostics) return "";
    const parts: string[] = [];
    parts.push(`stage=${diagnostics.stage}`);
    if (typeof diagnostics.httpStatus === "number") {
      parts.push(`http_status=${diagnostics.httpStatus}`);
    }
    if (diagnostics.transport) {
      parts.push(`transport=${diagnostics.transport}`);
    }
    if (diagnostics.providerError) {
      parts.push(`provider_error=${diagnostics.providerError}`);
    }
    if (diagnostics.providerErrorDescription) {
      parts.push(`provider_error_description=${diagnostics.providerErrorDescription}`);
    }
    return parts.length > 0 ? ` diagnostics(${parts.join(" ")})` : "";
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
