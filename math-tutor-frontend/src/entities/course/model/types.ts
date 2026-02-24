export type CourseStatus = "draft" | "published";

export type Course = {
  id: string;
  title: string;
  description: string;
  level: string;
  priceGuided: number; // с обратной связью
  priceSelf: number; // без обратной связи
  teacherId: string;
  status: CourseStatus;
};
