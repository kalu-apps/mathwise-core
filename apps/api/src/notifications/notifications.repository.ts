import { Injectable } from "@nestjs/common";
import { DatabaseService, type DatabaseExecutor } from "../db/database.service";
import type {
  EnqueueNotificationInput,
  NotificationOutboxRecordDto,
  NotificationStatus,
} from "./notifications.types";

type NotificationOutboxRow = {
  id: string;
  template: string;
  dedupeKey: string;
  recipientEmail: string;
  userId: string | null;
  checkoutId: string | null;
  status: NotificationStatus;
  payload: unknown;
  attemptCount: number;
  maxAttempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
};

const mapRow = (row: NotificationOutboxRow): NotificationOutboxRecordDto => ({
  id: row.id,
  template: row.template as NotificationOutboxRecordDto["template"],
  dedupeKey: row.dedupeKey,
  recipientEmail: row.recipientEmail,
  userId: row.userId ?? undefined,
  checkoutId: row.checkoutId ?? undefined,
  status: row.status,
  payload:
    row.payload && typeof row.payload === "object"
      ? (row.payload as Record<string, unknown>)
      : {},
  attemptCount: Number(row.attemptCount) || 0,
  maxAttempts: Number(row.maxAttempts) || 3,
  lastError: row.lastError ?? undefined,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  sentAt: row.sentAt ?? undefined,
});

@Injectable()
export class NotificationsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async ensureSchema() {
    await this.databaseService.execute(`
      CREATE TABLE IF NOT EXISTS notification_outbox (
        id TEXT PRIMARY KEY,
        template TEXT NOT NULL,
        dedupe_key TEXT NOT NULL UNIQUE,
        recipient_email TEXT NOT NULL,
        user_id TEXT,
        checkout_id TEXT,
        status TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'failed')),
        payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sent_at TEXT,
        updated_at_ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_notification_outbox_status_created
      ON notification_outbox (status, created_at ASC)
    `);
    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_notification_outbox_recipient
      ON notification_outbox (recipient_email, created_at DESC)
    `);
  }

  async enqueue(input: EnqueueNotificationInput): Promise<NotificationOutboxRecordDto> {
    const now = new Date().toISOString();
    await this.databaseService.execute(
      `
        INSERT INTO notification_outbox (
          id,
          template,
          dedupe_key,
          recipient_email,
          user_id,
          checkout_id,
          status,
          payload_json,
          attempt_count,
          max_attempts,
          created_at,
          updated_at,
          updated_at_ts
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'queued', $7::jsonb, 0, $8, $9, $9, NOW())
        ON CONFLICT (dedupe_key)
        DO NOTHING
      `,
      [
        input.id,
        input.template,
        input.dedupeKey,
        input.recipientEmail,
        input.userId ?? null,
        input.checkoutId ?? null,
        JSON.stringify(input.payload ?? {}),
        Math.max(1, Math.floor(input.maxAttempts ?? 3)),
        now,
      ]
    );

    const row = await this.findByDedupeKey(input.dedupeKey);
    if (!row) {
      throw new Error("notification_outbox enqueue failed");
    }
    return row;
  }

  async findByDedupeKey(dedupeKey: string): Promise<NotificationOutboxRecordDto | null> {
    const rows = await this.databaseService.query<NotificationOutboxRow>(
      `
        SELECT
          id,
          template,
          dedupe_key AS "dedupeKey",
          recipient_email AS "recipientEmail",
          user_id AS "userId",
          checkout_id AS "checkoutId",
          status,
          payload_json AS payload,
          attempt_count AS "attemptCount",
          max_attempts AS "maxAttempts",
          last_error AS "lastError",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          sent_at AS "sentAt"
        FROM notification_outbox
        WHERE dedupe_key = $1
        LIMIT 1
      `,
      [dedupeKey]
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async list(params?: {
    status?: NotificationStatus;
    template?: string;
    email?: string;
  }): Promise<NotificationOutboxRecordDto[]> {
    const rows = await this.databaseService.query<NotificationOutboxRow>(
      `
        SELECT
          id,
          template,
          dedupe_key AS "dedupeKey",
          recipient_email AS "recipientEmail",
          user_id AS "userId",
          checkout_id AS "checkoutId",
          status,
          payload_json AS payload,
          attempt_count AS "attemptCount",
          max_attempts AS "maxAttempts",
          last_error AS "lastError",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          sent_at AS "sentAt"
        FROM notification_outbox
        WHERE ($1::text IS NULL OR status = $1)
          AND ($2::text IS NULL OR template = $2)
          AND ($3::text IS NULL OR LOWER(recipient_email) = LOWER($3))
        ORDER BY created_at DESC, id DESC
      `,
      [params?.status ?? null, params?.template ?? null, params?.email ?? null]
    );
    return rows.map(mapRow);
  }

  async findById(id: string): Promise<NotificationOutboxRecordDto | null> {
    const rows = await this.databaseService.query<NotificationOutboxRow>(
      `
        SELECT
          id,
          template,
          dedupe_key AS "dedupeKey",
          recipient_email AS "recipientEmail",
          user_id AS "userId",
          checkout_id AS "checkoutId",
          status,
          payload_json AS payload,
          attempt_count AS "attemptCount",
          max_attempts AS "maxAttempts",
          last_error AS "lastError",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          sent_at AS "sentAt"
        FROM notification_outbox
        WHERE id = $1
        LIMIT 1
      `,
      [id]
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async markSent(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.databaseService.execute(
      `
        UPDATE notification_outbox
        SET
          status = 'sent',
          attempt_count = attempt_count + 1,
          updated_at = $2,
          sent_at = COALESCE(sent_at, $2),
          last_error = NULL,
          updated_at_ts = NOW()
        WHERE id = $1
      `,
      [id, now]
    );
  }

  async markFailed(id: string, message: string): Promise<void> {
    const now = new Date().toISOString();
    await this.databaseService.execute(
      `
        UPDATE notification_outbox
        SET
          status = 'failed',
          attempt_count = attempt_count + 1,
          updated_at = $2,
          last_error = $3,
          updated_at_ts = NOW()
        WHERE id = $1
      `,
      [id, now, message.slice(0, 500)]
    );
  }

  async markQueued(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.databaseService.execute(
      `
        UPDATE notification_outbox
        SET
          status = 'queued',
          updated_at = $2,
          last_error = NULL,
          updated_at_ts = NOW()
        WHERE id = $1
      `,
      [id, now]
    );
  }

  async withTransaction<T>(callback: (executor: DatabaseExecutor) => Promise<T>) {
    return this.databaseService.transaction(callback);
  }
}
