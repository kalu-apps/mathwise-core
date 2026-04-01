import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AssessmentsController } from "./assessments.controller";
import { AssessmentsRepository } from "./assessments.repository";
import { AssessmentsService } from "./assessments.service";

@Module({
  imports: [AuthModule],
  controllers: [AssessmentsController],
  providers: [AssessmentsRepository, AssessmentsService],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
