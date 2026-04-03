import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import {
  buildSessionClearCookie,
  readSessionIdFromCookieHeader,
} from "../auth/auth.cookies";
import { AuthService } from "../auth/auth.service";
import type { AuthUserDto } from "../auth/auth.types";
import { MediaService } from "./media.service";
import type {
  AbortMultipartUploadPayloadDto,
  AbortMultipartUploadResponseDto,
  CompleteMultipartUploadPayloadDto,
  CompleteMultipartUploadResponseDto,
  CompleteUploadPayloadDto,
  CompleteUploadResponseDto,
  CreateMultipartUploadPayloadDto,
  CreateMultipartUploadResponseDto,
  CreateUploadUrlPayloadDto,
  CreateUploadUrlResponseDto,
  GetDownloadUrlResponseDto,
  MarkFinalizeFailedResponseDto,
} from "./media.types";

type RequestWithCookie = {
  headers?: {
    cookie?: string;
  };
};

type HttpResponseWithHeaders = {
  setHeader: (name: string, value: string) => void;
};

@Controller("api/media")
export class MediaController {
  constructor(
    private readonly authService: AuthService,
    private readonly mediaService: MediaService
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

  @Post("upload-url")
  async createUploadUrl(
    @Body() payload: CreateUploadUrlPayloadDto,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<CreateUploadUrlResponseDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.mediaService.createUploadUrl({
      payload,
      actorUser,
    });
  }

  @Post("multipart/initiate")
  async createMultipartUpload(
    @Body() payload: CreateMultipartUploadPayloadDto,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<CreateMultipartUploadResponseDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.mediaService.createMultipartUpload({
      payload,
      actorUser,
    });
  }

  @Post(":id/complete")
  async completeUpload(
    @Param("id") id: string,
    @Body() payload: CompleteUploadPayloadDto | undefined,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<CompleteUploadResponseDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.mediaService.completeUpload({
      objectId: id,
      payload,
      actorUser,
    });
  }

  @Post("multipart/:id/complete")
  async completeMultipartUpload(
    @Param("id") id: string,
    @Body() payload: CompleteMultipartUploadPayloadDto,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<CompleteMultipartUploadResponseDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.mediaService.completeMultipartUpload({
      objectId: id,
      payload,
      actorUser,
    });
  }

  @Post("multipart/:id/abort")
  async abortMultipartUpload(
    @Param("id") id: string,
    @Body() payload: AbortMultipartUploadPayloadDto,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<AbortMultipartUploadResponseDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.mediaService.abortMultipartUpload({
      objectId: id,
      payload,
      actorUser,
    });
  }

  @Post(":id/finalize-failed")
  async markFinalizeFailed(
    @Param("id") id: string,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<MarkFinalizeFailedResponseDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.mediaService.markFinalizeFailed({
      objectId: id,
      actorUser,
    });
  }

  @Get(":id/download-url")
  async getDownloadUrl(
    @Param("id") id: string,
    @Req() req: RequestWithCookie,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): Promise<GetDownloadUrlResponseDto> {
    const actorUser = await this.resolveUserFromRequest(req, res);
    return this.mediaService.getDownloadUrl({
      objectId: id,
      actorUser,
    });
  }
}
