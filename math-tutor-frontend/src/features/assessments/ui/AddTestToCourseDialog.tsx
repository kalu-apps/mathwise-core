import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import PreviewRoundedIcon from "@mui/icons-material/PreviewRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import type { TestTemplate } from "@/features/assessments/model/types";
import { getAssessmentTemplatesByTeacher } from "@/features/assessments/model/storage";
import { DialogTitleWithClose } from "@/shared/ui/DialogTitleWithClose";
import { TestTemplatePreviewDialog } from "@/features/assessments/ui/TestTemplatePreviewDialog";
import { subscribeAppDataUpdates } from "@/shared/lib/subscribeAppDataUpdates";

type Props = {
  open: boolean;
  teacherId: string;
  onClose: () => void;
  onAddTemplate: (template: TestTemplate) => void;
};

export function AddTestToCourseDialog({
  open,
  teacherId,
  onClose,
  onAddTemplate,
}: Props) {
  const [templates, setTemplates] = useState<TestTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [previewTemplate, setPreviewTemplate] = useState<TestTemplate | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAssessmentTemplatesByTeacher(teacherId);
      setTemplates(result);
    } catch {
      setError("Не удалось загрузить шаблоны тестов.");
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    if (!open) return;
    void loadTemplates();
    const unsubscribe = subscribeAppDataUpdates(() => {
      void loadTemplates();
    });
    const onStorage = (event: StorageEvent) => {
      if (!event.key) return;
      if (event.key.includes("ASSESSMENTS") || event.key.includes("LOCAL_DB")) {
        void loadTemplates();
      }
    };
    const onFocus = () => {
      void loadTemplates();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);

    return () => {
      unsubscribe();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, [open, loadTemplates]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const published = templates.filter((template) => template.status === "published");
    if (!normalized) return published;
    return published.filter((template) => template.title.toLowerCase().includes(normalized));
  }, [templates, query]);

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="sm"
        fullWidth
        className="ui-dialog ui-dialog--wide"
      >
        <DialogTitleWithClose
          title="Добавить тест в курс"
          onClose={onClose}
          closeAriaLabel="Закрыть окно выбора теста"
        />
        <DialogContent>
          <Stack spacing={2}>
            <Alert severity="info">
              В курс можно добавить только опубликованные шаблоны тестов.
            </Alert>
            <div className="assessment-template-select__search">
              <TextField
                placeholder="Поиск по названию шаблона"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                fullWidth
                InputProps={{
                  endAdornment: query ? (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setQuery("")}
                        size="small"
                        aria-label="Очистить поиск"
                      >
                        <CloseRoundedIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ) : null,
                }}
              />
            </div>

            {error ? <Alert severity="error">{error}</Alert> : null}
            {loading ? (
              <Typography color="text.secondary">Загрузка шаблонов...</Typography>
            ) : filtered.length === 0 ? (
              <Alert severity="info">
                Подходящие шаблоны не найдены. Создайте шаблон на странице "База тестов".
              </Alert>
            ) : (
              <div className="assessment-template-select__list">
                {filtered.map((template) => (
                  <article
                    key={template.id}
                    className="assessment-template-select__item"
                  >
                    <div>
                      <Typography fontWeight={700}>{template.title}</Typography>
                      <Typography color="text.secondary" variant="body2">
                        {template.assessmentKind === "exam" ? "Экзамен" : "Зачет"} • Вопросов:{" "}
                        {template.questions.length}
                      </Typography>
                    </div>
                    <div className="assessment-template-select__actions">
                      <Button
                        size="small"
                        startIcon={<PreviewRoundedIcon fontSize="small" />}
                        onClick={() => setPreviewTemplate(template)}
                      >
                        Просмотр
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => onAddTemplate(template)}
                      >
                        Добавить
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Stack>
        </DialogContent>
      </Dialog>
      <TestTemplatePreviewDialog
        open={Boolean(previewTemplate)}
        template={previewTemplate}
        onClose={() => setPreviewTemplate(null)}
      />
    </>
  );
}
