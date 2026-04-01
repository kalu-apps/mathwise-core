import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LessonsController } from "./lessons.controller";
import { LessonsRepository } from "./lessons.repository";
import { LessonsService } from "./lessons.service";

@Module({
  imports: [AuthModule],
  controllers: [LessonsController],
  providers: [LessonsService, LessonsRepository],
  exports: [LessonsRepository, LessonsService],
})
export class LessonsModule {}
