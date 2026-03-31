import type { LessonDto } from "./lessons.types";

const toFiniteNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const mapUnknownLessonToDto = (input: unknown): LessonDto | null => {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id : "";
  const courseId = typeof raw.courseId === "string" ? raw.courseId : "";
  const title = typeof raw.title === "string" ? raw.title : "";
  if (!id || !courseId || !title) return null;

  return {
    id,
    courseId,
    title,
    order: Math.max(1, Math.floor(toFiniteNumber(raw.order))),
    duration: Math.max(0, Math.floor(toFiniteNumber(raw.duration))),
    videoUrl: typeof raw.videoUrl === "string" ? raw.videoUrl : undefined,
    videoStreamUrl:
      typeof raw.videoStreamUrl === "string" ? raw.videoStreamUrl : undefined,
    videoPosterUrl:
      typeof raw.videoPosterUrl === "string" ? raw.videoPosterUrl : undefined,
    mediaJobId: typeof raw.mediaJobId === "string" ? raw.mediaJobId : undefined,
    mediaJobStatus:
      raw.mediaJobStatus === "queued" ||
      raw.mediaJobStatus === "processing" ||
      raw.mediaJobStatus === "ready" ||
      raw.mediaJobStatus === "failed"
        ? raw.mediaJobStatus
        : undefined,
    mediaJobError:
      typeof raw.mediaJobError === "string" ? raw.mediaJobError : undefined,
    materials: Array.isArray(raw.materials)
      ? (raw.materials as LessonDto["materials"])
      : undefined,
    settings:
      raw.settings && typeof raw.settings === "object"
        ? (raw.settings as LessonDto["settings"])
        : undefined,
  };
};
