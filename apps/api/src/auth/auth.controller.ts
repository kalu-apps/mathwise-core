import {
  Body,
  Controller,
  Get,
  HttpException,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import {
  buildSessionClearCookie,
  buildSessionSetCookie,
  readSessionIdFromCookieHeader,
} from "./auth.cookies";
import { AuthService } from "./auth.service";
import type { AuthLogoutResponseDto, AuthUserDto, RequestMagicCodeResponseDto } from "./auth.types";

type HttpResponseWithHeaders = {
  setHeader: (name: string, value: string) => void;
};

type RequestWithCookie = {
  headers?: {
    cookie?: string;
  };
};

@Controller("api/auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
}
