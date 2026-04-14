import assert from "node:assert/strict";
import test from "node:test";
import { CapabilitiesService } from "./capabilities.service";

test("capabilities: premium student gets chat/workbook capabilities", async () => {
  const service = new CapabilitiesService({
    query: async (text: string) => {
      if (text.includes("FROM access_users")) {
        return [{ role: "student", isIdentityVerified: true }];
      }
      if (text.includes("FROM course_entitlements ce")) {
        return [
          {
            courseId: "course_1",
            teacherId: "teacher_1",
            tariff: "premium",
            price: 12_000,
            priceGuided: 12_000,
          },
        ];
      }
      if (text.includes("FROM user_course_access")) {
        return [{ courseId: "course_1" }];
      }
      return [];
    },
  } as never);

  const projection = await service.getCapabilitiesForUser({
    id: "student_1",
    email: "student@example.test",
    firstName: "Student",
    lastName: "One",
    role: "student",
  });

  assert.equal(projection.canChatWithTeacher, true);
  assert.equal(projection.canAccessWorkbook, true);
  assert.deepEqual(projection.premiumCourseIds, ["course_1"]);
  assert.deepEqual(projection.teacherIdsForPremiumInteractions, ["teacher_1"]);
});

test("capabilities: non-premium student cannot access chat/workbook", async () => {
  const service = new CapabilitiesService({
    query: async (text: string) => {
      if (text.includes("FROM access_users")) {
        return [{ role: "student", isIdentityVerified: true }];
      }
      if (text.includes("FROM course_entitlements ce")) {
        return [
          {
            courseId: "course_1",
            teacherId: "teacher_1",
            tariff: "standard",
            price: 5_000,
            priceGuided: 12_000,
          },
        ];
      }
      if (text.includes("FROM user_course_access")) {
        return [{ courseId: "course_1" }];
      }
      return [];
    },
  } as never);

  const projection = await service.getCapabilitiesForUser({
    id: "student_2",
    email: "student2@example.test",
    firstName: "Student",
    lastName: "Two",
    role: "student",
  });

  assert.equal(projection.canChatWithTeacher, false);
  assert.equal(projection.canAccessWorkbook, false);
  assert.deepEqual(projection.premiumCourseIds, []);
});

test("capabilities: explicit premium grants expose canonical capabilities", async () => {
  const service = new CapabilitiesService({
    execute: async () => undefined,
    query: async (text: string) => {
      if (text.includes("FROM access_users")) {
        return [{ role: "student", isIdentityVerified: true }];
      }
      if (text.includes("FROM access_capability_grants")) {
        return [
          {
            capability: "course_access",
            state: "active",
            sourceKind: "purchase",
            sourceRef: "purchase_1",
            courseId: "course_1",
            teacherId: "",
            grantedAt: "2026-04-14T00:00:00.000Z",
            updatedAt: "2026-04-14T00:00:00.000Z",
          },
          {
            capability: "teacher_chat_access",
            state: "active",
            sourceKind: "purchase",
            sourceRef: "purchase_1",
            courseId: "course_1",
            teacherId: "teacher_1",
            grantedAt: "2026-04-14T00:00:00.000Z",
            updatedAt: "2026-04-14T00:00:00.000Z",
          },
          {
            capability: "whiteboard_access",
            state: "active",
            sourceKind: "purchase",
            sourceRef: "purchase_1",
            courseId: "course_1",
            teacherId: "teacher_1",
            grantedAt: "2026-04-14T00:00:00.000Z",
            updatedAt: "2026-04-14T00:00:00.000Z",
          },
        ];
      }
      if (text.includes("FROM course_entitlements ce")) {
        return [];
      }
      if (text.includes("FROM user_course_access")) {
        return [];
      }
      if (text.includes("FROM profile_bookings")) {
        return [];
      }
      return [];
    },
  } as never);

  const projection = await service.getCapabilitiesForUser({
    id: "student_3",
    email: "student3@example.test",
    firstName: "Student",
    lastName: "Three",
    role: "student",
  });

  assert.equal(projection.canAccessCourse, true);
  assert.equal(projection.canChatWithTeacher, true);
  assert.equal(projection.canAccessWorkbook, true);
  assert.equal(projection.hasPremiumInteractionAccess, true);
  assert.equal(projection.hasBookingInteractionAccess, false);
  assert.deepEqual(projection.grantedCapabilities, [
    "course_access",
    "teacher_chat_access",
    "whiteboard_access",
  ]);
});

test("capabilities: booking interactions grant chat/workbook without premium purchase", async () => {
  const service = new CapabilitiesService({
    execute: async () => undefined,
    query: async (text: string) => {
      if (text.includes("FROM access_users")) {
        return [{ role: "student", isIdentityVerified: true }];
      }
      if (text.includes("FROM access_capability_grants")) {
        return [];
      }
      if (text.includes("FROM course_entitlements ce")) {
        return [];
      }
      if (text.includes("FROM user_course_access")) {
        return [];
      }
      if (text.includes("FROM profile_bookings")) {
        return [
          {
            bookingId: "booking_1",
            teacherId: "teacher_42",
          },
        ];
      }
      return [];
    },
  } as never);

  const projection = await service.getCapabilitiesForUser({
    id: "student_4",
    email: "student4@example.test",
    firstName: "Student",
    lastName: "Four",
    role: "student",
  });

  assert.equal(projection.canChatWithTeacher, true);
  assert.equal(projection.canAccessWorkbook, true);
  assert.equal(projection.hasPremiumInteractionAccess, false);
  assert.equal(projection.hasBookingInteractionAccess, true);
  assert.deepEqual(projection.teacherIdsForPremiumInteractions, ["teacher_42"]);
});
