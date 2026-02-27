import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import PublishRoundedIcon from "@mui/icons-material/PublishRounded";
import { useAuth } from "@/features/auth/model/AuthContext";
import {
  deleteAssessmentTemplate,
  getAssessmentTemplatesByTeacher,
  publishAssessmentTemplate,
} from "@/features/assessments/model/storage";
import type { TestTemplate } from "@/features/assessments/model/types";
import { TestTemplatePreviewDialog } from "@/features/assessments/ui/TestTemplatePreviewDialog";
import { subscribeAppDataUpdates } from "@/shared/lib/subscribeAppDataUpdates";
import { ListSkeleton } from "@/shared/ui/loading";
import { ListPagination } from "@/shared/ui/ListPagination";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";

export default function TeacherTestTemplatesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TestTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"published" | "draft">("published");
  const [page, setPage] = useState(1);
  const [previewTemplate, setPreviewTemplate] = useState<TestTemplate | null>(null);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    description: string;
    confirmText?: string;
    danger?: boolean;
    action: () => Promise<void> | void;
  } | null>(null);
  const pageSize = 9;

  const teacherId = user?.id ?? "";

  const loadTemplates = useCallback(async () => {
    if (!teacherId) return;
    try {
      setLoading(true);
      setError(null);
      const result = await getAssessmentTemplatesByTeacher(teacherId);
      setTemplates(result);
    } catch {
      setError("Не удалось загрузить шаблоны тестов.");
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    void loadTemplates();
    const unsubscribe = subscribeAppDataUpdates(() => {
      void loadTemplates();
    });
    return () => {
      unsubscribe();
    };
  }, [loadTemplates]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return templates.filter((template) => {
      const byQuery = normalized
        ? template.title.toLowerCase().includes(normalized)
        : true;
      const byStatus = template.status === statusFilter;
      return byQuery && byStatus;
    });
  }, [query, statusFilter, templates]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedTemplates = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage]);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter]);

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const handleDelete = async (template: TestTemplate) => {
    if (!teacherId) return;
    setConfirmState({
      title: "Удалить тест из базы?",
      description:
        "Тест исчезнет только из реестра базы тестов и не удалится из уже добавленных курсов. Если тест используется в купленных курсах, удаление будет заблокировано.",
      confirmText: "Удалить",
      danger: true,
      action: async () => {
        try {
          await deleteAssessmentTemplate(template.id, teacherId);
          await loadTemplates();
        } catch (deleteError) {
          setError(
            deleteError instanceof Error
              ? deleteError.message
              : "Не удалось удалить шаблон."
          );
        }
      },
    });
  };

  const handlePublish = async (template: TestTemplate) => {
    if (!teacherId) return;
    setConfirmState({
      title: "Опубликовать тест?",
      description:
        "После публикации тест станет доступен для добавления в курсы через окно создания курса.",
      confirmText: "Опубликовать",
      action: async () => {
        try {
          await publishAssessmentTemplate(template.id, teacherId);
          await loadTemplates();
        } catch (publishError) {
          setError(
            publishError instanceof Error
              ? publishError.message
              : "Не удалось опубликовать шаблон."
          );
        }
      },
    });
  };

  return (
    <section className="assessment-templates-page">
      <header className="assessment-templates-page__panel assessment-templates-page__panel--hero">
        <div className="assessment-templates-page__header">
          <IconButton
            className="assessment-templates-page__back"
            onClick={() => navigate("/teacher/profile?tab=courses")}
            aria-label="Вернуться к курсам"
          >
            <ArrowBackRoundedIcon />
          </IconButton>
          <div>
            <h1>База тестов</h1>
            <p>
              Реестр шаблонов для курсов: поиск работает сразу по опубликованным
              и черновикам.
            </p>
          </div>
          <Button
            variant="contained"
            startIcon={<AddRoundedIcon />}
            onClick={() => navigate("/teacher/tests/new")}
          >
            Создать тест
          </Button>
        </div>
      </header>

      <section className="assessment-templates-page__panel assessment-templates-page__panel--search">
        <div className="assessment-templates-page__filters">
          <TextField
            placeholder="Поиск шаблона"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            fullWidth
            InputProps={{
              endAdornment: query ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    aria-label="Очистить поиск"
                    onClick={() => setQuery("")}
                  >
                    <CloseRoundedIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />
        </div>
      </section>

      <section className="assessment-templates-page__panel assessment-templates-page__panel--list">
        <div className="assessment-templates-page__list-toolbar">
          <button
            type="button"
            className={`assessment-templates-page__filter-button ${
              statusFilter === "published" ? "is-active" : ""
            }`}
            onClick={() => setStatusFilter("published")}
          >
            Опубликованы
          </button>
          <button
            type="button"
            className={`assessment-templates-page__filter-button ${
              statusFilter === "draft" ? "is-active" : ""
            }`}
            onClick={() => setStatusFilter("draft")}
          >
            Черновики
          </button>
        </div>
        {error ? <Alert severity="error">{error}</Alert> : null}

        {loading ? (
          <ListSkeleton count={3} itemHeight={108} />
        ) : filtered.length === 0 ? (
          <Alert severity="info">Нет шаблонов по текущему фильтру.</Alert>
        ) : (
          <div className="assessment-templates-page__list">
            {pagedTemplates.map((template) => (
              <article key={template.id} className="assessment-templates-page__card">
                <div className="assessment-templates-page__card-main">
                  <Typography variant="h6">{template.title}</Typography>
                  <span
                    className={`assessment-templates-page__status ui-status-chip ${
                      template.status === "published"
                        ? "ui-status-chip--paid"
                        : "ui-status-chip--scheduled"
                    }`}
                  >
                    {template.status === "published" ? "Опубликован" : "Черновик"}
                  </span>
                  <span
                    className={`assessment-templates-page__status ui-status-chip ${
                      template.assessmentKind === "exam"
                        ? "ui-status-chip--warning"
                        : "ui-status-chip--new"
                    }`}
                  >
                    {template.assessmentKind === "exam" ? "Экзамен" : "Зачет"}
                  </span>
                  <div className="assessment-templates-page__meta">
                    <span>Вопросов: {template.questions.length}</span>
                    <span>
                      Время:{" "}
                      {template.durationMinutes > 0
                        ? `${template.durationMinutes} мин.`
                        : "не задано"}
                    </span>
                  </div>
                </div>
                <div className="assessment-templates-page__card-actions">
                  <IconButton
                    aria-label="Просмотр шаблона"
                    onClick={() => setPreviewTemplate(template)}
                  >
                    <VisibilityRoundedIcon />
                  </IconButton>
                  <IconButton
                    aria-label="Редактировать шаблон"
                    onClick={() => navigate(`/teacher/tests/${template.id}`)}
                  >
                    <EditRoundedIcon />
                  </IconButton>
                  {template.status === "draft" ? (
                    <IconButton
                      aria-label="Опубликовать шаблон"
                      onClick={() => void handlePublish(template)}
                    >
                      <PublishRoundedIcon />
                    </IconButton>
                  ) : null}
                  <IconButton
                    aria-label="Удалить шаблон"
                    onClick={() => void handleDelete(template)}
                  >
                    <DeleteOutlineRoundedIcon />
                  </IconButton>
                </div>
              </article>
            ))}
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <ListPagination
            page={safePage}
            totalItems={filtered.length}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        )}
      </section>

      <TestTemplatePreviewDialog
        open={Boolean(previewTemplate)}
        template={previewTemplate}
        onClose={() => setPreviewTemplate(null)}
      />
      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title ?? ""}
        description={confirmState?.description}
        confirmText={confirmState?.confirmText}
        danger={confirmState?.danger}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => {
          if (!confirmState) return;
          void Promise.resolve(confirmState.action()).finally(() =>
            setConfirmState(null)
          );
        }}
      />
    </section>
  );
}
