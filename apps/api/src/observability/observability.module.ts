import { Global, Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { HttpExceptionLoggingFilter } from "./http-exception.filter";
import { RequestLoggingMiddleware } from "./request-logging.middleware";
import { RuntimeDiagnosticsController } from "./runtime-diagnostics.controller";
import { RuntimeDiagnosticsService } from "./runtime-diagnostics.service";

@Global()
@Module({
  controllers: [RuntimeDiagnosticsController],
  providers: [
    RuntimeDiagnosticsService,
    RequestLoggingMiddleware,
    {
      provide: APP_FILTER,
      useClass: HttpExceptionLoggingFilter,
    },
  ],
  exports: [RuntimeDiagnosticsService, RequestLoggingMiddleware],
})
export class ObservabilityModule {}
