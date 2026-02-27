import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Button,
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

import type { Lesson } from "@/entities/lesson/model/types";

type LessonDetailsLocationState = {
  fromCoursePath?: string;
  courseBackFrom?: string | null;
  expandedBlockId?: string | null;
};

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

  useEffect(() => {
    if (!id) return;
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const decision = await getLessonAccessDecision({
          lessonId: id,
          userId: user?.id,
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
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [id, user?.id, user?.role]);

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

  return (
    <section className="lesson-details">
      <Container maxWidth="lg" className="lesson-details__container">
        {error && <Alert severity="error">{error}</Alert>}
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
          {lesson.videoUrl ? (
            <div className="lesson-details__video">
              <VideoPlayer
                src={lesson.videoUrl}
                onEnded={handleEnded}
                watermarkText={
                  user
                    ? `${user.email} • ${new Date().toLocaleString("ru-RU")}`
                    : undefined
                }
              />
            </div>
          ) : (
            <div className="lesson-details__video-empty">
              Видео для этого урока пока не добавлено
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
                    {lesson.settings?.disablePrintableDownloads &&
                    (m.type === "pdf" || m.type === "doc") ? (
                      <span>Доступно только для просмотра в уроке</span>
                    ) : (
                      <a href={m.url} target="_blank" rel="noopener noreferrer">
                        Открыть материал
                      </a>
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
