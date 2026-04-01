import { Controller, Get, Param, Req, Res } from "@nestjs/common";
import {
  buildSessionClearCookie,
  readSessionIdFromCookieHeader,
} from "../auth/auth.cookies";
import { AuthService } from "../auth/auth.service";
import type { AuthUserDto } from "../auth/auth.types";
import { AccessService } from "./access.service";
import type {
  CourseAccessDecisionDto,
  CourseAccessListResponseDto,
  LessonAccessDecisionDto,
} from "./access.types";

type RequestWithCookie = {
  headers?: {
    cookie?: string;
  };
};

type HttpResponseWithHeaders = {
  setHeader: (name: string, value: string) => void;
};

@Controller("api/access")
export class AccessController {
  constructor(
    private readonly authService: AuthService,
    private readonly accessService: AccessService
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

  @Get("courses")
  async getCourseAccessList(
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<CourseAccessListResponseDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.accessService.getCourseAccessList(actorUser);
  }

  @Get("courses/:courseId")
  async getCourseAccessDecision(
    @Param("courseId") courseId: string,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<CourseAccessDecisionDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.accessService.getCourseAccessDecision(courseId.trim(), actorUser);
  }

  @Get("lessons/:lessonId")
  async getLessonAccessDecision(
    @Param("lessonId") lessonId: string,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<LessonAccessDecisionDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.accessService.getLessonAccessDecision(lessonId.trim(), actorUser);
  }
}
