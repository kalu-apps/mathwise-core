import { Module } from "@nestjs/common";
import { StageAccessController } from "./stage-access.controller";
import { StageAccessService } from "./stage-access.service";

@Module({
  controllers: [StageAccessController],
  providers: [StageAccessService],
  exports: [StageAccessService],
})
export class StageAccessModule {}

