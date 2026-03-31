import { Module } from "@nestjs/common";
import { CoursesModule } from "../courses/courses.module";
import { LessonsModule } from "../lessons/lessons.module";
import { AccessController } from "./access.controller";
import { AccessRepository } from "./access.repository";
import { AccessService } from "./access.service";

@Module({
  imports: [CoursesModule, LessonsModule],
  controllers: [AccessController],
  providers: [AccessService, AccessRepository],
  exports: [AccessRepository, AccessService],
})
export class AccessModule {}
