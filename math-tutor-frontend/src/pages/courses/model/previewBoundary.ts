import type { Lesson } from "@/entities/lesson/model/types";
import type {
  CourseContentItem,
  CourseMaterialBlock,
} from "@/features/assessments/model/types";
import type { User } from "@/entities/user/model/types";

export type CourseDetailsContentMode =
  | "student_assessment"
  | "teacher_assessment"
  | "public_preview";

const PUBLIC_PREVIEW_BLOCK_TITLE = "Материалы курса";

export const getCourseDetailsContentMode = (
  role: User["role"] | null | undefined
): CourseDetailsContentMode => {
  if (role === "student") return "student_assessment";
  if (role === "teacher") return "teacher_assessment";
  return "public_preview";
};

export const shouldUseAssessmentsReadPath = (
  mode: CourseDetailsContentMode
) => mode !== "public_preview";

export const getPublicPreviewDefaultBlockId = (courseId: string) =>
  `course-block-default-${courseId}`;

export const buildPublicPreviewCourseBlocks = (
  courseId: string
): CourseMaterialBlock[] => [
  {
    id: getPublicPreviewDefaultBlockId(courseId),
    courseId,
    title: PUBLIC_PREVIEW_BLOCK_TITLE,
    description: "",
    order: 1,
  },
];

export const buildPublicPreviewCourseContentItems = (
  courseId: string,
  lessons: Lesson[],
  options?: {
    createdAt?: string;
  }
): CourseContentItem[] => {
  const blockId = getPublicPreviewDefaultBlockId(courseId);
  const createdAt = options?.createdAt ?? new Date().toISOString();
  return [...lessons]
    .sort((a, b) => a.order - b.order)
    .map((lesson, index) => ({
      id: `lesson-item-${lesson.id}`,
      courseId,
      blockId,
      type: "lesson" as const,
      lessonId: lesson.id,
      createdAt,
      order: index + 1,
    }));
};
