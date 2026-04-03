import type { CourseCatalogItemDto } from "./courses.types";

export const COURSE_VISUAL_STYLES = [
  "polyhedra",
  "function-fields",
  "projection-wireframe",
  "topology",
  "analytic-sections",
  "signal-waves",
] as const;

export const COURSE_VISUAL_PALETTES = [
  "indigo-mineral",
  "cobalt-cyan",
  "violet-mint",
  "graphite-aurora",
  "slate-gold",
] as const;

export type CourseVisualStyleDto = (typeof COURSE_VISUAL_STYLES)[number];
export type CourseVisualPaletteDto = (typeof COURSE_VISUAL_PALETTES)[number];

export type CourseVisualMetadataDto = {
  visualStyle: CourseVisualStyleDto;
  visualSeed: number;
  visualPalette: CourseVisualPaletteDto;
  visualVariant: number;
};

const MAX_VISUAL_SEED = 2_147_483_647;
const MAX_VISUAL_VARIANT = 255;

const isVisualStyle = (value: unknown): value is CourseVisualStyleDto =>
  typeof value === "string" && COURSE_VISUAL_STYLES.includes(value as CourseVisualStyleDto);

const normalizeVisualStyle = (value: unknown): CourseVisualStyleDto | null => {
  if (value === "lattice") return "projection-wireframe";
  return isVisualStyle(value) ? value : null;
};

const isVisualPalette = (value: unknown): value is CourseVisualPaletteDto =>
  typeof value === "string" && COURSE_VISUAL_PALETTES.includes(value as CourseVisualPaletteDto);

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const clampInt = (value: unknown, min: number, max: number): number | null => {
  const finite = toFiniteNumber(value);
  if (finite === null) return null;
  const rounded = Math.round(finite);
  return Math.min(max, Math.max(min, rounded));
};

const hashString = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const deriveCourseVisualMetadata = (courseId: string): CourseVisualMetadataDto => {
  const normalizedId = courseId.trim() || "course";
  const hash = hashString(normalizedId);
  const style = COURSE_VISUAL_STYLES[hash % COURSE_VISUAL_STYLES.length];
  const palette = COURSE_VISUAL_PALETTES[(hash >>> 5) % COURSE_VISUAL_PALETTES.length];
  const visualSeed = (hash * 2654435761) >>> 0;
  const visualVariant = (hash >>> 9) % (MAX_VISUAL_VARIANT + 1);

  return {
    visualStyle: style,
    visualSeed,
    visualPalette: palette,
    visualVariant,
  };
};

export const resolveCourseVisualMetadata = (
  courseId: string,
  input?: {
    visualStyle?: unknown;
    visualSeed?: unknown;
    visualPalette?: unknown;
    visualVariant?: unknown;
  }
): CourseVisualMetadataDto => {
  const fallback = deriveCourseVisualMetadata(courseId);

  return {
    visualStyle: normalizeVisualStyle(input?.visualStyle) ?? fallback.visualStyle,
    visualSeed:
      clampInt(input?.visualSeed, 0, MAX_VISUAL_SEED) ?? fallback.visualSeed,
    visualPalette: isVisualPalette(input?.visualPalette)
      ? input.visualPalette
      : fallback.visualPalette,
    visualVariant:
      clampInt(input?.visualVariant, 0, MAX_VISUAL_VARIANT) ?? fallback.visualVariant,
  };
};

export const withCourseVisualMetadata = (
  course: CourseCatalogItemDto
): CourseCatalogItemDto => {
  const visual = resolveCourseVisualMetadata(course.id, {
    visualStyle: course.visualStyle,
    visualSeed: course.visualSeed,
    visualPalette: course.visualPalette,
    visualVariant: course.visualVariant,
  });

  return {
    ...course,
    ...visual,
  };
};
