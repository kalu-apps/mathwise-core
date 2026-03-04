import {
  Dialog,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Stack,
  Typography,
  Chip,
  Box,
  Checkbox,
  FormControlLabel,
  Alert,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import VideoLibraryIcon from "@mui/icons-material/VideoLibrary";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import DescriptionIcon from "@mui/icons-material/Description";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { useEffect, useMemo, useRef, useState } from "react";
import { generateId } from "@/shared/lib/id";
import { formatLessonDuration, videoSecondsToStoredMinutes } from "@/shared/lib/duration";
import { t } from "@/shared/i18n";
import { useActionGuard } from "@/shared/lib/useActionGuard";
import { RecoverableErrorAlert } from "@/shared/ui/RecoverableErrorAlert";
import { ButtonPending } from "@/shared/ui/loading";
import { DialogTitleWithClose } from "@/shared/ui/DialogTitleWithClose";
import {
  preflightLessonVideo,
  type MediaJobStatus,
} from "@/shared/lib/mediaPipeline";

export type LessonMaterial = {
  id: string;
  name: string;
  type: "video" | "pdf" | "doc";
  url?: string;
  file?: File;
};

export type EditableLessonMaterial = {
  id: string;
  name: string;
  type: "pdf" | "doc";
  file?: File;
  url?: string;
};

export type LessonDraft = {
  id?: string;
  title: string;
  duration: number;
  videoFile: File | null;
  videoUrl?: string;
  videoStreamUrl?: string;
  videoPosterUrl?: string;
  mediaJobId?: string;
  mediaJobStatus?: MediaJobStatus;
  mediaJobError?: string;
  materials: EditableLessonMaterial[];
  settings?: {
    disablePrintableDownloads?: boolean;
  };
};

type Props = {
  initialLesson?: {
    id?: string;
    title: string;
    duration: number;
    videoUrl?: string;
    videoStreamUrl?: string;
    videoPosterUrl?: string;
    mediaJobId?: string;
    mediaJobStatus?: MediaJobStatus;
    mediaJobError?: string;
    materials: LessonMaterial[];
    settings?: {
      disablePrintableDownloads?: boolean;
    };
  };
  onSave: (lesson: LessonDraft) => Promise<void> | void;
  onCancel: () => void;
};

const getVideoDuration = (src: string) =>
  new Promise<number>((resolve, reject) => {
    const video = document.createElement("video");
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
      video.src = "";
    };
    const onLoaded = () => {
      const result = videoSecondsToStoredMinutes(video.duration);
      cleanup();
      resolve(result);
    };
    const onError = () => {
      cleanup();
      reject(new Error("Video metadata error"));
    };
    video.preload = "metadata";
    video.playsInline = true;
    video.muted = true;
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("error", onError);
    video.src = src;
    video.load();
  });

const isLikelyHlsSource = (src?: string) =>
  Boolean(src && /\.m3u8(?:$|[?#])/i.test(src.trim()));

const toComparableLessonSnapshot = (input: {
  title: string;
  videoFile: File | null;
  videoUrl?: string;
  videoStreamUrl?: string;
  videoPosterUrl?: string;
  mediaJobId?: string;
  mediaJobStatus?: MediaJobStatus;
  mediaJobError?: string;
  duration: number;
  materials: EditableLessonMaterial[];
  disablePrintableDownloads: boolean;
}) => ({
  title: input.title.trim(),
  hasVideoFile: Boolean(input.videoFile),
  videoUrl: input.videoUrl ?? "",
  videoStreamUrl: input.videoStreamUrl ?? "",
  videoPosterUrl: input.videoPosterUrl ?? "",
  mediaJobId: input.mediaJobId ?? "",
  mediaJobStatus: input.mediaJobStatus ?? "",
  mediaJobError: input.mediaJobError ?? "",
  duration: input.duration,
  materials: input.materials.map((material) => ({
    id: material.id,
    name: material.name.trim(),
    type: material.type,
    url: material.url ?? "",
    hasFile: Boolean(material.file),
  })),
  disablePrintableDownloads: input.disablePrintableDownloads,
});

export function LessonEditor({ initialLesson, onSave, onCancel }: Props) {
  const initialMaterials: EditableLessonMaterial[] =
    initialLesson?.materials
      .filter(
        (m): m is LessonMaterial & { type: "pdf" | "doc" } =>
          m.type === "pdf" || m.type === "doc"
      )
      .map((m) => ({
        id: m.id,
        name: m.name,
        type: m.type,
        url: m.url,
      })) ?? [];

  const [title, setTitle] = useState(initialLesson?.title ?? "");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | undefined>(
    initialLesson?.videoUrl
  );
  const [videoStreamUrl, setVideoStreamUrl] = useState<string | undefined>(
    initialLesson?.videoStreamUrl
  );
  const [videoPosterUrl, setVideoPosterUrl] = useState<string | undefined>(
    initialLesson?.videoPosterUrl
  );
  const [mediaJobId, setMediaJobId] = useState<string | undefined>(
    initialLesson?.mediaJobId
  );
  const [mediaJobStatus, setMediaJobStatus] = useState<MediaJobStatus | undefined>(
    initialLesson?.mediaJobStatus
  );
  const [mediaJobError, setMediaJobError] = useState<string | undefined>(
    initialLesson?.mediaJobError
  );
  const [videoPreflightNote, setVideoPreflightNote] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(
    initialLesson?.duration ?? 0
  );
  const [materials, setMaterials] =
    useState<EditableLessonMaterial[]>(initialMaterials);
  const [disablePrintableDownloads, setDisablePrintableDownloads] = useState(
    Boolean(initialLesson?.settings?.disablePrintableDownloads)
  );
  const [warningOpen, setWarningOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveGuard = useActionGuard();
  const isSaving = saveGuard.pending;
  const lessonId = initialLesson?.id;

  const materialInputRef = useRef<HTMLInputElement | null>(null);
  const [initialSnapshot] = useState(() =>
    JSON.stringify(
      toComparableLessonSnapshot({
        title: initialLesson?.title ?? "",
        videoFile: null,
        videoUrl: initialLesson?.videoUrl,
        videoStreamUrl: initialLesson?.videoStreamUrl,
        videoPosterUrl: initialLesson?.videoPosterUrl,
        mediaJobId: initialLesson?.mediaJobId,
        mediaJobStatus: initialLesson?.mediaJobStatus,
        mediaJobError: initialLesson?.mediaJobError,
        duration: initialLesson?.duration ?? 0,
        materials: initialMaterials,
        disablePrintableDownloads: Boolean(
          initialLesson?.settings?.disablePrintableDownloads
        ),
      })
    )
  );

  const hasUnsavedChanges = useMemo(
    () =>
      JSON.stringify(
        toComparableLessonSnapshot({
          title,
          videoFile,
          videoUrl,
          videoStreamUrl,
          videoPosterUrl,
          mediaJobId,
          mediaJobStatus,
          mediaJobError,
          duration,
          materials,
          disablePrintableDownloads,
        })
      ) !== initialSnapshot,
    [
      initialSnapshot,
      title,
      videoFile,
      videoUrl,
      videoStreamUrl,
      videoPosterUrl,
      mediaJobId,
      mediaJobStatus,
      mediaJobError,
      duration,
      materials,
      disablePrintableDownloads,
    ]
  );

  const handleAddMaterial = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const type =
      ext === "pdf" ? "pdf" : ext === "doc" || ext === "docx" ? "doc" : null;
    if (!type) return;

    setMaterials((prev) => [
      ...prev,
      { id: generateId(), name: file.name, type, file },
    ]);
  };

  const handleRemoveMaterial = (id: string) => {
    setMaterials((prev) => prev.filter((m) => m.id !== id));
  };

  const handleSave = async () => {
    if (title.trim().length === 0) {
      setSaveError(t("lessonEditor.requiredTitleError"));
      return;
    }
    if (!videoFile && !videoUrl && !videoStreamUrl) {
      setWarningOpen(true);
      setSaveError(t("lessonEditor.requiredVideoError"));
      return;
    }
    const preflight = preflightLessonVideo({
      lessonTitle: title.trim(),
      videoFile,
      videoUrl,
      videoStreamUrl,
      videoPosterUrl,
    });
    if (!preflight.ok) {
      setSaveError(preflight.error ?? "Не удалось подготовить видео.");
      return;
    }
    setVideoPreflightNote(preflight.note ?? null);
    setSaveError(null);
    try {
      const saved = await saveGuard.run(
        async () => {
          let finalDuration = duration;
          if (finalDuration === 0) {
            try {
              if (videoFile) {
                const objectUrl = URL.createObjectURL(videoFile);
                finalDuration = await getVideoDuration(objectUrl);
                URL.revokeObjectURL(objectUrl);
              } else if (videoUrl && !isLikelyHlsSource(videoUrl)) {
                finalDuration = await getVideoDuration(videoUrl);
              } else if (videoStreamUrl && !isLikelyHlsSource(videoStreamUrl)) {
                finalDuration = await getVideoDuration(videoStreamUrl);
              }
            } catch {
              finalDuration = duration;
            }
          }

          await onSave({
            id: lessonId,
            title: title.trim(),
            duration: finalDuration,
            videoFile,
            videoUrl,
            videoStreamUrl,
            videoPosterUrl,
            mediaJobId,
            mediaJobStatus,
            mediaJobError,
            materials,
            settings: {
              disablePrintableDownloads,
            },
          });
        },
        {
          lockKey: `lesson-save:${lessonId ?? "new"}:${title.trim()}`,
          retry: { label: t("common.retryLessonSaveAction") },
        }
      );
      if (saved === undefined) return;
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Не удалось сохранить урок."
      );
    }
  };

  useEffect(() => {
    if (videoFile) return;
    const metadataSource = videoUrl && !isLikelyHlsSource(videoUrl)
      ? videoUrl
      : videoStreamUrl && !isLikelyHlsSource(videoStreamUrl)
      ? videoStreamUrl
      : "";
    if (!metadataSource) return;
    let active = true;
    void getVideoDuration(metadataSource)
      .then((value) => {
        if (active) setDuration(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [videoFile, videoUrl, videoStreamUrl]);

  const mediaStatusAlert = useMemo(() => {
    if (mediaJobStatus === "queued") {
      return {
        severity: "info" as const,
        message: "Видео поставлено в очередь на подготовку. Курс можно сохранить как черновик.",
      };
    }
    if (mediaJobStatus === "processing") {
      return {
        severity: "info" as const,
        message: "Видео обрабатывается. Дождитесь статуса «Готово» перед публикацией курса.",
      };
    }
    if (mediaJobStatus === "ready") {
      return {
        severity: "success" as const,
        message: "Видео подготовлено. Поток и постер готовы к показу.",
      };
    }
    if (mediaJobStatus === "failed") {
      return {
        severity: "warning" as const,
        message:
          mediaJobError ||
          "Не удалось завершить обработку видео. Для урока будет использован резервный источник.",
      };
    }
    return null;
  }, [mediaJobError, mediaJobStatus]);

  const handleCloseRequest = () => {
    if (!hasUnsavedChanges) {
      onCancel();
      return;
    }
    setCloseConfirmOpen(true);
  };

  return (
    <>
      {/* ===== LESSON EDITOR DIALOG ===== */}
      <Dialog
        open
        onClose={handleCloseRequest}
        maxWidth="sm"
        fullWidth
        className="lesson-editor-dialog ui-dialog ui-dialog--wide"
      >
        <DialogTitleWithClose
          title={
            initialLesson
              ? t("lessonEditor.editLessonTitle")
              : t("lessonEditor.newLessonTitle")
          }
          onClose={handleCloseRequest}
          closeAriaLabel={t("common.close")}
        />
        <DialogContent className="lesson-editor-dialog__content">
          <Stack spacing={3} className="lesson-editor">
            {saveError && <RecoverableErrorAlert error={saveError} />}
            <TextField
              label={t("lessonEditor.lessonNameLabel")}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (saveError) setSaveError(null);
              }}
              fullWidth
              required
            />

            <Stack spacing={1}>
              <Typography variant="subtitle2">
                {t("lessonEditor.videoRequiredTitle")}
              </Typography>
              {mediaStatusAlert ? (
                <Alert severity={mediaStatusAlert.severity}>{mediaStatusAlert.message}</Alert>
              ) : null}
              {videoPreflightNote ? (
                <Alert severity="info">{videoPreflightNote}</Alert>
              ) : null}
              <Button component="label" variant="outlined">
                {videoFile ? "Заменить MP4-файл" : t("lessonEditor.uploadVideo")}
                <input
                  hidden
                  type="file"
                  accept="video/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setVideoFile(file);
                      setVideoUrl(undefined);
                      setVideoStreamUrl(undefined);
                      setMediaJobId(undefined);
                      setMediaJobStatus(undefined);
                      setMediaJobError(undefined);
                      setVideoPreflightNote(null);
                      if (saveError) setSaveError(null);
                      const objectUrl = URL.createObjectURL(file);
                      void getVideoDuration(objectUrl)
                        .then((value) => setDuration(value))
                        .finally(() => URL.revokeObjectURL(objectUrl));
                    }
                    e.target.value = "";
                  }}
                />
              </Button>
              {videoFile ? (
                <Chip
                  icon={<VideoLibraryIcon />}
                  label={videoFile.name}
                  onDelete={() => {
                    setVideoFile(null);
                    setDuration(0);
                    setMediaJobId(undefined);
                    setMediaJobStatus(undefined);
                    setMediaJobError(undefined);
                    setVideoPreflightNote(null);
                  }}
                  color="primary"
                />
              ) : null}
              <TextField
                label="Поток HLS / adaptive URL"
                value={videoStreamUrl ?? ""}
                onChange={(event) => {
                  setVideoStreamUrl(event.target.value || undefined);
                  setMediaJobId(undefined);
                  setMediaJobStatus(undefined);
                  setMediaJobError(undefined);
                  setVideoPreflightNote(null);
                  if (saveError) setSaveError(null);
                }}
                fullWidth
                placeholder="https://cdn.example.com/course/lesson/master.m3u8"
              />
              <TextField
                label="Резервный MP4 URL"
                value={videoUrl ?? ""}
                onChange={(event) => {
                  setVideoUrl(event.target.value || undefined);
                  setMediaJobId(undefined);
                  setMediaJobStatus(undefined);
                  setMediaJobError(undefined);
                  setVideoPreflightNote(null);
                  if (saveError) setSaveError(null);
                }}
                fullWidth
                disabled={Boolean(videoFile)}
                placeholder="https://cdn.example.com/course/lesson/fallback.mp4"
                helperText={
                  videoFile
                    ? "Резервный mp4 будет взят из загруженного файла."
                    : "Используется как fallback для браузеров без нативного HLS."
                }
              />
              <TextField
                label="Poster URL"
                value={videoPosterUrl ?? ""}
                onChange={(event) => {
                  setVideoPosterUrl(event.target.value || undefined);
                  setMediaJobError(undefined);
                }}
                fullWidth
                placeholder="https://cdn.example.com/course/lesson/poster.jpg"
                helperText="Постер показывается до запуска плеера и при ленивой инициализации."
              />
              {duration > 0 && (
                <Typography variant="caption" color="text.secondary">
                  {t("lessonEditor.durationMinutes", {
                    duration: formatLessonDuration(duration),
                  })}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary">
                HLS используется как основной поток. Если браузер не поддерживает его нативно,
                плеер переключится на mp4 fallback.
              </Typography>
            </Stack>

            <Stack spacing={1}>
              <Typography variant="subtitle2">
                {t("lessonEditor.materialsTitle")}
              </Typography>
              {materials.length > 0 && (
                <Box className="materials-grid">
                  {materials.map((m) => (
                    <Chip
                      key={m.id}
                      icon={
                        m.type === "pdf" ? (
                          <PictureAsPdfIcon />
                        ) : (
                          <DescriptionIcon />
                        )
                      }
                      label={m.name}
                      onDelete={() => handleRemoveMaterial(m.id)}
                      variant="outlined"
                    />
                  ))}
                </Box>
              )}

              <Button
                component="label"
                variant="outlined"
                startIcon={<UploadFileIcon />}
              >
                {t("lessonEditor.addPdfOrWord")}
                <input
                  ref={materialInputRef}
                  hidden
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleAddMaterial(file);
                    e.target.value = "";
                  }}
                />
              </Button>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={disablePrintableDownloads}
                    onChange={(event) =>
                      setDisablePrintableDownloads(event.target.checked)
                    }
                  />
                }
                label="Запретить скачивание печатных материалов"
              />
            </Stack>
          </Stack>
        </DialogContent>

        <DialogActions className="lesson-editor-dialog__actions">
          <Button onClick={onCancel} startIcon={<CloseRoundedIcon />}>
            <span className="lesson-editor-dialog__action-text">
              {t("common.cancel")}
            </span>
          </Button>
          <Button
            variant="contained"
            onClick={() => void handleSave()}
            disabled={isSaving}
            startIcon={<SaveRoundedIcon />}
          >
            <ButtonPending loading={isSaving} className="lesson-editor-dialog__action-text">
              {t("common.save")}
            </ButtonPending>
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={closeConfirmOpen}
        onClose={() => setCloseConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
        className="lesson-editor-dialog ui-dialog ui-dialog--compact"
      >
        <DialogTitleWithClose
          title="Есть несохранённые изменения"
          onClose={() => setCloseConfirmOpen(false)}
          closeAriaLabel={t("common.close")}
        />
        <DialogContent>
          <Typography color="text.secondary">
            Сохраните изменения перед закрытием урока, чтобы не потерять данные.
          </Typography>
        </DialogContent>
        <DialogActions className="lesson-editor-dialog__actions">
          <Button onClick={() => setCloseConfirmOpen(false)}>
            <span className="lesson-editor-dialog__action-text">Остаться</span>
          </Button>
          <Button
            color="inherit"
            onClick={() => {
              setCloseConfirmOpen(false);
              onCancel();
            }}
          >
            <span className="lesson-editor-dialog__action-text">Выйти без сохранения</span>
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              void handleSave();
              setCloseConfirmOpen(false);
            }}
            disabled={isSaving}
            startIcon={<SaveRoundedIcon />}
          >
            <ButtonPending loading={isSaving} className="lesson-editor-dialog__action-text">
              Сохранить
            </ButtonPending>
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===== WARNING DIALOG ===== */}
      <Dialog
        open={warningOpen}
        onClose={() => setWarningOpen(false)}
        maxWidth="xs"
        fullWidth
        className="lesson-editor-dialog ui-dialog ui-dialog--compact"
      >
        <DialogTitleWithClose
          title={t("lessonEditor.warningTitle")}
          onClose={() => setWarningOpen(false)}
          closeAriaLabel={t("common.close")}
        />
        <DialogContent>
          <Typography>{t("lessonEditor.warningVideoRequired")}</Typography>
        </DialogContent>
        <DialogActions className="lesson-editor-dialog__actions">
          <Button
            onClick={() => setWarningOpen(false)}
            startIcon={<CloseRoundedIcon />}
          >
            <span className="lesson-editor-dialog__action-text">
              {t("common.close")}
            </span>
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
