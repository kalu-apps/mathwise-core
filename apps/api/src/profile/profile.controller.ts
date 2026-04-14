import {
  Body,
  Controller,
  Get,
  HttpException,
  Post,
  Query,
  Put,
  Req,
  Res,
} from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import {
  buildSessionSetCookie,
  buildSessionClearCookie,
  readSessionIdFromCookieHeader,
} from "../auth/auth.cookies";
import { ProfileService } from "./profile.service";
import type {
  AcceptTeacherInvitePayloadDto,
  AcceptTeacherInviteResponseDto,
  CreateTeacherInvitePayloadDto,
  CreateTeacherInviteResponseDto,
  StudentProfileContextDto,
  TeacherInviteInspectResponseDto,
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

  @Put("profile/me")
  async updateProfileMe(
    @Body()
    body: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      photo?: string;
    },
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<AuthUserDto> {
    const user = await this.resolveUserFromRequest(req, res);
    if (!user) {
      throw new HttpException({ error: "Требуется авторизация." }, 401);
    }
    const updated = await this.profileService.updateProfile(user.id, {
      firstName: body?.firstName,
      lastName: body?.lastName,
      phone: body?.phone,
      photo: body?.photo,
    });
    if (!updated) {
      throw new HttpException({ error: "Пользователь не найден." }, 404);
    }
    return updated;
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

  @Post("teacher/invites")
  async createTeacherInvite(
    @Body() body: CreateTeacherInvitePayloadDto,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<CreateTeacherInviteResponseDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.profileService.createTeacherInvite({
      actorUser,
      payload: body ?? {},
    });
  }

  @Get("teacher/invites/inspect")
  async inspectTeacherInvite(
    @Query("token") token: string | undefined
  ): Promise<TeacherInviteInspectResponseDto> {
    return this.profileService.inspectTeacherInvite(token ?? "");
  }

  @Post("teacher/invites/accept")
  async acceptTeacherInvite(
    @Body() body: AcceptTeacherInvitePayloadDto,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<AcceptTeacherInviteResponseDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    const result = await this.profileService.acceptTeacherInvite({
      actorUser,
      payload: body ?? {},
    });
    if (result.sessionId) {
      res.setHeader("Set-Cookie", buildSessionSetCookie(result.sessionId));
    }
    return {
      ok: result.ok,
      inviteId: result.inviteId,
      teacherId: result.teacherId,
      studentId: result.studentId,
      accepted: result.accepted,
      sessionEstablished: result.sessionEstablished,
      nextPath: result.nextPath,
    };
  }
}
