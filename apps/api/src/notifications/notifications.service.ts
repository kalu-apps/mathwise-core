import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import nodemailer, { type SendMailOptions } from "nodemailer";
import { getApiRuntimeConfig } from "../config/runtime.config";
import {
  type EnqueueNotificationInput,
  type NotificationOutboxRecordDto,
  type NotificationStatus,
} from "./notifications.types";
import { NotificationsRepository } from "./notifications.repository";
import { buildNotificationMailContent } from "./notifications.mail-content";

type SmtpTransport = {
  sendMail(mail: SendMailOptions): Promise<unknown>;
};

type SmtpTransportFactory = (options: {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
  connectionTimeout: number;
  socketTimeout: number;
}) => SmtpTransport;

const defaultSmtpTransportFactory: SmtpTransportFactory = (options) =>
  nodemailer.createTransport(options);

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly runtimeConfig = getApiRuntimeConfig();
  private readonly logger = new Logger(NotificationsService.name);
  private smtpTransporter: SmtpTransport | null = null;

  constructor(
    private readonly notificationsRepository: NotificationsRepository,
    private readonly smtpTransportFactory: SmtpTransportFactory = defaultSmtpTransportFactory
  ) {}

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

  private maskEmail(email: string) {
    const [localPart, domain] = email.trim().split("@");
    if (!domain || !localPart) return "***";
    const anchor = localPart.slice(0, 1);
    return `${anchor}***@${domain}`;
  }

  private getSmtpTransporter() {
    if (this.smtpTransporter) {
      return this.smtpTransporter;
    }
    this.smtpTransporter = this.smtpTransportFactory({
      host: this.runtimeConfig.emailSmtpHost,
      port: this.runtimeConfig.emailSmtpPort,
      secure: this.runtimeConfig.emailSmtpSecure,
      auth: {
        user: this.runtimeConfig.emailSmtpUser,
        pass: this.runtimeConfig.emailSmtpPass,
      },
      connectionTimeout: this.runtimeConfig.mailConnectTimeoutMs,
      socketTimeout: this.runtimeConfig.mailSocketTimeoutMs,
    });
    return this.smtpTransporter;
  }

  private async dispatchSmtp(item: NotificationOutboxRecordDto) {
    const mailContent = buildNotificationMailContent({
      template: item.template,
      payload: item.payload,
      appEnv: this.runtimeConfig.appEnv,
      subjectPrefix: this.runtimeConfig.mailSubjectPrefix,
      appendStageFooter: this.runtimeConfig.mailAppendStageFooter,
    });

    const message: SendMailOptions = {
      from: {
        name: this.runtimeConfig.mailFromName,
        address: this.runtimeConfig.mailFrom,
      },
      to: item.recipientEmail,
      replyTo: this.runtimeConfig.mailReplyTo,
      subject: mailContent.subject,
      text: mailContent.text,
      html: mailContent.html,
    };
    if (this.runtimeConfig.mailBcc.length > 0) {
      message.bcc = this.runtimeConfig.mailBcc;
    }

    this.logger.log(
      JSON.stringify({
        event: "notification_dispatch_attempt",
        deliveryMode: "smtp",
        outboxId: item.id,
        template: item.template,
        recipient: this.maskEmail(item.recipientEmail),
        dryRun: this.runtimeConfig.mailDryRun,
      })
    );

    if (this.runtimeConfig.mailDryRun) {
      return;
    }

    await this.getSmtpTransporter().sendMail(message);
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
      if (this.runtimeConfig.emailDeliveryMode === "provider") {
        throw new Error("provider_dispatch_not_implemented");
      }
      if (this.runtimeConfig.emailDeliveryMode !== "smtp") {
        throw new Error("unknown_delivery_mode");
      }

      await this.dispatchSmtp(item);
      await this.notificationsRepository.markSent(item.id);
      this.logger.log(
        JSON.stringify({
          event: "notification_dispatch_success",
          deliveryMode: "smtp",
          outboxId: item.id,
          template: item.template,
          recipient: this.maskEmail(item.recipientEmail),
        })
      );
      return { ok: true, delivered: 1 };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "delivery_failed";
      this.logger.error(
        JSON.stringify({
          event: "notification_dispatch_failed",
          deliveryMode: this.runtimeConfig.emailDeliveryMode,
          outboxId: item.id,
          template: item.template,
          recipient: this.maskEmail(item.recipientEmail),
          error: message,
        })
      );
      await this.notificationsRepository.markFailed(item.id, message);
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
