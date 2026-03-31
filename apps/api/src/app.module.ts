import { Module } from "@nestjs/common";
import { AccessModule } from "./access/access.module";
import { CoursesModule } from "./courses/courses.module";
import { DatabaseModule } from "./db/database.module";
import { HealthModule } from "./health/health.module";
import { LessonsModule } from "./lessons/lessons.module";
import { RedisModule } from "./redis/redis.module";

@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    HealthModule,
    CoursesModule,
    LessonsModule,
    AccessModule,
  ],
})
export class AppModule {}
