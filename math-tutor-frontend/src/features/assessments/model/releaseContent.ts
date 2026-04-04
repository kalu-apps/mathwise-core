import type { CourseAssessmentReleaseSnapshotContract } from "@/shared/contracts/course.contract";
import type { Lesson } from "@/entities/lesson/model/types";
import type {
  CourseContentItem,
  CourseContentTestItem,
  CourseMaterialBlock,
  TestTemplateSnapshot,
} from "@/features/assessments/model/types";

const DEFAULT_BLOCK_TITLE = "Материалы курса";

const defaultBlockId = (courseId: string) => `course-block-default-${courseId}`;

const createDefaultBlock = (courseId: string): CourseMaterialBlock => ({
  id: defaultBlockId(courseId),
  courseId,
  title: DEFAULT_BLOCK_TITLE,
  description: "",
  order: 1,
});

const normalizeBlocks = (
  courseId: string,
  blocks: CourseAssessmentReleaseSnapshotContract["blocks"]
): CourseMaterialBlock[] => {
  const normalized = (Array.isArray(blocks) ? blocks : [])
    .map((block) => ({
      id: typeof block.id === "string" ? block.id.trim() : "",
      courseId,
      title: typeof block.title === "string" ? block.title.trim() : "",
      description: typeof block.description === "string" ? block.description : "",
      order:
        Number.isFinite(Number(block.order)) && Number(block.order) > 0
          ? Math.floor(Number(block.order))
          : 1,
    }))
    .filter((block) => block.id.length > 0 && block.title.length > 0)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((block, index) => ({
      ...block,
      order: index + 1,
    }));

  return normalized.length > 0 ? normalized : [createDefaultBlock(courseId)];
};

const normalizeItems = (params: {
  courseId: string;
  items: CourseAssessmentReleaseSnapshotContract["items"];
  lessons: Lesson[];
  blocks: CourseMaterialBlock[];
}): CourseContentItem[] => {
  const { courseId, items, lessons, blocks } = params;
  const firstBlockId = blocks[0].id;
  const blockIds = new Set(blocks.map((block) => block.id));
  const lessonIds = new Set(lessons.map((lesson) => lesson.id));

  const normalizedItems = (Array.isArray(items) ? items : [])
    .map((item): CourseContentItem | null => {
      const id = typeof item.id === "string" ? item.id.trim() : "";
      const type = item.type === "lesson" || item.type === "test" ? item.type : null;
      if (!id || !type) return null;
      const orderRaw = Number(item.order);
      const order = Number.isFinite(orderRaw) ? Math.max(1, Math.floor(orderRaw)) : 1;
      const blockId =
        typeof item.blockId === "string" && blockIds.has(item.blockId)
          ? item.blockId
          : firstBlockId;
      const createdAt =
        typeof item.createdAt === "string" && item.createdAt.trim().length > 0
          ? item.createdAt
          : new Date().toISOString();

      if (type === "lesson") {
        const lessonId = typeof item.lessonId === "string" ? item.lessonId : "";
        if (!lessonId || !lessonIds.has(lessonId)) return null;
        return {
          id,
          courseId,
          blockId,
          type: "lesson",
          lessonId,
          createdAt,
          order,
        };
      }

      const templateId = typeof item.templateId === "string" ? item.templateId : "";
      const titleSnapshot =
        typeof item.titleSnapshot === "string" ? item.titleSnapshot : "";
      if (!templateId || !titleSnapshot) return null;
      const templateSnapshot = isTestTemplateSnapshot(item.templateSnapshot)
        ? item.templateSnapshot
        : undefined;
      return {
        id,
        courseId,
        blockId,
        type: "test",
        templateId,
        titleSnapshot,
        templateSnapshot,
        createdAt,
        order,
      } satisfies CourseContentTestItem;
    })
    .filter((item): item is CourseContentItem => Boolean(item))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  const existingLessonIds = new Set(
    normalizedItems
      .filter((item): item is Extract<CourseContentItem, { type: "lesson" }> => item.type === "lesson")
      .map((item) => item.lessonId)
  );

  const missingLessonItems: CourseContentItem[] = [...lessons]
    .sort((a, b) => a.order - b.order)
    .filter((lesson) => !existingLessonIds.has(lesson.id))
    .map((lesson, index) => ({
      id: `lesson-item-${lesson.id}`,
      courseId,
      blockId: firstBlockId,
      type: "lesson" as const,
      lessonId: lesson.id,
      createdAt: new Date().toISOString(),
      order: normalizedItems.length + index + 1,
    }));

  return [...normalizedItems, ...missingLessonItems]
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((item, index) => ({
      ...item,
      order: index + 1,
    }));
};

const isTestTemplateSnapshot = (
  value: unknown
): value is TestTemplateSnapshot => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const source = value as Record<string, unknown>;
  return (
    typeof source.title === "string" &&
    Number.isFinite(Number(source.durationMinutes)) &&
    (source.assessmentKind === "credit" || source.assessmentKind === "exam") &&
    Array.isArray(source.questions)
  );
};

export const buildPublishedCourseContentProjection = (params: {
  courseId: string;
  lessons: Lesson[];
  snapshot: CourseAssessmentReleaseSnapshotContract | null | undefined;
}): { queue: CourseContentItem[]; blocks: CourseMaterialBlock[] } => {
  const { courseId, lessons, snapshot } = params;
  const blocks = normalizeBlocks(courseId, snapshot?.blocks ?? []);
  const queue = normalizeItems({
    courseId,
    items: snapshot?.items ?? [],
    lessons,
    blocks,
  });
  return { queue, blocks };
};
