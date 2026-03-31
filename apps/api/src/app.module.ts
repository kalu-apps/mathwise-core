import { Module } from "@nestjs/common";
import { CoursesModule } from "./courses/courses.module";
import { DatabaseModule } from "./db/database.module";
import { HealthModule } from "./health/health.module";
import { RedisModule } from "./redis/redis.module";

@Module({
  imports: [DatabaseModule, RedisModule, HealthModule, CoursesModule],
})
export class AppModule {}
