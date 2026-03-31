import assert from "node:assert/strict";
import test from "node:test";
import type { AuthUserDto } from "../auth/auth.types";
import { MediaService } from "./media.service";

test("media: create upload url fails with 503 when storage is disabled", async () => {
  const actorUser: AuthUserDto = {
    id: "student_1",
    email: "student@example.com",
    firstName: "Student",
    lastName: "One",
    role: "student",
  };

  const mediaService = new MediaService(
    {
      ensureSchema: async () => undefined,
      insertPending: async () => undefined,
    } as never,
    {
      isEnabled: () => false,
      getBucket: () => "test-bucket",
      getAppEnv: () => "local",
      healthcheck: async () => true,
    } as never
  );

  await assert.rejects(
    () =>
      mediaService.createUploadUrl({
        actorUser,
        payload: {
          fileName: "lesson.pdf",
          contentType: "application/pdf",
        },
      }),
    (error: unknown) => {
      const status =
        error &&
        typeof error === "object" &&
        "getStatus" in error &&
        typeof (error as { getStatus: () => number }).getStatus === "function"
          ? (error as { getStatus: () => number }).getStatus()
          : null;
      return status === 503;
    }
  );
});
