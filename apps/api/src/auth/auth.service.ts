import { Injectable, OnModuleInit } from "@nestjs/common";
import { getApiRuntimeConfig } from "../config/runtime.config";
import { DatabaseService } from "../db/database.service";
import { hashPassword, verifyPassword } from "./auth.password";
import { AuthRepository } from "./auth.repository";
import { readAuthSeedUsers, upsertAuthUsers } from "./auth.seed";
import { SessionStore } from "./session.store";
import type { AuthLogoutResponseDto, AuthUserDto, RequestMagicCodeResponseDto } from "./auth.types";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const normalizePassword = (password: string) => password.normalize("NFKC");

const nowIso = () => new Date().toISOString();

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly runtimeConfig = getApiRuntimeConfig();

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly authRepository: AuthRepository,
    private readonly sessionStore: SessionStore
  ) {}

  async onModuleInit() {
    await this.authRepository.ensureSchema();
    if (!this.runtimeConfig.coursesSeedOnBoot) return;
    const hasUsers = await this.authRepository.hasAnyUsers();
    if (hasUsers) return;

    const seedUsers = readAuthSeedUsers(this.runtimeConfig.coursesSeedSourceFile);
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
        ok: false,
        message: "Пользователь с таким email не найден.",
        expiresAt: null,
        debugCode: null,
      };
    }

    const issued = await this.sessionStore.issueMagicCode(normalizedEmail, user.id);
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
}
