import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  buildSessionClearCookie,
  readSessionIdFromCookieHeader,
} from "../auth/auth.cookies";
import { AuthService } from "../auth/auth.service";
import type { AuthUserDto } from "../auth/auth.types";
import { LessonsService } from "./lessons.service";
import type { LessonDto } from "./lessons.types";

type RequestWithCookie = {
  headers?: {
    cookie?: string;
  };
};

type HttpResponseWithHeaders = {
  setHeader: (name: string, value: string) => void;
};

@Controller()
export class LessonsController {
  constructor(
    private readonly authService: AuthService,
    private readonly lessonsService: LessonsService
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

  @Get("api/lessons")
  async getLessons(
    @Query("courseId") courseId: string | undefined,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<LessonDto[]> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.lessonsService.getLessons({
      courseId: courseId?.trim() || undefined,
      actorUser,
    });
  }

  @Get("api/lessons/:id")
  async getLessonById(
    @Param("id") lessonId: string,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<LessonDto | null> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.lessonsService.getLessonById(lessonId, actorUser);
  }

  @Get("api/courses/:courseId/lessons")
  async getLessonsByCourse(
    @Param("courseId") courseId: string,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<LessonDto[]> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.lessonsService.getLessons({
      courseId: courseId.trim(),
      actorUser,
    });
  }

  @Post("api/lessons")
  async createOrUpdateLesson(
    @Body() payload: LessonDto,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<LessonDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.lessonsService.saveLesson(payload, actorUser);
  }

  @Put("api/lessons")
  async replaceLessonsForCourse(
    @Query("courseId") courseId: string | undefined,
    @Body() payload: LessonDto[],
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<{ ok: true }> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    await this.lessonsService.replaceLessonsByCourse(
      {
        courseId: courseId?.trim() || "",
        lessons: Array.isArray(payload) ? payload : [],
      },
      actorUser
    );
    return { ok: true };
  }

  @Delete("api/lessons")
  async deleteLessonsForCourse(
    @Query("courseId") courseId: string | undefined,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<{ ok: true }> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    await this.lessonsService.deleteLessonsByCourse(courseId?.trim() || "", actorUser);
    return { ok: true };
  }
}
