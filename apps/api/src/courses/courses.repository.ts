import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../db/database.service";
import type { CourseCatalogItemDto } from "./courses.types";

type CourseRow = {
  id: string;
  title: string;
  description: string;
  level: string;
  priceGuided: number;
  priceSelf: number;
  teacherId: string;
  status: "draft" | "published";
};

@Injectable()
export class CoursesRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async ensureSchema() {
    await this.databaseService.execute(`
      CREATE TABLE IF NOT EXISTS courses_catalog (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        level TEXT NOT NULL DEFAULT '',
        price_guided INTEGER NOT NULL DEFAULT 0,
        price_self INTEGER NOT NULL DEFAULT 0,
        teacher_id TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  async hasAnyCourses(): Promise<boolean> {
    const rows = await this.databaseService.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM courses_catalog"
    );
    const count = Number(rows[0]?.count ?? 0);
    return count > 0;
  }

  async findAll(): Promise<CourseCatalogItemDto[]> {
    const rows = await this.databaseService.query<CourseRow>(`
      SELECT
        id,
        title,
        description,
        level,
        price_guided AS "priceGuided",
        price_self AS "priceSelf",
        teacher_id AS "teacherId",
        status
      FROM courses_catalog
      ORDER BY title ASC
    `);
    return rows.map((row) => this.mapRow(row));
  }

  async findAllIds(): Promise<string[]> {
    const rows = await this.databaseService.query<{ id: string }>(
      "SELECT id FROM courses_catalog ORDER BY title ASC"
    );
    return rows.map((row) => row.id);
  }

  async existsById(courseId: string): Promise<boolean> {
    const rows = await this.databaseService.query<{ id: string }>(
      "SELECT id FROM courses_catalog WHERE id = $1 LIMIT 1",
      [courseId]
    );
    return rows.length > 0;
  }

  async findById(courseId: string): Promise<CourseCatalogItemDto | null> {
    const rows = await this.databaseService.query<CourseRow>(
      `
        SELECT
          id,
          title,
          description,
          level,
          price_guided AS "priceGuided",
          price_self AS "priceSelf",
          teacher_id AS "teacherId",
          status
        FROM courses_catalog
        WHERE id = $1
        LIMIT 1
      `,
      [courseId]
    );

    const row = rows[0];
    return row ? this.mapRow(row) : null;
  }

  private mapRow(row: CourseRow): CourseCatalogItemDto {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      level: row.level,
      priceGuided: Number(row.priceGuided),
      priceSelf: Number(row.priceSelf),
      teacherId: row.teacherId,
      status: row.status,
    };
  }
}
