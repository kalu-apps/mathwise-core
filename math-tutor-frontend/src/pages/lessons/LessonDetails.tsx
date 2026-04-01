import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  CircularProgress,
  Container,
} from "@mui/material";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import DescriptionIcon from "@mui/icons-material/Description";

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

const isLikelyHlsSource = (value?: string) =>
  Boolean(value && /\\.m3u8(?:$|[?#])/i.test(value.trim()));

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
    if (lesson.contentVisibility === "public_preview") return;
    const hasVideoBinding = Boolean(
      lesson.videoMediaObjectId || lesson.videoUrl || lesson.videoStreamUrl
    );
    if (!hasVideoBinding) return;

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
    async (materialId: string) => {
      if (!lesson?.id) return;
      setMaterialLoadingById((prev) => ({ ...prev, [materialId]: true }));
      setMaterialErrorById((prev) => ({ ...prev, [materialId]: "" }));
      try {
        const access = await getLessonMaterialAccess({
          lessonId: lesson.id,
          materialId,
        });
        const opened = window.open(access.accessUrl, "_blank", "noopener,noreferrer");
        if (!opened) {
          window.location.assign(access.accessUrl);
        }
      } catch {
        setMaterialErrorById((prev) => ({
          ...prev,
          [materialId]: "Не удалось получить доступ к материалу. Повторите попытку.",
        }));
      } finally {
        setMaterialLoadingById((prev) => ({ ...prev, [materialId]: false }));
      }
    },
    [lesson?.id]
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
        {error && <Alert severity="error">{error}</Alert>}
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
                <Button variant="outlined" onClick={openAuthModal}>
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
    !isRedactedLesson &&
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
      : playbackLoading
      ? {
          severity: "info" as const,
          message:
            "Получаем защищенный доступ к видео. Это может занять несколько секунд.",
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
        {error && <Alert severity="error">{error}</Alert>}
        {mediaStatusBanner ? (
          <Alert severity={mediaStatusBanner.severity}>{mediaStatusBanner.message}</Alert>
        ) : null}
        {hasVideoBinding && (playbackError || playbackLoading) ? (
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
        <div className="lesson-details__top-nav">
          <BackNavButton onClick={handleBackToCourse} />
        </div>
        <header className="lesson-details__hero">
          <span className="lesson-details__kicker">Содержание урока</span>
          <span className="lesson-details__duration-chip">
            Длительность: {durationText}
          </span>
          <h1 className="lesson-details__title">{lesson.title}</h1>
        </header>

        <div className="lesson-details__video-card">
          {hasPlayableVideo ? (
            <div className="lesson-details__video">
              <VideoPlayer
                src={playbackSrc ?? undefined}
                streamSrc={playbackStreamSrc ?? undefined}
                poster={lesson.videoPosterUrl}
                onEnded={handleEnded}
                watermarkText={
                  user
                    ? `${user.email} • ${new Date().toLocaleString("ru-RU")}`
                    : undefined
                }
                onRequestSourceRefresh={requestPlaybackAccess}
              />
            </div>
          ) : (
            <div className="lesson-details__video-empty">
              {isRedactedLesson
                ? "Видео и материалы доступны после покупки курса."
                : hasVideoBinding && playbackLoading
                ? "Обновляем защищенный доступ к видео..."
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
              <Alert severity="info" className="ui-alert">
                Скачивание печатных материалов отключено преподавателем для этого урока.
              </Alert>
            )}
            <div className="lesson-details__materials-grid">
              {lesson.materials.map((m) => (
                <article key={m.id} className="lesson-details__material-card">
                  <span className="lesson-details__material-icon">
                    {m.type === "pdf" ? (
                      <PictureAsPdfIcon color="error" />
                    ) : (
                      <DescriptionIcon color="primary" />
                    )}
                  </span>
                  <div className="lesson-details__material-content">
                    <h3>{m.name}</h3>
                    {materialErrorById[m.id] ? (
                      <Alert severity="warning" className="ui-alert">
                        {materialErrorById[m.id]}
                      </Alert>
                    ) : null}
                    {!m.mediaObjectId && !m.url ? (
                      <span>Материал еще не готов к выдаче.</span>
                    ) : (
                      <Button
                        variant="text"
                        size="small"
                        disabled={Boolean(materialLoadingById[m.id])}
                        onClick={() => {
                          void handleOpenMaterial(m.id);
                        }}
                      >
                        {materialLoadingById[m.id] ? (
                          <>
                            <CircularProgress size={14} sx={{ mr: 1 }} />
                            Получаем доступ...
                          </>
                        ) : lesson.settings?.disablePrintableDownloads &&
                          (m.type === "pdf" || m.type === "doc") ? (
                          "Открыть для просмотра"
                        ) : (
                          "Открыть материал"
                        )}
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </Container>
    </section>
  );
}
