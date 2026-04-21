import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  IconButton,
  InputAdornment,
  Skeleton,
  TextField,
  Tooltip,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ImageRoundedIcon from "@mui/icons-material/ImageRounded";
import VideocamRoundedIcon from "@mui/icons-material/VideocamRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import type { User } from "@/entities/user/model/types";
import {
  createNewsPost,
  deleteNewsPost,
  getNewsFeed,
  NEWS_FEED_UPDATED_STORAGE_KEY,
  updateNewsPost,
} from "@/entities/news/model/storage";
import type {
  NewsAttachment,
  NewsAttachmentKind,
  NewsPost,
  NewsTone,
} from "@/entities/news/model/types";
import { cn } from "@/shared/lib/cn";
import { ListPagination } from "@/shared/ui/ListPagination";
import { subscribeAppDataUpdates } from "@/shared/lib/subscribeAppDataUpdates";
import { DialogTitleWithClose } from "@/shared/ui/DialogTitleWithClose";
import { useNavigate } from "react-router-dom";
import {
  getOwnedMediaDownloadUrl,
  uploadNewsAttachmentFile,
} from "@/shared/lib/mediaPipeline";

type Props = {
  user: User;
};

type NewsDraft = {
  title: string;
  content: string;
  tone: NewsTone;
  highlighted: boolean;
  attachments: NewsAttachment[];
  externalUrl: string;
};

type NewsAttachmentPreview = {
  kind: NewsAttachmentKind;
  url: string;
  title: string;
};

const toneLabels: Record<NewsTone, string> = {
  general: "Общее",
  exam: "Экзамены",
  achievement: "Достижения",
  important: "Важно",
  course_update: "Новые материалы",
};

const toneOptions: NewsTone[] = [
  "general",
  "exam",
  "achievement",
  "important",
  "course_update",
];

const emptyDraft: NewsDraft = {
  title: "",
  content: "",
  tone: "general",
  highlighted: true,
  attachments: [],
  externalUrl: "",
};

const NEWS_ATTACHMENT_MAX_BYTES = 80 * 1024 * 1024;

const buildAttachmentId = () =>
  `news_attachment_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;

const normalizeNewsAttachments = (
  attachments: NewsAttachment[] | undefined,
  fallbackImageUrl?: string
): NewsAttachment[] => {
  const normalized = Array.isArray(attachments)
    ? attachments.filter((attachment) => {
        if (!attachment || typeof attachment !== "object") return false;
        const hasMediaId = Boolean(attachment.mediaObjectId?.trim());
        const hasUrl = Boolean(
          (attachment.accessUrl || attachment.url)?.trim()
        );
        return hasMediaId || hasUrl;
      })
    : [];
  if (normalized.length > 0) {
    return normalized.map((attachment) => ({
      ...attachment,
      accessUrl: attachment.accessUrl || attachment.url,
    }));
  }
  const legacyImage = fallbackImageUrl?.trim();
  if (!legacyImage) return [];
  return [
    {
      id: buildAttachmentId(),
      kind: "image",
      url: legacyImage,
      accessUrl: legacyImage,
      downloadable: false,
    },
  ];
};

const buildNewsPayloadAttachments = (
  attachments: NewsAttachment[] | undefined
): NewsAttachment[] => {
  if (!Array.isArray(attachments)) return [];
  return attachments.map((attachment) => ({
    id: attachment.id || buildAttachmentId(),
    kind: attachment.kind,
    mediaObjectId: attachment.mediaObjectId,
    url: attachment.url,
    downloadable: attachment.downloadable ?? true,
    fileName: attachment.fileName,
    contentType: attachment.contentType,
  }));
};

const normalizeExternalUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

export function NewsFeedPanel({ user }: Props) {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isTeacher = user.role === "teacher";
  const createAttachmentInputRef = useRef<HTMLInputElement>(null);
  const editAttachmentInputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedLoadError, setFeedLoadError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [uploadingScope, setUploadingScope] = useState<"create" | "edit" | null>(
    null
  );
  const [previewAttachment, setPreviewAttachment] =
    useState<NewsAttachmentPreview | null>(null);
  const [page, setPage] = useState(1);

  const [draft, setDraft] = useState<NewsDraft>(emptyDraft);
  const [editDraft, setEditDraft] = useState<NewsDraft | null>(null);
  const pageSize = isMobile ? 1 : 2;

  const closeCreateModal = () => {
    if (saving || uploadingScope === "create") return;
    setCreateOpen(false);
  };

  const loadFeed = async () => {
    try {
      setFeedLoadError(null);
      setLoading(true);
      const data = await getNewsFeed();
      setItems(data);
    } catch {
      setFeedLoadError("Не удалось загрузить новости.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFeed();
    const unsubscribe = subscribeAppDataUpdates(
      () => {
        void loadFeed();
      },
      {
        includeAppEvent: false,
        storageKeys: [NEWS_FEED_UPDATED_STORAGE_KEY],
      }
    );
    return () => {
      unsubscribe();
    };
  }, []);

  const canSubmit =
    draft.title.trim().length > 0 &&
    draft.content.trim().length > 0 &&
    !saving &&
    uploadingScope !== "create";

  const canUpdate =
    !!editDraft &&
    editDraft.title.trim().length > 0 &&
    editDraft.content.trim().length > 0 &&
    !updatingId &&
    uploadingScope !== "edit";

  const composerToneOptions = useMemo(
    () =>
      isTeacher
        ? toneOptions.filter((tone) => tone !== "course_update")
        : toneOptions,
    [isTeacher]
  );

  const formatDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const resetDraft = () => {
    setDraft(emptyDraft);
  };

  const resetEditor = () => {
    if (uploadingScope === "edit") return;
    setEditingId(null);
    setEditDraft(null);
  };

  const removeDraftAttachment = (attachmentId: string) => {
    setDraft((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((item) => item.id !== attachmentId),
    }));
  };

  const removeEditAttachment = (attachmentId: string) => {
    setEditDraft((prev) =>
      prev
        ? {
            ...prev,
            attachments: prev.attachments.filter((item) => item.id !== attachmentId),
          }
        : prev
    );
  };

  const openAttachmentPreview = (attachment: NewsAttachment) => {
    const url = (attachment.accessUrl || attachment.url || "").trim();
    if (!url) return;
    setPreviewAttachment({
      kind: attachment.kind,
      url,
      title: attachment.fileName || "Вложение",
    });
  };

  const uploadAttachmentToScope = async (
    file: File,
    scope: "create" | "edit"
  ) => {
    const mime = file.type.toLowerCase();
    const isImage = mime.startsWith("image/");
    const isVideo = mime.startsWith("video/");
    if (!isImage && !isVideo) {
      setError("Можно загрузить только изображение или видео.");
      return;
    }
    if (file.size > NEWS_ATTACHMENT_MAX_BYTES) {
      setError("Файл слишком большой. Используйте вложение до 80 МБ.");
      return;
    }

    try {
      setUploadingScope(scope);
      setError(null);
      const objectId = await uploadNewsAttachmentFile(file);
      const access = await getOwnedMediaDownloadUrl(objectId);
      const nextAttachment: NewsAttachment = {
        id: buildAttachmentId(),
        kind: isVideo ? "video" : "image",
        mediaObjectId: objectId,
        downloadable: true,
        fileName: file.name,
        contentType: file.type || undefined,
        accessUrl: access.downloadUrl,
      };
      if (scope === "create") {
        setDraft((prev) => ({
          ...prev,
          attachments: [...prev.attachments, nextAttachment],
        }));
      } else {
        setEditDraft((prev) =>
          prev
            ? {
                ...prev,
                attachments: [...prev.attachments, nextAttachment],
              }
            : prev
        );
      }
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Не удалось загрузить вложение."
      );
    } finally {
      setUploadingScope(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const pagedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      setSaving(true);
      setError(null);
      await createNewsPost({
        authorId: user.id,
        title: draft.title.trim(),
        content: draft.content.trim(),
        tone: draft.tone,
        highlighted: true,
        attachments: buildNewsPayloadAttachments(draft.attachments),
        externalUrl: normalizeExternalUrl(draft.externalUrl) || undefined,
      });
      resetDraft();
      setCreateOpen(false);
      setPage(1);
      await loadFeed();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Не удалось опубликовать новость."
      );
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: NewsPost) => {
    setCreateOpen(false);
    setEditingId(item.id);
    setEditDraft({
      title: item.title,
      content: item.content,
      tone: item.tone,
      highlighted: true,
      attachments: normalizeNewsAttachments(item.attachments, item.imageUrl),
      externalUrl: item.externalUrl ?? "",
    });
  };

  const handleUpdate = async () => {
    if (!editingId || !editDraft || !canUpdate) return;
    try {
      setUpdatingId(editingId);
      setError(null);
      await updateNewsPost(
        editingId,
        {
          title: editDraft.title.trim(),
          content: editDraft.content.trim(),
          tone: editDraft.tone,
          highlighted: true,
          attachments: buildNewsPayloadAttachments(editDraft.attachments),
          externalUrl: normalizeExternalUrl(editDraft.externalUrl),
        },
        user.id
      );
      resetEditor();
      await loadFeed();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Не удалось сохранить изменения новости."
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isTeacher) return;
    try {
      setDeletingId(id);
      setError(null);
      await deleteNewsPost(id, user.id);
      if (editingId === id) {
        resetEditor();
      }
      await loadFeed();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Не удалось удалить новость."
      );
    } finally {
      setDeletingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    await handleDelete(deleteConfirmId);
    setDeleteConfirmId(null);
  };

  const handleCourseUpdateOpen = (courseId: string) => {
    navigate(`/courses/${courseId}`, {
      state: { from: "/student/profile?tab=study" },
    });
  };

  return (
    <section
      className={cn("news-feed", {
        "news-feed--teacher": isTeacher,
        "news-feed--student": !isTeacher,
      })}
    >
      <div className="news-feed__header">
        <span className="news-feed__wall-badge">Новости</span>
        {isTeacher && (
          <Button
            className={cn("news-feed__add", {
              "news-feed__add--compact": isMobile,
            })}
            variant={isMobile ? "outlined" : "contained"}
            startIcon={<AddRoundedIcon fontSize="small" />}
            onClick={() => {
              setCreateOpen(true);
              resetEditor();
            }}
            aria-label="Создать новость"
          >
            {isMobile ? "Создать" : "Создать объявление"}
          </Button>
        )}
      </div>

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <div className="news-feed__list">
        {loading ? (
          <>
            {Array.from({ length: pageSize }).map((_, index) => (
              <Skeleton
                key={`news-skeleton-${index}`}
                variant="rounded"
                height={140}
              />
            ))}
          </>
        ) : feedLoadError && items.length === 0 ? (
          <div className="news-feed__empty news-feed__empty--error" role="status">
            <div className="news-feed__empty-title">{feedLoadError}</div>
            <div className="news-feed__empty-caption">
              Проверьте соединение и попробуйте снова.
            </div>
            <Button
              variant="outlined"
              size="small"
              onClick={() => {
                void loadFeed();
              }}
            >
              Повторить
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="news-feed__empty news-feed__empty--plain">
            <div className="news-feed__empty-title">Пока нет объявлений.</div>
            <div className="news-feed__empty-caption">
              Здесь будут новые объявления преподавателя.
            </div>
          </div>
        ) : (
          pagedItems.map((item) => {
            const isEditing = editingId === item.id;
            return (
              <article
                key={item.id}
                className={cn("news-feed__item", `news-feed__item--${item.tone}`, {
                  "is-highlighted": item.highlighted,
                  "news-feed__item--course-update-premium":
                    !isTeacher && item.tone === "course_update",
                })}
              >
                <div className="news-feed__item-head">
                  {isEditing ? (
                    <div className="news-feed__item-edit-head">
                      <h3>Редактирование объявления</h3>
                      <div className="news-feed__meta">
                        <span>Изменения применятся после сохранения</span>
                        <span>{formatDate(item.createdAt)}</span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <h3>{item.title}</h3>
                      <div className="news-feed__meta">
                        <span>{item.authorName}</span>
                        <span>{formatDate(item.createdAt)}</span>
                        <span>{toneLabels[item.tone]}</span>
                      </div>
                    </div>
                  )}
                  {isTeacher && (
                    <div className="news-feed__item-actions">
                      {!isEditing ? (
                        <>
                          <Tooltip title="Редактировать">
                            <IconButton
                              className="news-feed__edit"
                              onClick={() => startEdit(item)}
                              aria-label="Редактировать новость"
                            >
                              <EditRoundedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Удалить">
                            <span>
                              <IconButton
                                className="news-feed__delete"
                                onClick={() => setDeleteConfirmId(item.id)}
                                aria-label="Удалить новость"
                                disabled={deletingId === item.id}
                              >
                                {deletingId === item.id ? (
                                  <CircularProgress size={16} />
                                ) : (
                                  <DeleteOutlineRoundedIcon fontSize="small" />
                                )}
                              </IconButton>
                            </span>
                          </Tooltip>
                        </>
                      ) : (
                        <>
                          <Tooltip title="Сохранить">
                            <span>
                              <IconButton
                                className="news-feed__save"
                                onClick={() => void handleUpdate()}
                                aria-label="Сохранить новость"
                                disabled={!canUpdate}
                              >
                                {updatingId === item.id ? (
                                  <CircularProgress size={16} />
                                ) : (
                                  <SaveRoundedIcon fontSize="small" />
                                )}
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Отменить">
                            <IconButton
                              className="news-feed__cancel"
                              onClick={resetEditor}
                              aria-label="Отменить редактирование"
                            >
                              <CloseRoundedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {isEditing && editDraft ? (
                  <div className="news-feed__editor">
                    <TextField
                      placeholder="Введите заголовок"
                      value={editDraft.title}
                      onChange={(e) =>
                        setEditDraft((prev) =>
                          prev ? { ...prev, title: e.target.value } : prev
                        )
                      }
                      required
                      size="small"
                      fullWidth
                      inputProps={{
                        "aria-label": "Заголовок новости",
                      }}
                    />
                    <TextField
                      className="news-feed__compose-textarea"
                      placeholder="Опишите обновление для студентов"
                      value={editDraft.content}
                      onChange={(e) =>
                        setEditDraft((prev) =>
                          prev ? { ...prev, content: e.target.value } : prev
                        )
                      }
                      multiline
                      minRows={4}
                      maxRows={8}
                      required
                      fullWidth
                      inputProps={{
                        "aria-label": "Текст новости",
                      }}
                    />
                    <TextField
                      className="news-feed__compose-link"
                      placeholder="https://..."
                      value={editDraft.externalUrl}
                      onChange={(e) =>
                        setEditDraft((prev) =>
                          prev ? { ...prev, externalUrl: e.target.value } : prev
                        )
                      }
                      fullWidth
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <LinkRoundedIcon fontSize="small" />
                          </InputAdornment>
                        ),
                      }}
                    />
                    <div className="news-feed__tone-row">
                      <div className="news-feed__tone-list">
                        {composerToneOptions.map((tone) => (
                          <button
                            key={`${item.id}-${tone}`}
                            type="button"
                            className={cn(
                              "news-feed__tone",
                              `news-feed__tone--${tone}`,
                              {
                                "is-active": editDraft.tone === tone,
                              }
                            )}
                            onClick={() =>
                              setEditDraft((prev) =>
                                prev ? { ...prev, tone } : prev
                              )
                            }
                          >
                            {toneLabels[tone]}
                          </button>
                        ))}
                      </div>
                      <div className="news-feed__media-actions">
                        <Tooltip title="Добавить изображение или видео">
                          <IconButton
                            className="news-feed__media-icon"
                            onClick={() => editAttachmentInputRef.current?.click()}
                            aria-label="Добавить вложение"
                            disabled={uploadingScope === "edit"}
                          >
                            <ImageRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Добавить видео">
                          <IconButton
                            className="news-feed__media-icon"
                            onClick={() => editAttachmentInputRef.current?.click()}
                            aria-label="Добавить видео"
                            disabled={uploadingScope === "edit"}
                          >
                            <VideocamRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <input
                          hidden
                          ref={editAttachmentInputRef}
                          type="file"
                          accept="image/*,video/*"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            await uploadAttachmentToScope(file, "edit");
                            e.target.value = "";
                          }}
                        />
                        {editDraft.attachments.length > 0 && (
                          <Tooltip title="Убрать изображение">
                            <IconButton
                              className="news-feed__media-icon news-feed__media-icon--clear"
                              onClick={() =>
                                setEditDraft((prev) =>
                                  prev ? { ...prev, attachments: [] } : prev
                                )
                              }
                              aria-label="Убрать вложения"
                              disabled={uploadingScope === "edit"}
                            >
                              <CloseRoundedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                    {uploadingScope === "edit" && (
                      <div className="news-feed__uploading">
                        <CircularProgress size={16} />
                        <span>Загружаем вложение…</span>
                      </div>
                    )}
                    {editDraft.attachments.length > 0 && (
                      <div className="news-feed__attachments-grid">
                        {editDraft.attachments.map((attachment) => {
                          const previewUrl = (
                            attachment.accessUrl ||
                            attachment.url ||
                            ""
                          ).trim();
                          return (
                            <article
                              key={attachment.id}
                              className="news-feed__attachment-card news-feed__attachment-card--editable"
                            >
                              <button
                                type="button"
                                className={cn(
                                  "news-feed__attachment-preview",
                                  `news-feed__attachment-preview--${attachment.kind}`
                                )}
                                onClick={() => openAttachmentPreview(attachment)}
                                disabled={!previewUrl}
                              >
                                {attachment.kind === "video" ? (
                                  <video src={previewUrl} muted playsInline preload="metadata" />
                                ) : (
                                  <img
                                    src={previewUrl}
                                    alt={attachment.fileName || "Изображение новости"}
                                  />
                                )}
                              </button>
                              <IconButton
                                className="news-feed__attachment-remove"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  removeEditAttachment(attachment.id);
                                }}
                                aria-label="Удалить вложение"
                              >
                                <CloseRoundedIcon fontSize="small" />
                              </IconButton>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <p>{item.content}</p>
                    {!isTeacher &&
                    item.tone === "course_update" &&
                    item.targetCourseId ? (
                      <button
                        type="button"
                        className="news-feed__course-jump"
                        onClick={() =>
                          handleCourseUpdateOpen(item.targetCourseId as string)
                        }
                      >
                        Перейти к новым материалам
                      </button>
                    ) : null}
                    {item.externalUrl && (
                      <a
                        href={normalizeExternalUrl(item.externalUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="news-feed__item-link"
                      >
                        <LinkRoundedIcon fontSize="small" />
                        <span>{item.externalUrl}</span>
                        <OpenInNewRoundedIcon fontSize="small" />
                      </a>
                    )}
                    {normalizeNewsAttachments(item.attachments, item.imageUrl).length >
                      0 && (
                      <div className="news-feed__attachments-grid">
                        {normalizeNewsAttachments(item.attachments, item.imageUrl).map(
                          (attachment) => {
                            const previewUrl = (
                              attachment.accessUrl ||
                              attachment.url ||
                              ""
                            ).trim();
                            return (
                              <article
                                key={attachment.id}
                                className="news-feed__attachment-card"
                              >
                                <button
                                  type="button"
                                  className={cn(
                                    "news-feed__attachment-preview",
                                    `news-feed__attachment-preview--${attachment.kind}`
                                  )}
                                  onClick={() => openAttachmentPreview(attachment)}
                                  disabled={!previewUrl}
                                >
                                  {attachment.kind === "video" ? (
                                    <video
                                      src={previewUrl}
                                      muted
                                      playsInline
                                      preload="metadata"
                                    />
                                  ) : (
                                    <img
                                      src={previewUrl}
                                      alt={attachment.fileName || item.title}
                                    />
                                  )}
                                </button>
                              </article>
                            );
                          }
                        )}
                      </div>
                    )}
                  </>
                )}
              </article>
            );
          })
        )}
      </div>

      {!loading && items.length > pageSize && (
        <ListPagination
          page={safePage}
          totalItems={items.length}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      )}

      {isTeacher && (
        <Dialog
          open={createOpen}
          onClose={closeCreateModal}
          fullWidth
          maxWidth="xs"
          className="news-feed__create-dialog"
        >
          <DialogTitleWithClose
            title="Создать объявление"
            onClose={closeCreateModal}
          />
          <DialogContent className="news-feed__create-content">
            <div className="news-feed__compose-fields">
                <TextField
                placeholder="Введите заголовок"
                value={draft.title}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, title: e.target.value }))
                }
                required
                size="small"
                fullWidth
                inputProps={{
                  "aria-label": "Заголовок новости",
                }}
                InputProps={{
                  endAdornment: draft.title ? (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() =>
                          setDraft((prev) => ({ ...prev, title: "" }))
                        }
                        aria-label="Очистить заголовок"
                      >
                        <CloseRoundedIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ) : null,
                }}
              />

              <TextField
                className="news-feed__compose-textarea"
                placeholder="Опишите обновление для студентов"
                value={draft.content}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, content: e.target.value }))
                }
                multiline
                minRows={4}
                maxRows={8}
                required
                fullWidth
                inputProps={{
                  "aria-label": "Текст новости",
                }}
              />

              <TextField
                className="news-feed__compose-link"
                placeholder="https://..."
                value={draft.externalUrl}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, externalUrl: e.target.value }))
                }
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LinkRoundedIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />
            </div>

            <div className="news-feed__tone-row news-feed__tone-row--create">
              <div className="news-feed__tone-list news-feed__tone-list--create">
                {composerToneOptions.map((tone) => (
                  <button
                    key={tone}
                    type="button"
                    className={cn("news-feed__tone", `news-feed__tone--${tone}`, {
                      "is-active": draft.tone === tone,
                    })}
                    onClick={() => setDraft((prev) => ({ ...prev, tone }))}
                  >
                    {toneLabels[tone]}
                  </button>
                ))}
              </div>
              <div className="news-feed__media-actions">
                <Tooltip title="Добавить изображение или видео">
                  <IconButton
                    className="news-feed__media-icon"
                    onClick={() => createAttachmentInputRef.current?.click()}
                    aria-label="Добавить вложение"
                    disabled={uploadingScope === "create"}
                  >
                    <ImageRoundedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Добавить видео">
                  <IconButton
                    className="news-feed__media-icon"
                    onClick={() => createAttachmentInputRef.current?.click()}
                    aria-label="Добавить видео"
                    disabled={uploadingScope === "create"}
                  >
                    <VideocamRoundedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <input
                  hidden
                  ref={createAttachmentInputRef}
                  type="file"
                  accept="image/*,video/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    await uploadAttachmentToScope(file, "create");
                    e.target.value = "";
                  }}
                />
                {draft.attachments.length > 0 && (
                  <Tooltip title="Убрать вложения">
                    <IconButton
                      className="news-feed__media-icon news-feed__media-icon--clear"
                      onClick={() => setDraft((prev) => ({ ...prev, attachments: [] }))}
                      aria-label="Убрать вложения"
                      disabled={uploadingScope === "create"}
                    >
                      <CloseRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </div>
            </div>

            {uploadingScope === "create" && (
              <div className="news-feed__uploading">
                <CircularProgress size={16} />
                <span>Загружаем вложение…</span>
              </div>
            )}

            {draft.attachments.length > 0 && (
              <div className="news-feed__attachments-grid news-feed__attachments-grid--create">
                {draft.attachments.map((attachment) => {
                  const previewUrl = (
                    attachment.accessUrl ||
                    attachment.url ||
                    ""
                  ).trim();
                  return (
                    <article
                      key={attachment.id}
                      className="news-feed__attachment-card news-feed__attachment-card--editable"
                    >
                      <button
                        type="button"
                        className={cn(
                          "news-feed__attachment-preview",
                          `news-feed__attachment-preview--${attachment.kind}`
                        )}
                        onClick={() => openAttachmentPreview(attachment)}
                        disabled={!previewUrl}
                      >
                        {attachment.kind === "video" ? (
                          <video src={previewUrl} muted playsInline preload="metadata" />
                        ) : (
                          <img src={previewUrl} alt={attachment.fileName || "Превью новости"} />
                        )}
                      </button>
                      <IconButton
                        className="news-feed__attachment-remove"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeDraftAttachment(attachment.id);
                        }}
                        aria-label="Удалить вложение"
                      >
                        <CloseRoundedIcon fontSize="small" />
                      </IconButton>
                    </article>
                  );
                })}
              </div>
            )}
          </DialogContent>
          <DialogActions className="news-feed__create-actions">
            <Button
              variant="text"
              onClick={closeCreateModal}
              disabled={saving}
            >
              Отмена
            </Button>
            <Button
              variant="contained"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
            >
              {saving ? (
                <CircularProgress size={18} color="inherit" />
              ) : (
                "Опубликовать"
              )}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      <Dialog
        open={Boolean(deleteConfirmId)}
        onClose={() => {
          if (deletingId) return;
          setDeleteConfirmId(null);
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitleWithClose
          title="Удалить новость?"
          onClose={() => {
            if (deletingId) return;
            setDeleteConfirmId(null);
          }}
        />
        <DialogContent>Новость исчезнет из ленты у всех пользователей.</DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            onClick={() => setDeleteConfirmId(null)}
            disabled={Boolean(deletingId)}
          >
            Отмена
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => void confirmDelete()}
            disabled={Boolean(deletingId)}
          >
            {deletingId ? "Удаляем..." : "Удалить"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(previewAttachment)}
        onClose={() => setPreviewAttachment(null)}
        fullWidth
        maxWidth="md"
        className="news-feed__preview-dialog"
      >
        <DialogTitleWithClose
          title=""
          onClose={() => setPreviewAttachment(null)}
        />
        <DialogContent className="news-feed__preview-content">
          {previewAttachment?.kind === "video" ? (
            <video
              controls
              playsInline
              preload="metadata"
              src={previewAttachment.url}
              className="news-feed__preview-media"
            />
          ) : previewAttachment ? (
            <img
              src={previewAttachment.url}
              alt={previewAttachment.title}
              className="news-feed__preview-media"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
