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

export type MediaReferenceUsage = {
  draftRefs: number;
  releaseRefs: number;
  purchaseRefs: number;
  totalRefs: number;
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
        state TEXT NOT NULL CHECK (
          state IN (
            'pending_upload',
            'uploaded',
            'orphan_candidate',
            'cleanup_pending',
            'upload_failed',
            'deleted'
          )
        ),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_at_ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.databaseService.execute(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          WHERE t.relname = 'media_objects'
            AND c.conname = 'media_objects_state_check'
        ) THEN
          ALTER TABLE media_objects DROP CONSTRAINT media_objects_state_check;
        END IF;
      END $$;
    `);
    await this.databaseService.execute(`
      ALTER TABLE media_objects
      ADD CONSTRAINT media_objects_state_check CHECK (
        state IN (
          'pending_upload',
          'uploaded',
          'orphan_candidate',
          'cleanup_pending',
          'upload_failed',
          'deleted'
        )
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
          AND state <> 'deleted'
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

  async markUploadFailed(params: {
    id: string;
    reason?: string;
  }): Promise<MediaObjectRecord | null> {
    const rows = await this.databaseService.query<MediaObjectRow>(
      `
        UPDATE media_objects
        SET
          state = 'upload_failed',
          updated_at = $2,
          updated_at_ts = NOW()
        WHERE id = $1
          AND state <> 'deleted'
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
      [params.id, new Date().toISOString()]
    );
    const row = rows[0];
    return row ? this.mapRow(row) : null;
  }

  async markOrphanCandidate(id: string): Promise<MediaObjectRecord | null> {
    const rows = await this.databaseService.query<MediaObjectRow>(
      `
        UPDATE media_objects
        SET
          state = 'orphan_candidate',
          updated_at = $2,
          updated_at_ts = NOW()
        WHERE id = $1
          AND state <> 'deleted'
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
      [id, new Date().toISOString()]
    );
    const row = rows[0];
    return row ? this.mapRow(row) : null;
  }

  async markCleanupPending(id: string): Promise<MediaObjectRecord | null> {
    const rows = await this.databaseService.query<MediaObjectRow>(
      `
        UPDATE media_objects
        SET
          state = 'cleanup_pending',
          updated_at = $2,
          updated_at_ts = NOW()
        WHERE id = $1
          AND state IN ('orphan_candidate', 'cleanup_pending', 'upload_failed')
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
      [id, new Date().toISOString()]
    );
    const row = rows[0];
    return row ? this.mapRow(row) : null;
  }

  async markDeleted(id: string): Promise<MediaObjectRecord | null> {
    const rows = await this.databaseService.query<MediaObjectRow>(
      `
        UPDATE media_objects
        SET
          state = 'deleted',
          updated_at = $2,
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
      [id, new Date().toISOString()]
    );
    const row = rows[0];
    return row ? this.mapRow(row) : null;
  }

  async markUploadedState(id: string): Promise<MediaObjectRecord | null> {
    const rows = await this.databaseService.query<MediaObjectRow>(
      `
        UPDATE media_objects
        SET
          state = 'uploaded',
          updated_at = $2,
          updated_at_ts = NOW()
        WHERE id = $1
          AND state <> 'deleted'
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
      [id, new Date().toISOString()]
    );
    const row = rows[0];
    return row ? this.mapRow(row) : null;
  }

  async markStalePendingAsFailed(maxAgeMinutes = 120): Promise<number> {
    const rows = await this.databaseService.query<{ count: string }>(
      `
        WITH affected AS (
          UPDATE media_objects
          SET
            state = 'upload_failed',
            updated_at = $1,
            updated_at_ts = NOW()
          WHERE state = 'pending_upload'
            AND updated_at_ts < (NOW() - ($2::int * INTERVAL '1 minute'))
          RETURNING id
        )
        SELECT COUNT(*)::text AS count FROM affected
      `,
      [new Date().toISOString(), Math.max(1, Math.floor(maxAgeMinutes))]
    );
    return Number(rows[0]?.count ?? 0);
  }

  async findCleanupCandidates(limit = 100): Promise<MediaObjectRecord[]> {
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
        WHERE state IN ('orphan_candidate', 'cleanup_pending', 'upload_failed')
        ORDER BY updated_at_ts ASC
        LIMIT $1
      `,
      [Math.max(1, Math.floor(limit))]
    );
    return rows.map((row) => this.mapRow(row));
  }

  async countReferencesByObjectId(objectId: string): Promise<MediaReferenceUsage> {
    const rows = await this.databaseService.query<{
      draftRefs: string;
      releaseRefs: string;
      purchaseRefs: string;
      newsRefs: string;
      chatRefs: string;
    }>(
      `
        SELECT
          (
            SELECT COUNT(*)::text
            FROM course_lessons cl
            WHERE cl.video_media_object_id = $1
               OR EXISTS (
                 SELECT 1
                 FROM jsonb_array_elements(COALESCE(cl.materials_json, '[]'::jsonb)) AS material
                 WHERE material->>'mediaObjectId' = $1
               )
          ) AS "draftRefs",
          (
            SELECT COUNT(*)::text
            FROM course_releases cr
            WHERE EXISTS (
              SELECT 1
              FROM jsonb_array_elements(COALESCE(cr.lessons_snapshot_json, '[]'::jsonb)) AS lesson
              WHERE lesson->>'videoMediaObjectId' = $1
                 OR EXISTS (
                   SELECT 1
                   FROM jsonb_array_elements(COALESCE(lesson->'materials', '[]'::jsonb)) AS material
                   WHERE material->>'mediaObjectId' = $1
                 )
            )
          ) AS "releaseRefs",
          (
            SELECT COUNT(*)::text
            FROM profile_purchases pp
            WHERE EXISTS (
              SELECT 1
              FROM jsonb_array_elements(COALESCE(pp.lessons_snapshot_json, '[]'::jsonb)) AS lesson
              WHERE lesson->>'videoMediaObjectId' = $1
                 OR EXISTS (
                   SELECT 1
                   FROM jsonb_array_elements(COALESCE(lesson->'materials', '[]'::jsonb)) AS material
                   WHERE material->>'mediaObjectId' = $1
                 )
            )
          ) AS "purchaseRefs",
          (
            SELECT COUNT(*)::text
            FROM news_posts np
            WHERE EXISTS (
              SELECT 1
              FROM jsonb_array_elements(COALESCE(np.attachments_json, '[]'::jsonb)) AS attachment
              WHERE attachment->>'mediaObjectId' = $1
            )
          ) AS "newsRefs",
          (
            SELECT COUNT(*)::text
            FROM chat_messages cm
            WHERE EXISTS (
              SELECT 1
              FROM jsonb_array_elements(COALESCE(cm.attachments_json, '[]'::jsonb)) AS attachment
              WHERE attachment->>'mediaObjectId' = $1
            )
          ) AS "chatRefs"
      `,
      [objectId]
    );
    const row = rows[0];
    const draftRefs = Number(row?.draftRefs ?? 0);
    const releaseRefs = Number(row?.releaseRefs ?? 0);
    const purchaseRefs = Number(row?.purchaseRefs ?? 0);
    const newsRefs = Number(row?.newsRefs ?? 0);
    const chatRefs = Number(row?.chatRefs ?? 0);
    return {
      draftRefs: Number.isFinite(draftRefs) ? draftRefs : 0,
      releaseRefs: Number.isFinite(releaseRefs) ? releaseRefs : 0,
      purchaseRefs: Number.isFinite(purchaseRefs) ? purchaseRefs : 0,
      totalRefs:
        (Number.isFinite(draftRefs) ? draftRefs : 0) +
        (Number.isFinite(releaseRefs) ? releaseRefs : 0) +
        (Number.isFinite(purchaseRefs) ? purchaseRefs : 0) +
        (Number.isFinite(newsRefs) ? newsRefs : 0) +
        (Number.isFinite(chatRefs) ? chatRefs : 0),
    };
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
