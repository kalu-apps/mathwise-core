import { generateId } from "@/shared/lib/id";
import type { LessonDraft } from "@/features/course-editor/ui/LessonEditor";
import type {
  CourseContentItem,
  CourseContentTestItem,
  CourseMaterialBlock,
} from "@/features/assessments/model/types";

export type CourseDraftSnapshot = {
  title: string;
  description: string;
  level: string;
  priceGuided: string;
  priceSelf: string;
  lessons: LessonDraft[];
  courseContentItems: CourseContentItem[];
  courseBlocks: CourseMaterialBlock[];
};

export const toComparableSnapshot = (snapshot: CourseDraftSnapshot) => {
  const normalizedBlocks =
    snapshot.courseBlocks.length === 1 &&
    snapshot.courseBlocks[0]?.title === "Основной блок" &&
    snapshot.courseBlocks[0]?.description.trim() === ""
      ? []
      : snapshot.courseBlocks.map((block) => ({
          id: block.id,
          title: block.title.trim(),
          description: block.description.trim(),
          order: block.order,
        }));

  return {
    title: snapshot.title.trim(),
    description: snapshot.description.trim(),
    level: snapshot.level.trim(),
    priceGuided: snapshot.priceGuided.trim(),
    priceSelf: snapshot.priceSelf.trim(),
    lessons: snapshot.lessons.map((lesson) => ({
      id: lesson.id ?? null,
      title: lesson.title.trim(),
      duration: lesson.duration,
      hasVideoFile: Boolean(lesson.videoFile),
      videoMediaObjectId: lesson.videoMediaObjectId ?? "",
      videoUrl: lesson.videoUrl ?? "",
      videoStreamUrl: lesson.videoStreamUrl ?? "",
      videoPosterUrl: lesson.videoPosterUrl ?? "",
      mediaJobId: lesson.mediaJobId ?? "",
      mediaJobStatus: lesson.mediaJobStatus ?? "",
      mediaJobError: lesson.mediaJobError ?? "",
      settings: lesson.settings ?? null,
      materials: lesson.materials.map((material) => ({
        id: material.id,
        name: material.name.trim(),
        type: material.type,
        mediaObjectId: material.mediaObjectId ?? "",
        url: material.url ?? "",
        hasFile: Boolean(material.file),
      })),
    })),
    courseContentItems: snapshot.courseContentItems.map((item) => ({
      id: item.id,
      blockId: item.blockId,
      type: item.type,
      order: item.order,
      lessonId: item.type === "lesson" ? item.lessonId : null,
      templateId: item.type === "test" ? item.templateId : null,
      titleSnapshot: item.type === "test" ? item.titleSnapshot : null,
    })),
    courseBlocks: normalizedBlocks,
  };
};

export const toLessonQueueItems = (
  courseId: string,
  lessons: LessonDraft[],
  blockId: string
): CourseContentItem[] =>
  lessons.map((lesson, index) => ({
    id: `lesson-item-${lesson.id ?? generateId()}`,
    courseId,
    blockId,
    type: "lesson" as const,
    lessonId: lesson.id ?? generateId(),
    createdAt: new Date().toISOString(),
    order: index + 1,
  }));

export const normalizeQueue = (items: CourseContentItem[]) =>
  [...items]
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({ ...item, order: index + 1 }));

export const getTestAttachmentItems = (item: CourseContentTestItem) => {
  const attachments =
    item.templateSnapshot?.questions
      .flatMap((question) => question.prompt.attachments ?? [])
      .filter((attachment) => attachment.type !== "image") ?? [];
  if (attachments.length === 0) return [];
  const seen = new Set<string>();
  return attachments.filter((attachment) => {
    const key = `${attachment.type}:${attachment.id}:${attachment.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const syncQueueWithLessons = (
  queue: CourseContentItem[],
  courseId: string,
  lessons: LessonDraft[],
  defaultBlockId: string
) => {
  const lessonIds = new Set(
    lessons
      .map((lesson) => lesson.id)
      .filter((lessonId): lessonId is string => Boolean(lessonId))
  );
  const preserved = queue.filter((item) =>
    item.type === "test" ? true : lessonIds.has(item.lessonId)
  );
  const existingLessonIds = new Set(
    preserved
      .filter((item): item is Extract<CourseContentItem, { type: "lesson" }> => item.type === "lesson")
      .map((item) => item.lessonId)
  );
  const appended = lessons
    .map((lesson) => lesson.id)
    .filter((lessonId): lessonId is string => Boolean(lessonId))
    .filter((lessonId) => !existingLessonIds.has(lessonId))
    .map((lessonId) => ({
      id: `lesson-item-${lessonId}`,
      courseId,
      blockId: defaultBlockId,
      type: "lesson" as const,
      lessonId,
      createdAt: new Date().toISOString(),
      order: preserved.length + 1,
    }));

  return normalizeQueue([...preserved, ...appended]);
};
