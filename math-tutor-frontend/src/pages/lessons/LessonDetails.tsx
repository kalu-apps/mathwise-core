import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Button,
  CircularProgress,
  Container,
  Dialog,
  IconButton,
} from "@mui/material";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import DescriptionIcon from "@mui/icons-material/Description";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";

import { useAuth } from "@/features/auth/model/AuthContext";
import { VideoPlayer } from "@/entities/lesson/ui/VideoPlayer";
import { getViewedLessonIds, markLessonViewed } from "@/entities/progress/model/storage";
import { getPurchases } from "@/entities/purchase/model/storage";
import { getOpenedLessonIds, markLessonOpened } from "@/entities/purchase/model/openedLessons";
import { selectCourseAccessState, selectPurchaseFinancialView } from "@/entities/purchase/model/selectors";
import { formatLessonDuration } from "@/shared/lib/duration";
import { getLessonAccessDecision } from "@/domain/auth-payments/model/api";
import type { LessonAccessDecision } from "@/domain/auth-payments/model/access";
import { getLessonAccessUiState } from "@/domain/auth-payments/model/ui";
import { AccessStateBanner } from "@/shared/ui/AccessStateBanner";
import { PageLoader } from "@/shared/ui/loading";
import { BackNavButton } from "@/shared/ui/BackNavButton";
import { Notice } from "@/shared/ui/Notice";
import {
  getLessonMaterialAccess,
  getLessonPlaybackAccess,
} from "@/entities/lesson/model/storage";

import type { Lesson } from "@/entities/lesson/model/types";

type LessonDetailsLocationState = {
  fromCoursePath?: string;
  courseBackFrom?: string | null;
  expandedBlockId?: string | null;
};

type LessonMaterialItem = NonNullable<Lesson["materials"]>[number];

const isLikelyHlsSource = (value?: string) =>
  Boolean(value && /\.m3u8(?:$|[?#])/i.test(value.trim()));

const isImageMaterial = (material: LessonMaterialItem) =>
  /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i.test(material.name);

const buildPdfFirstPagePreviewUrl = (url: string) =>
  `${url}${url.includes("#") ? "&" : "#"}page=1&view=FitH&toolbar=0&navpanes=0&scrollbar=0`;

export default function LessonDetails() {
  const { id: lessonIdParam } = useParams<{ id: string }>();
  const id = lessonIdParam ?? "";
  const { user, openAuthModal, openRecoverModal } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState =
    (location.state as LessonDetailsLocationState | null) ?? null;
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [canAccess, setCanAccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessDecision, setAccessDecision] = useState<LessonAccessDecision | null>(
    null
  );
  const [bnplBlock, setBnplBlock] = useState<{
    kind: "restricted_new_content" | "suspended_readonly";
    message: string;
    purchaseId?: string;
  } | null>(null);
  const [playbackSrc, setPlaybackSrc] = useState<string | null>(null);
  const [playbackStreamSrc, setPlaybackStreamSrc] = useState<string | null>(null);
  const [playbackExpiresAt, setPlaybackExpiresAt] = useState<string | null>(null);
  const [playbackLoading, setPlaybackLoading] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [materialLoadingById, setMaterialLoadingById] = useState<Record<string, boolean>>(
    {}
  );
  const [materialErrorById, setMaterialErrorById] = useState<Record<string, string>>(
    {}
  );
  const [materialAccessById, setMaterialAccessById] = useState<
    Record<string, { accessUrl: string; expiresAt?: string | null; downloadable: boolean }>
  >({});
  const [previewMaterial, setPreviewMaterial] = useState<{
    id: string;
    accessUrl: string;
    isImage: boolean;
    downloadable: boolean;
  } | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const decision = await getLessonAccessDecision({
          lessonId: id,
        });
        if (!active) return;
        let finalCanAccess = decision.canAccess;
        let nextBnplBlock: typeof bnplBlock = null;

        if (
          decision.canAccess &&
          user?.role === "student" &&
          decision.lesson?.courseId
        ) {
          const courseId = decision.lesson.courseId;
          const purchases = await getPurchases({ userId: user.id });
          const purchase = purchases.find((item) => item.courseId === courseId) ?? null;
          if (purchase) {
            const accessState = selectCourseAccessState(purchase);
            const financialView = selectPurchaseFinancialView(purchase);
            if (financialView.paymentMethod === "bnpl") {
              if (accessState.accessLevel === "suspended_readonly") {
                finalCanAccess = false;
                  nextBnplBlock = {
                    kind: "suspended_readonly",
                    message:
                      "Доступ к урокам временно приостановлен. Откройте детали оплаты и завершите платеж, чтобы восстановить доступ.",
                    purchaseId: purchase.id,
                  };
                } else if (accessState.accessLevel === "restricted_new_content") {
                const [openedIds, viewedIds] = await Promise.all([
                  getOpenedLessonIds(user.id, courseId),
                  getViewedLessonIds(user.id, courseId),
                ]);
                const isOpenedBefore =
                  openedIds.includes(decision.lesson.id) ||
                  viewedIds.includes(decision.lesson.id);
                if (!isOpenedBefore) {
                  finalCanAccess = false;
                  nextBnplBlock = {
                    kind: "restricted_new_content",
                    message:
                      "Новые уроки временно заблокированы до оплаты по графику. Откройте детали оплаты, чтобы продолжить обучение.",
                    purchaseId: purchase.id,
                  };
                }
              }
            }
          }
        }

        setAccessDecision(decision);
        setLesson(decision.lesson);
        setCanAccess(finalCanAccess);
        setBnplBlock(nextBnplBlock);
        setPlaybackSrc(null);
        setPlaybackStreamSrc(null);
        setPlaybackExpiresAt(null);
        setPlaybackError(null);
        setPlaybackLoading(false);
        setMaterialLoadingById({});
        setMaterialErrorById({});
        setMaterialAccessById({});
        setPreviewMaterial(null);

        if (
          finalCanAccess &&
          user?.role === "student" &&
          decision.lesson?.courseId
        ) {
          await markLessonOpened(user.id, decision.lesson.courseId, decision.lesson.id);
        }
      } catch {
        if (!active) return;
        setError("Не удалось загрузить урок.");
        setLesson(null);
        setCanAccess(false);
        setBnplBlock(null);
        setAccessDecision(null);
        setPlaybackSrc(null);
        setPlaybackStreamSrc(null);
        setPlaybackExpiresAt(null);
        setPlaybackError(null);
        setPlaybackLoading(false);
        setMaterialLoadingById({});
        setMaterialErrorById({});
        setMaterialAccessById({});
        setPreviewMaterial(null);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [id, user?.id, user?.role]);

  const requestPlaybackAccess = useCallback(async () => {
    if (!lesson?.id) {
      throw new Error("lesson_missing");
    }
    const access = await getLessonPlaybackAccess(lesson.id);
    const nextUrl = access.playbackUrl?.trim();
    if (!nextUrl) {
      throw new Error("playback_url_missing");
    }
    const isStream = isLikelyHlsSource(nextUrl);
    setPlaybackStreamSrc(isStream ? nextUrl : null);
    setPlaybackSrc(isStream ? null : nextUrl);
    setPlaybackExpiresAt(access.expiresAt ?? null);
    setPlaybackError(null);
    return {
      src: isStream ? undefined : nextUrl,
      streamSrc: isStream ? nextUrl : undefined,
    };
  }, [lesson?.id]);

  useEffect(() => {
    if (!canAccess || !lesson) return;
    const hasVideoBinding = Boolean(
      lesson.videoMediaObjectId || lesson.videoUrl || lesson.videoStreamUrl
    );
    const shouldAttemptPlayback =
      lesson.contentVisibility === "public_preview" || hasVideoBinding;
    if (!shouldAttemptPlayback) return;

    let active = true;
    setPlaybackLoading(true);
    setPlaybackError(null);
    void requestPlaybackAccess()
      .catch(() => {
        if (!active) return;
        setPlaybackError(
          "Не удалось получить безопасный доступ к видео. Попробуйте обновить доступ."
        );
      })
      .finally(() => {
        if (active) setPlaybackLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    canAccess,
    lesson,
    requestPlaybackAccess,
  ]);

  const handleOpenMaterial = useCallback(
    async (materialId: string, options?: { force?: boolean }) => {
      if (!lesson?.id) return;
      const cached = materialAccessById[materialId];
      const expiresAtMs = cached?.expiresAt ? new Date(cached.expiresAt).getTime() : null;
      const now = Date.now();
      if (
        cached &&
        !options?.force &&
        (expiresAtMs === null || Number.isNaN(expiresAtMs) || expiresAtMs - now > 45_000)
      ) {
        return cached;
      }
      setMaterialLoadingById((prev) => ({ ...prev, [materialId]: true }));
      setMaterialErrorById((prev) => ({ ...prev, [materialId]: "" }));
      try {
        const access = await getLessonMaterialAccess({
          lessonId: lesson.id,
          materialId,
        });
        setMaterialAccessById((prev) => ({
          ...prev,
          [materialId]: {
            accessUrl: access.accessUrl,
            expiresAt: access.expiresAt ?? null,
            downloadable: access.downloadable,
          },
        }));
        return {
          accessUrl: access.accessUrl,
          expiresAt: access.expiresAt ?? null,
          downloadable: access.downloadable,
        };
      } catch {
        setMaterialErrorById((prev) => ({
          ...prev,
          [materialId]: "Не удалось получить доступ к материалу. Повторите попытку.",
        }));
      } finally {
        setMaterialLoadingById((prev) => ({ ...prev, [materialId]: false }));
      }
    },
    [lesson?.id, materialAccessById]
  );

  useEffect(() => {
    const materials = lesson?.materials ?? [];
    if (!lesson?.id || !canAccess || !materials.length) return;
    let active = true;
    const preloadMaterialAccess = async () => {
      await Promise.all(
        materials.map(async (material) => {
          if (!material.mediaObjectId && !material.url) return;
          if (materialAccessById[material.id]?.accessUrl) return;
          try {
            const access = await getLessonMaterialAccess({
              lessonId: lesson.id,
              materialId: material.id,
            });
            if (!active) return;
            setMaterialAccessById((prev) => ({
              ...prev,
              [material.id]: {
                accessUrl: access.accessUrl,
                expiresAt: access.expiresAt ?? null,
                downloadable: access.downloadable,
              },
            }));
          } catch {
            if (!active) return;
            setMaterialErrorById((prev) => ({
              ...prev,
              [material.id]: "Не удалось подготовить предпросмотр материала.",
            }));
          }
        })
      );
    };
    void preloadMaterialAccess();
    return () => {
      active = false;
    };
  }, [canAccess, lesson?.id, lesson?.materials, materialAccessById]);

  const handlePreviewMaterial = useCallback(
    async (material: LessonMaterialItem) => {
      if (!material.mediaObjectId && !material.url) return;
      const access = await handleOpenMaterial(material.id);
      if (!access?.accessUrl) return;
      setPreviewMaterial({
        id: material.id,
        accessUrl: access.accessUrl,
        isImage: isImageMaterial(material),
        downloadable: access.downloadable,
      });
    },
    [handleOpenMaterial]
  );

  const handleDownloadMaterial = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>, material: LessonMaterialItem) => {
      event.stopPropagation();
      const access = await handleOpenMaterial(material.id, { force: true });
      if (!access?.accessUrl) return;
      const anchor = document.createElement("a");
      anchor.href = access.accessUrl;
      anchor.download = "";
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    },
    [handleOpenMaterial]
  );

  if (!id) {
    return <div className="lesson-details__not-found">Урок не найден</div>;
  }

  if (loading) {
    return (
      <section className="lesson-details">
        <Container maxWidth="lg" className="lesson-details__container">
          <PageLoader
            className="lesson-details__loading-card"
            title="Загрузка урока..."
            description="Проверяем доступ и готовим видео с материалами."
            minHeight={360}
          />
        </Container>
      </section>
    );
  }

  if (!lesson) {
    return (
      <div className="lesson-details__not-found">
        {error && <Notice tone="critical">{error}</Notice>}
        Урок не найден
      </div>
    );
  }

  if (!canAccess) {
    const accessNoticeState = getLessonAccessUiState(accessDecision);
    const showLoginButton = !user || Boolean(accessDecision?.requiresVerification);
    return (
      <section className="lesson-details lesson-details--locked">
        <Container maxWidth="lg" className="lesson-details__container">
          <div className="lesson-details__top-nav">
            <BackNavButton
              onClick={() => {
                const fallbackCourseId = lesson?.courseId ?? accessDecision?.lesson?.courseId;
                const backState = {
                  from:
                    typeof locationState?.courseBackFrom === "string"
                      ? locationState.courseBackFrom
                      : undefined,
                  expandedBlockId:
                    typeof locationState?.expandedBlockId === "string"
                      ? locationState.expandedBlockId
                      : undefined,
                };
                if (typeof locationState?.fromCoursePath === "string") {
                  navigate(locationState.fromCoursePath, { state: backState });
                  return;
                }
                if (fallbackCourseId) {
                  navigate(`/courses/${fallbackCourseId}`, {
                    state: backState,
                  });
                  return;
                }
                navigate(-1);
              }}
            />
          </div>
          <div className="lesson-details__locked-card">
            <h1 className="lesson-details__title">{lesson.title}</h1>
            {accessNoticeState ? (
              <AccessStateBanner
                state={accessNoticeState}
                onLogin={showLoginButton ? openAuthModal : undefined}
                onRecover={
                  showLoginButton
                    ? () =>
                        openRecoverModal(user?.email)
                    : undefined
                }
              />
            ) : (
              <p>
                {bnplBlock?.message ?? "Этот урок доступен после покупки курса."}
              </p>
            )}
            <div className="lesson-details__locked-actions">
              {bnplBlock ? (
                <Button
                  variant="contained"
                  onClick={() =>
                    navigate(
                      bnplBlock.purchaseId
                        ? `/profile/purchases/${bnplBlock.purchaseId}`
                        : "/student/profile",
                      {
                        state: { from: `${location.pathname}${location.search}` },
                      }
                    )
                  }
                >
                  Детали оплаты
                </Button>
              ) : (
                <Button
                  variant="contained"
                  onClick={() => navigate(`/courses/${lesson.courseId}`)}
                >
                  Купить курс
                </Button>
              )}
              {showLoginButton && !accessNoticeState && (
                <Button variant="outlined" onClick={() => openAuthModal()}>
                  Войти
                </Button>
              )}
            </div>
          </div>
        </Container>
      </section>
    );
  }

  const handleEnded = () => {
    if (!user || user.role !== "student") return;
    void markLessonViewed(user.id, lesson.courseId, lesson.id);
  };
  const handleBackToCourse = () => {
    const backState = {
      from:
        typeof locationState?.courseBackFrom === "string"
          ? locationState.courseBackFrom
          : undefined,
      expandedBlockId:
        typeof locationState?.expandedBlockId === "string"
          ? locationState.expandedBlockId
          : undefined,
    };
    if (typeof locationState?.fromCoursePath === "string") {
      navigate(locationState.fromCoursePath, { state: backState });
      return;
    }
    navigate(`/courses/${lesson.courseId}`, { state: backState });
  };
  const durationText = formatLessonDuration(lesson.duration);
  const isRedactedLesson = lesson.contentVisibility === "public_preview";
  const hasVideoBinding =
    isRedactedLesson ||
    Boolean(lesson.videoMediaObjectId || lesson.videoUrl || lesson.videoStreamUrl);
  const hasPlayableVideo = hasVideoBinding && Boolean(playbackSrc || playbackStreamSrc);
  const mediaStatusBanner =
    isRedactedLesson
      ? null
      : playbackError
      ? {
          severity: "warning" as const,
          message: playbackError,
        }
      : lesson.mediaJobStatus === "queued" || lesson.mediaJobStatus === "processing"
      ? {
          severity: "info" as const,
          message: hasVideoBinding
            ? "Видео еще оптимизируется. Пока доступен резервный источник, качество может улучшиться после завершения обработки."
            : "Видео для урока еще подготавливается. Обновите страницу чуть позже.",
        }
      : lesson.mediaJobStatus === "failed"
        ? {
            severity: "warning" as const,
            message:
              lesson.mediaJobError ||
              "Автоматическая обработка видео завершилась с ошибкой. Используется резервный источник, если он доступен.",
          }
        : null;

  return (
    <section className="lesson-details">
      <Container maxWidth="lg" className="lesson-details__container">
        {error && <Notice tone="critical" density="compact">{error}</Notice>}
        {mediaStatusBanner ? (
          <Notice tone={mediaStatusBanner.severity} density="compact">
            {mediaStatusBanner.message}
          </Notice>
        ) : null}
        {hasVideoBinding && playbackError ? (
          <div className="lesson-details__playback-actions">
            <Button
              variant="outlined"
              size="small"
              disabled={playbackLoading}
              onClick={() => {
                setPlaybackLoading(true);
                setPlaybackError(null);
                void requestPlaybackAccess()
                  .catch(() => {
                    setPlaybackError(
                      "Не удалось обновить доступ к видео. Проверьте соединение и попробуйте снова."
                    );
                  })
                  .finally(() => {
                    setPlaybackLoading(false);
                  });
              }}
            >
              {playbackLoading ? "Обновляем доступ..." : "Обновить доступ к видео"}
            </Button>
            {playbackExpiresAt ? (
              <span className="lesson-details__playback-expiry">
                Доступ активен до {new Date(playbackExpiresAt).toLocaleTimeString("ru-RU")}
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="lesson-details__top-bar">
          <div className="lesson-details__top-nav">
            <BackNavButton onClick={handleBackToCourse} />
          </div>
          <div className="lesson-details__hero" aria-label="Метаданные урока">
            <span className="lesson-details__duration-chip">
              Длительность: {durationText}
            </span>
          </div>
        </div>

        <div className="lesson-details__video-card">
          {hasPlayableVideo ? (
            <div className="lesson-details__video">
              <VideoPlayer
                src={playbackSrc ?? undefined}
                streamSrc={playbackStreamSrc ?? undefined}
                poster={lesson.videoPosterUrl}
                onEnded={handleEnded}
                onRequestSourceRefresh={requestPlaybackAccess}
              />
            </div>
          ) : (
            <div className="lesson-details__video-empty">
              {playbackLoading ? (
                <>
                  <CircularProgress size={22} />
                  <span>Подготавливаем предпросмотр видео...</span>
                </>
              ) : isRedactedLesson
                ? playbackError
                  ? "Не удалось подготовить предпросмотр урока. Попробуйте обновить доступ."
                  : "Предпросмотр видео временно недоступен."
                : lesson.mediaJobStatus === "queued" || lesson.mediaJobStatus === "processing"
                ? "Видео для этого урока подготавливается"
                : hasVideoBinding
                ? "Ссылка на видео недоступна. Обновите доступ или повторите позже."
                : "Видео для этого урока пока не добавлено"}
            </div>
          )}
        </div>

        {lesson.materials && lesson.materials.length > 0 && (
          <section className="lesson-details__materials">
            <div className="lesson-details__materials-head">
              <h2>Материалы урока</h2>
              <p>Файлы и документы для закрепления темы.</p>
            </div>
            {lesson.settings?.disablePrintableDownloads && (
              <Notice tone="neutral" density="compact">
                Скачивание печатных материалов отключено преподавателем для этого урока.
              </Notice>
            )}
            <div className="lesson-details__materials-grid">
              {lesson.materials.map((m) => (
                <article
                  key={m.id}
                  className="lesson-details__material-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    void handlePreviewMaterial(m);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      void handlePreviewMaterial(m);
                    }
                  }}
                >
                  <div className="lesson-details__material-preview">
                    {materialLoadingById[m.id] ? (
                      <div className="lesson-details__material-preview-fallback">
                        <CircularProgress size={20} />
                      </div>
                    ) : materialAccessById[m.id]?.accessUrl ? (
                      isImageMaterial(m) ? (
                        <img
                          src={materialAccessById[m.id].accessUrl}
                          alt="Предпросмотр материала"
                          loading="lazy"
                        />
                      ) : (
                        <iframe
                          src={buildPdfFirstPagePreviewUrl(materialAccessById[m.id].accessUrl)}
                          title="Предпросмотр первой страницы материала"
                          loading="lazy"
                        />
                      )
                    ) : (
                      <div className="lesson-details__material-preview-fallback">
                        {m.type === "pdf" ? (
                          <PictureAsPdfIcon color="error" />
                        ) : (
                          <DescriptionIcon color="primary" />
                        )}
                      </div>
                    )}
                  </div>
                  {!lesson.settings?.disablePrintableDownloads &&
                  (materialAccessById[m.id]?.downloadable ?? m.downloadable ?? true) ? (
                    <button
                      type="button"
                      className="lesson-details__material-download"
                      aria-label="Скачать материал"
                      onClick={(event) => {
                        void handleDownloadMaterial(event, m);
                      }}
                    >
                      <DownloadRoundedIcon fontSize="inherit" />
                    </button>
                  ) : null}
                  {materialErrorById[m.id] ? (
                    <span className="lesson-details__material-error-text">
                      {materialErrorById[m.id]}
                    </span>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        )}
        <Dialog
          open={Boolean(previewMaterial)}
          onClose={() => setPreviewMaterial(null)}
          fullWidth
          maxWidth="xl"
          className="lesson-details__material-preview-dialog"
        >
          <IconButton
            className="lesson-details__material-preview-close"
            aria-label="Закрыть предпросмотр материала"
            onClick={() => setPreviewMaterial(null)}
          >
            <CloseRoundedIcon />
          </IconButton>
          <div className="lesson-details__material-preview-modal-body">
            {previewMaterial?.accessUrl ? (
              previewMaterial.isImage ? (
                <img src={previewMaterial.accessUrl} alt="Предпросмотр материала" />
              ) : (
                <iframe src={previewMaterial.accessUrl} title="Предпросмотр материала" />
              )
            ) : null}
          </div>
        </Dialog>
      </Container>
    </section>
  );
}
