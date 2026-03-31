import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { DatabaseService } from "../db/database.service";
import { RedisService } from "../redis/redis.service";

@Controller()
export class HealthController {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService
  ) {}

  @Get("health")
  getHealth() {
    return {
      ok: true,
      service: "mathwise-api-pilot",
      timestamp: new Date().toISOString(),
    };
  }

  @Get("ready")
  async getReadiness() {
    const [postgresOk, redisOk] = await Promise.all([
      this.databaseService.ping(),
      this.redisService.ping(),
    ]);

    const payload = {
      ok: postgresOk && redisOk,
      dependencies: {
        postgres: postgresOk ? "up" : "down",
        redis: redisOk ? "up" : "down",
      },
      timestamp: new Date().toISOString(),
    };

    if (!payload.ok) {
      throw new ServiceUnavailableException(payload);
    }

    return payload;
  }
}
