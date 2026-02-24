import { useEffect, useState } from "react";
import { Alert } from "@mui/material";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/features/auth/model/AuthContext";
import { getAssessmentTemplateById } from "@/features/assessments/model/storage";
import type { TestTemplate } from "@/features/assessments/model/types";
import { TestTemplateEditor } from "@/features/assessments/ui/TestTemplateEditor";
import { PageLoader } from "@/shared/ui/loading";

export default function TeacherTestEditorPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { templateId } = useParams<{ templateId: string }>();
  const readOnly = searchParams.get("mode") === "preview";
  const [template, setTemplate] = useState<TestTemplate | null>(null);
  const [loading, setLoading] = useState(Boolean(templateId && templateId !== "new"));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!templateId || templateId === "new") {
      setTemplate(null);
      setLoading(false);
      return;
    }

    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const found = await getAssessmentTemplateById(templateId);
        if (!active) return;
        if (!found) {
          setError("Шаблон теста не найден.");
          setTemplate(null);
          return;
        }
        setTemplate(found);
      } catch {
        if (!active) return;
        setError("Не удалось загрузить шаблон теста.");
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
  }, [templateId]);

  if (!user) return null;

  if (loading) {
    return (
      <PageLoader
        minHeight={280}
        title="Загрузка шаблона теста"
        description="Подготавливаем редактор..."
      />
    );
  }

  return (
    <section className="assessment-editor-page">
      <div className="assessment-editor-page__panel">
        {error ? <Alert severity="error">{error}</Alert> : null}
        <TestTemplateEditor
          teacherId={user.id}
          initialTemplate={template}
          readOnly={readOnly}
          onCancel={() => {
            const backTo =
              typeof location.state === "object" &&
              location.state &&
              "backTo" in location.state
                ? String((location.state as { backTo?: string }).backTo ?? "")
                : "";
            navigate(backTo || "/teacher/tests");
          }}
          onSaved={() => navigate("/teacher/tests")}
        />
      </div>
    </section>
  );
}
