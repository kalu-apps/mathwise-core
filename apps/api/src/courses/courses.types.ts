export type CourseStatus = "draft" | "published";

export type CourseCatalogItemDto = {
  id: string;
  title: string;
  description: string;
  level: string;
  priceGuided: number;
  priceSelf: number;
  teacherId: string;
  status: CourseStatus;
};

export type CoursesDbPayload = {
  courses?: unknown;
};
