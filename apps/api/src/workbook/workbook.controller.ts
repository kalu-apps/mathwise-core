import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import {
  buildSessionClearCookie,
  readSessionIdFromCookieHeader,
} from "../auth/auth.cookies";
import { AuthService } from "../auth/auth.service";
import type { AuthUserDto } from "../auth/auth.types";
import { WorkbookService } from "./workbook.service";
import type { WorkbookLaunchResponseDto } from "./workbook.types";

type RequestWithCookie = {
  headers?: {
    cookie?: string;
  };
};

type HttpResponseWithHeaders = {
  setHeader: (name: string, value: string) => void;
};

type RedirectResponse = HttpResponseWithHeaders & {
  redirect: (status: number, url: string) => void;
};

@Controller("api/workbook")
export class WorkbookController {
  constructor(
    private readonly authService: AuthService,
    private readonly workbookService: WorkbookService
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

  private async requireUser(
    req: RequestWithCookie,
    res: HttpResponseWithHeaders
  ): Promise<AuthUserDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    if (!actorUser) {
      throw new HttpException({ error: "Требуется авторизация." }, 401);
    }
    return actorUser;
  }

  @Post("launch")
  async createLaunch(
    @Body() body: { from?: string } | undefined,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<WorkbookLaunchResponseDto> {
    const actorUser = await this.requireUser(req, res);
    return this.workbookService.createLaunch(actorUser, {
      from: typeof body?.from === "string" ? body.from : undefined,
    });
  }

  @Get("launch/:artifactId")
  async consumeLaunch(
    @Param("artifactId") artifactId: string,
    @Req() req: RequestWithCookie,
    @Res() res: RedirectResponse
  ): Promise<void> {
    const actorUser = await this.requireUser(req, res);
    const targetUrl = await this.workbookService.consumeLaunch(actorUser, artifactId);
    res.redirect(302, targetUrl);
  }
}
