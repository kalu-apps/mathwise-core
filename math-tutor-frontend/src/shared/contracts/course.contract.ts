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
