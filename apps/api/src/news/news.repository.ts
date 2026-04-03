import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../db/database.service";
import type { NewsPostDto, NewsTone, NewsVisibility } from "./news.types";

type NewsPostRow = {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  content: string;
  tone: NewsTone;
  highlighted: boolean;
  imageUrl: string | null;
  externalUrl: string | null;
  visibility: NewsVisibility;
  targetCourseId: string | null;
  targetUserIds: unknown;
  createdAt: string;
  updatedAt: string;
};

const normalizeTargetUserIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
};

const mapRow = (row: NewsPostRow): NewsPostDto => ({
  id: row.id,
  authorId: row.authorId,
  authorName: row.authorName,
  title: row.title,
  content: row.content,
  tone: row.tone,
  highlighted: row.highlighted,
  imageUrl: row.imageUrl ?? undefined,
  externalUrl: row.externalUrl ?? undefined,
  visibility: row.visibility,
  targetCourseId: row.targetCourseId ?? undefined,
  targetUserIds: normalizeTargetUserIds(row.targetUserIds),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

@Injectable()
export class NewsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async ensureSchema() {
    await this.databaseService.execute(`
      CREATE TABLE IF NOT EXISTS news_posts (
        id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL,
        author_name TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        tone TEXT NOT NULL CHECK (tone IN ('general', 'exam', 'achievement', 'important', 'course_update')),
        highlighted BOOLEAN NOT NULL DEFAULT FALSE,
        image_url TEXT,
        external_url TEXT,
        visibility TEXT NOT NULL DEFAULT 'all' CHECK (visibility IN ('all', 'course_students')),
        target_course_id TEXT,
        target_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_at_ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_news_posts_created
      ON news_posts (created_at DESC, id DESC)
    `);
  }

  async listAll(): Promise<NewsPostDto[]> {
    const rows = await this.databaseService.query<NewsPostRow>(`
      SELECT
        id,
        author_id AS "authorId",
        author_name AS "authorName",
        title,
        content,
        tone,
        highlighted,
        image_url AS "imageUrl",
        external_url AS "externalUrl",
        visibility,
        target_course_id AS "targetCourseId",
        target_user_ids AS "targetUserIds",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM news_posts
      ORDER BY created_at DESC, id DESC
    `);
    return rows.map((row) => mapRow(row));
  }

  async findById(id: string): Promise<NewsPostDto | null> {
    const rows = await this.databaseService.query<NewsPostRow>(
      `
        SELECT
          id,
          author_id AS "authorId",
          author_name AS "authorName",
          title,
          content,
          tone,
          highlighted,
          image_url AS "imageUrl",
          external_url AS "externalUrl",
          visibility,
          target_course_id AS "targetCourseId",
          target_user_ids AS "targetUserIds",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM news_posts
        WHERE id = $1
        LIMIT 1
      `,
      [id]
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async insert(params: {
    id: string;
    authorId: string;
    authorName: string;
    title: string;
    content: string;
    tone: NewsTone;
    highlighted: boolean;
    imageUrl: string | null;
    externalUrl: string | null;
    visibility: NewsVisibility;
    targetCourseId: string | null;
    targetUserIds: string[];
    createdAt: string;
    updatedAt: string;
  }): Promise<NewsPostDto> {
    await this.databaseService.execute(
      `
        INSERT INTO news_posts (
          id,
          author_id,
          author_name,
          title,
          content,
          tone,
          highlighted,
          image_url,
          external_url,
          visibility,
          target_course_id,
          target_user_ids,
          created_at,
          updated_at,
          updated_at_ts
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, NOW()
        )
      `,
      [
        params.id,
        params.authorId,
        params.authorName,
        params.title,
        params.content,
        params.tone,
        params.highlighted,
        params.imageUrl,
        params.externalUrl,
        params.visibility,
        params.targetCourseId,
        JSON.stringify(params.targetUserIds),
        params.createdAt,
        params.updatedAt,
      ]
    );
    const created = await this.findById(params.id);
    if (!created) {
      throw new Error("news_insert_failed");
    }
    return created;
  }

  async update(params: {
    id: string;
    title: string;
    content: string;
    tone: NewsTone;
    highlighted: boolean;
    imageUrl: string | null;
    externalUrl: string | null;
    visibility: NewsVisibility;
    targetCourseId: string | null;
    targetUserIds: string[];
    updatedAt: string;
  }): Promise<NewsPostDto | null> {
    await this.databaseService.execute(
      `
        UPDATE news_posts
        SET
          title = $2,
          content = $3,
          tone = $4,
          highlighted = $5,
          image_url = $6,
          external_url = $7,
          visibility = $8,
          target_course_id = $9,
          target_user_ids = $10::jsonb,
          updated_at = $11,
          updated_at_ts = NOW()
        WHERE id = $1
      `,
      [
        params.id,
        params.title,
        params.content,
        params.tone,
        params.highlighted,
        params.imageUrl,
        params.externalUrl,
        params.visibility,
        params.targetCourseId,
        JSON.stringify(params.targetUserIds),
        params.updatedAt,
      ]
    );
    return this.findById(params.id);
  }

  async deleteById(id: string): Promise<boolean> {
    const rows = await this.databaseService.query<{ id: string }>(
      `
        DELETE FROM news_posts
        WHERE id = $1
        RETURNING id
      `,
      [id]
    );
    return rows.length > 0;
  }
}
