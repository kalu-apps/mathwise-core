import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../db/database.service";
import type { MediaObjectRecord, MediaObjectState } from "./media.types";

type MediaObjectRow = {
  id: string;
  objectKey: string;
  bucket: string;
  ownerUserId: string;
  category: string;
  contentType: string;
  sizeBytes: string | null;
  etag: string | null;
  state: MediaObjectState;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class MediaRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async ensureSchema() {
    await this.databaseService.execute(`
      CREATE TABLE IF NOT EXISTS media_objects (
        id TEXT PRIMARY KEY,
        object_key TEXT NOT NULL UNIQUE,
        bucket TEXT NOT NULL,
        owner_user_id TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
        size_bytes BIGINT,
        etag TEXT,
        state TEXT NOT NULL CHECK (state IN ('pending_upload', 'uploaded', 'deleted')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_at_ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_media_objects_owner_created
      ON media_objects (owner_user_id, created_at DESC)
    `);
    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_media_objects_state_updated
      ON media_objects (state, updated_at DESC)
    `);
  }

  async insertPending(record: MediaObjectRecord): Promise<void> {
    await this.databaseService.execute(
      `
        INSERT INTO media_objects (
          id,
          object_key,
          bucket,
          owner_user_id,
          category,
          content_type,
          size_bytes,
          etag,
          state,
          created_at,
          updated_at,
          updated_at_ts
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW()
        )
      `,
      [
        record.id,
        record.objectKey,
        record.bucket,
        record.ownerUserId,
        record.category,
        record.contentType,
        record.sizeBytes ?? null,
        record.etag ?? null,
        record.state,
        record.createdAt,
        record.updatedAt,
      ]
    );
  }

  async findById(id: string): Promise<MediaObjectRecord | null> {
    const rows = await this.databaseService.query<MediaObjectRow>(
      `
        SELECT
          id,
          object_key AS "objectKey",
          bucket,
          owner_user_id AS "ownerUserId",
          category,
          content_type AS "contentType",
          size_bytes::text AS "sizeBytes",
          etag,
          state,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM media_objects
        WHERE id = $1
        LIMIT 1
      `,
      [id]
    );
    const row = rows[0];
    if (!row) return null;
    return this.mapRow(row);
  }

  async markUploaded(params: {
    id: string;
    sizeBytes?: number;
    etag?: string;
  }): Promise<MediaObjectRecord | null> {
    const rows = await this.databaseService.query<MediaObjectRow>(
      `
        UPDATE media_objects
        SET
          state = 'uploaded',
          size_bytes = COALESCE($2, size_bytes),
          etag = COALESCE($3, etag),
          updated_at = $4,
          updated_at_ts = NOW()
        WHERE id = $1
        RETURNING
          id,
          object_key AS "objectKey",
          bucket,
          owner_user_id AS "ownerUserId",
          category,
          content_type AS "contentType",
          size_bytes::text AS "sizeBytes",
          etag,
          state,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
      [
        params.id,
        params.sizeBytes && Number.isFinite(params.sizeBytes)
          ? Math.max(0, Math.floor(params.sizeBytes))
          : null,
        params.etag?.trim() || null,
        new Date().toISOString(),
      ]
    );
    const row = rows[0];
    return row ? this.mapRow(row) : null;
  }

  private mapRow(row: MediaObjectRow): MediaObjectRecord {
    const size = row.sizeBytes ? Number(row.sizeBytes) : Number.NaN;
    return {
      id: row.id,
      objectKey: row.objectKey,
      bucket: row.bucket,
      ownerUserId: row.ownerUserId,
      category: row.category,
      contentType: row.contentType,
      sizeBytes: Number.isFinite(size) ? size : undefined,
      etag: row.etag ?? undefined,
      state: row.state,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
