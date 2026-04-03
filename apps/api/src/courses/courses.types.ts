export type CourseStatus = "draft" | "published";

export type CourseVisualStyleDto =
  | "polyhedra"
  | "function-fields"
  | "projection-wireframe"
  | "lattice"
  | "topology"
  | "analytic-sections"
  | "signal-waves";

export type CourseVisualPaletteDto =
  | "indigo-mineral"
  | "cobalt-cyan"
  | "violet-mint"
  | "graphite-aurora"
  | "slate-gold";

export type CourseCatalogItemDto = {
  id: string;
  title: string;
  description: string;
  level: string;
  priceGuided: number;
  priceSelf: number;
  teacherId: string;
  status: CourseStatus;
  visualStyle?: CourseVisualStyleDto;
  visualSeed?: number;
  visualPalette?: CourseVisualPaletteDto;
  visualVariant?: number;
};

export type CourseReleaseStatus = "active" | "superseded";

export type CourseAssessmentReleaseItemDto = {
  id: string;
  courseId: string;
  blockId: string;
  type: "lesson" | "test";
  order: number;
  titleSnapshot?: string;
  templateId?: string;
  templateSnapshot?: unknown;
  lessonId?: string;
  createdAt: string;
};

export type CourseReleaseSnapshotDto = {
  id: string;
  courseId: string;
  version: number;
  status: CourseReleaseStatus;
  publishedAt: string;
  createdByTeacherId: string;
  course: CourseCatalogItemDto;
  lessons: unknown[];
  assessments: CourseAssessmentReleaseItemDto[];
};

export type PublishCourseResponseDto = {
  courseId: string;
  releaseId: string;
  version: number;
  publishedAt: string;
  lessonsCount: number;
  assessmentsCount: number;
};

export type CoursesDbPayload = {
  courses?: unknown;
};
