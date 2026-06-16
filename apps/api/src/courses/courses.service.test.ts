import assert from "node:assert/strict";
import test from "node:test";
import { CoursesService } from "./courses.service";

const withRequiredRuntimeEnv = async (run: () => Promise<void>) => {
  const snapshot = {
    APP_ENV: process.env.APP_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
  };

  process.env.APP_ENV = "local";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://local/test";
  process.env.REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

  try {
    await run();
  } finally {
    if (snapshot.APP_ENV === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = snapshot.APP_ENV;

    if (snapshot.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = snapshot.DATABASE_URL;

    if (snapshot.REDIS_URL === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = snapshot.REDIS_URL;
  }
};

test("courses service: teacher delete does not delete lessons, releases, purchases, or media", async () => {
  await withRequiredRuntimeEnv(async () => {
    let hiddenCourseId: string | null = null;
    let lessonsDeleted = false;
    let draftLessonsRead = false;
    let mediaReleased = false;

    const service = new CoursesService(
      { query: async () => [] } as never,
      {
        findDraftById: async () => ({
          id: "course_1",
          title: "Course 1",
          description: "",
          level: "",
          priceGuided: 1000,
          priceSelf: 1000,
          teacherId: "teacher_1",
          status: "published",
        }),
        deleteDraft: async (courseId: string) => {
          hiddenCourseId = courseId;
        },
      } as never,
      {
        findDraftByCourse: async () => {
          draftLessonsRead = true;
          return [];
        },
        deleteByCourse: async () => {
          lessonsDeleted = true;
        },
      } as never,
      {
        releaseMediaObjects: async () => {
          mediaReleased = true;
        },
      } as never
    );

    await service.deleteDraft("course_1", {
      id: "teacher_1",
      email: "teacher@example.test",
      firstName: "Teacher",
      lastName: "One",
      role: "teacher",
    });

    assert.equal(hiddenCourseId, "course_1");
    assert.equal(draftLessonsRead, false);
    assert.equal(lessonsDeleted, false);
    assert.equal(mediaReleased, false);
  });
});

test("courses service: hidden purchased course is still returned to its student", async () => {
  await withRequiredRuntimeEnv(async () => {
    const service = new CoursesService(
      {
        query: async (statement: string) => {
          assert.match(statement, /profile_purchases/);
          return [{ hasActiveEntitlement: true }];
        },
      } as never,
      {
        isTeacherDeleted: async () => true,
        findPublishedById: async () => ({
          id: "course_1",
          title: "Course 1",
          description: "",
          level: "",
          priceGuided: 1000,
          priceSelf: 1000,
          teacherId: "teacher_1",
          status: "published",
        }),
      } as never,
      {} as never,
      {} as never
    );

    const course = await service.getById("course_1", {
      id: "student_1",
      email: "student@example.test",
      firstName: "Student",
      lastName: "One",
      role: "student",
    });

    assert.equal(course?.id, "course_1");
  });
});

test("courses service: hidden course is not returned without ownership", async () => {
  await withRequiredRuntimeEnv(async () => {
    const service = new CoursesService(
      {
        query: async () => [{ hasActiveEntitlement: false }],
      } as never,
      {
        isTeacherDeleted: async () => true,
        findPublishedById: async () => ({
          id: "course_1",
          title: "Course 1",
          description: "",
          level: "",
          priceGuided: 1000,
          priceSelf: 1000,
          teacherId: "teacher_1",
          status: "published",
        }),
      } as never,
      {} as never,
      {} as never
    );

    const course = await service.getById("course_1", {
      id: "student_1",
      email: "student@example.test",
      firstName: "Student",
      lastName: "One",
      role: "student",
    });

    assert.equal(course, null);
  });
});
