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

export type LessonVideoUploadProgress = {
  uploadedBytes: number;
  totalBytes: number;
  percent: number;
  phase: "uploading" | "finalizing" | "completed";
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
type UploadProgressCallback = (progress: LessonVideoUploadProgress) => void;

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

const isJsdomRuntime = () =>
  typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent);

const shouldUseXhrUploadProgress = (onUploadProgress?: UploadProgressCallback) =>
  Boolean(onUploadProgress) &&
  typeof XMLHttpRequest !== "undefined" &&
  !isJsdomRuntime();

const emitUploadProgress = (
  callback: UploadProgressCallback | undefined,
  progress: LessonVideoUploadProgress
) => {
  if (!callback) return;
  callback({
    uploadedBytes: Math.max(0, progress.uploadedBytes),
    totalBytes: Math.max(1, progress.totalBytes),
    percent: Math.max(0, Math.min(100, Math.round(progress.percent))),
    phase: progress.phase,
  });
};

const uploadObjectWithXhr = (params: {
  uploadUrl: string;
  method: string;
  headers?: Record<string, string>;
  body: Blob;
  signal?: AbortSignal;
  onProgress?: (uploadedBytes: number, totalBytes: number) => void;
}) =>
  new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const totalBytes = params.body.size;
    const onAbortSignal = () => {
      xhr.abort();
    };
    const clear = () => {
      xhr.upload.onprogress = null;
      xhr.onload = null;
      xhr.onerror = null;
      xhr.onabort = null;
      params.signal?.removeEventListener("abort", onAbortSignal);
    };

    xhr.open(params.method || "PUT", params.uploadUrl, true);
    Object.entries(params.headers ?? {}).forEach(([key, value]) => {
      if (typeof value === "string") {
        xhr.setRequestHeader(key, value);
      }
    });

    xhr.upload.onprogress = (event: ProgressEvent<EventTarget>) => {
      const loaded = typeof event.loaded === "number" ? event.loaded : 0;
      const total =
        event.lengthComputable && typeof event.total === "number" && event.total > 0
          ? event.total
          : totalBytes;
      params.onProgress?.(loaded, total);
    };
    xhr.onload = () => {
      clear();
      if (xhr.status >= 200 && xhr.status < 300) {
        params.onProgress?.(totalBytes, totalBytes);
        resolve();
        return;
      }
      reject(new Error(`storage-upload-http-${xhr.status}`));
    };
    xhr.onerror = () => {
      clear();
      reject(new TypeError("network failed"));
    };
    xhr.onabort = () => {
      clear();
      reject(new DOMException("Upload aborted", "AbortError"));
    };

    if (params.signal) {
      if (params.signal.aborted) {
        clear();
        reject(new DOMException("Upload aborted", "AbortError"));
        return;
      }
      params.signal.addEventListener("abort", onAbortSignal, { once: true });
    }

    xhr.send(params.body);
  });

const isAbortLikeError = (error: unknown, signal?: AbortSignal) => {
  if (signal?.aborted) return true;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (
    error instanceof ApiError &&
    error.status === 0 &&
    error.message === "Запрос отменен пользователем."
  ) {
    return true;
  }
  return false;
};

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
  signal?: AbortSignal;
  onUploadProgress?: UploadProgressCallback;
}): Promise<{ objectId: string }> => {
  const contentType = params.file.type || "application/octet-stream";
  let upload: CreateUploadUrlResponse;
  try {
    upload = await api.post<CreateUploadUrlResponse>("/media/upload-url", {
      fileName: params.file.name,
      contentType,
      sizeBytes: params.file.size,
      category: params.category,
    }, {
      signal: params.signal,
    });
  } catch (error) {
    if (isAbortLikeError(error, params.signal)) {
      throw error;
    }
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
    emitUploadProgress(params.onUploadProgress, {
      uploadedBytes: 0,
      totalBytes: params.file.size,
      percent: 0,
      phase: "uploading",
    });
    if (shouldUseXhrUploadProgress(params.onUploadProgress)) {
      await uploadObjectWithXhr({
        uploadUrl: upload.uploadUrl,
        method: upload.method || "PUT",
        headers: upload.headers,
        body: params.file,
        signal: params.signal,
        onProgress: (uploadedBytes, totalBytes) => {
          const safeTotal = Math.max(1, totalBytes);
          emitUploadProgress(params.onUploadProgress, {
            uploadedBytes,
            totalBytes: safeTotal,
            percent: (uploadedBytes / safeTotal) * 100,
            phase: "uploading",
          });
        },
      });
    } else {
      const uploadResponse = await fetch(upload.uploadUrl, {
        method: upload.method || "PUT",
        headers: upload.headers,
        body: params.file,
        signal: params.signal,
      });
      if (!uploadResponse.ok) {
        throw new Error(`storage-upload-http-${uploadResponse.status}`);
      }
      emitUploadProgress(params.onUploadProgress, {
        uploadedBytes: params.file.size,
        totalBytes: params.file.size,
        percent: 100,
        phase: "uploading",
      });
    }
  } catch (error) {
    if (isAbortLikeError(error, params.signal)) {
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
    emitUploadProgress(params.onUploadProgress, {
      uploadedBytes: params.file.size,
      totalBytes: params.file.size,
      percent: 100,
      phase: "finalizing",
    });
    await api.post<CompleteUploadResponse>(`/media/${upload.objectId}/complete`, {
      sizeBytes: params.file.size,
    }, {
      signal: params.signal,
    });
  } catch (error) {
    if (isAbortLikeError(error, params.signal)) {
      throw error;
    }
    let resolvedError: unknown = error;
    try {
      await api.post<CompleteUploadResponse>(`/media/${upload.objectId}/complete`, {
        sizeBytes: params.file.size,
      }, {
        signal: params.signal,
      });
      return {
        objectId: upload.objectId,
      };
    } catch (finalizeError) {
      if (isAbortLikeError(finalizeError, params.signal)) {
        throw finalizeError;
      }
      resolvedError = finalizeError;
      try {
        await api.post(`/media/${upload.objectId}/finalize-failed`, {}, {
          signal: params.signal,
        });
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

  emitUploadProgress(params.onUploadProgress, {
    uploadedBytes: params.file.size,
    totalBytes: params.file.size,
    percent: 100,
    phase: "completed",
  });
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
  signal?: AbortSignal;
}) => {
  for (let attempt = 1; attempt <= MULTIPART_PART_UPLOAD_MAX_RETRIES; attempt += 1) {
    if (params.signal?.aborted) {
      throw new DOMException("Upload aborted", "AbortError");
    }
    try {
      const response = await fetch(params.uploadUrl, {
        method: params.method,
        body: params.body,
        signal: params.signal,
      });
      if (!response.ok) {
        throw new Error(`multipart_part_http_${response.status}`);
      }
      return;
    } catch (error) {
      if (isAbortLikeError(error, params.signal)) {
        throw error;
      }
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
  signal?: AbortSignal;
  onUploadProgress?: UploadProgressCallback;
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
      },
      {
        signal: params.signal,
      }
    );
  } catch (error) {
    if (isAbortLikeError(error, params.signal)) {
      throw error;
    }
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
  let completedBytes = 0;
  emitUploadProgress(params.onUploadProgress, {
    uploadedBytes: 0,
    totalBytes: params.file.size,
    percent: 0,
    phase: "uploading",
  });

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
          signal: params.signal,
        });
        completedBytes += chunk.size;
        emitUploadProgress(params.onUploadProgress, {
          uploadedBytes: completedBytes,
          totalBytes: params.file.size,
          percent: (completedBytes / Math.max(1, params.file.size)) * 100,
          phase: "uploading",
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
    if (isAbortLikeError(uploadError, params.signal)) {
      throw uploadError;
    }
    try {
      await api.post(`/media/multipart/${initiated.objectId}/abort`, {
        uploadId: initiated.uploadId,
      }, {
        signal: params.signal,
      });
    } catch {
      // Best effort abort for abandoned multipart sessions.
    }
    throw new Error(buildUploadFailureMessage("upload", params.category));
  }

  try {
    emitUploadProgress(params.onUploadProgress, {
      uploadedBytes: params.file.size,
      totalBytes: params.file.size,
      percent: 100,
      phase: "finalizing",
    });
    await api.post<CompleteMultipartUploadResponse>(
      `/media/multipart/${initiated.objectId}/complete`,
      {
        uploadId: initiated.uploadId,
        partCount: initiated.partCount,
        sizeBytes: params.file.size,
      },
      {
        signal: params.signal,
      }
    );
  } catch (error) {
    if (isAbortLikeError(error, params.signal)) {
      throw error;
    }
    try {
      await api.post<CompleteUploadResponse>(
        `/media/${initiated.objectId}/finalize-failed`,
        {},
        {
          signal: params.signal,
        }
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

  emitUploadProgress(params.onUploadProgress, {
    uploadedBytes: params.file.size,
    totalBytes: params.file.size,
    percent: 100,
    phase: "completed",
  });
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
  input: ResolveLessonVideoSourcesInput,
  options?: {
    signal?: AbortSignal;
    onUploadProgress?: UploadProgressCallback;
  }
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
            signal: options?.signal,
            onUploadProgress: options?.onUploadProgress,
          })
        : await uploadObjectToStorage({
            file: input.videoFile,
            category: "lesson-video",
            signal: options?.signal,
            onUploadProgress: options?.onUploadProgress,
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
    if (isAbortLikeError(error, options?.signal)) {
      throw error;
    }
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

export async function uploadLessonMaterialFile(
  file: File,
  options?: { signal?: AbortSignal }
): Promise<string> {
  const uploaded = await uploadObjectToStorage({
    file,
    category: "lesson-material",
    signal: options?.signal,
  });
  return uploaded.objectId;
}

export async function uploadNewsAttachmentFile(
  file: File,
  options?: { signal?: AbortSignal }
): Promise<string> {
  const uploaded = await uploadObjectToStorage({
    file,
    category: "news-attachment",
    signal: options?.signal,
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
