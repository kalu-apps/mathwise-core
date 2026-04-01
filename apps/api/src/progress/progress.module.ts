import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LessonsModule } from "../lessons/lessons.module";
import { ProgressController } from "./progress.controller";
import { ProgressRepository } from "./progress.repository";
import { ProgressService } from "./progress.service";

@Module({
  imports: [AuthModule, LessonsModule],
  controllers: [ProgressController],
  providers: [ProgressRepository, ProgressService],
  exports: [ProgressService],
})
export class ProgressModule {}
