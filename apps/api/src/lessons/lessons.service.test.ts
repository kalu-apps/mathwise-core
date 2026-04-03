import assert from "node:assert/strict";
import test from "node:test";
import type { AuthUserDto } from "../auth/auth.types";
import { LessonsService } from "./lessons.service";
import type { LessonDto } from "./lessons.types";

process.env.APP_ENV ??= "local";
process.env.DATABASE_URL ??= "postgres://local:local@localhost:5432/local";
process.env.REDIS_URL ??= "redis://localhost:6379";

const ACTOR_STUDENT: AuthUserDto = {
  id: "student_1",
  email: "student@example.com",
  firstName: "Student",
  lastName: "One",
  role: "student",
};

const ACTOR_TEACHER: AuthUserDto = {
  id: "teacher_1",
  email: "teacher@example.com",
  firstName: "Teacher",
  lastName: "One",
  role: "teacher",
};

const LESSON: LessonDto = {
  id: "lesson_1",
  courseId: "course_1",
  title: "Lesson 1",
  order: 1,
  duration: 600,
  videoMediaObjectId: "media_video_1",
  mediaJobStatus: "ready",
  materials: [
    {
      id: "mat_1",
      name: "Конспект",
      type: "pdf",
      mediaObjectId: "media_mat_1",
      downloadable: true,
    },
  ],
};

const isHttpStatus = (error: unknown, status: number) =>
  Boolean(
    error &&
      typeof error === "object" &&
      "getStatus" in error &&
      typeof (error as { getStatus: () => number }).getStatus === "function" &&
      (error as { getStatus: () => number }).getStatus() === status
  );

const createService = (params: {
  entitledCourseIds?: string[];
  lesson?: LessonDto;
}) => {
  const entitledCourseIds = new Set(params.entitledCourseIds ?? []);
  const lesson = params.lesson ?? LESSON;

  const databaseService = {
    query: async (text: string) => {
      if (text.includes("FROM access_users")) {
        return [
          {
            role: "student",
            isIdentityVerified: true,
          },
        ];
      }
      if (text.includes("FROM user_course_access")) {
        return entitledCourseIds.has(lesson.courseId)
          ? [{ courseId: lesson.courseId }]
          : [];
      }
      return [];
    },
  };

  const lessonsRepository = {
    ensureSchema: async () => undefined,
    hasAnyLessons: async () => true,
    findDraftById: async () => null,
    findPublishedById: async () => lesson,
  };

  const mediaService = {
    getRuntimeDownloadUrlByObjectId: async (mediaObjectId: string) => ({
      objectId: mediaObjectId,
      objectKey: `local/${mediaObjectId}`,
      downloadUrl: `https://signed.example.com/${mediaObjectId}`,
      expiresAt: "2030-01-01T00:00:00.000Z",
      contentType: "video/mp4",
    }),
  };

  return new LessonsService(
    databaseService as never,
    lessonsRepository as never,
    mediaService as never
  );
};

test("lessons runtime: entitled actor receives short-lived playback access", async () => {
  const service = createService({ entitledCourseIds: ["course_1"] });

  const access = await service.getLessonPlaybackAccess("lesson_1", ACTOR_STUDENT);

  assert.equal(access.lessonId, "lesson_1");
  assert.equal(access.source, "media");
  assert.match(access.playbackUrl, /^https:\/\/signed\.example\.com\//);
});

test("lessons runtime: anonymous actor receives first-lesson preview playback access", async () => {
  const service = createService({ entitledCourseIds: [] });

  const access = await service.getLessonPlaybackAccess("lesson_1", null);

  assert.equal(access.lessonId, "lesson_1");
  assert.equal(access.source, "media");
  assert.match(access.playbackUrl, /^https:\/\/signed\.example\.com\//);
});

test("lessons runtime: non-entitled actor receives first-lesson preview playback access", async () => {
  const service = createService({ entitledCourseIds: [] });

  const access = await service.getLessonPlaybackAccess("lesson_1", ACTOR_STUDENT);

  assert.equal(access.lessonId, "lesson_1");
  assert.equal(access.source, "media");
  assert.match(access.playbackUrl, /^https:\/\/signed\.example\.com\//);
});

test("lessons runtime: non-entitled actor is rejected for non-preview lesson playback", async () => {
  const service = createService({
    entitledCourseIds: [],
    lesson: {
      ...LESSON,
      id: "lesson_2",
      order: 2,
    },
  });

  await assert.rejects(
    () => service.getLessonPlaybackAccess("lesson_2", ACTOR_STUDENT),
    (error: unknown) => isHttpStatus(error, 403)
  );
});

test("lessons runtime: material access is issued through backend-gated endpoint", async () => {
  const service = createService({ entitledCourseIds: ["course_1"] });

  const access = await service.getLessonMaterialAccess(
    {
      lessonId: "lesson_1",
      materialId: "mat_1",
    },
    ACTOR_STUDENT
  );

  assert.equal(access.lessonId, "lesson_1");
  assert.equal(access.materialId, "mat_1");
  assert.equal(access.source, "media");
  assert.equal(access.downloadable, true);
  assert.match(access.accessUrl, /^https:\/\/signed\.example\.com\//);
});

test("lessons draft replace: detached media ids are sent to media cleanup", async () => {
  const previous: LessonDto[] = [
    {
      id: "lesson_1",
      courseId: "course_1",
      title: "Lesson 1",
      order: 1,
      duration: 30,
      videoMediaObjectId: "media_old_video",
      materials: [
        {
          id: "mat_old",
          name: "Old PDF",
          type: "pdf",
          mediaObjectId: "media_old_pdf",
        },
      ],
    },
  ];
  const next: LessonDto[] = [
    {
      id: "lesson_1",
      courseId: "course_1",
      title: "Lesson 1",
      order: 1,
      duration: 30,
      videoMediaObjectId: "media_new_video",
      materials: [
        {
          id: "mat_new",
          name: "New PDF",
          type: "pdf",
          mediaObjectId: "media_new_pdf",
        },
      ],
    },
  ];

  const released: string[][] = [];
  const service = new LessonsService(
    {
      query: async (text: string) => {
        if (text.includes("FROM courses_catalog")) {
          return [{ teacherId: ACTOR_TEACHER.id }];
        }
        return [];
      },
    } as never,
    {
      ensureSchema: async () => undefined,
      hasAnyLessons: async () => true,
      findDraftByCourse: async () => previous,
      replaceByCourse: async () => undefined,
    } as never,
    {
      releaseMediaObjects: async (params: { objectIds: string[] }) => {
        released.push(params.objectIds);
      },
    } as never
  );

  await service.replaceLessonsByCourse(
    {
      courseId: "course_1",
      lessons: next,
    },
    ACTOR_TEACHER
  );

  assert.equal(released.length, 1);
  assert.deepEqual(
    [...released[0]].sort(),
    ["media_old_pdf", "media_old_video"].sort()
  );
});
