import { Body, Controller, Get, HttpException, Post, Query } from "@nestjs/common";
import { getApiRuntimeConfig } from "../config/runtime.config";
import { NotificationsService } from "./notifications.service";
import type { NotificationStatus } from "./notifications.types";

@Controller("api/notifications/outbox")
export class NotificationsController {
  private readonly runtimeConfig = getApiRuntimeConfig();

  constructor(private readonly notificationsService: NotificationsService) {}

  private assertDebugAccessAllowed() {
    if (this.runtimeConfig.appEnv !== "local") {
      throw new HttpException(
        { error: "Outbox diagnostics are disabled outside local APP_ENV." },
        403
      );
    }
  }

  @Get()
  async list(
    @Query("status") status?: NotificationStatus,
    @Query("template") template?: string,
    @Query("email") email?: string
  ) {
    this.assertDebugAccessAllowed();
    return this.notificationsService.list({
      status,
      template: template?.trim() || undefined,
      email: email?.trim() || undefined,
    });
  }

  @Post("retry")
  async retry(@Body() body: { id?: string }) {
    this.assertDebugAccessAllowed();
    const id = body?.id?.trim();
    if (!id) {
      return { ok: false, delivered: 0 };
    }
    return this.notificationsService.retryById(id);
  }
}
