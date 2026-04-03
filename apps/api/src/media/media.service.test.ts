import assert from "node:assert/strict";
import test from "node:test";
import type { AuthUserDto } from "../auth/auth.types";
import type { MediaObjectRecord } from "./media.types";
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

const createMediaRecord = (
  overrides: Partial<MediaObjectRecord> = {}
): MediaObjectRecord => ({
  id: "media_1",
  objectKey: "stage/lesson-video/student_1/2026-04-03/media_1_video.mp4",
  bucket: "test-bucket",
  ownerUserId: "student_1",
  category: "lesson-video",
  contentType: "video/mp4",
  sizeBytes: 1024,
  state: "uploaded",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

test("media: create upload url fails with 503 when storage is disabled", async () => {
  const actorUser = createActorUser();

  const mediaService = new MediaService(
    {
      ensureSchema: async () => undefined,
      insertPending: async () => undefined,
      markStalePendingAsFailed: async () => 0,
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
      markStalePendingAsFailed: async () => 0,
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
        markStalePendingAsFailed: async () => 0,
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
      markStalePendingAsFailed: async () => 0,
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

test("media: releaseMediaObjects does not delete still-referenced media", async () => {
  let deleteCalls = 0;
  let markUploadedStateCalls = 0;
  const mediaService = new MediaService(
    {
      ensureSchema: async () => undefined,
      markStalePendingAsFailed: async () => 0,
      markOrphanCandidate: async () =>
        createMediaRecord({ state: "orphan_candidate" }),
      findById: async () => createMediaRecord({ state: "orphan_candidate" }),
      countReferencesByObjectId: async () => ({
        draftRefs: 1,
        releaseRefs: 0,
        purchaseRefs: 0,
        totalRefs: 1,
      }),
      markUploadedState: async () => {
        markUploadedStateCalls += 1;
        return createMediaRecord({ state: "uploaded" });
      },
      markCleanupPending: async () => createMediaRecord({ state: "cleanup_pending" }),
      markDeleted: async () => createMediaRecord({ state: "deleted" }),
    } as never,
    {
      isEnabled: () => true,
      healthcheck: async () => true,
      deleteObject: async () => {
        deleteCalls += 1;
        return true;
      },
      headObject: async () => ({
        etag: "etag",
      }),
    } as never
  );

  await mediaService.releaseMediaObjects({
    objectIds: ["media_1"],
    reason: "test",
  });

  assert.equal(deleteCalls, 0);
  assert.equal(markUploadedStateCalls, 1);
});

test("media: releaseMediaObjects deletes unreferenced media safely", async () => {
  let deleteCalls = 0;
  let markDeletedCalls = 0;
  const mediaService = new MediaService(
    {
      ensureSchema: async () => undefined,
      markStalePendingAsFailed: async () => 0,
      markOrphanCandidate: async () =>
        createMediaRecord({ state: "orphan_candidate" }),
      findById: async () => createMediaRecord({ state: "orphan_candidate" }),
      countReferencesByObjectId: async () => ({
        draftRefs: 0,
        releaseRefs: 0,
        purchaseRefs: 0,
        totalRefs: 0,
      }),
      markUploadedState: async () => createMediaRecord({ state: "uploaded" }),
      markCleanupPending: async () => createMediaRecord({ state: "cleanup_pending" }),
      markDeleted: async () => {
        markDeletedCalls += 1;
        return createMediaRecord({ state: "deleted" });
      },
    } as never,
    {
      isEnabled: () => true,
      healthcheck: async () => true,
      deleteObject: async () => {
        deleteCalls += 1;
        return true;
      },
      headObject: async () => null,
    } as never
  );

  await mediaService.releaseMediaObjects({
    objectIds: ["media_1"],
    reason: "test",
  });

  assert.equal(deleteCalls, 1);
  assert.equal(markDeletedCalls, 1);
});
