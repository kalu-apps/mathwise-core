import assert from "node:assert/strict";
import test from "node:test";
import { markFullLessonContent, redactLessonForPreview } from "./lessons.redaction";
import type { LessonDto } from "./lessons.types";

const BASE_LESSON: LessonDto = {
  id: "lesson_1",
  courseId: "course_1",
  title: "Производная и графики",
  order: 2,
  duration: 1800,
  videoMediaObjectId: "media_video_1",
  videoUrl: "https://cdn.example.com/lesson.mp4",
  videoStreamUrl: "https://cdn.example.com/lesson.m3u8",
  videoPosterUrl: "https://cdn.example.com/lesson.jpg",
  materials: [
    {
      id: "mat_1",
      name: "Конспект",
      type: "pdf",
      mediaObjectId: "media_material_1",
      url: "https://cdn.example.com/notes.pdf",
    },
  ],
};

test("lessons redaction: non-entitled actor receives metadata-only payload", () => {
  const payload = redactLessonForPreview(BASE_LESSON);
  assert.equal(payload.contentVisibility, "public_preview");
  assert.equal(payload.videoMediaObjectId, undefined);
  assert.equal(payload.videoUrl, undefined);
  assert.equal(payload.videoStreamUrl, undefined);
  assert.equal(payload.materials, undefined);
  assert.equal(payload.title, BASE_LESSON.title);
  assert.equal(payload.courseId, BASE_LESSON.courseId);
});

test("lessons redaction: entitled actor keeps full lesson payload", () => {
  const payload = markFullLessonContent(BASE_LESSON);
  assert.equal(payload.contentVisibility, "entitled_full");
  assert.equal(payload.videoMediaObjectId, BASE_LESSON.videoMediaObjectId);
  assert.equal(payload.videoUrl, BASE_LESSON.videoUrl);
  assert.equal(payload.videoStreamUrl, BASE_LESSON.videoStreamUrl);
  assert.equal(payload.materials?.length, 1);
});
