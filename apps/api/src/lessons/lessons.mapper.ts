import type { LessonDto } from "./lessons.types";

type LessonMaterialDto = NonNullable<LessonDto["materials"]>[number];

const toFiniteNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const hasRuntimeSignedQuery = (value: string) => {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("x-amz-signature=") ||
    normalized.includes("x-amz-credential=") ||
    normalized.includes("x-amz-security-token=") ||
    normalized.includes("x-goog-signature=") ||
    normalized.includes("sig=") ||
    normalized.includes("signature=")
  );
};

export const sanitizePersistedMediaUrl = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return hasRuntimeSignedQuery(trimmed) ? undefined : trimmed;
};

const mapUnknownMaterial = (input: unknown): LessonMaterialDto | null => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const type = raw.type === "video" || raw.type === "pdf" || raw.type === "doc" ? raw.type : null;
  if (!id || !name || !type) return null;

  const mediaObjectId =
    typeof raw.mediaObjectId === "string" && raw.mediaObjectId.trim().length > 0
      ? raw.mediaObjectId.trim()
      : undefined;
  const url =
    typeof raw.url === "string" ? sanitizePersistedMediaUrl(raw.url) : undefined;

  if (!mediaObjectId && !url) return null;

  return {
    id,
    name,
    type,
    mediaObjectId,
    url,
    downloadable:
      typeof raw.downloadable === "boolean" ? raw.downloadable : undefined,
  };
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
    videoMediaObjectId:
      typeof raw.videoMediaObjectId === "string" ? raw.videoMediaObjectId : undefined,
    videoUrl: sanitizePersistedMediaUrl(raw.videoUrl),
    videoStreamUrl:
      sanitizePersistedMediaUrl(raw.videoStreamUrl),
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
      ? raw.materials
          .map((material) => mapUnknownMaterial(material))
          .filter((material): material is NonNullable<LessonDto["materials"]>[number] =>
            Boolean(material)
          )
      : undefined,
    settings:
      raw.settings && typeof raw.settings === "object"
        ? (raw.settings as LessonDto["settings"])
        : undefined,
  };
};
