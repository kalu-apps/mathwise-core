import type { CourseCatalogItemDto } from "./courses.types";
import { resolveCourseVisualMetadata } from "./courses.visuals";

const isCourseStatus = (value: unknown): value is "draft" | "published" => {
  return value === "draft" || value === "published";
};

const toFiniteNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const mapUnknownCourseToDto = (
  input: unknown
): CourseCatalogItemDto | null => {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id : "";
  const title = typeof raw.title === "string" ? raw.title : "";
  if (!id || !title) return null;

  const visual = resolveCourseVisualMetadata(id, {
    visualStyle: raw.visualStyle,
    visualSeed: raw.visualSeed,
    visualPalette: raw.visualPalette,
    visualVariant: raw.visualVariant,
  });

  return {
    id,
    title,
    description: typeof raw.description === "string" ? raw.description : "",
    level: typeof raw.level === "string" ? raw.level : "",
    priceGuided: toFiniteNumber(raw.priceGuided),
    priceSelf: toFiniteNumber(raw.priceSelf),
    teacherId: typeof raw.teacherId === "string" ? raw.teacherId : "",
    status: isCourseStatus(raw.status) ? raw.status : "draft",
    ...visual,
  };
};
