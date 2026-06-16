import assert from "node:assert/strict";
import test from "node:test";
import { AccessService } from "./access.service";

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

const createAccessService = (params: { hasEntitlement: boolean }) =>
  new AccessService(
    { query: async () => [] } as never,
    {
      existsPublishedById: async () => true,
      existsById: async () => true,
      isTeacherDeleted: async () => true,
    } as never,
    {} as never,
    {
      findUserContext: async () => ({
        id: "student_1",
        role: "student",
        isIdentityVerified: true,
      }),
      hasActiveEntitlement: async () => params.hasEntitlement,
    } as never
  );

test("access: hidden course stays available to the student who bought it", async () => {
  await withRequiredRuntimeEnv(async () => {
    const service = createAccessService({ hasEntitlement: true });

    const decision = await service.getCourseAccessDecision("course_1", {
      id: "student_1",
      email: "student@example.test",
      firstName: "Student",
      lastName: "One",
      role: "student",
    });

    assert.equal(decision.canViewCourse, true);
    assert.equal(decision.canAccessAllLessons, true);
    assert.equal(decision.hasActiveCourseEntitlement, true);
    assert.equal(decision.mode, "full");
  });
});

test("access: hidden course is not visible without an existing entitlement", async () => {
  await withRequiredRuntimeEnv(async () => {
    const service = createAccessService({ hasEntitlement: false });

    const decision = await service.getCourseAccessDecision("course_1", {
      id: "student_1",
      email: "student@example.test",
      firstName: "Student",
      lastName: "One",
      role: "student",
    });

    assert.equal(decision.canViewCourse, false);
    assert.equal(decision.canAccessAllLessons, false);
    assert.equal(decision.hasActiveCourseEntitlement, false);
    assert.equal(decision.reason, "course_not_found");
    assert.equal(decision.mode, "none");
  });
});
