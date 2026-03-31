import { Module } from "@nestjs/common";
import { LessonsController } from "./lessons.controller";
import { LessonsRepository } from "./lessons.repository";
import { LessonsService } from "./lessons.service";

@Module({
  controllers: [LessonsController],
  providers: [LessonsService, LessonsRepository],
  exports: [LessonsRepository, LessonsService],
})
export class LessonsModule {}
