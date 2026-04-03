import {
  Dialog,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Stack,
  Typography,
  Box,
  Checkbox,
  FormControlLabel,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import DescriptionIcon from "@mui/icons-material/Description";
import PlayCircleFilledWhiteRoundedIcon from "@mui/icons-material/PlayCircleFilledWhiteRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
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
  getOwnedMediaDownloadUrl,
  preflightLessonVideo,
  type MediaJobStatus,
} from "@/shared/lib/mediaPipeline";

export type LessonMaterial = {
  id: string;
  name: string;
  type: "video" | "pdf" | "doc";
  mediaObjectId?: string;
  url?: string;
  file?: File;
};

export type EditableLessonMaterial = {
  id: string;
  name: string;
  type: "pdf" | "doc";
  mediaObjectId?: string;
  file?: File;
  url?: string;
};

export type LessonDraft = {
  id?: string;
  title: string;
  duration: number;
  videoFile: File | null;
  videoMediaObjectId?: string;
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
    videoMediaObjectId?: string;
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

type PreviewKind = "video" | "pdf" | "unsupported";

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
  videoMediaObjectId?: string;
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
  videoMediaObjectId: input.videoMediaObjectId ?? "",
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
    mediaObjectId: material.mediaObjectId ?? "",
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
        mediaObjectId: m.mediaObjectId,
        url: m.url,
      })) ?? [];

  const [title, setTitle] = useState(initialLesson?.title ?? "");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoMediaObjectId, setVideoMediaObjectId] = useState<string | undefined>(
    initialLesson?.videoMediaObjectId
  );
  const [videoUrl, setVideoUrl] = useState<string | undefined>(
    initialLesson?.videoUrl
  );
  const [videoStreamUrl, setVideoStreamUrl] = useState<string | undefined>(
    initialLesson?.videoStreamUrl
  );
  const [videoPosterUrl] = useState<string | undefined>(
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewKind, setPreviewKind] = useState<PreviewKind>("video");
  const [previewTitle, setPreviewTitle] = useState("Предпросмотр");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewExternalHref, setPreviewExternalHref] = useState<string | null>(null);
  const [previewSource, setPreviewSource] = useState<
    "local" | "media" | "external" | null
  >(null);
  const saveGuard = useActionGuard();
  const isSaving = saveGuard.pending;
  const lessonId = initialLesson?.id;

  const materialInputRef = useRef<HTMLInputElement | null>(null);
  const localPreviewUrlRef = useRef<string | null>(null);
  const [initialSnapshot] = useState(() =>
    JSON.stringify(
      toComparableLessonSnapshot({
        title: initialLesson?.title ?? "",
        videoFile: null,
        videoMediaObjectId: initialLesson?.videoMediaObjectId,
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
          videoMediaObjectId,
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
      videoMediaObjectId,
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

  const resetLocalPreview = () => {
    if (localPreviewUrlRef.current) {
      URL.revokeObjectURL(localPreviewUrlRef.current);
      localPreviewUrlRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      resetLocalPreview();
    };
  }, []);

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewKind("video");
    setPreviewTitle("Предпросмотр");
    setPreviewError(null);
    setPreviewUrl(null);
    setPreviewExternalHref(null);
    setPreviewSource(null);
    resetLocalPreview();
  };

  const resolvePreviewSourceLabel = () => {
    if (!previewSource) return null;
    if (previewSource === "local") {
      return "Источник: локальный файл до сохранения.";
    }
    if (previewSource === "media") {
      return "Источник: backend-safe media runtime доступ.";
    }
    return "Источник: внешний URL.";
  };

  const resolveMaterialStatus = (material: EditableLessonMaterial) => {
    if (material.file) return "Готов к загрузке";
    if (material.mediaObjectId) return "Готово";
    if (material.url) return "Внешний источник";
    return "Требуется файл";
  };

  const canPreviewMaterial = (material: EditableLessonMaterial) =>
    Boolean(material.file || material.mediaObjectId || material.url);

  const handleOpenVideoPreview = async () => {
    setPreviewOpen(true);
    setPreviewKind("video");
    setPreviewTitle("Предпросмотр видео");
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewUrl(null);
    setPreviewExternalHref(null);
    setPreviewSource(null);
    resetLocalPreview();
    try {
      if (videoFile) {
        const localUrl = URL.createObjectURL(videoFile);
        localPreviewUrlRef.current = localUrl;
        setPreviewUrl(localUrl);
        setPreviewExternalHref(localUrl);
        setPreviewSource("local");
        return;
      }
      if (videoMediaObjectId?.trim()) {
        const access = await getOwnedMediaDownloadUrl(videoMediaObjectId);
        setPreviewUrl(access.downloadUrl);
        setPreviewExternalHref(access.downloadUrl);
        setPreviewSource("media");
        return;
      }
      const externalSource = videoStreamUrl?.trim() || videoUrl?.trim();
      if (externalSource) {
        setPreviewUrl(externalSource);
        setPreviewExternalHref(externalSource);
        setPreviewSource("external");
        return;
      }
      setPreviewError("Видео еще не прикреплено. Загрузите файл, чтобы открыть предпросмотр.");
    } catch {
      setPreviewError(
        "Не удалось открыть предпросмотр видео. Попробуйте еще раз."
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleOpenMaterialPreview = async (material: EditableLessonMaterial) => {
    const isPdf = material.type === "pdf";
    setPreviewOpen(true);
    setPreviewKind(isPdf ? "pdf" : "unsupported");
    setPreviewTitle(`Материал: ${material.name}`);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewUrl(null);
    setPreviewExternalHref(null);
    setPreviewSource(null);
    resetLocalPreview();

    try {
      if (material.file) {
        const localUrl = URL.createObjectURL(material.file);
        localPreviewUrlRef.current = localUrl;
        setPreviewUrl(localUrl);
        setPreviewExternalHref(localUrl);
        setPreviewSource("local");
        return;
      }

      if (material.mediaObjectId?.trim()) {
        const access = await getOwnedMediaDownloadUrl(material.mediaObjectId);
        setPreviewUrl(access.downloadUrl);
        setPreviewExternalHref(access.downloadUrl);
        setPreviewSource("media");
        return;
      }

      if (material.url?.trim()) {
        setPreviewUrl(material.url);
        setPreviewExternalHref(material.url);
        setPreviewSource("external");
        return;
      }

      setPreviewError("Файл материала еще не прикреплен. Добавьте файл и сохраните урок.");
    } catch {
      setPreviewError(
        "Не удалось открыть предпросмотр материала. Попробуйте еще раз."
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSave = async () => {
    if (title.trim().length === 0) {
      setSaveError(t("lessonEditor.requiredTitleError"));
      return;
    }
    if (!videoFile && !videoMediaObjectId && !videoUrl && !videoStreamUrl) {
      setWarningOpen(true);
      setSaveError(t("lessonEditor.requiredVideoError"));
      return;
    }
    const preflight = preflightLessonVideo({
      lessonTitle: title.trim(),
      videoFile,
      videoMediaObjectId,
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
            videoMediaObjectId,
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
          "Не удалось подготовить видео. Попробуйте загрузить файл еще раз.",
      };
    }
    return null;
  }, [mediaJobError, mediaJobStatus]);

  const hasVideoAttached = Boolean(
    videoFile || videoMediaObjectId || videoStreamUrl || videoUrl
  );

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
              {hasVideoAttached ? (
                <Box className="lesson-editor__video-card">
                  <Tooltip title="Удалить видео">
                    <IconButton
                      size="small"
                      className="lesson-editor__video-card-remove"
                      onClick={() => {
                        setVideoFile(null);
                        setVideoMediaObjectId(undefined);
                        setVideoUrl(undefined);
                        setVideoStreamUrl(undefined);
                        setDuration(0);
                        setMediaJobId(undefined);
                        setMediaJobStatus(undefined);
                        setMediaJobError(undefined);
                        setVideoPreflightNote(null);
                      }}
                      aria-label="Удалить видео"
                    >
                      <DeleteOutlineRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <button
                    type="button"
                    className="lesson-editor__video-card-preview"
                    onClick={() => void handleOpenVideoPreview()}
                  >
                    <Box
                      className="lesson-editor__video-card-stage"
                      sx={
                        videoPosterUrl
                          ? {
                              backgroundImage: `url(${videoPosterUrl})`,
                              backgroundSize: "cover",
                              backgroundPosition: "center",
                            }
                          : undefined
                      }
                    >
                      <PlayCircleFilledWhiteRoundedIcon className="lesson-editor__video-card-play" />
                    </Box>
                    <Stack spacing={0.25} className="lesson-editor__video-card-meta">
                      <Typography variant="subtitle2" noWrap>
                        {videoFile?.name ??
                          (videoMediaObjectId
                            ? "Видео прикреплено"
                            : "Видео из внешнего источника")}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Нажмите, чтобы проверить предпросмотр.
                      </Typography>
                    </Stack>
                  </button>
                </Box>
              ) : (
                <Button component="label" variant="outlined" startIcon={<UploadFileIcon />}>
                  {t("lessonEditor.uploadVideo")}
                  <input
                    hidden
                    type="file"
                    accept="video/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setVideoFile(file);
                        setVideoMediaObjectId(undefined);
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
              )}
              {duration > 0 && (
                <Typography variant="caption" color="text.secondary">
                  {t("lessonEditor.durationMinutes", {
                    duration: formatLessonDuration(duration),
                  })}
                </Typography>
              )}
            </Stack>

            <Stack spacing={1}>
              <Typography variant="subtitle2">
                {t("lessonEditor.materialsTitle")}
              </Typography>
              {materials.length > 0 && (
                <Box className="lesson-editor__materials-grid">
                  {materials.map((m) => (
                    <Box key={m.id} className="lesson-editor__material-card">
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="flex-start"
                        spacing={1}
                      >
                        <Stack direction="row" spacing={1} alignItems="center" minWidth={0}>
                          {m.type === "pdf" ? (
                            <PictureAsPdfIcon fontSize="small" color="error" />
                          ) : (
                            <DescriptionIcon fontSize="small" />
                          )}
                          <Typography variant="subtitle2" noWrap>
                            {m.name}
                          </Typography>
                        </Stack>
                        <Tooltip title="Удалить файл">
                          <IconButton
                            size="small"
                            onClick={() => handleRemoveMaterial(m.id)}
                            aria-label="Удалить материал"
                          >
                            <DeleteOutlineRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {resolveMaterialStatus(m)}
                      </Typography>
                      <Button
                        variant="text"
                        size="small"
                        onClick={() => void handleOpenMaterialPreview(m)}
                        disabled={!canPreviewMaterial(m)}
                      >
                        {m.type === "pdf" ? "Открыть предпросмотр" : "Открыть файл"}
                      </Button>
                    </Box>
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
        open={previewOpen}
        onClose={closePreview}
        maxWidth="md"
        fullWidth
        className="lesson-editor-dialog lesson-editor-dialog--preview ui-dialog ui-dialog--wide"
      >
        <DialogTitleWithClose
          title={previewTitle}
          onClose={closePreview}
          closeAriaLabel={t("common.close")}
        />
        <DialogContent className="lesson-editor__preview-content">
          <Stack spacing={2}>
            <Box className="lesson-editor__preview-stage">
              {previewLoading ? (
                <Stack direction="row" spacing={1} alignItems="center">
                  <CircularProgress size={20} />
                  <Typography>Подготавливаем предпросмотр...</Typography>
                </Stack>
              ) : null}
              {previewError ? <Alert severity="warning">{previewError}</Alert> : null}
              {!previewLoading && !previewError && previewKind === "video" && previewUrl ? (
                <video
                  key={previewUrl}
                  controls
                  preload="metadata"
                  className="lesson-editor__preview-video"
                  src={previewUrl}
                />
              ) : null}
              {!previewLoading && !previewError && previewKind === "pdf" && previewUrl ? (
                <iframe
                  key={previewUrl}
                  className="lesson-editor__preview-iframe"
                  src={previewUrl}
                  title={previewTitle}
                />
              ) : null}
              {!previewLoading &&
              !previewError &&
              previewKind === "unsupported" ? (
                <Stack spacing={1.5} alignItems="flex-start">
                  <Alert severity="info">
                    Для этого типа файла встроенный просмотр недоступен. Откройте файл в новой вкладке.
                  </Alert>
                  {previewExternalHref ? (
                    <Button
                      variant="outlined"
                      href={previewExternalHref}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Открыть файл
                    </Button>
                  ) : null}
                </Stack>
              ) : null}
            </Box>
            {resolvePreviewSourceLabel() ? (
              <Typography variant="caption" color="text.secondary">
                {resolvePreviewSourceLabel()}
              </Typography>
            ) : null}
          </Stack>
        </DialogContent>
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
