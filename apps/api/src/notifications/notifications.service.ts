import { Injectable, OnModuleInit } from "@nestjs/common";
import { getApiRuntimeConfig } from "../config/runtime.config";
import {
  type EnqueueNotificationInput,
  type NotificationOutboxRecordDto,
  type NotificationStatus,
} from "./notifications.types";
import { NotificationsRepository } from "./notifications.repository";

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly runtimeConfig = getApiRuntimeConfig();

  constructor(private readonly notificationsRepository: NotificationsRepository) {}

  async onModuleInit() {
    await this.notificationsRepository.ensureSchema();
  }

  async enqueue(input: EnqueueNotificationInput): Promise<NotificationOutboxRecordDto> {
    return this.notificationsRepository.enqueue(input);
  }

  async enqueueAndDispatch(
    input: EnqueueNotificationInput
  ): Promise<NotificationOutboxRecordDto> {
    const record = await this.notificationsRepository.enqueue(input);
    await this.dispatchById(record.id);
    const updated = await this.notificationsRepository.findById(record.id);
    return updated ?? record;
  }

  async list(params?: {
    status?: NotificationStatus;
    template?: string;
    email?: string;
  }) {
    return this.notificationsRepository.list(params);
  }

  async dispatchById(id: string): Promise<{ ok: boolean; delivered: number }> {
    const item = await this.notificationsRepository.findById(id);
    if (!item) {
      return { ok: false, delivered: 0 };
    }
    if (item.status === "sent") {
      return { ok: true, delivered: 0 };
    }
    if (item.attemptCount >= item.maxAttempts) {
      await this.notificationsRepository.markFailed(
        item.id,
        "max_attempts_reached"
      );
      return { ok: false, delivered: 0 };
    }

    if (this.runtimeConfig.emailDeliveryMode === "disabled") {
      await this.notificationsRepository.markFailed(item.id, "dispatch_disabled");
      return { ok: true, delivered: 0 };
    }

    try {
      // Provider adapter must mark delivery based on provider acknowledgement.
      // Until adapter is implemented, we fail explicitly instead of reporting sent.
      throw new Error("provider_dispatch_not_implemented");
    } catch (error) {
      await this.notificationsRepository.markFailed(
        item.id,
        error instanceof Error ? error.message : "delivery_failed"
      );
      return { ok: false, delivered: 0 };
    }
  }

  async retryById(id: string): Promise<{ ok: boolean; delivered: number }> {
    const item = await this.notificationsRepository.findById(id);
    if (!item) {
      return { ok: false, delivered: 0 };
    }
    await this.notificationsRepository.markQueued(item.id);
    return this.dispatchById(item.id);
  }
}
