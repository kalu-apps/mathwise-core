import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../db/database.service";
import type { LessonDto } from "./lessons.types";

type LessonRow = {
  id: string;
  courseId: string;
  title: string;
  order: number;
  duration: number;
  videoUrl: string | null;
  videoStreamUrl: string | null;
  videoPosterUrl: string | null;
  mediaJobId: string | null;
  mediaJobStatus: "queued" | "processing" | "ready" | "failed" | null;
  mediaJobError: string | null;
  materials: unknown;
  settings: unknown;
};

@Injectable()
export class LessonsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async ensureSchema() {
    await this.databaseService.execute(`
      CREATE TABLE IF NOT EXISTS course_lessons (
        id TEXT PRIMARY KEY,
        course_id TEXT NOT NULL,
        title TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        duration_sec INTEGER NOT NULL DEFAULT 0,
        video_url TEXT,
        video_stream_url TEXT,
        video_poster_url TEXT,
        media_job_id TEXT,
        media_job_status TEXT,
        media_job_error TEXT,
        materials_json JSONB,
        settings_json JSONB,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_course_lessons_course_order
      ON course_lessons (course_id, sort_order)
    `);
  }

  async hasAnyLessons(): Promise<boolean> {
    const rows = await this.databaseService.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM course_lessons"
    );
    return Number(rows[0]?.count ?? 0) > 0;
  }

  async findAll(courseId?: string): Promise<LessonDto[]> {
    const rows = courseId
      ? await this.databaseService.query<LessonRow>(
          `
            SELECT
              id,
              course_id AS "courseId",
              title,
              sort_order AS "order",
              duration_sec AS "duration",
              video_url AS "videoUrl",
              video_stream_url AS "videoStreamUrl",
              video_poster_url AS "videoPosterUrl",
              media_job_id AS "mediaJobId",
              media_job_status AS "mediaJobStatus",
              media_job_error AS "mediaJobError",
              materials_json AS "materials",
              settings_json AS "settings"
            FROM course_lessons
            WHERE course_id = $1
            ORDER BY sort_order ASC, id ASC
          `,
          [courseId]
        )
      : await this.databaseService.query<LessonRow>(`
          SELECT
            id,
            course_id AS "courseId",
            title,
            sort_order AS "order",
            duration_sec AS "duration",
            video_url AS "videoUrl",
            video_stream_url AS "videoStreamUrl",
            video_poster_url AS "videoPosterUrl",
            media_job_id AS "mediaJobId",
            media_job_status AS "mediaJobStatus",
            media_job_error AS "mediaJobError",
            materials_json AS "materials",
            settings_json AS "settings"
          FROM course_lessons
          ORDER BY course_id ASC, sort_order ASC, id ASC
        `);
    return rows.map((row) => this.mapRow(row));
  }

  async findById(lessonId: string): Promise<LessonDto | null> {
    const rows = await this.databaseService.query<LessonRow>(
      `
        SELECT
          id,
          course_id AS "courseId",
          title,
          sort_order AS "order",
          duration_sec AS "duration",
          video_url AS "videoUrl",
          video_stream_url AS "videoStreamUrl",
          video_poster_url AS "videoPosterUrl",
          media_job_id AS "mediaJobId",
          media_job_status AS "mediaJobStatus",
          media_job_error AS "mediaJobError",
          materials_json AS "materials",
          settings_json AS "settings"
        FROM course_lessons
        WHERE id = $1
        LIMIT 1
      `,
      [lessonId]
    );
    const row = rows[0];
    return row ? this.mapRow(row) : null;
  }

  private mapRow(row: LessonRow): LessonDto {
    return {
      id: row.id,
      courseId: row.courseId,
      title: row.title,
      order: Number(row.order),
      duration: Number(row.duration),
      videoUrl: row.videoUrl ?? undefined,
      videoStreamUrl: row.videoStreamUrl ?? undefined,
      videoPosterUrl: row.videoPosterUrl ?? undefined,
      mediaJobId: row.mediaJobId ?? undefined,
      mediaJobStatus: row.mediaJobStatus ?? undefined,
      mediaJobError: row.mediaJobError ?? undefined,
      materials: Array.isArray(row.materials)
        ? (row.materials as LessonDto["materials"])
        : undefined,
      settings:
        row.settings && typeof row.settings === "object"
          ? (row.settings as LessonDto["settings"])
          : undefined,
    };
  }
}
