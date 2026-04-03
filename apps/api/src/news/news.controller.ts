import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import {
  buildSessionClearCookie,
  readSessionIdFromCookieHeader,
} from "../auth/auth.cookies";
import type { AuthUserDto } from "../auth/auth.types";
import { NewsService } from "./news.service";
import type {
  CreateNewsPostPayloadDto,
  NewsPostDto,
  UpdateNewsPostPayloadDto,
} from "./news.types";

type RequestWithCookie = {
  headers?: {
    cookie?: string;
  };
};

type HttpResponseWithHeaders = {
  setHeader: (name: string, value: string) => void;
};

@Controller("api/news")
export class NewsController {
  constructor(
    private readonly authService: AuthService,
    private readonly newsService: NewsService
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

  @Get()
  async getNews(
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<NewsPostDto[]> {
    const actorUser = await this.requireUser(req, res);
    return this.newsService.listForActor(actorUser);
  }

  @Post()
  async createNews(
    @Body() body: CreateNewsPostPayloadDto,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<NewsPostDto> {
    const actorUser = await this.requireUser(req, res);
    return this.newsService.create({
      actorUser,
      payload: body ?? {},
    });
  }

  @Put(":newsId")
  async updateNews(
    @Param("newsId") newsId: string,
    @Query("actorId") actorId: string | undefined,
    @Body() body: UpdateNewsPostPayloadDto,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<NewsPostDto> {
    const actorUser = await this.requireUser(req, res);
    return this.newsService.update({
      actorUser,
      newsId: newsId.trim(),
      actorId,
      payload: body ?? {},
    });
  }

  @Delete(":newsId")
  async deleteNews(
    @Param("newsId") newsId: string,
    @Query("actorId") actorId: string | undefined,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<{ id: string }> {
    const actorUser = await this.requireUser(req, res);
    return this.newsService.delete({
      actorUser,
      newsId: newsId.trim(),
      actorId,
    });
  }
}
