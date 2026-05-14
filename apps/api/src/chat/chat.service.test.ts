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
    } as never,
    {} as never
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

test("chat: booking-capable student can access messages", async () => {
  const service = new ChatService(
    {
      ensureSchema: async () => undefined,
      findThreadById: async () => ({
        id: "thread_booking_1",
        studentId: "student_2",
        teacherId: "teacher_2",
      }),
      listMessagesByThread: async () => [
        {
          id: "msg_1",
          threadId: "thread_booking_1",
          senderId: "teacher_2",
          senderRole: "teacher",
          senderName: "Teacher Two",
          senderPhoto: null,
          text: "Добрый день",
          attachments: [],
          createdAt: new Date().toISOString(),
        },
      ],
    } as never,
    {} as never,
    {
      getCapabilitiesForUser: async () => ({
        role: "student",
        userId: "student_2",
        isIdentityVerified: true,
        hasActiveCourseEntitlement: false,
        canAccessCourse: false,
        canAccessAllLessons: false,
        canChatWithTeacher: true,
        canAccessWorkbook: true,
        isPremiumStudent: false,
        hasPremiumInteractionAccess: false,
        hasBookingInteractionAccess: true,
        grantedCapabilities: ["teacher_chat_access", "whiteboard_access"],
        activeCapabilityGrants: [],
        entitledCourseIds: [],
        premiumCourseIds: [],
        teacherIdsForPremiumInteractions: ["teacher_2"],
        primaryTeacherId: "teacher_2",
        resolvedAt: new Date().toISOString(),
      }),
    } as never,
    {} as never
  );

  const messages = await service.getMessages({
    actorUser: {
      id: "student_2",
      email: "student2@example.test",
      firstName: "Student",
      lastName: "Two",
      role: "student",
    },
    threadId: "thread_booking_1",
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.threadId, "thread_booking_1");
});

test("chat: hydrates voice url by voice id when mediaObjectId is missing", async () => {
  const service = new ChatService(
    {
      ensureSchema: async () => undefined,
      findThreadById: async () => ({
        id: "thread_voice_1",
        studentId: "student_3",
        teacherId: "teacher_3",
      }),
      listMessagesByThread: async () => [
        {
          id: "msg_voice_1",
          threadId: "thread_voice_1",
          senderId: "teacher_3",
          senderRole: "teacher",
          senderName: "Teacher Three",
          senderPhoto: null,
          text: "",
          attachments: [],
          voice: {
            id: "media_voice_1",
            mimeType: "audio/webm",
            size: 1024,
            url: "https://expired.example.test/voice.webm",
          },
          createdAt: new Date().toISOString(),
        },
      ],
    } as never,
    {} as never,
    {} as never,
    {
      getRuntimeDownloadUrlByObjectId: async (objectId: string) => ({
        objectId,
        objectKey: `stage/chat/${objectId}.webm`,
        downloadUrl: `https://signed.example.test/${objectId}.webm`,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        contentType: "audio/webm",
        sizeBytes: 1024,
      }),
    } as never
  );

  const messages = await service.getMessages({
    actorUser: {
      id: "teacher_3",
      email: "teacher3@example.test",
      firstName: "Teacher",
      lastName: "Three",
      role: "teacher",
    },
    threadId: "thread_voice_1",
  });

  assert.equal(messages.length, 1);
  assert.equal(
    messages[0]?.voice?.url,
    "https://signed.example.test/media_voice_1.webm"
  );
  assert.equal(messages[0]?.voice?.mediaObjectId, "media_voice_1");
});

test("chat: issues media access for participant voice message", async () => {
  const service = new ChatService(
    {
      ensureSchema: async () => undefined,
      findThreadById: async () => ({
        id: "thread_voice_access_1",
        studentId: "student_voice_access",
        teacherId: "teacher_voice_access",
      }),
      findMessageById: async () => ({
        id: "msg_voice_access_1",
        threadId: "thread_voice_access_1",
        senderId: "teacher_voice_access",
        senderRole: "teacher",
        senderName: "Teacher Voice",
        senderPhoto: null,
        text: "",
        attachments: [],
        voice: {
          id: "media_voice_access_1",
          mediaObjectId: "media_voice_access_1",
          mimeType: "audio/webm",
          size: 1024,
          url: "https://expired.example.test/voice.webm",
        },
        createdAt: new Date().toISOString(),
      }),
    } as never,
    {} as never,
    {
      getCapabilitiesForUser: async () => ({
        role: "student",
        userId: "student_voice_access",
        isIdentityVerified: true,
        hasActiveCourseEntitlement: false,
        canAccessCourse: false,
        canAccessAllLessons: false,
        canChatWithTeacher: true,
        canAccessWorkbook: true,
        isPremiumStudent: false,
        hasPremiumInteractionAccess: false,
        hasBookingInteractionAccess: true,
        grantedCapabilities: ["teacher_chat_access", "whiteboard_access"],
        activeCapabilityGrants: [],
        entitledCourseIds: [],
        premiumCourseIds: [],
        teacherIdsForPremiumInteractions: ["teacher_voice_access"],
        primaryTeacherId: "teacher_voice_access",
        resolvedAt: new Date().toISOString(),
      }),
    } as never,
    {
      getRuntimeDownloadUrlByObjectId: async (objectId: string) => ({
        objectId,
        objectKey: `stage/chat/${objectId}.webm`,
        downloadUrl: `https://signed.example.test/${objectId}.webm`,
        expiresAt: "2026-05-14T20:00:00.000Z",
        contentType: "audio/webm",
        sizeBytes: 1024,
      }),
    } as never
  );

  const access = await service.getMessageMediaAccess({
    actorUser: {
      id: "student_voice_access",
      email: "student.voice@example.test",
      firstName: "Student",
      lastName: "Voice",
      role: "student",
    },
    threadId: "thread_voice_access_1",
    messageId: "msg_voice_access_1",
    mediaObjectId: "media_voice_access_1",
  });

  assert.equal(access.threadId, "thread_voice_access_1");
  assert.equal(access.messageId, "msg_voice_access_1");
  assert.equal(access.mediaObjectId, "media_voice_access_1");
  assert.equal(
    access.downloadUrl,
    "https://signed.example.test/media_voice_access_1.webm"
  );
});
