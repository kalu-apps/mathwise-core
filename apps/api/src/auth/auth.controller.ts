import {
  Body,
  Controller,
  Get,
  HttpException,
  Ip,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  buildSessionClearCookie,
  buildSessionSetCookie,
  readSessionIdFromCookieHeader,
} from "./auth.cookies";
import { AuthIdentityIntentService } from "./auth.identity-intent.service";
import { AuthService } from "./auth.service";
import type {
  AuthFirstPasswordCompleteResponseDto,
  AuthFirstPasswordStatusResponseDto,
  AuthIdentityCompletionStatusResponseDto,
  AuthOauthWidgetConfigResponseDto,
  AuthIdentityIntentStartResponseDto,
  AuthIdentityIntentStatusResponseDto,
  AuthIdentityIntentVerifyResponseDto,
  AuthLogoutResponseDto,
  AuthPasswordSaveResponseDto,
  AuthPasswordStatusResponseDto,
  AuthPasswordResetResponseDto,
  AuthRecoveryRequestResponseDto,
  AuthRecoveryVerifyResponseDto,
  AuthUserDto,
  RequestMagicCodeResponseDto,
} from "./auth.types";

type HttpResponseWithHeaders = {
  setHeader: (name: string, value: string) => void;
};

type HttpRedirectResponse = {
  redirect: (url: string) => void;
};

type RequestWithCookie = {
  headers?: {
    cookie?: string;
  };
};

@Controller("api/auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authIdentityIntentService: AuthIdentityIntentService
  ) {}

  private async resolveUserFromRequest(
    req: RequestWithCookie,
    res: HttpResponseWithHeaders
  ): Promise<AuthUserDto | null> {
    const sessionId = readSessionIdFromCookieHeader(req.headers?.cookie);
    const user = await this.authService.getSession(sessionId);
    if (!user && sessionId) {
      res.setHeader("Set-Cookie", buildSessionClearCookie());
    }
    return user;
  }

  @Post("magic-link")
  async requestMagicLink(
    @Body() body: { email?: string }
  ): Promise<RequestMagicCodeResponseDto> {
    return this.authService.requestMagicLink(body?.email ?? "");
  }

  @Post("magic-link/confirm")
  async confirmMagicLink(
    @Body() body: { email?: string; code?: string },
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<AuthUserDto> {
    const result = await this.authService.confirmMagicLink({
      email: body?.email ?? "",
      code: body?.code ?? "",
    });
    if (!result.ok) {
      throw new HttpException({ error: result.error }, result.status);
    }
    res.setHeader("Set-Cookie", buildSessionSetCookie(result.sessionId));
    return result.user;
  }

  @Post("password/login")
  async passwordLogin(
    @Body() body: { email?: string; password?: string },
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<AuthUserDto> {
    const result = await this.authService.passwordLogin({
      email: body?.email ?? "",
      password: body?.password ?? "",
    });
    if (!result.ok) {
      throw new HttpException(
        {
          error: result.error,
          code: result.code,
        },
        result.status
      );
    }
    res.setHeader("Set-Cookie", buildSessionSetCookie(result.sessionId));
    return result.user;
  }

  @Get("oauth/providers")
  getOauthProviders(): { providers: string[] } {
    return {
      providers: this.authService.getEnabledSocialProviders(),
    };
  }

  @Get("oauth/widget-config")
  getOauthWidgetConfig(): AuthOauthWidgetConfigResponseDto {
    return this.authService.getOauthWidgetConfig();
  }

  @Get("oauth/:provider/start")
  async startOauth(
    @Param("provider") provider: string,
    @Query("redirect") redirectPath: string | undefined,
    @Res() res: HttpRedirectResponse
  ): Promise<void> {
    const result = await this.authService.buildSocialLoginStartUrl({
      provider,
      redirectPath,
    });
    res.redirect(result.redirectUrl);
  }

  @Get("oauth/:provider/callback")
  async oauthCallback(
    @Param("provider") provider: string,
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") providerError: string | undefined,
    @Res({ passthrough: true })
    res: HttpResponseWithHeaders & HttpRedirectResponse
  ): Promise<void> {
    const result = await this.authService.completeSocialLogin({
      provider,
      code,
      state,
      providerError,
    });
    if (result.ok && result.sessionId) {
      res.setHeader("Set-Cookie", buildSessionSetCookie(result.sessionId));
    }
    res.redirect(result.redirectUrl);
  }

  @Post("identity-intents/start")
  async startIdentityIntent(
    @Body()
    body: {
      channel?: string;
      email?: string;
      metadata?: Record<string, unknown>;
    },
    @Ip() ip?: string
  ): Promise<AuthIdentityIntentStartResponseDto> {
    return this.authIdentityIntentService.start({
      channel: body?.channel,
      email: body?.email,
      ip,
      metadata: body?.metadata,
    });
  }

  @Post("identity-intents/verify")
  async verifyIdentityIntent(
    @Body() body: { intentId?: string; code?: string }
  ): Promise<AuthIdentityIntentVerifyResponseDto> {
    return this.authIdentityIntentService.verify({
      intentId: body?.intentId,
      code: body?.code,
    });
  }

  @Get("identity-intents/:intentId/status")
  async getIdentityIntentStatus(
    @Param("intentId") intentId: string
  ): Promise<AuthIdentityIntentStatusResponseDto> {
    return this.authIdentityIntentService.getStatus(intentId);
  }

  @Get("session")
  async getSession(
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<AuthUserDto | null> {
    const cookieHeader = req.headers?.cookie;
    const sessionId = readSessionIdFromCookieHeader(cookieHeader);
    const user = await this.authService.getSession(sessionId);
    if (!user && sessionId) {
      res.setHeader("Set-Cookie", buildSessionClearCookie());
    }
    return user;
  }

  @Post("logout")
  async logout(
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<AuthLogoutResponseDto> {
    const sessionId = readSessionIdFromCookieHeader(req.headers?.cookie);
    const payload = await this.authService.logout(sessionId);
    res.setHeader("Set-Cookie", buildSessionClearCookie());
    return payload;
  }

  @Get("password/status")
  async getPasswordStatus(
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<AuthPasswordStatusResponseDto> {
    const user = await this.resolveUserFromRequest(req, res);
    if (!user) {
      throw new HttpException({ error: "Требуется авторизация." }, 401);
    }
    return this.authService.getPasswordStatus(user.id);
  }

  @Get("identity/completion")
  async getIdentityCompletion(
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<AuthIdentityCompletionStatusResponseDto> {
    const user = await this.resolveUserFromRequest(req, res);
    if (!user) {
      throw new HttpException({ error: "Требуется авторизация." }, 401);
    }
    return this.authService.getIdentityCompletionStatus(user.id);
  }

  @Get("password/first/status")
  async getFirstPasswordStatus(
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<AuthFirstPasswordStatusResponseDto> {
    const user = await this.resolveUserFromRequest(req, res);
    if (!user) {
      throw new HttpException({ error: "Требуется авторизация." }, 401);
    }
    return this.authService.getFirstPasswordStatus(user.id);
  }

  @Post("password/first/complete")
  async completeFirstPassword(
    @Body() body: { newPassword?: string },
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<AuthFirstPasswordCompleteResponseDto> {
    const user = await this.resolveUserFromRequest(req, res);
    if (!user) {
      throw new HttpException({ error: "Требуется авторизация." }, 401);
    }
    return this.authService.completeFirstPassword({
      userId: user.id,
      newPassword: body?.newPassword ?? "",
    });
  }

  @Post("password/set")
  async setPassword(
    @Body() body: { newPassword?: string },
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<AuthPasswordSaveResponseDto> {
    const user = await this.resolveUserFromRequest(req, res);
    if (!user) {
      throw new HttpException({ error: "Требуется авторизация." }, 401);
    }
    return this.authService.setPassword({
      userId: user.id,
      newPassword: body?.newPassword ?? "",
    });
  }

  @Post("password/change")
  async changePassword(
    @Body() body: { currentPassword?: string; newPassword?: string },
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<AuthPasswordSaveResponseDto> {
    const user = await this.resolveUserFromRequest(req, res);
    if (!user) {
      throw new HttpException({ error: "Требуется авторизация." }, 401);
    }
    return this.authService.changePassword({
      userId: user.id,
      currentPassword: body?.currentPassword ?? "",
      newPassword: body?.newPassword ?? "",
    });
  }

  @Post("recovery/request")
  async requestRecovery(
    @Body() body: { email?: string },
    @Ip() ip?: string
  ): Promise<AuthRecoveryRequestResponseDto> {
    return this.authService.requestRecovery(body?.email ?? "", ip);
  }

  @Post("recovery/verify")
  async verifyRecovery(
    @Body() body: { email?: string; code?: string }
  ): Promise<AuthRecoveryVerifyResponseDto> {
    return this.authService.verifyRecovery({
      email: body?.email ?? "",
      code: body?.code ?? "",
    });
  }

  @Post("password/reset")
  async resetPassword(
    @Body() body: { email?: string; recoveryToken?: string; newPassword?: string }
  ): Promise<AuthPasswordResetResponseDto> {
    return this.authService.resetPassword({
      email: body?.email ?? "",
      recoveryToken: body?.recoveryToken ?? "",
      newPassword: body?.newPassword ?? "",
    });
  }

  // Backward-compatible aliases for legacy frontend callers.
  @Post("password/reset/request")
  async requestPasswordReset(
    @Body() body: { email?: string },
    @Ip() ip?: string
  ): Promise<AuthRecoveryRequestResponseDto> {
    return this.authService.requestRecovery(body?.email ?? "", ip);
  }

  @Post("password/reset/confirm")
  async confirmPasswordReset(
    @Body() body: { email?: string; token?: string; newPassword?: string }
  ): Promise<AuthPasswordResetResponseDto> {
    const verify = await this.authService.verifyRecovery({
      email: body?.email ?? "",
      code: body?.token ?? "",
    });
    if (!verify.ok || !verify.recoveryToken) {
      return {
        ok: false,
        message: verify.message,
      };
    }
    return this.authService.resetPassword({
      email: body?.email ?? "",
      recoveryToken: verify.recoveryToken,
      newPassword: body?.newPassword ?? "",
    });
  }
}
