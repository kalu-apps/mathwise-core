import { Body, Controller, Get, Post, Req, Res } from "@nestjs/common";
import { StageAccessService } from "./stage-access.service";
import type {
  StageAccessStatusDto,
  StageAccessVerifyResponseDto,
} from "./stage-access.types";

type RequestWithCookie = {
  headers?: {
    cookie?: string;
  };
};

type HttpResponseWithHeaders = {
  setHeader: (name: string, value: string) => void;
};

@Controller("api/stage-access")
export class StageAccessController {
  constructor(private readonly stageAccessService: StageAccessService) {}

  @Get("status")
  getStatus(@Req() req: RequestWithCookie): StageAccessStatusDto {
    return this.stageAccessService.getStatus(req.headers?.cookie);
  }

  @Post("verify")
  verify(
    @Body() body: { secret?: string } | undefined,
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): StageAccessVerifyResponseDto {
    const { response, setCookie } = this.stageAccessService.verify(
      body?.secret ?? ""
    );
    res.setHeader("Set-Cookie", setCookie);
    return response;
  }

  @Post("logout")
  logout(
    @Res({ passthrough: true }) res: HttpResponseWithHeaders
  ): StageAccessVerifyResponseDto {
    const { response, clearCookie } = this.stageAccessService.buildLogoutPayload();
    res.setHeader("Set-Cookie", clearCookie);
    return response;
  }
}

