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
    materials: LessonMaterial[];
    settings?: {
      disablePrintableDownloads?: boolean;
    };
  };
  onSave: (lesson: LessonDraft) => void;
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
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("error", onError);
    video.src = src;
  });

const toComparableLessonSnapshot = (input: {
  title: string;
  videoFile: File | null;
  videoUrl?: string;
  duration: number;
  materials: EditableLessonMaterial[];
  disablePrintableDownloads: boolean;
}) => ({
  title: input.title.trim(),
  hasVideoFile: Boolean(input.videoFile),
  videoUrl: input.videoUrl ?? "",
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
          duration,
          materials,
          disablePrintableDownloads,
        })
      ) !== initialSnapshot,
    [initialSnapshot, title, videoFile, videoUrl, duration, materials, disablePrintableDownloads]
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
    if (!videoFile && !videoUrl) {
      setWarningOpen(true);
      setSaveError(t("lessonEditor.requiredVideoError"));
      return;
    }
    setSaveError(null);
    const saved = await saveGuard.run(
      async () => {
        let finalDuration = duration;
        if (finalDuration === 0) {
          try {
            if (videoFile) {
              const objectUrl = URL.createObjectURL(videoFile);
              finalDuration = await getVideoDuration(objectUrl);
              URL.revokeObjectURL(objectUrl);
            } else if (videoUrl) {
              finalDuration = await getVideoDuration(videoUrl);
            }
          } catch {
            finalDuration = duration;
          }
        }

        onSave({
          id: lessonId,
          title: title.trim(),
          duration: finalDuration,
          videoFile,
          videoUrl,
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
  };

  useEffect(() => {
    if (!videoUrl) return;
    let active = true;
    void getVideoDuration(videoUrl)
      .then((value) => {
        if (active) setDuration(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [videoUrl]);

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
              {videoFile ? (
                <Chip
                  icon={<VideoLibraryIcon />}
                  label={videoFile.name}
                  onDelete={() => {
                    setVideoFile(null);
                    setDuration(0);
                  }}
                  color="primary"
                />
              ) : videoUrl ? (
                <Chip
                  icon={<VideoLibraryIcon />}
                  label={t("lessonEditor.videoUploaded")}
                  onDelete={() => {
                    setVideoUrl(undefined);
                    setDuration(0);
                  }}
                  color="primary"
                  variant="outlined"
                />
              ) : (
                <Button component="label" variant="outlined">
                  {t("lessonEditor.uploadVideo")}
                  <input
                    hidden
                    type="file"
                    accept="video/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setVideoFile(file);
                        setVideoUrl(undefined);
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
