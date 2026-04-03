import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Lesson } from "@/entities/lesson/model/types";

const apiGetMock = vi.fn();
const apiPutMock = vi.fn();
const readStorageMock = vi.fn();
const removeStorageMock = vi.fn();

vi.mock("@/shared/api/client", () => ({
  api: {
    get: (...args: unknown[]) => apiGetMock(...args),
    put: (...args: unknown[]) => apiPutMock(...args),
  },
}));

vi.mock("@/shared/lib/localDb", () => ({
  readStorage: (...args: unknown[]) => readStorageMock(...args),
  removeStorage: (...args: unknown[]) => removeStorageMock(...args),
}));

const emptyAssessmentsState = () => ({
  templates: [],
  courseContent: {},
  courseBlocks: {},
  attempts: [],
});

describe("course details assessment autosync", () => {
  beforeEach(() => {
    vi.resetModules();
    apiGetMock.mockReset();
    apiPutMock.mockReset();
    readStorageMock.mockReset();
    removeStorageMock.mockReset();
    readStorageMock.mockImplementation((_, fallback) => fallback);
    removeStorageMock.mockImplementation(() => {});
  });

  it("keeps lesson queue autosync silent in read path", async () => {
    apiGetMock.mockResolvedValueOnce(emptyAssessmentsState());
    apiPutMock.mockResolvedValue(undefined);

    const { getCourseContentItems } = await import(
      "@/features/assessments/model/storage"
    );

    const lessons: Lesson[] = [
      {
        id: "lesson_1",
        courseId: "course_1",
        title: "Алгебра 1",
        order: 1,
        duration: 45,
      },
    ];

    const queue = await getCourseContentItems("course_1", lessons);

    expect(queue).toHaveLength(1);
    expect(apiPutMock).toHaveBeenCalledTimes(1);
    const [path, payload, options] = apiPutMock.mock.calls[0] as [
      string,
      Record<string, unknown>,
      { notifyDataUpdate?: boolean },
    ];
    expect(path).toBe("/assessments/state");
    expect(options).toMatchObject({ notifyDataUpdate: false });
    expect(payload).toMatchObject({
      courseContent: {
        course_1: expect.any(Array),
      },
    });
  });

  it("keeps block normalization autosync silent in read path", async () => {
    apiGetMock.mockResolvedValueOnce(emptyAssessmentsState());
    apiPutMock.mockResolvedValue(undefined);

    const { getCourseMaterialBlocks } = await import(
      "@/features/assessments/model/storage"
    );

    const blocks = await getCourseMaterialBlocks("course_1");

    expect(blocks).toHaveLength(1);
    expect(apiPutMock).toHaveBeenCalledTimes(1);
    const [path, payload, options] = apiPutMock.mock.calls[0] as [
      string,
      Record<string, unknown>,
      { notifyDataUpdate?: boolean },
    ];
    expect(path).toBe("/assessments/state");
    expect(options).toMatchObject({ notifyDataUpdate: false });
    expect(payload).toMatchObject({
      courseBlocks: {
        course_1: expect.any(Array),
      },
    });
  });
});

