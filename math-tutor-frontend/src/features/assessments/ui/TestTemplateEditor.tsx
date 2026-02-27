import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import type { AssessmentQuestion, TestTemplate } from "@/features/assessments/model/types";
import { generateId } from "@/shared/lib/id";
import { detectAssessmentAnswerType } from "@/features/assessments/model/evaluator";
import { saveAssessmentTemplate } from "@/features/assessments/model/storage";
import { fileToDataUrl } from "@/shared/lib/files";
import { ListPagination } from "@/shared/ui/ListPagination";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";

type Props = {
  teacherId: string;
  initialTemplate?: TestTemplate | null;
  readOnly?: boolean;
  onSaved?: (template: TestTemplate) => void;
  onCancel?: () => void;
};

const createEmptyQuestion = (): AssessmentQuestion => ({
  id: generateId(),
  prompt: {
    text: "",
    attachments: [],
  },
  answerSpec: {
    type: "text",
    expected: "",
    formatRules: {
      allowCommaDecimal: true,
      trimSpaces: true,
    },
  },
  feedback: {
    explanation: "",
    recommendations: [],
  },
});

const getQuestionCardLabel = (question: AssessmentQuestion) => {
  const raw = question.prompt.text.trim();
  return raw ? raw : "Новый вопрос";
};

const buildSnapshot = (input: {
  templateId: string | null;
  title: string;
  description: string;
  assessmentKind: "credit" | "exam";
  durationMinutes: string;
  questions: AssessmentQuestion[];
}) =>
  JSON.stringify({
    templateId: input.templateId,
    title: input.title.trim(),
    description: input.description.trim(),
    assessmentKind: input.assessmentKind,
    durationMinutes: input.durationMinutes.trim(),
    questions: input.questions,
  });

const parseDurationMinutes = (raw: string) => {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(240, Math.max(1, parsed));
};

const hasTemplateContent = (params: {
  title: string;
  description: string;
  questions: AssessmentQuestion[];
}) => {
  if (params.title.trim() || params.description.trim()) return true;
  return params.questions.some((question) =>
    Boolean(
      question.prompt.text.trim() ||
        String(question.answerSpec.expected ?? "").trim() ||
        question.feedback.explanation.trim()
    )
  );
};

type TemplateSource = {
  templateId: string | null;
  title: string;
  description: string;
  assessmentKind: "credit" | "exam";
  durationMinutes: string;
  questions: AssessmentQuestion[];
};

export function TestTemplateEditor({
  teacherId,
  initialTemplate,
  readOnly = false,
  onSaved,
  onCancel,
}: Props) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [templateId, setTemplateId] = useState<string | null>(initialTemplate?.id ?? null);
  const [title, setTitle] = useState(initialTemplate?.title ?? "");
  const [description, setDescription] = useState(initialTemplate?.description ?? "");
  const [assessmentKind, setAssessmentKind] = useState<"credit" | "exam">(
    initialTemplate?.assessmentKind === "exam" ? "exam" : "credit"
  );
  const [durationMinutes, setDurationMinutes] = useState(
    initialTemplate?.durationMinutes ? String(initialTemplate.durationMinutes) : ""
  );
  const [questions, setQuestions] = useState<AssessmentQuestion[]>(
    initialTemplate?.questions.length ? initialTemplate.questions : [createEmptyQuestion()]
  );
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [dragQuestionId, setDragQuestionId] = useState<string | null>(null);
  const [saveDecisionOpen, setSaveDecisionOpen] = useState(false);
  const [questionsPage, setQuestionsPage] = useState(1);
  const [previewAttachment, setPreviewAttachment] = useState<{
    name: string;
    url: string;
  } | null>(null);
  const [deleteQuestionId, setDeleteQuestionId] = useState<string | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [closeActionLoading, setCloseActionLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const snapshotRef = useRef(
    buildSnapshot({
      templateId: initialTemplate?.id ?? null,
      title: initialTemplate?.title ?? "",
      description: initialTemplate?.description ?? "",
      assessmentKind: initialTemplate?.assessmentKind === "exam" ? "exam" : "credit",
      durationMinutes: initialTemplate?.durationMinutes
        ? String(initialTemplate.durationMinutes)
        : "",
      questions: initialTemplate?.questions.length
        ? initialTemplate.questions
        : [createEmptyQuestion()],
    })
  );
  const autosaveInProgressRef = useRef(false);
  const skipUnmountAutosaveRef = useRef(false);
  const templateIdRef = useRef<string | null>(initialTemplate?.id ?? null);
  const autoSaveDraftRef = useRef<() => Promise<void>>(async () => {});
  const latestStateRef = useRef({
    title: initialTemplate?.title ?? "",
    description: initialTemplate?.description ?? "",
    assessmentKind: (initialTemplate?.assessmentKind === "exam"
      ? "exam"
      : "credit") as "credit" | "exam",
    durationMinutes: initialTemplate?.durationMinutes
      ? String(initialTemplate.durationMinutes)
      : "",
    questions: initialTemplate?.questions.length
      ? initialTemplate.questions
      : [createEmptyQuestion()],
  });

  const activeQuestion = useMemo(
    () => questions.find((question) => question.id === activeQuestionId) ?? null,
    [questions, activeQuestionId]
  );

  const questionsPageSize = isMobile ? 6 : 9;
  const totalQuestionsPages = Math.max(
    1,
    Math.ceil(questions.length / questionsPageSize)
  );
  const safeQuestionsPage = Math.min(questionsPage, totalQuestionsPages);
  const pagedQuestions = useMemo(() => {
    const start = (safeQuestionsPage - 1) * questionsPageSize;
    return questions.slice(start, start + questionsPageSize);
  }, [questions, safeQuestionsPage, questionsPageSize]);

  const updateQuestion = (questionId: string, patch: Partial<AssessmentQuestion>) => {
    setQuestions((prev) =>
      prev.map((question) =>
        question.id === questionId ? { ...question, ...patch } : question
      )
    );
  };

  const updateActiveExpected = (value: string) => {
    if (!activeQuestion) return;
    const detectedType = detectAssessmentAnswerType(value);
    updateQuestion(activeQuestion.id, {
      answerSpec: {
        ...activeQuestion.answerSpec,
        expected: value,
        type: detectedType,
        tolerance:
          detectedType === "number" ? activeQuestion.answerSpec.tolerance : undefined,
      },
    });
  };

  const updateActiveTolerance = (value: string) => {
    if (!activeQuestion) return;
    const parsed = Number.parseFloat(value);
    updateQuestion(activeQuestion.id, {
      answerSpec: {
        ...activeQuestion.answerSpec,
        tolerance:
          Number.isFinite(parsed) && parsed >= 0
            ? {
                kind: activeQuestion.answerSpec.tolerance?.kind ?? "abs",
                value: parsed,
              }
            : undefined,
      },
    });
  };

  const reorderQuestions = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setQuestions((prev) => {
      const sourceIndex = prev.findIndex((question) => question.id === sourceId);
      const targetIndex = prev.findIndex((question) => question.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return prev;
      const next = [...prev];
      const [item] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
  };

  const moveQuestion = (questionId: string, direction: "up" | "down") => {
    setQuestions((prev) => {
      const sourceIndex = prev.findIndex((question) => question.id === questionId);
      if (sourceIndex < 0) return prev;
      const targetIndex = direction === "up" ? sourceIndex - 1 : sourceIndex + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
  };

  const handleQuestionDragStart = (event: DragEvent<HTMLElement>, questionId: string) => {
    if (readOnly || isMobile) return;
    setDragQuestionId(questionId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", questionId);
  };

  const handleQuestionDrop = (event: DragEvent<HTMLElement>, targetId: string) => {
    if (readOnly) return;
    event.preventDefault();
    const sourceId = dragQuestionId || event.dataTransfer.getData("text/plain");
    if (!sourceId) return;
    reorderQuestions(sourceId, targetId);
    setDragQuestionId(null);
  };

  const addQuestion = () => {
    const question = createEmptyQuestion();
    setQuestions((prev) => [...prev, question]);
    setActiveQuestionId(question.id);
    setQuestionsPage(totalQuestionsPages + 1);
  };

  const removeQuestion = (questionId: string) => {
    setQuestions((prev) => {
      if (prev.length === 1) return prev;
      const next = prev.filter((question) => question.id !== questionId);
      if (questionId === activeQuestionId) {
        setActiveQuestionId(next[0]?.id ?? null);
      }
      return next;
    });
  };

  const handleUploadAttachments = async (files: FileList | null) => {
    if (!files || !activeQuestion || readOnly) return;
    const accepted = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (accepted.length === 0) return;
    const prepared = await Promise.all(
      accepted.map(async (file) => ({
        id: generateId(),
        name: file.name,
        url: await fileToDataUrl(file),
        type: "image" as const,
      }))
    );
    updateQuestion(activeQuestion.id, {
      prompt: {
        ...activeQuestion.prompt,
        attachments: [...(activeQuestion.prompt.attachments ?? []), ...prepared],
      },
    });
  };

  const validateTemplate = (
    status: "draft" | "published",
    source: TemplateSource
  ) => {
    if (status === "draft") {
      if (
        !hasTemplateContent({
          title: source.title,
          description: source.description,
          questions: source.questions,
        })
      ) {
        return "Добавьте хотя бы тему или один вопрос, чтобы сохранить черновик.";
      }
      return null;
    }

    if (!source.title.trim()) return "Укажите тему теста.";
    const parsedDuration = parseDurationMinutes(source.durationMinutes);
    if (!parsedDuration) return "Укажите длительность теста в минутах.";
    if (source.questions.length === 0) return "Добавьте хотя бы один вопрос.";

    const invalid = source.questions.find(
      (question) =>
        !question.prompt.text.trim() ||
        !String(question.answerSpec.expected).trim() ||
        !question.feedback.explanation.trim()
    );
    if (invalid) {
      return "Каждый вопрос должен содержать текст, правильный ответ и пояснение.";
    }
    return null;
  };

  const persistTemplate = async (
    status: "draft" | "published",
    options?: { silent?: boolean },
    sourceOverride?: TemplateSource
  ) => {
    const source: TemplateSource =
      sourceOverride ?? {
        templateId: templateIdRef.current ?? templateId,
        title,
        description,
        assessmentKind,
        durationMinutes,
        questions,
      };

    const validationError = validateTemplate(status, source);
    if (validationError) {
      setError(validationError);
      return null;
    }

    setSaving(true);
    setError(null);

    try {
      const parsedDuration =
        parseDurationMinutes(source.durationMinutes) ?? (status === "draft" ? 0 : 1);
      const preparedQuestions = source.questions.map((question) => {
        const expected = String(question.answerSpec.expected ?? "");
        const detectedType = detectAssessmentAnswerType(expected);
        const questionWithoutTopic = { ...question };
        delete questionWithoutTopic.topicId;
        return {
          ...questionWithoutTopic,
          answerSpec: {
            ...question.answerSpec,
            type: detectedType,
            expected,
            tolerance:
              detectedType === "number" ? question.answerSpec.tolerance : undefined,
          },
        };
      });

      const saved = await saveAssessmentTemplate({
        id: source.templateId ?? undefined,
        title: source.title,
        description: source.description,
        assessmentKind: source.assessmentKind,
        durationMinutes: parsedDuration,
        createdByTeacherId: teacherId,
        questions: preparedQuestions,
        recommendationMap: undefined,
        status,
      });
      setTemplateId(saved.id);
      templateIdRef.current = saved.id;
      setQuestions(saved.questions);
      snapshotRef.current = buildSnapshot({
        templateId: saved.id,
        title: saved.title,
        description: saved.description ?? "",
        assessmentKind: saved.assessmentKind,
        durationMinutes: String(saved.durationMinutes),
        questions: saved.questions,
      });
      latestStateRef.current = {
        title: saved.title,
        description: saved.description ?? "",
        assessmentKind: saved.assessmentKind,
        durationMinutes: String(saved.durationMinutes),
        questions: saved.questions,
      };
      if (!options?.silent) {
        onSaved?.(saved);
      }
      return saved;
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Не удалось сохранить шаблон теста."
      );
      return null;
    } finally {
      setSaving(false);
    }
  };

  const autoSaveDraft = async () => {
    if (readOnly || autosaveInProgressRef.current) return;
    const latest = latestStateRef.current;
    const latestSnapshot = buildSnapshot({
      templateId: templateIdRef.current,
      title: latest.title,
      description: latest.description,
      assessmentKind: latest.assessmentKind,
      durationMinutes: latest.durationMinutes,
      questions: latest.questions,
    });
    if (latestSnapshot === snapshotRef.current) return;
    if (
      !hasTemplateContent({
        title: latest.title,
        description: latest.description,
        questions: latest.questions,
      })
    ) {
      return;
    }
    autosaveInProgressRef.current = true;
    try {
      await persistTemplate(
        "draft",
        { silent: true },
        {
          templateId: templateIdRef.current,
          title: latest.title,
          description: latest.description,
          assessmentKind: latest.assessmentKind,
          durationMinutes: latest.durationMinutes,
          questions: latest.questions,
        }
      );
    } finally {
      autosaveInProgressRef.current = false;
    }
  };

  autoSaveDraftRef.current = autoSaveDraft;

  const hasUnsavedChanges =
    buildSnapshot({
      templateId: templateIdRef.current,
      title,
      description,
      assessmentKind,
      durationMinutes,
      questions,
    }) !== snapshotRef.current;

  const handleBack = async () => {
    if (!readOnly && hasUnsavedChanges) {
      setCloseConfirmOpen(true);
      return;
    }
    if (!readOnly) {
      skipUnmountAutosaveRef.current = true;
      await autoSaveDraft();
    }
    onCancel?.();
  };

  useEffect(() => {
    latestStateRef.current = {
      title,
      description,
      assessmentKind,
      durationMinutes,
      questions,
    };
  }, [title, description, assessmentKind, durationMinutes, questions]);

  useEffect(() => {
    templateIdRef.current = templateId;
  }, [templateId]);

  useEffect(() => {
    if (!activeQuestionId && questions.length > 0) {
      setActiveQuestionId(questions[0].id);
    }
  }, [activeQuestionId, questions]);

  useEffect(() => {
    setQuestionsPage((prev) => Math.min(prev, totalQuestionsPages));
  }, [totalQuestionsPages]);

  useEffect(() => {
    if (!activeQuestionId) return;
    const index = questions.findIndex((question) => question.id === activeQuestionId);
    if (index < 0) return;
    const targetPage = Math.floor(index / questionsPageSize) + 1;
    if (targetPage !== safeQuestionsPage) {
      setQuestionsPage(targetPage);
    }
  }, [activeQuestionId, questions, questionsPageSize, safeQuestionsPage]);

  useEffect(() => {
    if (readOnly) return;
    return () => {
      if (skipUnmountAutosaveRef.current) return;
      void autoSaveDraftRef.current();
    };
  }, [readOnly]);

  const detectedAnswerType = activeQuestion
    ? detectAssessmentAnswerType(String(activeQuestion.answerSpec.expected ?? ""))
    : "text";

  return (
    <div className="assessment-editor">
      <div className="assessment-editor__head">
        <div className="assessment-editor__head-main">
          <IconButton
            className="assessment-editor__back"
            onClick={() => {
              void handleBack();
            }}
            aria-label="Назад"
          >
            <ArrowBackRoundedIcon />
          </IconButton>
          <div>
            <h1>{initialTemplate ? "Редактор теста" : "Создание теста"}</h1>
            <p>
              {readOnly
                ? "Режим просмотра опубликованного шаблона."
                : "Тест можно сохранить в черновик или сразу опубликовать."}
            </p>
          </div>
        </div>
        {!readOnly && (
          <Button
            startIcon={<SaveRoundedIcon />}
            variant="contained"
            disabled={saving}
            onClick={() => setSaveDecisionOpen(true)}
          >
            Сохранить шаблон
          </Button>
        )}
      </div>

      {error ? <Alert severity="error">{error}</Alert> : null}

      <div className="assessment-editor__grid">
        <aside className="assessment-editor__panel assessment-editor__panel--list">
          <div className="assessment-editor__meta">
            <TextField
              label="Тема теста"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              fullWidth
              disabled={readOnly}
              size="small"
            />
            <TextField
              label="Описание"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              multiline
              minRows={2}
              fullWidth
              disabled={readOnly}
              size="small"
            />
            <div className="assessment-editor__kind">
              <span className="assessment-editor__kind-label">Формат проверки</span>
              <div className="assessment-editor__kind-options">
                <Button
                  size="small"
                  variant={assessmentKind === "credit" ? "contained" : "outlined"}
                  onClick={() => setAssessmentKind("credit")}
                  disabled={readOnly}
                >
                  Зачет
                </Button>
                <Button
                  size="small"
                  variant={assessmentKind === "exam" ? "contained" : "outlined"}
                  onClick={() => setAssessmentKind("exam")}
                  disabled={readOnly}
                >
                  Экзамен
                </Button>
              </div>
            </div>
            <TextField
              label="Длительность (мин)"
              value={durationMinutes}
              onChange={(event) =>
                setDurationMinutes(event.target.value.replace(/[^\d]/g, ""))
              }
              inputProps={{ inputMode: "numeric", pattern: "[0-9]*" }}
              fullWidth
              disabled={readOnly}
              size="small"
            />
          </div>
          <div className="assessment-editor__panel-head">
            <Typography variant="h6">Вопросы</Typography>
            {!readOnly && (
              <Button size="small" startIcon={<AddRoundedIcon />} onClick={addQuestion}>
                Добавить
              </Button>
            )}
          </div>
          <Stack spacing={1}>
            {pagedQuestions.map((question) => {
              const index = questions.findIndex((entry) => entry.id === question.id);
              return (
              <article
                key={question.id}
                className={`assessment-editor__question-item ${
                  question.id === activeQuestionId ? "is-active" : ""
                }`}
                draggable={!readOnly && !isMobile}
                onDragStart={(event) => handleQuestionDragStart(event, question.id)}
                onDragEnd={() => setDragQuestionId(null)}
                onDragOver={(event) => {
                  if (readOnly) return;
                  event.preventDefault();
                }}
                onDrop={(event) => handleQuestionDrop(event, question.id)}
              >
                <button
                  type="button"
                  className="assessment-editor__question-main"
                  onClick={() => setActiveQuestionId(question.id)}
                >
                  <strong>{index + 1}.</strong>
                  <span>{getQuestionCardLabel(question)}</span>
                </button>
                <span className="assessment-editor__question-actions">
                  {!readOnly && isMobile && (
                    <>
                      <IconButton
                        size="small"
                        aria-label="Поднять вопрос"
                        onClick={() => moveQuestion(question.id, "up")}
                        disabled={index === 0}
                      >
                        <ArrowUpwardRoundedIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label="Опустить вопрос"
                        onClick={() => moveQuestion(question.id, "down")}
                        disabled={index === questions.length - 1}
                      >
                        <ArrowDownwardRoundedIcon fontSize="small" />
                      </IconButton>
                    </>
                  )}
                  <IconButton
                    size="small"
                    aria-label="Редактировать вопрос"
                    onClick={() => setActiveQuestionId(question.id)}
                  >
                    <EditRoundedIcon fontSize="small" />
                  </IconButton>
                  {!readOnly && (
                    <IconButton
                      size="small"
                      aria-label="Удалить вопрос"
                      onClick={() => setDeleteQuestionId(question.id)}
                      disabled={questions.length === 1}
                    >
                      <DeleteOutlineRoundedIcon fontSize="small" />
                    </IconButton>
                  )}
                </span>
              </article>
              );
            })}
          </Stack>
          {questions.length > questionsPageSize ? (
            <ListPagination
              page={safeQuestionsPage}
              totalItems={questions.length}
              pageSize={questionsPageSize}
              onPageChange={setQuestionsPage}
            />
          ) : null}
        </aside>

        <section className="assessment-editor__panel assessment-editor__panel--rules">
          <Typography variant="h6">Редактор вопроса</Typography>
          {!activeQuestion ? (
            <Alert severity="info" sx={{ mt: 1.5 }}>
              Выберите вопрос из списка слева, чтобы заполнить поля.
            </Alert>
          ) : (
            <Stack spacing={2} sx={{ mt: 1.5 }}>
              <TextField
                label="Вопрос"
                value={activeQuestion.prompt.text}
                onChange={(event) =>
                  updateQuestion(activeQuestion.id, {
                    prompt: {
                      ...activeQuestion.prompt,
                      text: event.target.value,
                    },
                  })
                }
                multiline
                minRows={4}
                fullWidth
                disabled={readOnly}
                className="assessment-editor__field-compact"
                size="small"
              />
              {!readOnly && (
                <Button component="label" variant="outlined">
                  Загрузить изображение
                  <input
                    hidden
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) => {
                      void handleUploadAttachments(event.target.files);
                      event.currentTarget.value = "";
                    }}
                  />
                </Button>
              )}
              {(activeQuestion.prompt.attachments ?? []).length > 0 && (
                <div className="assessment-editor__attachments">
                  {(activeQuestion.prompt.attachments ?? []).map((attachment) => (
                    <figure key={attachment.id} className="assessment-editor__attachment">
                      <a
                        href={attachment.url}
                        onClick={(event) => {
                          event.preventDefault();
                          setPreviewAttachment({
                            name: attachment.name,
                            url: attachment.url,
                          });
                        }}
                        className="assessment-editor__attachment-preview"
                      >
                        <img src={attachment.url} alt={attachment.name} />
                      </a>
                      <figcaption>
                        <a href={attachment.url} download={attachment.name}>
                          {attachment.name}
                        </a>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}

              <Divider />

              <TextField
                label="Правильный ответ"
                value={String(activeQuestion.answerSpec.expected ?? "")}
                onChange={(event) => updateActiveExpected(event.target.value)}
                fullWidth
                disabled={readOnly}
                className="assessment-editor__field-compact"
                size="small"
              />
              {detectedAnswerType === "number" && (
                <TextField
                  label="Допуск (опционально)"
                  value={String(activeQuestion.answerSpec.tolerance?.value ?? "")}
                  onChange={(event) => updateActiveTolerance(event.target.value)}
                  fullWidth
                  disabled={readOnly}
                  className="assessment-editor__field-compact"
                  size="small"
                />
              )}
              <TextField
                label="Пояснение после проверки"
                value={activeQuestion.feedback.explanation}
                onChange={(event) =>
                  updateQuestion(activeQuestion.id, {
                    feedback: {
                      ...activeQuestion.feedback,
                      explanation: event.target.value,
                    },
                  })
                }
                multiline
                minRows={3}
                fullWidth
                disabled={readOnly}
                className="assessment-editor__field-compact"
                size="small"
              />
            </Stack>
          )}
        </section>
      </div>

      <Dialog
        open={saveDecisionOpen}
        onClose={() => setSaveDecisionOpen(false)}
        maxWidth="xs"
        fullWidth
        className="ui-dialog ui-dialog--compact"
      >
        <DialogTitle>Как сохранить шаблон?</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">
            Выберите статус: черновик можно доработать позже, опубликованный шаблон
            доступен для добавления в курсы.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDecisionOpen(false)}>Отмена</Button>
          <Button
            variant="outlined"
            onClick={async () => {
              const saved = await persistTemplate("draft");
              if (saved) {
                setSaveDecisionOpen(false);
              }
            }}
            disabled={saving}
          >
            Сохранить как черновик
          </Button>
          <Button
            variant="contained"
            onClick={async () => {
              const saved = await persistTemplate("published");
              if (saved) {
                setSaveDecisionOpen(false);
              }
            }}
            disabled={saving}
          >
            Опубликовать
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(previewAttachment)}
        onClose={() => setPreviewAttachment(null)}
        maxWidth="md"
        fullWidth
        className="ui-dialog ui-dialog--wide"
      >
        <DialogTitle>
          {previewAttachment?.name ?? "Просмотр изображения"}
        </DialogTitle>
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
        <DialogActions>
          <Button onClick={() => setPreviewAttachment(null)}>Закрыть</Button>
          {previewAttachment ? (
            <Button
              component="a"
              href={previewAttachment.url}
              download={previewAttachment.name}
            >
              Скачать
            </Button>
          ) : null}
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteQuestionId)}
        title="Удалить вопрос?"
        description="Вопрос будет удален из шаблона теста. Действие можно отменить до сохранения шаблона."
        confirmText="Удалить"
        danger
        onCancel={() => setDeleteQuestionId(null)}
        onConfirm={() => {
          if (!deleteQuestionId) return;
          removeQuestion(deleteQuestionId);
          setDeleteQuestionId(null);
        }}
      />

      <Dialog
        open={closeConfirmOpen}
        onClose={() => setCloseConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
        className="ui-dialog ui-dialog--compact"
      >
        <DialogTitle>Выйти из редактора теста?</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">
            Есть несохраненные изменения. Можно сохранить черновик и выйти или
            закрыть редактор без сохранения.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCloseConfirmOpen(false)}>Отмена</Button>
          <Button
            variant="contained"
            onClick={() => {
              void (async () => {
                setCloseActionLoading(true);
                try {
                  skipUnmountAutosaveRef.current = true;
                  await autoSaveDraft();
                  onCancel?.();
                } finally {
                  setCloseActionLoading(false);
                  setCloseConfirmOpen(false);
                }
              })();
            }}
            disabled={closeActionLoading}
          >
            Сохранить и выйти
          </Button>
          <Button
            color="warning"
            onClick={() => {
              skipUnmountAutosaveRef.current = true;
              setCloseConfirmOpen(false);
              onCancel?.();
            }}
            disabled={closeActionLoading}
          >
            Выйти без сохранения
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
