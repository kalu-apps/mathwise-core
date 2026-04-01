import { api } from "@/shared/api/client";

export type ResolveLessonVideoSourcesInput = {
  lessonTitle?: string;
  videoFile: File | null;
  videoUrl?: string;
  videoStreamUrl?: string;
  videoPosterUrl?: string;
};

export type ResolveLessonVideoSourcesResult = {
  videoUrl: string;
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

type DownloadUrlResponse = {
  objectId: string;
  downloadUrl: string;
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

const MAX_BROWSER_UPLOAD_BYTES = 250 * 1024 * 1024;
const MAX_JOB_POLLS = 20;
const JOB_POLL_DELAY_MS = 500;

const normalizeSource = (value?: string) => value?.trim() ?? "";
const wait = (ms: number) =>
  new Promise((resolve) => globalThis.setTimeout(resolve, ms));

const buildFallbackResult = (
  input: ResolveLessonVideoSourcesInput,
  uploadDataUrl: string
): ResolveLessonVideoSourcesResult => ({
  videoUrl: uploadDataUrl || normalizeSource(input.videoUrl),
  videoStreamUrl: normalizeSource(input.videoStreamUrl) || undefined,
  videoPosterUrl: normalizeSource(input.videoPosterUrl) || undefined,
});

const toResolvedState = (
  state: ResolveLessonVideoSourcesResult,
  status: MediaJobStatus,
  jobId?: string,
  error?: string
): LessonMediaJobState => ({
  videoUrl: normalizeSource(state.videoUrl),
  videoStreamUrl: normalizeSource(state.videoStreamUrl) || undefined,
  videoPosterUrl: normalizeSource(state.videoPosterUrl) || undefined,
  status,
  jobId,
  error,
});

const uploadObjectToStorage = async (params: {
  file: File;
  category: string;
}): Promise<{ objectId: string; downloadUrl: string }> => {
  const upload = await api.post<CreateUploadUrlResponse>("/media/upload-url", {
    fileName: params.file.name,
    contentType: params.file.type || "application/octet-stream",
    sizeBytes: params.file.size,
    category: params.category,
  });

  const uploadResponse = await fetch(upload.uploadUrl, {
    method: upload.method || "PUT",
    headers: upload.headers,
    body: params.file,
  });
  if (!uploadResponse.ok) {
    throw new Error("Storage upload failed");
  }

  await api.post<CompleteUploadResponse>(`/media/${upload.objectId}/complete`, {
    sizeBytes: params.file.size,
  });
  const download = await api.get<DownloadUrlResponse>(
    `/media/${upload.objectId}/download-url`,
    {
      dedupe: false,
      cacheTtlMs: 0,
    }
  );

  return {
    objectId: upload.objectId,
    downloadUrl: download.downloadUrl,
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
      error: "Файл не распознан как видео. Загрузите видеофайл или используйте прямую ссылку.",
    };
  }
  if (input.videoFile.size > MAX_BROWSER_UPLOAD_BYTES) {
    return {
      ok: false,
      error:
        "Для текущего режима тестирования загрузите видео до 250 МБ. Для более тяжелых роликов используйте потоковую ссылку или внешний mp4 URL.",
    };
  }
  if (input.videoFile.size > 120 * 1024 * 1024) {
    return {
      ok: true,
      note:
        "Большие видео обрабатываются дольше. Лучше дождаться статуса «Готово» перед публикацией курса.",
    };
  }
  return { ok: true };
};

export async function startLessonVideoPipeline(
  input: ResolveLessonVideoSourcesInput
): Promise<LessonMediaJobState> {
  const fallbackResult = buildFallbackResult(input, "");

  if (!input.videoFile) {
    return toResolvedState(fallbackResult, "ready");
  }

  try {
    const uploaded = await uploadObjectToStorage({
      file: input.videoFile,
      category: "lesson-video",
    });
    return toResolvedState(
      {
        videoUrl: uploaded.downloadUrl,
        videoStreamUrl: uploaded.downloadUrl,
        videoPosterUrl: fallbackResult.videoPosterUrl,
      },
      "ready",
      uploaded.objectId
    );
  } catch {
    return toResolvedState(
      fallbackResult,
      "failed",
      undefined,
      "Не удалось загрузить видео в storage. Проверьте media-runtime настройки."
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
            videoUrl: current.downloadUrl,
            videoStreamUrl: current.downloadUrl,
            videoPosterUrl: fallbackSources.videoPosterUrl,
          },
          "ready",
          jobId
        );
      }
    } catch {
      // Media object can still be in transit in storage.
    }
  }

  return toResolvedState(fallbackSources, "processing", jobId);
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
      videoUrl: resolved.videoUrl,
      videoStreamUrl: resolved.videoStreamUrl,
      videoPosterUrl: resolved.videoPosterUrl,
    };
  }
  return {
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
  return uploaded.downloadUrl;
}
