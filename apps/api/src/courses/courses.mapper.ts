import type { CourseCatalogItemDto } from "./courses.types";

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

  return {
    id,
    title,
    description: typeof raw.description === "string" ? raw.description : "",
    level: typeof raw.level === "string" ? raw.level : "",
    priceGuided: toFiniteNumber(raw.priceGuided),
    priceSelf: toFiniteNumber(raw.priceSelf),
    teacherId: typeof raw.teacherId === "string" ? raw.teacherId : "",
    status: isCourseStatus(raw.status) ? raw.status : "draft",
  };
};
