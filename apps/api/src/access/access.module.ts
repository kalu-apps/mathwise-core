import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CoursesModule } from "../courses/courses.module";
import { LessonsModule } from "../lessons/lessons.module";
import { AccessController } from "./access.controller";
import { AccessRepository } from "./access.repository";
import { AccessService } from "./access.service";

@Module({
  imports: [AuthModule, CoursesModule, LessonsModule],
  controllers: [AccessController],
  providers: [AccessService, AccessRepository],
  exports: [AccessRepository, AccessService],
})
export class AccessModule {}
