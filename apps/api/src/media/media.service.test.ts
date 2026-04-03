import assert from "node:assert/strict";
import test from "node:test";
import type { AuthUserDto } from "../auth/auth.types";
import { MediaService } from "./media.service";

const getErrorStatus = (error: unknown) =>
  error &&
  typeof error === "object" &&
  "getStatus" in error &&
  typeof (error as { getStatus: () => number }).getStatus === "function"
    ? (error as { getStatus: () => number }).getStatus()
    : null;

const createActorUser = (): AuthUserDto => ({
  id: "student_1",
  email: "student@example.com",
  firstName: "Student",
  lastName: "One",
  role: "student",
});

test("media: create upload url fails with 503 when storage is disabled", async () => {
  const actorUser = createActorUser();

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
      return getErrorStatus(error) === 503;
    }
  );
});

test("media: lesson-video upload requires explicit sizeBytes", async () => {
  const actorUser = createActorUser();
  const mediaService = new MediaService(
    {
      ensureSchema: async () => undefined,
      insertPending: async () => undefined,
    } as never,
    {
      isEnabled: () => true,
      getBucket: () => "test-bucket",
      getAppEnv: () => "stage",
      healthcheck: async () => true,
      createSignedUploadUrl: async () => ({
        url: "https://s3.example/upload",
        expiresAt: new Date().toISOString(),
      }),
    } as never
  );

  await assert.rejects(
    () =>
      mediaService.createUploadUrl({
        actorUser,
        payload: {
          fileName: "lesson.mp4",
          contentType: "video/mp4",
          category: "lesson-video",
        },
      }),
    (error: unknown) => getErrorStatus(error) === 400
  );
});

test("media: lesson-video upload rejects payload above configured cap", async () => {
  const previous = process.env.MEDIA_LESSON_VIDEO_MAX_UPLOAD_MB;
  process.env.MEDIA_LESSON_VIDEO_MAX_UPLOAD_MB = "1024";
  try {
    const actorUser = createActorUser();
    const mediaService = new MediaService(
      {
        ensureSchema: async () => undefined,
        insertPending: async () => undefined,
      } as never,
      {
        isEnabled: () => true,
        getBucket: () => "test-bucket",
        getAppEnv: () => "stage",
        healthcheck: async () => true,
        createSignedUploadUrl: async () => ({
          url: "https://s3.example/upload",
          expiresAt: new Date().toISOString(),
        }),
      } as never
    );

    await assert.rejects(
      () =>
        mediaService.createUploadUrl({
          actorUser,
          payload: {
            fileName: "lesson.mp4",
            contentType: "video/mp4",
            category: "lesson-video",
            sizeBytes: 2 * 1024 * 1024 * 1024,
          },
        }),
      (error: unknown) => getErrorStatus(error) === 413
    );
  } finally {
    if (previous === undefined) {
      delete process.env.MEDIA_LESSON_VIDEO_MAX_UPLOAD_MB;
    } else {
      process.env.MEDIA_LESSON_VIDEO_MAX_UPLOAD_MB = previous;
    }
  }
});

test("media: lesson-video upload keeps backend-owned pending record when valid", async () => {
  const actorUser = createActorUser();
  let insertedRecord: unknown = null;

  const mediaService = new MediaService(
    {
      ensureSchema: async () => undefined,
      insertPending: async (record: unknown) => {
        insertedRecord = record;
      },
    } as never,
    {
      isEnabled: () => true,
      getBucket: () => "test-bucket",
      getAppEnv: () => "stage",
      healthcheck: async () => true,
      createSignedUploadUrl: async () => ({
        url: "https://s3.example/upload",
        expiresAt: new Date().toISOString(),
      }),
    } as never
  );

  const response = await mediaService.createUploadUrl({
    actorUser,
    payload: {
      fileName: "lesson.mp4",
      contentType: "video/mp4",
      category: "lesson-video",
      sizeBytes: 50 * 1024 * 1024,
    },
  });

  assert.equal(typeof response.objectId, "string");
  assert.equal(response.method, "PUT");
  assert.equal(
    typeof (insertedRecord as { category?: unknown } | null)?.category,
    "string"
  );
  assert.equal(
    (insertedRecord as { category?: string } | null)?.category,
    "lesson-video"
  );
});
