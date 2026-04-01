import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  Res,
} from "@nestjs/common";
import {
  buildSessionClearCookie,
  readSessionIdFromCookieHeader,
} from "../auth/auth.cookies";
import { AuthService } from "../auth/auth.service";
import type { AuthUserDto } from "../auth/auth.types";
import { CoursesService } from "./courses.service";
import type {
  CourseAssessmentReleaseItemDto,
  CourseCatalogItemDto,
  PublishCourseResponseDto,
} from "./courses.types";

type RequestWithCookie = {
  headers?: {
    cookie?: string;
  };
};

type HttpResponseWithHeaders = {
  setHeader: (name: string, value: string) => void;
};

@Controller("api")
export class CoursesController {
  constructor(
    private readonly authService: AuthService,
    private readonly coursesService: CoursesService
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
  async getCatalog(): Promise<CourseCatalogItemDto[]> {
    return this.coursesService.getCatalog();
  }

  @Get("courses/:id")
  async getCourseById(
    @Param("id") courseId: string,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<CourseCatalogItemDto | null> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.coursesService.getById(courseId, actorUser);
  }

  @Get("teacher/courses/drafts")
  async getTeacherDrafts(
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<CourseCatalogItemDto[]> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.coursesService.getTeacherDrafts(actorUser);
  }

  @Post("courses")
  async createDraft(
    @Body() payload: CourseCatalogItemDto,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<CourseCatalogItemDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.coursesService.createDraft(payload, actorUser);
  }

  @Put("courses/:id")
  async updateDraft(
    @Param("id") courseId: string,
    @Body() payload: CourseCatalogItemDto,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<CourseCatalogItemDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.coursesService.updateDraft(courseId, payload, actorUser);
  }

  @Delete("courses/:id")
  async deleteDraft(
    @Param("id") courseId: string,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<{ ok: true }> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    await this.coursesService.deleteDraft(courseId, actorUser);
    return { ok: true };
  }

  @Post("courses/:id/publish")
  async publishCourse(
    @Param("id") courseId: string,
    @Body() body: { assessmentsSnapshot?: CourseAssessmentReleaseItemDto[] } | undefined,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<PublishCourseResponseDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.coursesService.publishCourse({
      courseId,
      actorUser,
      assessmentsSnapshot: body?.assessmentsSnapshot,
    });
  }
}
