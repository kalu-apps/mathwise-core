import { api } from "@/shared/api/client";
import { fileToDataUrl } from "@/shared/lib/files";

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

type VideoPipelineResponse = ResolveLessonVideoSourcesResult & {
  pipelineMode: "ffmpeg" | "passthrough";
};

type MediaPipelineJobResponse = {
  id: string;
  status: "queued" | "processing" | "ready" | "failed";
  result?: string | null;
  error?: string | null;
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

const parsePipelineResult = (
  payload: string | null | undefined
): VideoPipelineResponse | null => {
  if (!payload) return null;
  try {
    return JSON.parse(payload) as VideoPipelineResponse;
  } catch {
    return null;
  }
};

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
  const uploadDataUrl = input.videoFile ? await fileToDataUrl(input.videoFile) : "";
  const fallbackResult = buildFallbackResult(input, uploadDataUrl);

  if (!input.videoFile) {
    return toResolvedState(fallbackResult, "ready");
  }

  try {
    const job = await api.post<MediaPipelineJobResponse>("/media/video-jobs", {
      lessonTitle: normalizeSource(input.lessonTitle),
      uploadDataUrl,
      fallbackUrl: normalizeSource(input.videoUrl),
      streamUrl: normalizeSource(input.videoStreamUrl),
      posterUrl: normalizeSource(input.videoPosterUrl),
    });

    return toResolvedState(
      fallbackResult,
      job.status === "failed" ? "failed" : job.status,
      job.id,
      job.error ?? undefined
    );
  } catch {
    return toResolvedState(
      fallbackResult,
      "failed",
      undefined,
      "Не удалось запустить обработку видео. Сохранен резервный источник."
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
      const current = await api.get<MediaPipelineJobResponse>(`/media/video-jobs/${jobId}`);
      if (current.status === "ready") {
        const result = parsePipelineResult(current.result);
        if (!result) {
          break;
        }
        return toResolvedState(result, "ready", jobId);
      }
      if (current.status === "failed") {
        return toResolvedState(
          fallbackSources,
          "failed",
          jobId,
          current.error ?? "Обработка видео завершилась с ошибкой."
        );
      }
    } catch {
      break;
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
