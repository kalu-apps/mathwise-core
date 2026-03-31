import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CoursesModule } from "../courses/courses.module";
import { LessonsModule } from "../lessons/lessons.module";
import { ProfileController } from "./profile.controller";
import { ProfileRepository } from "./profile.repository";
import { ProfileService } from "./profile.service";

@Module({
  imports: [AuthModule, CoursesModule, LessonsModule],
  controllers: [ProfileController],
  providers: [ProfileService, ProfileRepository],
  exports: [ProfileService, ProfileRepository],
})
export class ProfileModule {}
