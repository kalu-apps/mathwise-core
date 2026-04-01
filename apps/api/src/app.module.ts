import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { AccessModule } from "./access/access.module";
import { AssessmentsModule } from "./assessments/assessments.module";
import { AuthModule } from "./auth/auth.module";
import { BookingsModule } from "./bookings/bookings.module";
import { CapabilitiesModule } from "./capabilities/capabilities.module";
import { ChatModule } from "./chat/chat.module";
import { CoursesModule } from "./courses/courses.module";
import { DatabaseModule } from "./db/database.module";
import { HealthModule } from "./health/health.module";
import { LessonsModule } from "./lessons/lessons.module";
import { MediaModule } from "./media/media.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { ObservabilityModule } from "./observability/observability.module";
import { RequestLoggingMiddleware } from "./observability/request-logging.middleware";
import { ProfileModule } from "./profile/profile.module";
import { ProgressModule } from "./progress/progress.module";
import { PurchasesModule } from "./purchases/purchases.module";
import { RedisModule } from "./redis/redis.module";
import { StageAccessModule } from "./stage-access/stage-access.module";
import { StageAccessGateMiddleware } from "./stage-access/stage-access.middleware";
import { WorkbookModule } from "./workbook/workbook.module";

@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    ObservabilityModule,
    HealthModule,
    AuthModule,
    AssessmentsModule,
    CoursesModule,
    LessonsModule,
    ProgressModule,
    MediaModule,
    NotificationsModule,
    AccessModule,
    CapabilitiesModule,
    ChatModule,
    ProfileModule,
    PurchasesModule,
    BookingsModule,
    StageAccessModule,
    WorkbookModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestLoggingMiddleware, StageAccessGateMiddleware)
      .forRoutes("*");
  }
}
