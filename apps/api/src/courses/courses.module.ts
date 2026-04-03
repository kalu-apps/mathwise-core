import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LessonsModule } from "../lessons/lessons.module";
import { MediaModule } from "../media/media.module";
import { CoursesController } from "./courses.controller";
import { CoursesRepository } from "./courses.repository";
import { CoursesService } from "./courses.service";

@Module({
  imports: [AuthModule, LessonsModule, MediaModule],
  controllers: [CoursesController],
  providers: [CoursesService, CoursesRepository],
  exports: [CoursesRepository, CoursesService],
})
export class CoursesModule {}
