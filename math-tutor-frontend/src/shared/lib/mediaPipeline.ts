import { api, ApiError } from "@/shared/api/client";

export type ResolveLessonVideoSourcesInput = {
  lessonTitle?: string;
  videoFile: File | null;
  videoMediaObjectId?: string;
  videoUrl?: string;
  videoStreamUrl?: string;
  videoPosterUrl?: string;
};

export type ResolveLessonVideoSourcesResult = {
  videoMediaObjectId?: string;
  videoUrl?: string;
  videoStreamUrl?: string;
  videoPosterUrl?: string;
};

type CreateUploadUrlResponse = {
  objectId: string;
  uploadUrl: string;
  method: "PUT";
  headers?: Record<string, string>;
};

type CompleteUploadResponse = {
  ok: boolean;
  media: {
    id: string;
  };
};

type CreateMultipartUploadResponse = {
  objectId: string;
  uploadId: string;
  partSizeBytes: number;
  partCount: number;
  parts: Array<{
    partNumber: number;
    uploadUrl: string;
    method: "PUT";
  }>;
};

type CompleteMultipartUploadResponse = {
  ok: boolean;
  media: {
    id: string;
  };
};

type DownloadUrlResponse = {
  objectId: string;
  downloadUrl: string;
  expiresAt?: string;
};

export type MediaJobStatus = "queued" | "processing" | "ready" | "failed";

export type LessonMediaJobState = ResolveLessonVideoSourcesResult & {
  jobId?: string;
  status: MediaJobStatus;
  error?: string;
};

export type VideoPreflightResult = {
  ok: boolean;
  error?: string;
  note?: string;
};

const DEFAULT_LESSON_VIDEO_UPLOAD_LIMIT_MB = 2048;
const MIN_LESSON_VIDEO_UPLOAD_LIMIT_MB = 1024;
const MAX_LESSON_VIDEO_UPLOAD_LIMIT_MB = 4096;
const MULTIPART_VIDEO_THRESHOLD_BYTES = 256 * 1024 * 1024;
const MULTIPART_UPLOAD_CONCURRENCY = 3;
const MULTIPART_PART_UPLOAD_MAX_RETRIES = 3;
const MULTIPART_PART_RETRY_BASE_MS = 750;
const MAX_JOB_POLLS = 20;
const JOB_POLL_DELAY_MS = 500;

type UploadStage = "presign" | "upload" | "complete";

const toMegabytes = (bytes: number) => bytes / (1024 * 1024);

const formatUploadLimit = (bytes: number) => {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    const rounded = Number.isInteger(gb) ? String(gb) : gb.toFixed(1);
    return `${rounded} ГБ`;
  }
  return `${Math.floor(toMegabytes(bytes))} МБ`;
};

const resolveLessonVideoUploadLimitMb = () => {
  const configured = Number(import.meta.env.VITE_LESSON_VIDEO_UPLOAD_MAX_MB);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_LESSON_VIDEO_UPLOAD_LIMIT_MB;
  }
  return Math.min(
    MAX_LESSON_VIDEO_UPLOAD_LIMIT_MB,
    Math.max(MIN_LESSON_VIDEO_UPLOAD_LIMIT_MB, Math.floor(configured))
  );
};

export const LESSON_VIDEO_UPLOAD_LIMIT_BYTES =
  resolveLessonVideoUploadLimitMb() * 1024 * 1024;
export const LESSON_VIDEO_UPLOAD_LIMIT_LABEL = formatUploadLimit(
  LESSON_VIDEO_UPLOAD_LIMIT_BYTES
);

const normalizeSource = (value?: string) => value?.trim() || undefined;
const wait = (ms: number) =>
  new Promise((resolve) => globalThis.setTimeout(resolve, ms));

const buildUploadFailureMessage = (
  stage: UploadStage,
  category: string
) => {
  if (category === "lesson-video") {
    if (stage === "presign") {
      return "Не удалось начать загрузку видео. Попробуйте еще раз.";
    }
    if (stage === "upload") {
      return "Не удалось загрузить видео. Попробуйте еще раз. Если ошибка повторяется, обратитесь к администратору.";
    }
    return "Видео загружено, но не удалось подтвердить загрузку. Попробуйте еще раз.";
  }
  if (stage === "presign") {
    return "Не удалось начать загрузку файла. Попробуйте еще раз.";
  }
  if (stage === "upload") {
    return "Не удалось загрузить файл. Попробуйте еще раз.";
  }
  return "Файл загружен, но не удалось подтвердить загрузку. Попробуйте еще раз.";
};

const extractApiDiagnostics = (error: unknown) => {
  if (!(error instanceof ApiError)) return null;
  return {
    code: error.code,
    status: error.status,
    requestId: error.requestId,
    details: error.details,
  };
};

const logUploadFailure = (params: {
  stage: UploadStage;
  category: string;
  fileName: string;
  sizeBytes: number;
  error: unknown;
  context?: Record<string, unknown>;
}) => {
  const diagnostics = extractApiDiagnostics(params.error);
  const probableCors =
    params.stage === "upload" &&
    params.error instanceof TypeError &&
    /fetch/i.test(params.error.message);
  if (typeof console !== "undefined") {
    console.error("[media-upload] upload-failed", {
      stage: params.stage,
      category: params.category,
      fileName: params.fileName,
      sizeBytes: params.sizeBytes,
      probableCors,
      diagnostics,
      error:
        params.error instanceof Error
          ? {
              name: params.error.name,
              message: params.error.message,
            }
          : params.error,
      context: params.context,
    });
  }
};

const buildFallbackResult = (
  input: ResolveLessonVideoSourcesInput,
  uploadedObjectId?: string
): ResolveLessonVideoSourcesResult => ({
  videoMediaObjectId: uploadedObjectId ?? normalizeSource(input.videoMediaObjectId),
  videoUrl: normalizeSource(input.videoUrl),
  videoStreamUrl: normalizeSource(input.videoStreamUrl),
  videoPosterUrl: normalizeSource(input.videoPosterUrl),
});

const toResolvedState = (
  state: ResolveLessonVideoSourcesResult,
  status: MediaJobStatus,
  jobId?: string,
  error?: string
): LessonMediaJobState => ({
  videoMediaObjectId: normalizeSource(state.videoMediaObjectId),
  videoUrl: normalizeSource(state.videoUrl),
  videoStreamUrl: normalizeSource(state.videoStreamUrl),
  videoPosterUrl: normalizeSource(state.videoPosterUrl),
  status,
  jobId,
  error,
});

const uploadObjectToStorage = async (params: {
  file: File;
  category: string;
}): Promise<{ objectId: string }> => {
  const contentType = params.file.type || "application/octet-stream";
  let upload: CreateUploadUrlResponse;
  try {
    upload = await api.post<CreateUploadUrlResponse>("/media/upload-url", {
      fileName: params.file.name,
      contentType,
      sizeBytes: params.file.size,
      category: params.category,
    });
  } catch (error) {
    logUploadFailure({
      stage: "presign",
      category: params.category,
      fileName: params.file.name,
      sizeBytes: params.file.size,
      error,
    });
    throw new Error(buildUploadFailureMessage("presign", params.category));
  }

  try {
    const uploadResponse = await fetch(upload.uploadUrl, {
      method: upload.method || "PUT",
      headers: upload.headers,
      body: params.file,
    });
    if (!uploadResponse.ok) {
      logUploadFailure({
        stage: "upload",
        category: params.category,
        fileName: params.file.name,
        sizeBytes: params.file.size,
        error: new Error(`storage-upload-http-${uploadResponse.status}`),
      });
      throw new Error(buildUploadFailureMessage("upload", params.category));
    }
  } catch (error) {
    if (error instanceof Error && error.message === buildUploadFailureMessage("upload", params.category)) {
      throw error;
    }
    logUploadFailure({
      stage: "upload",
      category: params.category,
      fileName: params.file.name,
      sizeBytes: params.file.size,
      error,
    });
    throw new Error(buildUploadFailureMessage("upload", params.category));
  }

  try {
    await api.post<CompleteUploadResponse>(`/media/${upload.objectId}/complete`, {
      sizeBytes: params.file.size,
    });
  } catch (error) {
    let resolvedError: unknown = error;
    try {
      await api.post<CompleteUploadResponse>(`/media/${upload.objectId}/complete`, {
        sizeBytes: params.file.size,
      });
      return {
        objectId: upload.objectId,
      };
    } catch (finalizeError) {
      resolvedError = finalizeError;
      try {
        await api.post(`/media/${upload.objectId}/finalize-failed`, {});
      } catch (reconcileError) {
        if (typeof console !== "undefined") {
          console.warn("[media-upload] finalize-failed-reconcile", {
            objectId: upload.objectId,
            reconcileError:
              reconcileError instanceof Error
                ? {
                    name: reconcileError.name,
                    message: reconcileError.message,
                  }
                : reconcileError,
          });
        }
      }
    }
    logUploadFailure({
      stage: "complete",
      category: params.category,
      fileName: params.file.name,
      sizeBytes: params.file.size,
      error: resolvedError,
    });
    throw new Error(buildUploadFailureMessage("complete", params.category));
  }

  return {
    objectId: upload.objectId,
  };
};

const uploadMultipartPartWithRetry = async (params: {
  uploadUrl: string;
  method: "PUT";
  body: Blob;
  fileName: string;
  sizeBytes: number;
  category: string;
  partNumber: number;
}) => {
  for (let attempt = 1; attempt <= MULTIPART_PART_UPLOAD_MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(params.uploadUrl, {
        method: params.method,
        body: params.body,
      });
      if (!response.ok) {
        throw new Error(`multipart_part_http_${response.status}`);
      }
      return;
    } catch (error) {
      if (attempt >= MULTIPART_PART_UPLOAD_MAX_RETRIES) {
        logUploadFailure({
          stage: "upload",
          category: params.category,
          fileName: params.fileName,
          sizeBytes: params.sizeBytes,
          error,
          context: {
            partNumber: params.partNumber,
            attempt,
            mode: "multipart",
          },
        });
        throw error;
      }
      await wait(MULTIPART_PART_RETRY_BASE_MS * attempt);
    }
  }
};

const uploadMultipartObjectToStorage = async (params: {
  file: File;
  category: string;
}): Promise<{ objectId: string }> => {
  let initiated: CreateMultipartUploadResponse;
  try {
    initiated = await api.post<CreateMultipartUploadResponse>(
      "/media/multipart/initiate",
      {
        fileName: params.file.name,
        contentType: params.file.type || "application/octet-stream",
        sizeBytes: params.file.size,
        category: params.category,
      }
    );
  } catch (error) {
    logUploadFailure({
      stage: "presign",
      category: params.category,
      fileName: params.file.name,
      sizeBytes: params.file.size,
      error,
      context: { mode: "multipart" },
    });
    throw new Error(buildUploadFailureMessage("presign", params.category));
  }

  const sortedParts = [...initiated.parts].sort((a, b) => a.partNumber - b.partNumber);
  let index = 0;
  let uploadError: unknown = null;

  const worker = async () => {
    while (index < sortedParts.length && !uploadError) {
      const currentIndex = index;
      index += 1;
      const part = sortedParts[currentIndex];
      const start = (part.partNumber - 1) * initiated.partSizeBytes;
      const end = Math.min(start + initiated.partSizeBytes, params.file.size);
      const chunk = params.file.slice(start, end);
      try {
        await uploadMultipartPartWithRetry({
          uploadUrl: part.uploadUrl,
          method: part.method,
          body: chunk,
          fileName: params.file.name,
          sizeBytes: params.file.size,
          category: params.category,
          partNumber: part.partNumber,
        });
      } catch (error) {
        uploadError = error;
      }
    }
  };

  await Promise.all(
    Array.from({ length: MULTIPART_UPLOAD_CONCURRENCY }, () => worker())
  );

  if (uploadError) {
    try {
      await api.post(`/media/multipart/${initiated.objectId}/abort`, {
        uploadId: initiated.uploadId,
      });
    } catch {
      // Best effort abort for abandoned multipart sessions.
    }
    throw new Error(buildUploadFailureMessage("upload", params.category));
  }

  try {
    await api.post<CompleteMultipartUploadResponse>(
      `/media/multipart/${initiated.objectId}/complete`,
      {
        uploadId: initiated.uploadId,
        partCount: initiated.partCount,
        sizeBytes: params.file.size,
      }
    );
  } catch (error) {
    try {
      await api.post<CompleteUploadResponse>(
        `/media/${initiated.objectId}/finalize-failed`,
        {}
      );
    } catch {
      // finalize-failed reconciliation is best effort
    }
    logUploadFailure({
      stage: "complete",
      category: params.category,
      fileName: params.file.name,
      sizeBytes: params.file.size,
      error,
      context: { mode: "multipart" },
    });
    throw new Error(buildUploadFailureMessage("complete", params.category));
  }

  return {
    objectId: initiated.objectId,
  };
};

export const preflightLessonVideo = (
  input: ResolveLessonVideoSourcesInput
): VideoPreflightResult => {
  if (!input.videoFile) {
    return { ok: true };
  }
  if (!input.videoFile.type.startsWith("video/")) {
    return {
      ok: false,
      error: "Файл не распознан как видео. Выберите корректный видеофайл.",
    };
  }
  if (input.videoFile.size > LESSON_VIDEO_UPLOAD_LIMIT_BYTES) {
    return {
      ok: false,
      error: `Размер видео превышает лимит ${LESSON_VIDEO_UPLOAD_LIMIT_LABEL}. Выберите файл меньше лимита или обратитесь к администратору.`,
    };
  }
  if (input.videoFile.size > 512 * 1024 * 1024) {
    return {
      ok: true,
      note:
        "Большие видео загружаются и обрабатываются дольше. Дождитесь статуса «Готово» перед публикацией курса.",
    };
  }
  return { ok: true };
};

export async function startLessonVideoPipeline(
  input: ResolveLessonVideoSourcesInput
): Promise<LessonMediaJobState> {
  if (!input.videoFile) {
    return toResolvedState(buildFallbackResult(input), "ready");
  }

  try {
    const uploaded =
      input.videoFile.size >= MULTIPART_VIDEO_THRESHOLD_BYTES
        ? await uploadMultipartObjectToStorage({
            file: input.videoFile,
            category: "lesson-video",
          })
        : await uploadObjectToStorage({
            file: input.videoFile,
            category: "lesson-video",
          });
    return toResolvedState(
      {
        videoMediaObjectId: uploaded.objectId,
        videoPosterUrl: normalizeSource(input.videoPosterUrl),
      },
      "ready",
      uploaded.objectId
    );
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : buildUploadFailureMessage("upload", "lesson-video");
    return toResolvedState(
      buildFallbackResult(input),
      "failed",
      undefined,
      message
    );
  }
}

export async function pollLessonVideoPipeline(
  jobId: string,
  fallbackSources: ResolveLessonVideoSourcesResult,
  options?: {
    maxPolls?: number;
    delayMs?: number;
  }
): Promise<LessonMediaJobState> {
  const maxPolls = Math.max(1, options?.maxPolls ?? MAX_JOB_POLLS);
  const delayMs = Math.max(100, options?.delayMs ?? JOB_POLL_DELAY_MS);

  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    if (attempt > 0) {
      await wait(delayMs);
    }
    try {
      const current = await api.get<DownloadUrlResponse>(`/media/${jobId}/download-url`, {
        dedupe: false,
        cacheTtlMs: 0,
      });
      if (current.downloadUrl) {
        return toResolvedState(
          {
            ...fallbackSources,
            videoMediaObjectId: current.objectId || jobId,
          },
          "ready",
          jobId
        );
      }
    } catch {
      // Media object can still be in transit in storage.
    }
  }

  return toResolvedState(
    {
      ...fallbackSources,
      videoMediaObjectId: normalizeSource(fallbackSources.videoMediaObjectId) || jobId,
    },
    "processing",
    jobId
  );
}

export async function resolveLessonVideoSources(
  input: ResolveLessonVideoSourcesInput
): Promise<ResolveLessonVideoSourcesResult> {
  const started = await startLessonVideoPipeline(input);
  if (
    (started.status === "queued" || started.status === "processing") &&
    started.jobId
  ) {
    const resolved = await pollLessonVideoPipeline(started.jobId, started);
    return {
      videoMediaObjectId: resolved.videoMediaObjectId,
      videoUrl: resolved.videoUrl,
      videoStreamUrl: resolved.videoStreamUrl,
      videoPosterUrl: resolved.videoPosterUrl,
    };
  }
  return {
    videoMediaObjectId: started.videoMediaObjectId,
    videoUrl: started.videoUrl,
    videoStreamUrl: started.videoStreamUrl,
    videoPosterUrl: started.videoPosterUrl,
  };
}

export async function uploadLessonMaterialFile(file: File): Promise<string> {
  const uploaded = await uploadObjectToStorage({
    file,
    category: "lesson-material",
  });
  return uploaded.objectId;
}

export async function getOwnedMediaDownloadUrl(
  objectId: string
): Promise<DownloadUrlResponse> {
  const normalized = objectId.trim();
  if (!normalized) {
    throw new Error("media_object_id_missing");
  }
  const response = await api.get<DownloadUrlResponse>(
    `/media/${encodeURIComponent(normalized)}/download-url`,
    {
      dedupe: false,
      cacheTtlMs: 0,
    }
  );
  if (!response.downloadUrl?.trim()) {
    throw new Error("media_download_url_missing");
  }
  return response;
}
