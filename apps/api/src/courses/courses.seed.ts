import fs from "fs";
import { mapUnknownCourseToDto } from "./courses.mapper";
import type { CourseCatalogItemDto, CoursesDbPayload } from "./courses.types";

export type CoursesSeedExecutor = {
  execute: (text: string, params?: unknown[]) => Promise<void>;
};

export const readCourseSeedItems = (sourceFile: string): CourseCatalogItemDto[] => {
  if (!fs.existsSync(sourceFile)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(sourceFile, "utf-8");
    const payload = JSON.parse(raw) as CoursesDbPayload;
    const rawCourses = Array.isArray(payload.courses) ? payload.courses : [];
    return rawCourses
      .map((item) => mapUnknownCourseToDto(item))
      .filter((item): item is CourseCatalogItemDto => Boolean(item));
  } catch {
    return [];
  }
};

export const upsertCourses = async (
  executor: CoursesSeedExecutor,
  courses: CourseCatalogItemDto[]
) => {
  if (courses.length === 0) return;

  for (const course of courses) {
    await executor.execute(
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
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (id)
        DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          level = EXCLUDED.level,
          price_guided = EXCLUDED.price_guided,
          price_self = EXCLUDED.price_self,
          teacher_id = EXCLUDED.teacher_id,
          status = EXCLUDED.status,
          updated_at = NOW()
      `,
      [
        course.id,
        course.title,
        course.description,
        course.level,
        Math.round(course.priceGuided),
        Math.round(course.priceSelf),
        course.teacherId,
        course.status,
      ]
    );
  }
};
