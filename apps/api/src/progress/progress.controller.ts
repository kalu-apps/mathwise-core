import { Body, Controller, Delete, Get, Post, Query, Req, Res } from "@nestjs/common";
import {
  buildSessionClearCookie,
  readSessionIdFromCookieHeader,
} from "../auth/auth.cookies";
import { AuthService } from "../auth/auth.service";
import type { AuthUserDto } from "../auth/auth.types";
import { ProgressService } from "./progress.service";
import type {
  DeleteProgressPayloadDto,
  MarkLessonViewedPayloadDto,
  ProgressViewedIdsResponseDto,
} from "./progress.types";

type RequestWithCookie = {
  headers?: {
    cookie?: string;
  };
};

type HttpResponseWithHeaders = {
  setHeader: (name: string, value: string) => void;
};

@Controller("api/progress")
export class ProgressController {
  constructor(
    private readonly authService: AuthService,
    private readonly progressService: ProgressService
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

  @Get()
  async getViewedLessonIds(
    @Query("courseId") courseId: string | undefined,
    @Query("userId") userId: string | undefined,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<ProgressViewedIdsResponseDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.progressService.getViewedLessonIds({
      actorUser,
      courseId: courseId?.trim() || "",
      userId: userId?.trim() || undefined,
    });
  }

  @Post("viewed")
  async markViewed(
    @Body() payload: MarkLessonViewedPayloadDto,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<{ ok: true }> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    await this.progressService.markLessonViewed({
      actorUser,
      userId: payload.userId,
      courseId: payload.courseId,
      lessonId: payload.lessonId,
    });
    return { ok: true };
  }

  @Delete()
  async deleteProgress(
    @Query("courseId") courseId: string | undefined,
    @Query("userId") userId: string | undefined,
    @Body() payload: DeleteProgressPayloadDto | undefined,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<{ ok: true }> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    await this.progressService.deleteProgressByCourse({
      actorUser,
      courseId: payload?.courseId?.trim() || courseId?.trim() || "",
      userId: payload?.userId?.trim() || userId?.trim() || undefined,
    });
    return { ok: true };
  }
}
