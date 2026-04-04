import { describe, expect, it } from "vitest";
import type { Lesson } from "@/entities/lesson/model/types";
import { buildPublishedCourseContentProjection } from "@/features/assessments/model/releaseContent";

describe("published course content projection", () => {
  const lessons: Lesson[] = [
    {
      id: "lesson_1",
      courseId: "course_1",
      title: "Введение",
      order: 1,
      duration: 10,
    },
    {
      id: "lesson_2",
      courseId: "course_1",
      title: "Продолжение",
      order: 2,
      duration: 15,
    },
  ];

  it("uses release snapshot blocks and items for published runtime", () => {
    const projection = buildPublishedCourseContentProjection({
      courseId: "course_1",
      lessons,
      snapshot: {
        blocks: [
          {
            id: "block_1",
            courseId: "course_1",
            title: "Материалы курса",
            description: "",
            order: 1,
          },
        ],
        items: [
          {
            id: "lesson_item_1",
            courseId: "course_1",
            blockId: "block_1",
            type: "lesson",
            lessonId: "lesson_1",
            order: 1,
            createdAt: "2026-04-04T00:00:00.000Z",
          },
          {
            id: "test_item_1",
            courseId: "course_1",
            blockId: "block_1",
            type: "test",
            templateId: "template_1",
            titleSnapshot: "Проверка 1",
            templateSnapshot: {
              title: "Проверка 1",
              durationMinutes: 20,
              assessmentKind: "credit",
              questions: [],
            },
            order: 2,
            createdAt: "2026-04-04T00:00:00.000Z",
          },
        ],
      },
    });

    expect(projection.blocks).toHaveLength(1);
    expect(projection.queue).toHaveLength(3);
    expect(projection.queue[0]).toMatchObject({ type: "lesson", lessonId: "lesson_1" });
    expect(projection.queue[1]).toMatchObject({ type: "test", id: "test_item_1" });
    expect(projection.queue[2]).toMatchObject({ type: "lesson", lessonId: "lesson_2" });
  });

  it("filters lesson items that are not present in published lessons", () => {
    const projection = buildPublishedCourseContentProjection({
      courseId: "course_1",
      lessons: [lessons[0]],
      snapshot: {
        blocks: [
          {
            id: "block_1",
            courseId: "course_1",
            title: "Материалы курса",
            description: "",
            order: 1,
          },
        ],
        items: [
          {
            id: "draft_lesson_item",
            courseId: "course_1",
            blockId: "block_1",
            type: "lesson",
            lessonId: "lesson_2",
            order: 1,
            createdAt: "2026-04-04T00:00:00.000Z",
          },
        ],
      },
    });

    expect(
      projection.queue.some(
        (item) => item.type === "lesson" && item.lessonId === "lesson_2"
      )
    ).toBe(false);
    expect(projection.queue).toHaveLength(1);
    expect(projection.queue[0]).toMatchObject({ type: "lesson", lessonId: "lesson_1" });
  });

  it("falls back to default block for legacy releases without blocks", () => {
    const projection = buildPublishedCourseContentProjection({
      courseId: "course_1",
      lessons,
      snapshot: {
        blocks: [],
        items: [],
      },
    });

    expect(projection.blocks).toEqual([
      {
        id: "course-block-default-course_1",
        courseId: "course_1",
        title: "Материалы курса",
        description: "",
        order: 1,
      },
    ]);
    expect(
      projection.queue.filter(
        (item) => item.type === "lesson" && item.blockId === "course-block-default-course_1"
      )
    ).toHaveLength(2);
  });
});
