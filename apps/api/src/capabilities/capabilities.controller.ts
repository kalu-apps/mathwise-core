import { Controller, Get, HttpException, Req, Res } from "@nestjs/common";
import {
  buildSessionClearCookie,
  readSessionIdFromCookieHeader,
} from "../auth/auth.cookies";
import { AuthService } from "../auth/auth.service";
import type { AuthUserDto } from "../auth/auth.types";
import { CapabilitiesService } from "./capabilities.service";
import type { CapabilityProjectionDto } from "./capabilities.types";

type RequestWithCookie = {
  headers?: {
    cookie?: string;
  };
};

type HttpResponseWithHeaders = {
  setHeader: (name: string, value: string) => void;
};

@Controller("api/capabilities")
export class CapabilitiesController {
  constructor(
    private readonly authService: AuthService,
    private readonly capabilitiesService: CapabilitiesService
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

  @Get("me")
  async getMyCapabilities(
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<CapabilityProjectionDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    if (!actorUser) {
      throw new HttpException({ error: "Требуется авторизация." }, 401);
    }
    return this.capabilitiesService.getCapabilitiesForUser(actorUser);
  }
}
