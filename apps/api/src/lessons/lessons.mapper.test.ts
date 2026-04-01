import assert from "node:assert/strict";
import test from "node:test";
import { mapUnknownLessonToDto, sanitizePersistedMediaUrl } from "./lessons.mapper";

test("lessons mapper: strips temporary signed urls from persisted fields", () => {
  const dto = mapUnknownLessonToDto({
    id: "lesson_1",
    courseId: "course_1",
    title: "Lesson",
    order: 1,
    duration: 120,
    videoUrl:
      "https://storage.example.com/video.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc",
    videoStreamUrl:
      "https://storage.example.com/stream.m3u8?X-Amz-Credential=test&X-Amz-Signature=def",
    materials: [
      {
        id: "mat_1",
        name: "Материал",
        type: "pdf",
        url: "https://storage.example.com/file.pdf?signature=123",
      },
      {
        id: "mat_2",
        name: "Материал 2",
        type: "pdf",
        mediaObjectId: "media_2",
      },
    ],
  });

  assert.ok(dto);
  assert.equal(dto?.videoUrl, undefined);
  assert.equal(dto?.videoStreamUrl, undefined);
  assert.equal(dto?.materials?.length, 1);
  assert.equal(dto?.materials?.[0]?.mediaObjectId, "media_2");
});

test("lessons mapper: keeps external non-signed urls", () => {
  assert.equal(
    sanitizePersistedMediaUrl("https://cdn.example.com/lesson.mp4"),
    "https://cdn.example.com/lesson.mp4"
  );
});

