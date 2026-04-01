import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { AccessModule } from "./access/access.module";
import { AuthModule } from "./auth/auth.module";
import { BookingsModule } from "./bookings/bookings.module";
import { CoursesModule } from "./courses/courses.module";
import { DatabaseModule } from "./db/database.module";
import { HealthModule } from "./health/health.module";
import { LessonsModule } from "./lessons/lessons.module";
import { MediaModule } from "./media/media.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { ObservabilityModule } from "./observability/observability.module";
import { RequestLoggingMiddleware } from "./observability/request-logging.middleware";
import { ProfileModule } from "./profile/profile.module";
import { PurchasesModule } from "./purchases/purchases.module";
import { RedisModule } from "./redis/redis.module";

@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    ObservabilityModule,
    HealthModule,
    AuthModule,
    CoursesModule,
    LessonsModule,
    MediaModule,
    NotificationsModule,
    AccessModule,
    ProfileModule,
    PurchasesModule,
    BookingsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggingMiddleware).forRoutes("*");
  }
}
