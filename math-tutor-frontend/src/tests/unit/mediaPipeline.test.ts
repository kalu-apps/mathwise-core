import { afterEach, describe, expect, it, vi } from "vitest";

const postMock = vi.fn();

vi.mock("@/shared/api/client", () => ({
  api: {
    post: postMock,
    get: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    code: string | undefined;
    status: number;
    requestId: string | undefined;
    details: unknown;

    constructor(
      message: string,
      options?: {
        code?: string;
        status?: number;
        requestId?: string;
        details?: unknown;
      }
    ) {
      super(message);
      this.code = options?.code;
      this.status = options?.status ?? 500;
      this.requestId = options?.requestId;
      this.details = options?.details;
    }
  },
}));

const createVideoFile = (
  sizeBytes: number,
  overrides?: Partial<Pick<File, "name" | "type">>
) =>
  ({
    name: overrides?.name ?? "lesson.mp4",
    type: overrides?.type ?? "video/mp4",
    size: sizeBytes,
  }) as File;

describe("mediaPipeline", () => {
  afterEach(() => {
    postMock.mockReset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns teacher-friendly upload error copy without internal runtime wording", async () => {
    postMock.mockRejectedValue(new Error("Media storage disabled. Broken runtime."));

    const { startLessonVideoPipeline } = await import("@/shared/lib/mediaPipeline");
    const result = await startLessonVideoPipeline({
      lessonTitle: "Алгебра",
      videoFile: createVideoFile(8 * 1024 * 1024),
    });

    expect(result.status).toBe("failed");
    expect(result.error).toBe("Не удалось начать загрузку видео. Попробуйте еще раз.");
    expect(result.error?.toLowerCase()).not.toContain("media-runtime");
    expect(result.error?.toLowerCase()).not.toContain("storage disabled");
  });

  it("keeps backend-owned upload-url + complete flow for lesson video", async () => {
    postMock.mockImplementation(async (path: string) => {
      if (path === "/media/upload-url") {
        return {
          objectId: "media_lesson_1",
          uploadUrl: "https://s3.example.test/upload",
          method: "PUT" as const,
          headers: {
            "Content-Type": "video/mp4",
          },
        };
      }
      if (path === "/media/media_lesson_1/complete") {
        return {
          ok: true,
          media: { id: "media_lesson_1" },
        };
      }
      throw new Error(`unexpected path ${path}`);
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
      })
    );

    const { startLessonVideoPipeline } = await import("@/shared/lib/mediaPipeline");
    const result = await startLessonVideoPipeline({
      lessonTitle: "Геометрия",
      videoFile: createVideoFile(12 * 1024 * 1024),
    });

    expect(result.status).toBe("ready");
    expect(result.videoMediaObjectId).toBe("media_lesson_1");
    expect(postMock).toHaveBeenNthCalledWith(
      1,
      "/media/upload-url",
      expect.objectContaining({
        category: "lesson-video",
      })
    );
    expect(postMock).toHaveBeenNthCalledWith(
      2,
      "/media/media_lesson_1/complete",
      expect.any(Object)
    );
  });

  it("enforces configurable lesson video cap above 250MB", async () => {
    const {
      LESSON_VIDEO_UPLOAD_LIMIT_BYTES,
      LESSON_VIDEO_UPLOAD_LIMIT_LABEL,
      preflightLessonVideo,
    } = await import("@/shared/lib/mediaPipeline");

    expect(LESSON_VIDEO_UPLOAD_LIMIT_BYTES).toBeGreaterThan(250 * 1024 * 1024);

    const preflight = preflightLessonVideo({
      lessonTitle: "Тригонометрия",
      videoFile: createVideoFile(LESSON_VIDEO_UPLOAD_LIMIT_BYTES + 1),
    });

    expect(preflight.ok).toBe(false);
    expect(preflight.error).toContain(LESSON_VIDEO_UPLOAD_LIMIT_LABEL);
    expect(preflight.error).not.toContain("250");
  });
});
