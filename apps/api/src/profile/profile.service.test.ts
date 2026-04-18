import assert from "node:assert/strict";
import test from "node:test";
import { ProfileService } from "./profile.service";

test("profile: student context reconciles guest bookings by canonical email", async () => {
  process.env.APP_ENV = "local";
  process.env.DATABASE_URL = "postgres://local:local@127.0.0.1:5432/mathwise_test";
  process.env.REDIS_URL = "redis://127.0.0.1:6379";

  let attachedParams:
    | {
        userId: string;
        canonicalEmail: string;
      }
    | undefined;

  const profileRepository = {
    ensureSchema: async () => undefined,
    hasAnyProfileData: async () => false,
    attachGuestBookingsToStudentByEmail: async (params: {
      userId: string;
      canonicalEmail: string;
    }) => {
      attachedParams = params;
      return 1;
    },
    findPurchasesByUser: async () => [],
    findBookingsByStudent: async () => [],
    findTeacherAvailabilityByTeacherIds: async () => [],
    findBookingsByTeacher: async () => [],
    findTeacherAvailabilityByTeacherId: async () => [],
  };

  const authRepository = {
    findById: async (id: string) =>
      id === "student_1"
        ? {
            id,
            role: "student",
            firstName: "Student",
            lastName: "One",
            email: "Student@Example.com",
            phone: "",
            photo: "",
          }
        : null,
    findByRole: async () => [],
  };

  const coursesRepository = {
    findAllPublishedCatalog: async () => [],
    findAllDraftsByTeacher: async () => [],
  };

  const lessonsRepository = {
    findPublishedAll: async () => [],
    findDraftByCourse: async () => [],
  };

  const databaseService = {
    execute: async () => undefined,
    query: async () => [],
  };

  const service = new ProfileService(
    databaseService as never,
    profileRepository as never,
    authRepository as never,
    coursesRepository as never,
    lessonsRepository as never,
    undefined,
    undefined,
    undefined
  );

  const context = await service.getStudentContext("student_1");

  assert.deepEqual(attachedParams, {
    userId: "student_1",
    canonicalEmail: "student@example.com",
  });
  assert.equal(context.profile?.id, "student_1");
  assert.equal(context.bookings.length, 0);
});
