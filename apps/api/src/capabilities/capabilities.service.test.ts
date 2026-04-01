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
