import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../db/database.service";

type ProgressRow = {
  lessonId: string;
};

@Injectable()
export class ProgressRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async ensureSchema() {
    await this.databaseService.execute(`
      CREATE TABLE IF NOT EXISTS lesson_progress (
        user_id TEXT NOT NULL,
        course_id TEXT NOT NULL,
        lesson_id TEXT NOT NULL,
        viewed_at TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, course_id, lesson_id)
      )
    `);

    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_lesson_progress_course_user
      ON lesson_progress (course_id, user_id)
    `);
  }

  async markLessonViewed(params: {
    userId: string;
    courseId: string;
    lessonId: string;
    viewedAt: string;
  }): Promise<void> {
    await this.databaseService.execute(
      `
        INSERT INTO lesson_progress (
          user_id,
          course_id,
          lesson_id,
          viewed_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (user_id, course_id, lesson_id)
        DO UPDATE SET
          viewed_at = EXCLUDED.viewed_at,
          updated_at = NOW()
      `,
      [params.userId, params.courseId, params.lessonId, params.viewedAt]
    );
  }

  async findViewedLessonIds(params: {
    userId: string;
    courseId: string;
  }): Promise<string[]> {
    const rows = await this.databaseService.query<ProgressRow>(
      `
        SELECT lesson_id AS "lessonId"
        FROM lesson_progress
        WHERE user_id = $1
          AND course_id = $2
        ORDER BY viewed_at ASC, lesson_id ASC
      `,
      [params.userId, params.courseId]
    );
    return rows.map((row) => row.lessonId);
  }

  async deleteProgressByCourseForUser(params: {
    userId: string;
    courseId: string;
  }): Promise<void> {
    await this.databaseService.execute(
      `
        DELETE FROM lesson_progress
        WHERE user_id = $1
          AND course_id = $2
      `,
      [params.userId, params.courseId]
    );
  }

  async deleteProgressByCourse(courseId: string): Promise<void> {
    await this.databaseService.execute(
      `
        DELETE FROM lesson_progress
        WHERE course_id = $1
      `,
      [courseId]
    );
  }
}
