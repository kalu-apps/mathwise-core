import {
  Controller,
  Get,
  HttpException,
  Req,
  Res,
} from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import {
  buildSessionClearCookie,
  readSessionIdFromCookieHeader,
} from "../auth/auth.cookies";
import { ProfileService } from "./profile.service";
import type {
  StudentProfileContextDto,
  TeacherDashboardContextDto,
} from "./profile.types";
import type { AuthUserDto } from "../auth/auth.types";

type RequestWithCookie = {
  headers?: {
    cookie?: string;
  };
};

type HttpResponseWithHeaders = {
  setHeader: (name: string, value: string) => void;
};

@Controller("api")
export class ProfileController {
  constructor(
    private readonly authService: AuthService,
    private readonly profileService: ProfileService
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

  @Get("profile/me")
  async getProfileMe(
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<AuthUserDto | null> {
    return this.resolveUserFromRequest(req, res);
  }

  @Get("public/teachers")
  async getPublicTeachers(): Promise<AuthUserDto[]> {
    return this.profileService.getPublicTeachers();
  }

  @Get("student/context")
  async getStudentContext(
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<StudentProfileContextDto> {
    const user = await this.resolveUserFromRequest(req, res);
    if (!user) {
      throw new HttpException({ error: "Требуется авторизация." }, 401);
    }
    if (user.role !== "student") {
      throw new HttpException({ error: "Доступ только для ученика." }, 403);
    }
    return this.profileService.getStudentContext(user.id);
  }

  @Get("teacher/context")
  async getTeacherContext(
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<TeacherDashboardContextDto> {
    const user = await this.resolveUserFromRequest(req, res);
    if (!user) {
      throw new HttpException({ error: "Требуется авторизация." }, 401);
    }
    if (user.role !== "teacher") {
      throw new HttpException({ error: "Доступ только для преподавателя." }, 403);
    }
    return this.profileService.getTeacherDashboardContext(user.id);
  }
}
