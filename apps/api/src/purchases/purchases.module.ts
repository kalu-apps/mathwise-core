import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CoursesModule } from "../courses/courses.module";
import { LessonsModule } from "../lessons/lessons.module";
import { PurchasesController } from "./purchases.controller";
import { PurchasesRepository } from "./purchases.repository";
import { PurchasesService } from "./purchases.service";

@Module({
  imports: [AuthModule, CoursesModule, LessonsModule],
  controllers: [PurchasesController],
  providers: [PurchasesService, PurchasesRepository],
  exports: [PurchasesService, PurchasesRepository],
})
export class PurchasesModule {}
