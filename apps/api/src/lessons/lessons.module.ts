import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MediaModule } from "../media/media.module";
import { LessonsController } from "./lessons.controller";
import { LessonsRepository } from "./lessons.repository";
import { LessonsService } from "./lessons.service";

@Module({
  imports: [AuthModule, MediaModule],
  controllers: [LessonsController],
  providers: [LessonsService, LessonsRepository],
  exports: [LessonsRepository, LessonsService],
})
export class LessonsModule {}
