import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { DatabaseService } from "../db/database.service";
import { getApiRuntimeConfig } from "../config/runtime.config";
import { MediaService } from "../media/media.service";
import { RuntimeDiagnosticsService } from "../observability/runtime-diagnostics.service";
import { RedisService } from "../redis/redis.service";

@Controller()
export class HealthController {
  private readonly runtimeConfig = getApiRuntimeConfig();

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
    private readonly mediaService: MediaService,
    private readonly runtimeDiagnosticsService: RuntimeDiagnosticsService
  ) {}

  @Get("health")
  getHealth() {
    const diagnostics = this.runtimeDiagnosticsService.snapshot();
    return {
      ok: true,
      service: "mathwise-api-pilot",
      appEnv: this.runtimeConfig.appEnv,
      releaseVersion: this.runtimeConfig.releaseVersion,
      uptimeSec: diagnostics.uptimeSec,
      timestamp: new Date().toISOString(),
    };
  }

  @Get("ready")
  async getReadiness() {
    const [postgresOk, redisOk, mediaOk] = await Promise.all([
      this.databaseService.ping(),
      this.redisService.ping(),
      this.mediaService.isStorageReady(),
    ]);
    const mediaEnabled = this.mediaService.isStorageEnabled();

    const payload = {
      ok: postgresOk && redisOk && (!mediaEnabled || mediaOk),
      releaseVersion: this.runtimeConfig.releaseVersion,
      dependencies: {
        postgres: postgresOk ? "up" : "down",
        redis: redisOk ? "up" : "down",
        media: mediaEnabled ? (mediaOk ? "up" : "down") : "disabled",
      },
      timestamp: new Date().toISOString(),
    };

    if (!payload.ok) {
      throw new ServiceUnavailableException(payload);
    }

    return payload;
  }
}
