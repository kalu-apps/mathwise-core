import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import { ChatService } from "./chat.service";

test("chat: non-premium student is denied message access", async () => {
  const service = new ChatService(
    {
      ensureSchema: async () => undefined,
      findThreadById: async () => ({
        id: "thread_1",
        studentId: "student_1",
        teacherId: "teacher_1",
      }),
      listMessagesByThread: async () => [],
    } as never,
    {} as never,
    {
      getCapabilitiesForUser: async () => ({
        role: "student",
        userId: "student_1",
        isIdentityVerified: true,
        hasActiveCourseEntitlement: true,
        canAccessCourse: true,
        canAccessAllLessons: true,
        canChatWithTeacher: false,
        canAccessWorkbook: false,
        isPremiumStudent: false,
        entitledCourseIds: ["course_1"],
        premiumCourseIds: [],
        teacherIdsForPremiumInteractions: [],
        primaryTeacherId: null,
        resolvedAt: new Date().toISOString(),
      }),
    } as never
  );

  await assert.rejects(
    () =>
      service.getMessages({
        actorUser: {
          id: "student_1",
          email: "student@example.test",
          firstName: "Student",
          lastName: "One",
          role: "student",
        },
        threadId: "thread_1",
      }),
    (error: unknown) => {
      assert.ok(error instanceof HttpException);
      assert.equal(error.getStatus(), 403);
      assert.equal(
        (error.getResponse() as { code?: string }).code,
        "chat_access_denied"
      );
      return true;
    }
  );
});

test("chat: teacher cannot access foreign thread", async () => {
  const service = new ChatService(
    {
      ensureSchema: async () => undefined,
      findThreadById: async () => ({
        id: "thread_1",
        studentId: "student_1",
        teacherId: "teacher_owner",
      }),
      listMessagesByThread: async () => [],
    } as never,
    {} as never,
    {} as never
  );

  await assert.rejects(
    () =>
      service.getMessages({
        actorUser: {
          id: "teacher_foreign",
          email: "teacher@example.test",
          firstName: "Teacher",
          lastName: "Foreign",
          role: "teacher",
        },
        threadId: "thread_1",
      }),
    (error: unknown) => {
      assert.ok(error instanceof HttpException);
      assert.equal(error.getStatus(), 403);
      return true;
    }
  );
});
