import { Body, Controller, Get, Put, Req, Res } from "@nestjs/common";
import {
  buildSessionClearCookie,
  readSessionIdFromCookieHeader,
} from "../auth/auth.cookies";
import { AuthService } from "../auth/auth.service";
import type { AuthUserDto } from "../auth/auth.types";
import { AssessmentsService } from "./assessments.service";
import type {
  AssessmentSessionsMapDto,
  AssessmentStateRecordDto,
} from "./assessments.types";

type RequestWithCookie = {
  headers?: {
    cookie?: string;
  };
};

type HttpResponseWithHeaders = {
  setHeader: (name: string, value: string) => void;
};

@Controller("api/assessments")
export class AssessmentsController {
  constructor(
    private readonly authService: AuthService,
    private readonly assessmentsService: AssessmentsService
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

  @Get("state")
  async getState(
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<AssessmentStateRecordDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.assessmentsService.getState(actorUser);
  }

  @Put("state")
  async putState(
    @Body() payload: unknown,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<AssessmentStateRecordDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.assessmentsService.saveState(payload, actorUser);
  }

  @Get("sessions")
  async getSessions(
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<AssessmentSessionsMapDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.assessmentsService.getSessions(actorUser);
  }

  @Put("sessions")
  async putSessions(
    @Body() payload: unknown,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<AssessmentSessionsMapDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.assessmentsService.saveSessions(payload, actorUser);
  }
}
