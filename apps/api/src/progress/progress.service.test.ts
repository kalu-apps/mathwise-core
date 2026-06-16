import assert from "node:assert/strict";
import test from "node:test";
import { ProgressService } from "./progress.service";

test("progress: teacher course-level delete preserves all student progress", async () => {
  let deletedCourseProgress = false;
  let deletedUserProgress = false;

  const service = new ProgressService(
    {
      deleteProgressByCourse: async () => {
        deletedCourseProgress = true;
      },
      deleteProgressByCourseForUser: async () => {
        deletedUserProgress = true;
      },
    } as never,
    {} as never
  );

  await service.deleteProgressByCourse({
    actorUser: {
      id: "teacher_1",
      email: "teacher@example.test",
      firstName: "Teacher",
      lastName: "One",
      role: "teacher",
    },
    courseId: "course_1",
  });

  assert.equal(deletedCourseProgress, false);
  assert.equal(deletedUserProgress, false);
});

test("progress: teacher can still delete progress for one selected student", async () => {
  let deletedUserProgress:
    | {
        userId: string;
        courseId: string;
      }
    | null = null;

  const service = new ProgressService(
    {
      deleteProgressByCourse: async () => {
        throw new Error("course-level progress delete must not run");
      },
      deleteProgressByCourseForUser: async (params: {
        userId: string;
        courseId: string;
      }) => {
        deletedUserProgress = params;
      },
    } as never,
    {} as never
  );

  await service.deleteProgressByCourse({
    actorUser: {
      id: "teacher_1",
      email: "teacher@example.test",
      firstName: "Teacher",
      lastName: "One",
      role: "teacher",
    },
    userId: "student_1",
    courseId: "course_1",
  });

  assert.deepEqual(deletedUserProgress, {
    userId: "student_1",
    courseId: "course_1",
  });
});
