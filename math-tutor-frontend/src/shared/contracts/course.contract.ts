export type CourseStatusContract = "draft" | "published";

export type CourseCatalogItemContract = {
  id: string;
  title: string;
  description: string;
  level: string;
  priceGuided: number;
  priceSelf: number;
  teacherId: string;
  status: CourseStatusContract;
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

export type PublishCourseResponseContract = {
  courseId: string;
  releaseId: string;
  version: number;
  publishedAt: string;
  lessonsCount: number;
  assessmentsCount: number;
};
