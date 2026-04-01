import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import { WorkbookService } from "./workbook.service";

const REQUIRED_ENV: Record<string, string> = {
  APP_ENV: "local",
  DATABASE_URL: "postgres://u:p@127.0.0.1:5432/db",
  REDIS_URL: "redis://127.0.0.1:6379",
  WORKBOOK_LAUNCH_ENABLED: "true",
  WORKBOOK_BOARD_BASE_URL: "https://board.example.test",
  WORKBOOK_LAUNCH_SECRET: "local-workbook-launch-secret",
  WORKBOOK_LAUNCH_TTL_SEC: "120",
};

const applyEnv = () => {
  for (const [key, value] of Object.entries(REQUIRED_ENV)) {
    process.env[key] = value;
  }
};

const restoreEnv = (snapshot: NodeJS.ProcessEnv) => {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
};

test("workbook launch: denied for non-premium student", async () => {
  const snapshot = { ...process.env };
  try {
    applyEnv();
    const service = new WorkbookService(
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
        service.createLaunch({
          id: "student_1",
          email: "student@example.test",
          firstName: "Student",
          lastName: "One",
          role: "student",
        }),
      (error: unknown) => {
        assert.ok(error instanceof HttpException);
        assert.equal(error.getStatus(), 403);
        assert.equal(
          (error.getResponse() as { code?: string }).code,
          "workbook_access_denied"
        );
        return true;
      }
    );
  } finally {
    restoreEnv(snapshot);
  }
});

test("workbook launch: premium student gets short-lived launch URL", async () => {
  const snapshot = { ...process.env };
  const store = new Map<string, string>();
  const replay = new Map<string, string>();
  try {
    applyEnv();
    const redis = {
      set: async (key: string, value: string) => {
        store.set(key, value);
      },
      get: async (key: string) => store.get(key) ?? null,
      del: async (key: string) => {
        store.delete(key);
      },
      setIfAbsent: async (key: string, value: string) => {
        if (replay.has(key)) return false;
        replay.set(key, value);
        return true;
      },
    };
    const service = new WorkbookService(
      redis as never,
      {
        getCapabilitiesForUser: async () => ({
          role: "student",
          userId: "student_1",
          isIdentityVerified: true,
          hasActiveCourseEntitlement: true,
          canAccessCourse: true,
          canAccessAllLessons: true,
          canChatWithTeacher: true,
          canAccessWorkbook: true,
          isPremiumStudent: true,
          entitledCourseIds: ["course_1"],
          premiumCourseIds: ["course_1"],
          teacherIdsForPremiumInteractions: ["teacher_1"],
          primaryTeacherId: "teacher_1",
          resolvedAt: new Date().toISOString(),
        }),
      } as never
    );

    const created = await service.createLaunch(
      {
        id: "student_1",
        email: "student@example.test",
        firstName: "Student",
        lastName: "One",
        role: "student",
      },
      { from: "/student/profile?tab=study" }
    );
    assert.match(created.launchUrl, /\/api\/workbook\/launch\//);

    const artifactId = created.launchUrl.split("/").pop() ?? "";
    const target = await service.consumeLaunch(
      {
        id: "student_1",
        email: "student@example.test",
        firstName: "Student",
        lastName: "One",
        role: "student",
      },
      artifactId
    );
    assert.match(target, /^https:\/\/board\.example\.test\/workbook\?/);
    assert.match(target, /mwLaunch=/);
  } finally {
    restoreEnv(snapshot);
  }
});
