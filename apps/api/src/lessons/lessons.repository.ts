import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../db/database.service";
import { mapUnknownLessonToDto, sanitizePersistedMediaUrl } from "./lessons.mapper";
import type { LessonDto } from "./lessons.types";

type LessonRow = {
  id: string;
  courseId: string;
  title: string;
  order: number;
  duration: number;
  videoMediaObjectId: string | null;
  videoUrl: string | null;
  videoStreamUrl: string | null;
  videoPosterUrl: string | null;
  mediaJobId: string | null;
  mediaJobStatus: "queued" | "processing" | "ready" | "failed" | null;
  mediaJobError: string | null;
  materials: unknown;
  settings: unknown;
};

type PublishedLessonsRow = {
  courseId: string;
  lessonsSnapshot: unknown;
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
        video_media_object_id TEXT,
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
    await this.databaseService.execute(`
      ALTER TABLE course_lessons
      ADD COLUMN IF NOT EXISTS video_media_object_id TEXT
    `);
  }

  async hasAnyLessons(): Promise<boolean> {
    const rows = await this.databaseService.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM course_lessons"
    );
    return Number(rows[0]?.count ?? 0) > 0;
  }

  async findAll(courseId?: string): Promise<LessonDto[]> {
    if (courseId?.trim()) {
      return this.findPublishedByCourse(courseId.trim());
    }
    return this.findPublishedAll();
  }

  async findById(lessonId: string): Promise<LessonDto | null> {
    return this.findPublishedById(lessonId);
  }

  async findDraftAll(courseId?: string): Promise<LessonDto[]> {
    const rows = courseId
      ? await this.databaseService.query<LessonRow>(
          `
            SELECT
              id,
              course_id AS "courseId",
              title,
              sort_order AS "order",
              duration_sec AS "duration",
              video_media_object_id AS "videoMediaObjectId",
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
            video_media_object_id AS "videoMediaObjectId",
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

  async findDraftByCourse(courseId: string): Promise<LessonDto[]> {
    return this.findDraftAll(courseId);
  }

  async findDraftById(lessonId: string): Promise<LessonDto | null> {
    const rows = await this.databaseService.query<LessonRow>(
      `
        SELECT
          id,
          course_id AS "courseId",
          title,
          sort_order AS "order",
          duration_sec AS "duration",
          video_media_object_id AS "videoMediaObjectId",
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

  async upsertOne(lesson: LessonDto): Promise<LessonDto> {
    await this.databaseService.execute(
      `
        INSERT INTO course_lessons (
          id,
          course_id,
          title,
          sort_order,
          duration_sec,
          video_media_object_id,
          video_url,
          video_stream_url,
          video_poster_url,
          media_job_id,
          media_job_status,
          media_job_error,
          materials_json,
          settings_json,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10, $11, $12,
          $13::jsonb, $14::jsonb, NOW()
        )
        ON CONFLICT (id)
        DO UPDATE SET
          course_id = EXCLUDED.course_id,
          title = EXCLUDED.title,
          sort_order = EXCLUDED.sort_order,
          duration_sec = EXCLUDED.duration_sec,
          video_media_object_id = EXCLUDED.video_media_object_id,
          video_url = EXCLUDED.video_url,
          video_stream_url = EXCLUDED.video_stream_url,
          video_poster_url = EXCLUDED.video_poster_url,
          media_job_id = EXCLUDED.media_job_id,
          media_job_status = EXCLUDED.media_job_status,
          media_job_error = EXCLUDED.media_job_error,
          materials_json = EXCLUDED.materials_json,
          settings_json = EXCLUDED.settings_json,
          updated_at = NOW()
      `,
      [
        lesson.id,
        lesson.courseId,
        lesson.title,
        Math.max(1, Math.floor(lesson.order)),
        Math.max(0, Math.floor(lesson.duration)),
        lesson.videoMediaObjectId ?? null,
        lesson.videoUrl ?? null,
        lesson.videoStreamUrl ?? null,
        lesson.videoPosterUrl ?? null,
        lesson.mediaJobId ?? null,
        lesson.mediaJobStatus ?? null,
        lesson.mediaJobError ?? null,
        JSON.stringify(lesson.materials ?? null),
        JSON.stringify(lesson.settings ?? null),
      ]
    );
    return lesson;
  }

  async replaceByCourse(courseId: string, lessons: LessonDto[]): Promise<void> {
    await this.databaseService.transaction<void>(async (tx) => {
      await tx.execute("DELETE FROM course_lessons WHERE course_id = $1", [courseId]);
      for (const lesson of lessons) {
        await tx.execute(
          `
            INSERT INTO course_lessons (
              id,
              course_id,
              title,
              sort_order,
              duration_sec,
              video_media_object_id,
              video_url,
              video_stream_url,
              video_poster_url,
              media_job_id,
              media_job_status,
              media_job_error,
              materials_json,
              settings_json,
              updated_at
            )
            VALUES (
              $1, $2, $3, $4, $5,
              $6, $7, $8, $9, $10, $11, $12,
              $13::jsonb, $14::jsonb, NOW()
            )
          `,
          [
            lesson.id,
            courseId,
            lesson.title,
            Math.max(1, Math.floor(lesson.order)),
            Math.max(0, Math.floor(lesson.duration)),
            lesson.videoMediaObjectId ?? null,
            lesson.videoUrl ?? null,
            lesson.videoStreamUrl ?? null,
            lesson.videoPosterUrl ?? null,
            lesson.mediaJobId ?? null,
            lesson.mediaJobStatus ?? null,
            lesson.mediaJobError ?? null,
            JSON.stringify(lesson.materials ?? null),
            JSON.stringify(lesson.settings ?? null),
          ]
        );
      }
    });
  }

  async deleteByCourse(courseId: string): Promise<void> {
    await this.databaseService.execute("DELETE FROM course_lessons WHERE course_id = $1", [
      courseId,
    ]);
  }

  async findPublishedAll(): Promise<LessonDto[]> {
    const rows = await this.databaseService.query<PublishedLessonsRow>(`
      SELECT
        cr.course_id AS "courseId",
        cr.lessons_snapshot_json AS "lessonsSnapshot"
      FROM course_release_pointer crp
      JOIN course_releases cr
        ON cr.id = crp.active_release_id
      ORDER BY cr.course_id ASC
    `);
    return rows.flatMap((row) => this.mapLessonsSnapshot(row.courseId, row.lessonsSnapshot));
  }

  async findPublishedByCourse(courseId: string): Promise<LessonDto[]> {
    const rows = await this.databaseService.query<PublishedLessonsRow>(
      `
        SELECT
          cr.course_id AS "courseId",
          cr.lessons_snapshot_json AS "lessonsSnapshot"
        FROM course_release_pointer crp
        JOIN course_releases cr
          ON cr.id = crp.active_release_id
        WHERE crp.course_id = $1
        LIMIT 1
      `,
      [courseId]
    );
    const row = rows[0];
    if (!row) return [];
    return this.mapLessonsSnapshot(row.courseId, row.lessonsSnapshot);
  }

  async findPublishedById(lessonId: string): Promise<LessonDto | null> {
    const rows = await this.databaseService.query<{ courseId: string; lessonSnapshot: unknown }>(
      `
        SELECT
          cr.course_id AS "courseId",
          lesson AS "lessonSnapshot"
        FROM course_release_pointer crp
        JOIN course_releases cr
          ON cr.id = crp.active_release_id
        CROSS JOIN LATERAL jsonb_array_elements(cr.lessons_snapshot_json) AS lesson
        WHERE lesson->>'id' = $1
        LIMIT 1
      `,
      [lessonId]
    );
    const row = rows[0];
    if (!row) return null;
    const mapped = mapUnknownLessonToDto(row.lessonSnapshot);
    if (!mapped) return null;
    return {
      ...mapped,
      courseId: mapped.courseId || row.courseId,
    };
  }

  private mapLessonsSnapshot(courseId: string, snapshot: unknown): LessonDto[] {
    if (!Array.isArray(snapshot)) return [];
    return snapshot
      .map((item) => mapUnknownLessonToDto(item))
      .filter((item): item is LessonDto => Boolean(item))
      .map((item) => ({
        ...item,
        courseId: item.courseId || courseId,
      }))
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }

  private mapRow(row: LessonRow): LessonDto {
    const normalizedMaterials = Array.isArray(row.materials)
      ? row.materials
          .filter(
            (material): material is NonNullable<LessonDto["materials"]>[number] =>
              Boolean(material && typeof material === "object")
          )
          .map((material) => ({
            ...material,
            url: sanitizePersistedMediaUrl(material.url),
          }))
          .filter((material) => Boolean(material.mediaObjectId || material.url))
      : undefined;

    return {
      id: row.id,
      courseId: row.courseId,
      title: row.title,
      order: Number(row.order),
      duration: Number(row.duration),
      videoMediaObjectId: row.videoMediaObjectId ?? undefined,
      videoUrl: sanitizePersistedMediaUrl(row.videoUrl),
      videoStreamUrl: sanitizePersistedMediaUrl(row.videoStreamUrl),
      videoPosterUrl: row.videoPosterUrl ?? undefined,
      mediaJobId: row.mediaJobId ?? undefined,
      mediaJobStatus: row.mediaJobStatus ?? undefined,
      mediaJobError: row.mediaJobError ?? undefined,
      materials: normalizedMaterials,
      settings:
        row.settings && typeof row.settings === "object"
          ? (row.settings as LessonDto["settings"])
          : undefined,
    };
  }
}
