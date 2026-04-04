export type CourseStatusContract = "draft" | "published";

export type CourseVisualStyleContract =
  | "polyhedra"
  | "function-fields"
  | "projection-wireframe"
  | "lattice"
  | "topology"
  | "analytic-sections"
  | "signal-waves";

export type CourseVisualPaletteContract =
  | "indigo-mineral"
  | "cobalt-cyan"
  | "violet-mint"
  | "graphite-aurora"
  | "slate-gold";

export type CourseCatalogItemContract = {
  id: string;
  title: string;
  description: string;
  level: string;
  priceGuided: number;
  priceSelf: number;
  teacherId: string;
  status: CourseStatusContract;
  visualStyle?: CourseVisualStyleContract;
  visualSeed?: number;
  visualPalette?: CourseVisualPaletteContract;
  visualVariant?: number;
};

export type CourseCatalogResponseContract = CourseCatalogItemContract[];
export type CourseByIdResponseContract = CourseCatalogItemContract | null;

export type CourseAssessmentReleaseItemContract = {
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

export type CourseAssessmentReleaseBlockContract = {
  id: string;
  courseId: string;
  title: string;
  description: string;
  order: number;
};

export type CourseAssessmentReleaseSnapshotContract = {
  items: CourseAssessmentReleaseItemContract[];
  blocks: CourseAssessmentReleaseBlockContract[];
};

export type CourseReleaseContentResponseContract =
  CourseAssessmentReleaseSnapshotContract;

export type PublishCourseResponseContract = {
  courseId: string;
  releaseId: string;
  version: number;
  publishedAt: string;
  lessonsCount: number;
  assessmentsCount: number;
};
