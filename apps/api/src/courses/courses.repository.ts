import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../db/database.service";
import { mapUnknownCourseToDto } from "./courses.mapper";
import { resolveCourseVisualMetadata, withCourseVisualMetadata } from "./courses.visuals";
import type {
  CourseAssessmentReleaseBlockDto,
  CourseAssessmentReleaseItemDto,
  CourseAssessmentReleaseSnapshotDto,
  CourseCatalogItemDto,
  CourseReleaseSnapshotDto,
} from "./courses.types";

type CourseRow = {
  id: string;
  title: string;
  description: string;
  level: string;
  priceGuided: number;
  priceSelf: number;
  teacherId: string;
  status: "draft" | "published";
  visualStyle: string | null;
  visualSeed: number | null;
  visualPalette: string | null;
  visualVariant: number | null;
  teacherDeletedAt?: string | null;
};

type CourseSnapshotRow = {
  snapshot: unknown;
};

type CourseReleaseRow = {
  id: string;
  courseId: string;
  version: number;
  status: "active" | "superseded";
  courseSnapshot: unknown;
  lessonsSnapshot: unknown;
  assessmentsSnapshot: unknown;
  publishedAt: string;
  createdByTeacherId: string;
};

type PublishReleaseInput = {
  releaseId: string;
  courseId: string;
  createdByTeacherId: string;
  publishedAt: string;
  courseSnapshot: CourseCatalogItemDto;
  lessonsSnapshot: unknown[];
  assessmentsSnapshot: CourseAssessmentReleaseSnapshotDto;
};

const MAX_VISUAL_SEED = 2_147_483_647;
const MAX_VISUAL_VARIANT = 255;

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
        visual_style TEXT NOT NULL DEFAULT 'polyhedra',
        visual_seed INTEGER NOT NULL DEFAULT 0,
        visual_palette TEXT NOT NULL DEFAULT 'indigo-mineral',
        visual_variant INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.databaseService.execute(`
      ALTER TABLE courses_catalog
      ADD COLUMN IF NOT EXISTS visual_style TEXT NOT NULL DEFAULT 'polyhedra'
    `);
    await this.databaseService.execute(`
      ALTER TABLE courses_catalog
      ADD COLUMN IF NOT EXISTS visual_seed INTEGER NOT NULL DEFAULT 0
    `);
    await this.databaseService.execute(`
      ALTER TABLE courses_catalog
      ADD COLUMN IF NOT EXISTS visual_palette TEXT NOT NULL DEFAULT 'indigo-mineral'
    `);
    await this.databaseService.execute(`
      ALTER TABLE courses_catalog
      ADD COLUMN IF NOT EXISTS visual_variant INTEGER NOT NULL DEFAULT 0
    `);
    await this.databaseService.execute(`
      ALTER TABLE courses_catalog
      ADD COLUMN IF NOT EXISTS teacher_deleted_at TEXT
    `);
    await this.databaseService.execute(`
      CREATE TABLE IF NOT EXISTS course_releases (
        id TEXT PRIMARY KEY,
        course_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'superseded')),
        course_snapshot_json JSONB NOT NULL,
        lessons_snapshot_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        assessments_snapshot_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        published_at TEXT NOT NULL,
        created_by_teacher_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (course_id, version)
      )
    `);
    await this.databaseService.execute(`
      CREATE INDEX IF NOT EXISTS idx_course_releases_course_published
      ON course_releases (course_id, published_at DESC)
    `);
    await this.databaseService.execute(`
      CREATE TABLE IF NOT EXISTS course_release_pointer (
        course_id TEXT PRIMARY KEY,
        active_release_id TEXT NOT NULL,
        active_version INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        updated_at_ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    return this.findAllDrafts();
  }

  async findAllDrafts(): Promise<CourseCatalogItemDto[]> {
    const rows = await this.databaseService.query<CourseRow>(`
      SELECT
        id,
        title,
        description,
        level,
        price_guided AS "priceGuided",
        price_self AS "priceSelf",
        teacher_id AS "teacherId",
        status,
        visual_style AS "visualStyle",
        visual_seed AS "visualSeed",
        visual_palette AS "visualPalette",
        visual_variant AS "visualVariant"
      FROM courses_catalog
      ORDER BY title ASC
    `);
    return rows.map((row) => this.mapRow(row));
  }

  async findAllDraftsByTeacher(teacherId: string): Promise<CourseCatalogItemDto[]> {
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
          status,
          visual_style AS "visualStyle",
          visual_seed AS "visualSeed",
          visual_palette AS "visualPalette",
          visual_variant AS "visualVariant"
        FROM courses_catalog
        WHERE teacher_id = $1
          AND teacher_deleted_at IS NULL
        ORDER BY updated_at DESC, title ASC
      `,
      [teacherId]
    );
    return rows.map((row) => this.mapRow(row));
  }

  async findAllPublishedCatalog(): Promise<CourseCatalogItemDto[]> {
    const rows = await this.databaseService.query<CourseSnapshotRow>(`
      SELECT
        cr.course_snapshot_json AS snapshot
      FROM course_release_pointer crp
      JOIN course_releases cr
        ON cr.id = crp.active_release_id
      JOIN courses_catalog cc
        ON cc.id = crp.course_id
      WHERE cc.teacher_deleted_at IS NULL
      ORDER BY LOWER(COALESCE(cr.course_snapshot_json->>'title', '')) ASC
    `);
    return rows
      .map((row) => this.mapCourseSnapshot(row.snapshot))
      .filter((item): item is CourseCatalogItemDto => Boolean(item));
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

  async existsPublishedById(courseId: string): Promise<boolean> {
    const rows = await this.databaseService.query<{ id: string }>(
      `
        SELECT crp.course_id AS id
        FROM course_release_pointer crp
        WHERE crp.course_id = $1
        LIMIT 1
      `,
      [courseId]
    );
    return rows.length > 0;
  }

  async isTeacherDeleted(courseId: string): Promise<boolean> {
    const rows = await this.databaseService.query<{ teacherDeletedAt: string | null }>(
      `
        SELECT teacher_deleted_at AS "teacherDeletedAt"
        FROM courses_catalog
        WHERE id = $1
        LIMIT 1
      `,
      [courseId]
    );
    return Boolean(rows[0]?.teacherDeletedAt);
  }

  async findById(courseId: string): Promise<CourseCatalogItemDto | null> {
    const published = await this.findPublishedById(courseId);
    if (published) return published;
    return this.findDraftById(courseId);
  }

  async findDraftById(courseId: string): Promise<CourseCatalogItemDto | null> {
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
          status,
          visual_style AS "visualStyle",
          visual_seed AS "visualSeed",
          visual_palette AS "visualPalette",
          visual_variant AS "visualVariant"
        FROM courses_catalog
        WHERE id = $1
        LIMIT 1
      `,
      [courseId]
    );
    const row = rows[0];
    return row ? this.mapRow(row) : null;
  }

  async findPublishedById(courseId: string): Promise<CourseCatalogItemDto | null> {
    const rows = await this.databaseService.query<CourseSnapshotRow>(
      `
        SELECT
          cr.course_snapshot_json AS snapshot
        FROM course_release_pointer crp
        JOIN course_releases cr
          ON cr.id = crp.active_release_id
        WHERE crp.course_id = $1
        LIMIT 1
      `,
      [courseId]
    );
    return this.mapCourseSnapshot(rows[0]?.snapshot);
  }

  async findActiveReleaseByCourseId(
    courseId: string
  ): Promise<CourseReleaseSnapshotDto | null> {
    const rows = await this.databaseService.query<CourseReleaseRow>(
      `
        SELECT
          cr.id,
          cr.course_id AS "courseId",
          cr.version,
          cr.status,
          cr.course_snapshot_json AS "courseSnapshot",
          cr.lessons_snapshot_json AS "lessonsSnapshot",
          cr.assessments_snapshot_json AS "assessmentsSnapshot",
          cr.published_at AS "publishedAt",
          cr.created_by_teacher_id AS "createdByTeacherId"
        FROM course_release_pointer crp
        JOIN course_releases cr
          ON cr.id = crp.active_release_id
        WHERE crp.course_id = $1
        LIMIT 1
      `,
      [courseId]
    );
    const row = rows[0];
    if (!row) return null;
    const course = this.mapCourseSnapshot(row.courseSnapshot);
    if (!course) return null;
    return {
      id: row.id,
      courseId: row.courseId,
      version: Number(row.version),
      status: row.status,
      publishedAt: row.publishedAt,
      createdByTeacherId: row.createdByTeacherId,
      course,
      lessons: Array.isArray(row.lessonsSnapshot) ? row.lessonsSnapshot : [],
      assessments: this.normalizeAssessmentsSnapshot(row.assessmentsSnapshot, row.courseId),
    };
  }

  async upsertDraft(course: CourseCatalogItemDto): Promise<CourseCatalogItemDto> {
    await this.databaseService.execute(
      `
        INSERT INTO courses_catalog (
          id,
          title,
          description,
          level,
          price_guided,
          price_self,
          teacher_id,
          status,
          visual_style,
          visual_seed,
          visual_palette,
          visual_variant,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        ON CONFLICT (id)
        DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          level = EXCLUDED.level,
          price_guided = EXCLUDED.price_guided,
          price_self = EXCLUDED.price_self,
          teacher_id = EXCLUDED.teacher_id,
          status = EXCLUDED.status,
          visual_style = EXCLUDED.visual_style,
          visual_seed = EXCLUDED.visual_seed,
          visual_palette = EXCLUDED.visual_palette,
          visual_variant = EXCLUDED.visual_variant,
          teacher_deleted_at = NULL,
          updated_at = NOW()
      `,
      [
        course.id,
        course.title,
        course.description,
        course.level,
        Math.max(0, Math.round(course.priceGuided)),
        Math.max(0, Math.round(course.priceSelf)),
        course.teacherId,
        course.status,
        course.visualStyle,
        Math.min(MAX_VISUAL_SEED, Math.max(0, Math.round(course.visualSeed ?? 0))),
        course.visualPalette,
        Math.min(MAX_VISUAL_VARIANT, Math.max(0, Math.round(course.visualVariant ?? 0))),
      ]
    );
    return course;
  }

  async deleteDraft(courseId: string): Promise<void> {
    await this.databaseService.execute(
      `
        UPDATE courses_catalog
        SET teacher_deleted_at = COALESCE(teacher_deleted_at, $2),
            updated_at = NOW()
        WHERE id = $1
      `,
      [courseId, new Date().toISOString()]
    );
  }

  async publishDraft(input: PublishReleaseInput): Promise<{ releaseId: string; version: number }> {
    const result = await this.databaseService.transaction<{
      releaseId: string;
      version: number;
    }>(async (tx) => {
      const versionRows = await tx.query<{ version: number }>(
        `
          SELECT COALESCE(MAX(version), 0) + 1 AS version
          FROM course_releases
          WHERE course_id = $1
        `,
        [input.courseId]
      );
      const version = Number(versionRows[0]?.version ?? 1);

      await tx.execute(
        `
          UPDATE course_releases
          SET status = 'superseded'
          WHERE course_id = $1
            AND status = 'active'
        `,
        [input.courseId]
      );

      await tx.execute(
        `
          INSERT INTO course_releases (
            id,
            course_id,
            version,
            status,
            course_snapshot_json,
            lessons_snapshot_json,
            assessments_snapshot_json,
            published_at,
            created_by_teacher_id
          )
          VALUES ($1, $2, $3, 'active', $4::jsonb, $5::jsonb, $6::jsonb, $7, $8)
        `,
        [
          input.releaseId,
          input.courseId,
          version,
          JSON.stringify(input.courseSnapshot),
          JSON.stringify(input.lessonsSnapshot),
          JSON.stringify(input.assessmentsSnapshot),
          input.publishedAt,
          input.createdByTeacherId,
        ]
      );

      await tx.execute(
        `
          INSERT INTO course_release_pointer (
            course_id,
            active_release_id,
            active_version,
            updated_at,
            updated_at_ts
          )
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (course_id)
          DO UPDATE SET
            active_release_id = EXCLUDED.active_release_id,
            active_version = EXCLUDED.active_version,
            updated_at = EXCLUDED.updated_at,
            updated_at_ts = NOW()
        `,
        [input.courseId, input.releaseId, version, input.publishedAt]
      );

      await tx.execute(
        `
          UPDATE courses_catalog
          SET
            status = 'published',
            updated_at = NOW()
          WHERE id = $1
        `,
        [input.courseId]
      );

      return { releaseId: input.releaseId, version };
    });

    return result;
  }

  private mapCourseSnapshot(snapshot: unknown): CourseCatalogItemDto | null {
    const mapped = mapUnknownCourseToDto(snapshot);
    if (!mapped) return null;
    return withCourseVisualMetadata({
      ...mapped,
      status: "published",
    });
  }

  private normalizeAssessmentsSnapshot(
    snapshot: unknown,
    courseId: string
  ): CourseAssessmentReleaseSnapshotDto {
    if (Array.isArray(snapshot)) {
      const items = this.normalizeAssessmentItems(snapshot, courseId);
      return {
        items,
        blocks: this.deriveBlocksFromItems(items, courseId),
      };
    }

    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      return {
        items: [],
        blocks: this.defaultBlocks(courseId),
      };
    }

    const source = snapshot as Record<string, unknown>;
    const items = this.normalizeAssessmentItems(source.items, courseId);
    const blocks = this.normalizeAssessmentBlocks(source.blocks, courseId);
    return {
      items,
      blocks: blocks.length > 0 ? blocks : this.deriveBlocksFromItems(items, courseId),
    };
  }

  private normalizeAssessmentItems(
    value: unknown,
    courseId: string
  ): CourseAssessmentReleaseItemDto[] {
    if (!Array.isArray(value)) return [];
    const normalized = value
      .map((item): CourseAssessmentReleaseItemDto | null => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return null;
        const record = item as Record<string, unknown>;
        const id = typeof record.id === "string" ? record.id.trim() : "";
        const blockId = typeof record.blockId === "string" ? record.blockId.trim() : "";
        const type = record.type === "lesson" || record.type === "test" ? record.type : null;
        if (!id || !blockId || !type) return null;

        const orderRaw = Number(record.order);
        const order = Number.isFinite(orderRaw) ? Math.max(1, Math.floor(orderRaw)) : 1;
        const createdAt =
          typeof record.createdAt === "string" && record.createdAt.trim().length > 0
            ? record.createdAt
            : new Date().toISOString();

        return {
          id,
          courseId,
          blockId,
          type,
          order,
          createdAt,
          lessonId: typeof record.lessonId === "string" ? record.lessonId : undefined,
          templateId:
            typeof record.templateId === "string" ? record.templateId : undefined,
          titleSnapshot:
            typeof record.titleSnapshot === "string" ? record.titleSnapshot : undefined,
          templateSnapshot:
            record.templateSnapshot && typeof record.templateSnapshot === "object"
              ? record.templateSnapshot
              : undefined,
        };
      })
      .filter((item): item is CourseAssessmentReleaseItemDto => Boolean(item))
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

    return normalized.map((item, index) => ({
      ...item,
      order: index + 1,
    }));
  }

  private normalizeAssessmentBlocks(
    value: unknown,
    courseId: string
  ): CourseAssessmentReleaseBlockDto[] {
    if (!Array.isArray(value)) return [];
    const normalized = value
      .map((item): CourseAssessmentReleaseBlockDto | null => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return null;
        const record = item as Record<string, unknown>;
        const id = typeof record.id === "string" ? record.id.trim() : "";
        const title = typeof record.title === "string" ? record.title.trim() : "";
        if (!id || !title) return null;
        const description =
          typeof record.description === "string" ? record.description : "";
        const orderRaw = Number(record.order);
        const order = Number.isFinite(orderRaw) ? Math.max(1, Math.floor(orderRaw)) : 1;
        return {
          id,
          courseId,
          title,
          description,
          order,
        };
      })
      .filter((item): item is CourseAssessmentReleaseBlockDto => Boolean(item))
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

    return normalized.map((item, index) => ({
      ...item,
      order: index + 1,
    }));
  }

  private defaultBlocks(courseId: string): CourseAssessmentReleaseBlockDto[] {
    return [
      {
        id: `course-block-default-${courseId}`,
        courseId,
        title: "Материалы курса",
        description: "",
        order: 1,
      },
    ];
  }

  private deriveBlocksFromItems(
    items: CourseAssessmentReleaseItemDto[],
    courseId: string
  ): CourseAssessmentReleaseBlockDto[] {
    const blockIds = [...new Set(items.map((item) => item.blockId.trim()).filter(Boolean))];
    if (blockIds.length === 0) {
      return this.defaultBlocks(courseId);
    }
    return blockIds.map((blockId, index) => ({
      id: blockId,
      courseId,
      title: index === 0 ? "Материалы курса" : `Блок ${index + 1}`,
      description: "",
      order: index + 1,
    }));
  }

  private mapRow(row: CourseRow): CourseCatalogItemDto {
    const visual = resolveCourseVisualMetadata(row.id, {
      visualStyle: row.visualStyle,
      visualSeed: row.visualSeed,
      visualPalette: row.visualPalette,
      visualVariant: row.visualVariant,
    });

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      level: row.level,
      priceGuided: Number(row.priceGuided),
      priceSelf: Number(row.priceSelf),
      teacherId: row.teacherId,
      status: row.status,
      ...visual,
    };
  }
}
