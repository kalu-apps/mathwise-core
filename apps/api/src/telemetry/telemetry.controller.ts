import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { TelemetryService } from "./telemetry.service";
import type { RumIngestPayloadDto, RumIngestResponseDto } from "./telemetry.types";

@Controller("api/telemetry")
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Post("rum")
  @HttpCode(202)
  ingestRum(@Body() body: RumIngestPayloadDto): RumIngestResponseDto {
    return this.telemetryService.ingestRum(body ?? {});
  }
}
