import {
  Body,
  Controller,
  Get,
  HttpException,
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
import { ChatService } from "./chat.service";
import type {
  DeleteTeacherChatMessagePayloadDto,
  SendTeacherChatMessagePayloadDto,
  TeacherChatEligibilityDto,
  TeacherChatMessageDto,
  TeacherChatThreadDto,
  UpdateTeacherChatMessagePayloadDto,
} from "./chat.types";

type RequestWithCookie = {
  headers?: {
    cookie?: string;
  };
};

type HttpResponseWithHeaders = {
  setHeader: (name: string, value: string) => void;
};

@Controller("api/chat")
export class ChatController {
  constructor(
    private readonly authService: AuthService,
    private readonly chatService: ChatService
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

  @Get("eligibility")
  async getEligibility(
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<TeacherChatEligibilityDto> {
    const actorUser = await this.requireUser(req, res);
    return this.chatService.getEligibility(actorUser);
  }

  @Get("threads")
  async getThreads(
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<TeacherChatThreadDto[]> {
    const actorUser = await this.requireUser(req, res);
    return this.chatService.getThreads(actorUser);
  }

  @Get("messages")
  async getMessages(
    @Query("threadId") threadId: string | undefined,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<TeacherChatMessageDto[]> {
    const actorUser = await this.requireUser(req, res);
    return this.chatService.getMessages({
      actorUser,
      threadId: threadId?.trim() || "",
    });
  }

  @Post("messages")
  async sendMessage(
    @Body() body: SendTeacherChatMessagePayloadDto,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<TeacherChatMessageDto> {
    const actorUser = await this.requireUser(req, res);
    return this.chatService.sendMessage({
      actorUser,
      payload: body ?? { text: "" },
    });
  }

  @Put("messages/:messageId")
  async updateMessage(
    @Param("messageId") messageId: string,
    @Body() body: UpdateTeacherChatMessagePayloadDto,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<TeacherChatMessageDto> {
    const actorUser = await this.requireUser(req, res);
    return this.chatService.updateMessage({
      actorUser,
      messageId: messageId.trim(),
      payload: body,
    });
  }

  @Post("messages/:messageId/delete")
  async deleteMessage(
    @Param("messageId") messageId: string,
    @Body() body: DeleteTeacherChatMessagePayloadDto,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<{ ok: boolean }> {
    const actorUser = await this.requireUser(req, res);
    return this.chatService.deleteMessage({
      actorUser,
      messageId: messageId.trim(),
      payload: body,
    });
  }

  @Post("threads/mark-read")
  async markThreadRead(
    @Body() body: { threadId?: string },
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<{ ok: boolean }> {
    const actorUser = await this.requireUser(req, res);
    return this.chatService.markThreadRead({
      actorUser,
      threadId: body?.threadId?.trim() || "",
    });
  }

  @Post("threads/:threadId/clear")
  async clearThread(
    @Param("threadId") threadId: string,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<{ ok: boolean }> {
    const actorUser = await this.requireUser(req, res);
    return this.chatService.clearThread({
      actorUser,
      threadId: threadId.trim(),
    });
  }
}
