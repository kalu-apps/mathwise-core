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
  MarkTeacherChatVoiceListenedPayloadDto,
  SendTeacherChatMessagePayloadDto,
  TeacherChatEligibilityDto,
  TeacherChatMediaAccessDto,
  TeacherChatMessageDto,
  TeacherChatRealtimeEventDto,
  TeacherChatThreadDto,
  UpdateTeacherChatMessagePayloadDto,
} from "./chat.types";

type RequestWithCookie = {
  headers?: {
    cookie?: string;
    "last-event-id"?: string;
  };
};

type EventStreamRequest = RequestWithCookie & {
  on: (event: "close", listener: () => void) => void;
};

type HttpResponseWithHeaders = {
  setHeader: (name: string, value: string) => void;
};

type EventStreamResponse = HttpResponseWithHeaders & {
  write: (chunk: string) => void;
  end: () => void;
  flushHeaders?: () => void;
};

const parseLastEventId = (value: string | undefined): number | undefined => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
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

  @Get("events")
  async streamEvents(
    @Query("threadId") threadId: string | undefined,
    @Query("lastEventId") lastEventId: string | undefined,
    @Req() req: EventStreamRequest,
    @Res() res: EventStreamResponse
  ): Promise<void> {
    const actorUser = await this.requireUser(req, res);
    const normalizedThreadId = threadId?.trim() || undefined;
    if (normalizedThreadId) {
      await this.chatService.assertEventStreamAccess(actorUser, normalizedThreadId);
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const writeEvent = (event: TeacherChatRealtimeEventDto) => {
      res.write("event: chat\n");
      if (event.type !== "connected" && event.type !== "ping" && event.version > 0) {
        res.write(`id: ${event.version}\n`);
      }
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    const unsubscribe = this.chatService.subscribeToEvents({
      actorUser,
      threadId: normalizedThreadId,
      lastEventId: parseLastEventId(lastEventId ?? req.headers?.["last-event-id"]),
      emit: writeEvent,
    });
    req.on("close", () => {
      unsubscribe();
      res.end();
    });
  }

  @Get("messages/:messageId/media/:mediaObjectId/access")
  async getMessageMediaAccess(
    @Param("messageId") messageId: string,
    @Param("mediaObjectId") mediaObjectId: string,
    @Query("threadId") threadId: string | undefined,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<TeacherChatMediaAccessDto> {
    const actorUser = await this.requireUser(req, res);
    return this.chatService.getMessageMediaAccess({
      actorUser,
      threadId: threadId?.trim() || "",
      messageId: messageId.trim(),
      mediaObjectId: mediaObjectId.trim(),
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

  @Post("messages/:messageId/voice/listened")
  async markVoiceListened(
    @Param("messageId") messageId: string,
    @Body() body: MarkTeacherChatVoiceListenedPayloadDto,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<{ ok: boolean }> {
    const actorUser = await this.requireUser(req, res);
    return this.chatService.markVoiceListened({
      actorUser,
      messageId: messageId.trim(),
      payload: {
        threadId: body?.threadId?.trim() || "",
      },
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
