import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { RedisModule } from "../redis/redis.module";
import { WorkbookController } from "./workbook.controller";
import { WorkbookService } from "./workbook.service";

@Module({
  imports: [AuthModule, CapabilitiesModule, RedisModule],
  controllers: [WorkbookController],
  providers: [WorkbookService],
})
export class WorkbookModule {}
