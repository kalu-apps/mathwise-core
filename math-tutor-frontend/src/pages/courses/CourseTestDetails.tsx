import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import { useAuth } from "@/features/auth/model/AuthContext";
import { getCourseById } from "@/entities/course/model/storage";
import { getLessonsByCourse } from "@/entities/lesson/model/storage";
import { getViewedLessonIds } from "@/entities/progress/model/storage";
import { getPurchases } from "@/entities/purchase/model/storage";
import { selectCourseAccessState } from "@/entities/purchase/model/selectors";
import {
  clearAssessmentSession,
  getAssessmentAttempts,
  getAssessmentSession,
  getAssessmentTemplateById,
  getCourseContentItems,
  saveAssessmentSession,
  submitAssessmentAttempt,
} from "@/features/assessments/model/storage";
import {
  formatSpentTime,
  getAssessmentGradeLabel,
  getAssessmentGradeTone,
  getMissingPrerequisites,
  getUnansweredQuestionIndexes,
} from "@/features/assessments/model/progress";
import type {
  AssessmentAttempt,
  CourseContentTestItem,
  TestTemplate,
} from "@/features/assessments/model/types";
import { PageLoader } from "@/shared/ui/loading";
import { DialogTitleWithClose } from "@/shared/ui/DialogTitleWithClose";
import { BackNavButton } from "@/shared/ui/BackNavButton";

type CourseTestLocationState = {
  fromCoursePath?: string;
  courseBackFrom?: string | null;
  expandedBlockId?: string | null;
};

const getTimerTone = (remainingSeconds: number, totalSeconds: number) => {
  const ratio = totalSeconds <= 0 ? 0 : remainingSeconds / totalSeconds;
  if (ratio <= 0.2) return "error";
  if (ratio <= 0.5) return "warning";
  return "success";
};

const formatClock = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(safe / 3600)
    .toString()
    .padStart(2, "0");
  const mm = Math.floor((safe % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const ss = (safe % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
};

export default function CourseTestDetails() {
  const { courseId = "", testItemId = "" } = useParams<{
    courseId: string;
    testItemId: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as CourseTestLocationState | null) ?? null;
  const { user, openAuthModal } = useAuth();
  const isTeacherPreview = user?.role === "teacher";
  const isStudentMode = user?.role === "student";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [template, setTemplate] = useState<TestTemplate | null>(null);
  const [testItem, setTestItem] = useState<CourseContentTestItem | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [attempts, setAttempts] = useState<AssessmentAttempt[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [lockedReason, setLockedReason] = useState<string | null>(null);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [missingAnswerIndexes, setMissingAnswerIndexes] = useState<number[]>([]);
  const [resultAttempt, setResultAttempt] = useState<AssessmentAttempt | null>(null);
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [timeoutNoticeOpen, setTimeoutNoticeOpen] = useState(false);
  const [revealMap, setRevealMap] = useState<Record<string, boolean>>({});
  const [previewAttachment, setPreviewAttachment] = useState<{
    name: string;
    url: string;
  } | null>(null);
  const startedAtRef = useRef<string>(new Date().toISOString());
  const timeoutHandledRef = useRef(false);

  useEffect(() => {
    if (!courseId || !testItemId) return;
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      setSessionReady(false);
      setLockedReason(null);
      timeoutHandledRef.current = false;

      try {
        const [course, lessons] = await Promise.all([
          getCourseById(courseId),
          getLessonsByCourse(courseId),
        ]);
        if (!course) {
          throw new Error("Курс не найден.");
        }
        if (!user) {
          throw new Error("Для прохождения теста необходимо войти в профиль.");
        }
        if (user.role !== "student" && user.role !== "teacher") {
          throw new Error("Недостаточно прав для просмотра теста.");
        }

        const queue = await getCourseContentItems(courseId, lessons);
        const item = queue.find(
          (candidate): candidate is CourseContentTestItem =>
            candidate.type === "test" && candidate.id === testItemId
        );
        if (!item) {
          throw new Error("Тест не найден в содержании курса.");
        }
        const loadedTemplate =
          item.templateSnapshot
            ? {
                id: item.templateId,
                title: item.templateSnapshot.title,
                description: item.templateSnapshot.description ?? "",
                durationMinutes: item.templateSnapshot.durationMinutes,
                assessmentKind:
                  item.templateSnapshot.assessmentKind === "exam"
                    ? ("exam" as const)
                    : ("credit" as const),
                createdByTeacherId: "",
                createdAt: item.createdAt,
                updatedAt: item.createdAt,
                questions: item.templateSnapshot.questions,
                recommendationMap: item.templateSnapshot.recommendationMap,
                status: "published" as const,
              }
            : await getAssessmentTemplateById(item.templateId);
        if (!loadedTemplate) {
          throw new Error("Шаблон теста недоступен в карточке курса.");
        }

        const blockQueue = queue
          .filter((queueItem) => queueItem.blockId === item.blockId)
          .sort((a, b) => a.order - b.order);
        const queueForPrerequisites =
          blockQueue.length > 0 ? blockQueue : queue;

        const [
          purchases,
          viewedLessonIds,
          testAttempts,
          existingSession,
        ] = await Promise.all([
          isStudentMode ? getPurchases({ userId: user.id }) : Promise.resolve([]),
          isStudentMode
            ? getViewedLessonIds(user.id, courseId)
            : Promise.resolve<string[]>([]),
          isStudentMode
            ? getAssessmentAttempts({
                studentId: user.id,
                courseId,
                testItemId,
              })
            : Promise.resolve<AssessmentAttempt[]>([]),
          isStudentMode
            ? getAssessmentSession({
                studentId: user.id,
                courseId,
                testItemId,
              })
            : Promise.resolve(null),
        ]);

        if (isStudentMode) {
          const purchase = purchases.find((candidate) => candidate.courseId === courseId);
          if (!purchase) {
            throw new Error("Сначала купите курс, затем проходите тесты.");
          }
          const access = selectCourseAccessState(purchase);
          if (access.accessLevel === "suspended_readonly") {
            throw new Error(
              "Доступ к тесту временно приостановлен. Проверьте раздел «Детали оплаты»."
            );
          }
        }

        const missingItems = isStudentMode
          ? getMissingPrerequisites({
              queue: queueForPrerequisites,
              testItemId,
              viewedLessonIds,
            })
          : [];

        const blockedMessage =
          missingItems.length > 0
            ? `Перед тестом нужно изучить материалы выше в этом блоке: осталось ${missingItems.length} элементов.`
            : null;

        if (!active) return;
        setTemplate(loadedTemplate);
        setTestItem(item);
        setAttempts(testAttempts);
        setResultAttempt(testAttempts[0] ?? null);
        setLockedReason(blockedMessage);

        if (existingSession) {
          startedAtRef.current = existingSession.startedAt;
          setAnswers(existingSession.answers);
          setCurrentQuestionIndex(
            Math.min(
              Math.max(0, existingSession.currentQuestionIndex),
              loadedTemplate.questions.length - 1
            )
          );
          setRemainingSeconds(existingSession.remainingSeconds);
        } else {
          startedAtRef.current = new Date().toISOString();
          setAnswers({});
          setCurrentQuestionIndex(0);
          setRemainingSeconds(loadedTemplate.durationMinutes * 60);
        }
        setRunning(isStudentMode && !blockedMessage);
        setSessionReady(true);
      } catch (loadError) {
        if (!active) return;
        setTemplate(null);
        setTestItem(null);
        setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить тест.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [courseId, testItemId, user, isStudentMode]);

  useEffect(() => {
    if (!sessionReady || !running || submitting || !template || lockedReason) return;
    const timer = window.setInterval(() => {
      setRemainingSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [sessionReady, running, submitting, template, lockedReason]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        setRunning(false);
        return;
      }
      if (sessionReady && !lockedReason && !resultDialogOpen && remainingSeconds > 0) {
        setRunning(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [lockedReason, remainingSeconds, resultDialogOpen, sessionReady]);

  useEffect(() => {
    if (!sessionReady || !template || !running) return;
    if (remainingSeconds > 0) return;
    if (timeoutHandledRef.current) return;
    timeoutHandledRef.current = true;
    setRunning(false);
    const run = async () => {
      await finalizeSubmit(true);
    };
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds, sessionReady, template, running]);

  useEffect(() => {
    if (!sessionReady || !template || !testItem || !user || user.role !== "student") {
      return;
    }
    if (resultDialogOpen) return;
    void saveAssessmentSession({
      studentId: user.id,
      courseId,
      testItemId,
      templateId: template.id,
      startedAt: startedAtRef.current,
      remainingSeconds,
      currentQuestionIndex,
      answers,
    });
  }, [
    answers,
    courseId,
    currentQuestionIndex,
    remainingSeconds,
    resultDialogOpen,
    sessionReady,
    template,
    testItem,
    testItemId,
    user,
  ]);

  const activeQuestion = template?.questions[currentQuestionIndex] ?? null;
  const totalSeconds = (template?.durationMinutes ?? 0) * 60;
  const latestAttempt = attempts[0] ?? null;
  const timerTone = getTimerTone(remainingSeconds, totalSeconds);

  const handleGoBackToCourse = () => {
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
    navigate(`/courses/${courseId}`, { state: backState });
  };

  const finalizeSubmit = async (fromTimeout = false) => {
    if (!user || user.role !== "student" || !template || !testItem) return;
    setSubmitting(true);
    setError(null);
    try {
      const spent = Math.max(0, totalSeconds - remainingSeconds);
      const submitted = await submitAssessmentAttempt({
        studentId: user.id,
        courseId,
        testItemId,
        templateId: template.id,
        startedAt: startedAtRef.current,
        timeSpentSeconds: spent,
        answers,
      });
      await clearAssessmentSession({
        studentId: user.id,
        courseId,
        testItemId,
      });

      const refreshedAttempts = await getAssessmentAttempts({
        studentId: user.id,
        courseId,
        testItemId,
      });
      setAttempts(refreshedAttempts);
      setResultAttempt(submitted.attempt);
      setRevealMap({});
      setRunning(false);
      setResultDialogOpen(true);
      if (fromTimeout) {
        setTimeoutNoticeOpen(true);
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Не удалось отправить тест на проверку."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitClick = () => {
    if (!template) return;
    const missing = getUnansweredQuestionIndexes(
      template.questions.map((question) => question.id),
      answers
    );
    if (missing.length > 0) {
      setMissingAnswerIndexes(missing);
      setSubmitConfirmOpen(true);
      return;
    }
    void finalizeSubmit(false);
  };

  const handleRetake = async () => {
    if (!template || !user || user.role !== "student") return;
    startedAtRef.current = new Date().toISOString();
    setAnswers({});
    setCurrentQuestionIndex(0);
    setRemainingSeconds(template.durationMinutes * 60);
    setResultDialogOpen(false);
    setTimeoutNoticeOpen(false);
    setRunning(true);
    await clearAssessmentSession({
      studentId: user.id,
      courseId,
      testItemId,
    });
  };

  if (!courseId || !testItemId) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="error">Некорректный адрес теста.</Alert>
      </Container>
    );
  }

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <PageLoader
          minHeight={260}
          title="Подготовка теста"
          description="Загружаем вопросы и проверяем доступ."
        />
      </Container>
    );
  }

  if (!template || !testItem) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error">{error ?? "Тест не найден."}</Alert>
        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          {!user ? (
            <Button variant="contained" onClick={openAuthModal}>
              Войти
            </Button>
          ) : null}
          <Button variant="outlined" onClick={handleGoBackToCourse}>
            Вернуться к курсу
          </Button>
        </Stack>
      </Container>
    );
  }

  if (lockedReason) {
    return (
      <section className="course-test-page">
        <Container maxWidth="md" sx={{ py: 4 }}>
          <div className="course-test-page__top-nav">
            <BackNavButton onClick={handleGoBackToCourse} />
          </div>
          <header className="course-test-page__header">
            <div className="course-test-page__header-main">
              <div>
                <span className="course-test-page__kicker">Тест курса</span>
                <h1>{testItem.titleSnapshot || template.title}</h1>
              </div>
            </div>
          </header>
          <Alert severity="warning">{lockedReason}</Alert>
          <Button sx={{ mt: 2 }} variant="contained" onClick={handleGoBackToCourse}>
            Вернуться к материалам курса
          </Button>
        </Container>
      </section>
    );
  }

  return (
    <section className="course-test-page">
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <div className="course-test-page__top-nav">
          <BackNavButton onClick={handleGoBackToCourse} />
        </div>
        <header className="course-test-page__header">
          <div className="course-test-page__header-main">
            <div>
              <span className="course-test-page__kicker">Тест курса</span>
              <h1>{testItem.titleSnapshot || template.title}</h1>
              <p>
                {isTeacherPreview
                  ? template.description || "Режим предпросмотра теста для преподавателя."
                  : template.description || "Проверьте знания по материалам курса."}
              </p>
            </div>
          </div>
          <div className="course-test-page__header-side">
            {!isTeacherPreview ? (
              <Chip
                icon={<AccessTimeRoundedIcon />}
                color={timerTone}
                label={`Осталось: ${formatClock(remainingSeconds)}`}
                className="course-test-page__timer"
              />
            ) : (
              <Chip label="Предпросмотр для преподавателя" color="info" />
            )}
            {!isTeacherPreview && latestAttempt ? (
              <Chip
                className="course-test-page__last-result"
                label={`Последний результат: ${latestAttempt.score.correct}/${latestAttempt.score.total} (${latestAttempt.score.percent}%)`}
              />
            ) : null}
          </div>
        </header>

        {error ? <Alert severity="error">{error}</Alert> : null}
        <div className="course-test-page__nav">
          {template.questions.map((question, index) => {
            const hasAnswer = Boolean(String(answers[question.id] ?? "").trim());
            return (
              <button
                key={question.id}
                type="button"
                className={`course-test-page__nav-item ${
                  index === currentQuestionIndex ? "is-active" : ""
                } ${hasAnswer ? "is-answered" : ""}`}
                onClick={() => setCurrentQuestionIndex(index)}
              >
                {index + 1}
              </button>
            );
          })}
        </div>

        {activeQuestion ? (
          <article className="course-test-page__question">
            <Typography variant="h6">
              Вопрос {currentQuestionIndex + 1} из {template.questions.length}
            </Typography>
            <Typography sx={{ mt: 1 }}>{activeQuestion.prompt.text}</Typography>
            {(activeQuestion.prompt.attachments ?? []).length > 0 ? (
              <div className="course-test-page__attachments">
                {(activeQuestion.prompt.attachments ?? []).map((attachment) => (
                  <figure key={attachment.id} className="course-test-page__attachment">
                    <button
                      type="button"
                      className="course-test-page__attachment-button"
                      onClick={() =>
                        setPreviewAttachment({
                          name: attachment.name,
                          url: attachment.url,
                        })
                      }
                    >
                      <img src={attachment.url} alt={attachment.name} />
                    </button>
                  </figure>
                ))}
              </div>
            ) : null}

            {!isTeacherPreview ? (
              <TextField
                label="Ваш ответ"
                value={answers[activeQuestion.id] ?? ""}
                onChange={(event) =>
                  setAnswers((prev) => ({
                    ...prev,
                    [activeQuestion.id]: event.target.value,
                  }))
                }
                fullWidth
                sx={{ mt: 2 }}
                disabled={Boolean(lockedReason) || isTeacherPreview}
              />
            ) : (
              <Stack spacing={1.2} sx={{ mt: 2 }}>
                <Alert severity="info">
                  <strong>Правильный ответ:</strong>{" "}
                  {Array.isArray(activeQuestion.answerSpec.expected)
                    ? activeQuestion.answerSpec.expected.join(", ")
                    : String(activeQuestion.answerSpec.expected ?? "—")}
                </Alert>
                <Alert severity="success">
                  <strong>Пояснение:</strong>{" "}
                  {activeQuestion.feedback.explanation || "Пояснение не задано."}
                </Alert>
              </Stack>
            )}

            <div className="course-test-page__question-actions">
              <Button
                variant="outlined"
                onClick={() =>
                  setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))
                }
                disabled={currentQuestionIndex === 0}
              >
                Назад
              </Button>
              <Button
                variant="outlined"
                onClick={() =>
                  setCurrentQuestionIndex((prev) =>
                    Math.min(template.questions.length - 1, prev + 1)
                  )
                }
                disabled={currentQuestionIndex === template.questions.length - 1}
              >
                Далее
              </Button>
            </div>
          </article>
        ) : null}

        {!isTeacherPreview ? (
          <div className="course-test-page__actions">
            <Button
              variant="contained"
              startIcon={<TaskAltRoundedIcon />}
              disabled={submitting}
              onClick={handleSubmitClick}
            >
              Отдать на проверку
            </Button>
            <Button
              variant="outlined"
              color="inherit"
              onClick={handleGoBackToCourse}
              disabled={submitting}
            >
              Продолжить позже
            </Button>
            {attempts.length > 0 ? (
              <Button
                variant="outlined"
                startIcon={<HistoryRoundedIcon />}
                onClick={() => setHistoryOpen(true)}
              >
                Прошлые попытки
              </Button>
            ) : null}
            <Button
              variant="text"
              startIcon={<ReplayRoundedIcon />}
              onClick={() => {
                void handleRetake();
              }}
            >
              Начать заново
            </Button>
          </div>
        ) : (
          <div className="course-test-page__actions">
            <Button variant="outlined" onClick={handleGoBackToCourse}>
              Вернуться к материалам курса
            </Button>
          </div>
        )}
      </Container>

      {!isTeacherPreview && (
        <Dialog
        open={submitConfirmOpen}
        onClose={() => setSubmitConfirmOpen(false)}
        maxWidth="sm"
        fullWidth
        className="ui-dialog ui-dialog--compact"
      >
        <DialogTitleWithClose
          title="Не все вопросы заполнены"
          onClose={() => setSubmitConfirmOpen(false)}
          closeAriaLabel="Закрыть"
        />
        <DialogContent>
          <Typography color="text.secondary">
            Вы не ответили на вопросы: {missingAnswerIndexes.join(", ")}.
            Отправить тест сейчас?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSubmitConfirmOpen(false)}>Продолжить тест</Button>
          <Button
            variant="contained"
            onClick={() => {
              setSubmitConfirmOpen(false);
              void finalizeSubmit(false);
            }}
          >
            Отправить
          </Button>
        </DialogActions>
      </Dialog>
      )}

      {!isTeacherPreview && (
      <Dialog
        open={timeoutNoticeOpen}
        onClose={() => setTimeoutNoticeOpen(false)}
        maxWidth="sm"
        fullWidth
        className="ui-dialog ui-dialog--compact"
      >
        <DialogTitleWithClose
          title="Время истекло"
          onClose={() => setTimeoutNoticeOpen(false)}
          closeAriaLabel="Закрыть"
        />
        <DialogContent>
          <Typography color="text.secondary">
            Установленное время завершилось. Результат уже сохранен.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleGoBackToCourse}>Вернуться к курсу</Button>
          <Button
            variant="contained"
            onClick={() => {
              setTimeoutNoticeOpen(false);
              setResultDialogOpen(true);
            }}
          >
            Посмотреть результат
          </Button>
        </DialogActions>
      </Dialog>
      )}

      {!isTeacherPreview && (
      <Dialog
        open={resultDialogOpen}
        onClose={() => setResultDialogOpen(false)}
        maxWidth="md"
        fullWidth
        className="ui-dialog ui-dialog--wide"
      >
        <DialogTitleWithClose
          title="Результаты теста"
          onClose={() => setResultDialogOpen(false)}
          closeAriaLabel="Закрыть"
        />
        <DialogContent>
          {!resultAttempt ? (
            <Typography color="text.secondary">Результат еще не сформирован.</Typography>
          ) : (
            <Stack spacing={2}>
              <div className="course-test-page__result-head">
                <Chip
                  label={`Правильных ответов: ${resultAttempt.score.correct}/${resultAttempt.score.total}`}
                  color="info"
                />
                <Chip
                  label={`Результат: ${resultAttempt.score.percent}% (${getAssessmentGradeLabel(
                    resultAttempt.score.percent
                  )})`}
                  color={getAssessmentGradeTone(resultAttempt.score.percent)}
                />
                <Chip
                  label={`Время: ${formatSpentTime(resultAttempt.timeSpentSeconds)}`}
                  variant="outlined"
                />
              </div>
              {template.questions.map((question, index) => {
                const answer = resultAttempt.answers.find(
                  (item) => item.questionId === question.id
                );
                const isCorrect = Boolean(answer?.isCorrect);
                const reveal = revealMap[question.id] ?? false;
                return (
                  <article
                    key={question.id}
                    className={`course-test-page__result-item ${
                      isCorrect ? "is-correct" : "is-wrong"
                    }`}
                  >
                    <strong>
                      {index + 1}. {question.prompt.text}
                    </strong>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      Ваш ответ: {answer?.raw?.trim() ? answer.raw : "—"}
                    </Typography>
                    <Button
                      size="small"
                      sx={{ mt: 1, alignSelf: "flex-start" }}
                      onClick={() =>
                        setRevealMap((prev) => ({
                          ...prev,
                          [question.id]: !prev[question.id],
                        }))
                      }
                    >
                      {reveal ? "Скрыть детали" : "Показать правильный ответ и пояснение"}
                    </Button>
                    {reveal ? (
                      <div className="course-test-page__result-details">
                        <Typography variant="body2">
                          Правильный ответ:{" "}
                          {Array.isArray(question.answerSpec.expected)
                            ? question.answerSpec.expected.join(", ")
                            : question.answerSpec.expected}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Пояснение: {question.feedback.explanation}
                        </Typography>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            startIcon={<ReplayRoundedIcon />}
            onClick={() => {
              void handleRetake();
            }}
          >
            Пройти тест заново
          </Button>
        </DialogActions>
      </Dialog>
      )}

      {!isTeacherPreview && (
      <Dialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        maxWidth="md"
        fullWidth
        className="ui-dialog ui-dialog--wide"
      >
        <DialogTitleWithClose
          title="История попыток"
          onClose={() => setHistoryOpen(false)}
          closeAriaLabel="Закрыть"
        />
        <DialogContent>
          {attempts.length === 0 ? (
            <Typography color="text.secondary">Попыток пока нет.</Typography>
          ) : (
            <Stack spacing={1.5}>
              {attempts.map((attempt) => (
                <article key={attempt.id} className="course-test-page__history-item">
                  <div>
                    <strong>
                      {new Date(attempt.submittedAt ?? attempt.startedAt).toLocaleString(
                        "ru-RU"
                      )}
                    </strong>
                    <Typography variant="body2" color="text.secondary">
                      Правильных: {attempt.score.correct}/{attempt.score.total} • Время:{" "}
                      {formatSpentTime(attempt.timeSpentSeconds)}
                    </Typography>
                  </div>
                  <Chip
                    label={`${attempt.score.percent}% • ${getAssessmentGradeLabel(
                      attempt.score.percent
                    )}`}
                    color={getAssessmentGradeTone(attempt.score.percent)}
                  />
                </article>
              ))}
            </Stack>
          )}
        </DialogContent>
        </Dialog>
      )}

      <Dialog
        open={Boolean(previewAttachment)}
        onClose={() => setPreviewAttachment(null)}
        maxWidth="md"
        fullWidth
        className="ui-dialog ui-dialog--wide"
      >
        <DialogTitleWithClose
          title={previewAttachment?.name ?? "Просмотр изображения"}
          onClose={() => setPreviewAttachment(null)}
          closeAriaLabel="Закрыть просмотр изображения"
        />
        <DialogContent>
          {previewAttachment ? (
            <img
              src={previewAttachment.url}
              alt={previewAttachment.name}
              style={{
                width: "100%",
                maxHeight: "70dvh",
                objectFit: "contain",
                borderRadius: 12,
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
