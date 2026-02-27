import {
  Button,
  Chip,
  Dialog,
  DialogContent,
  Stack,
  Typography,
} from "@mui/material";
import { DialogTitleWithClose } from "@/shared/ui/DialogTitleWithClose";
import type { TestTemplate } from "@/features/assessments/model/types";

type Props = {
  open: boolean;
  template: TestTemplate | null;
  onClose: () => void;
};

export function TestTemplatePreviewDialog({ open, template, onClose }: Props) {
  const stringifyExpected = (value: string | string[]) =>
    Array.isArray(value) ? value.join(", ") : value;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      className="ui-dialog ui-dialog--wide"
    >
      <DialogTitleWithClose
        title={template?.title ?? "Предпросмотр теста"}
        onClose={onClose}
        closeAriaLabel="Закрыть предпросмотр"
      />
      <DialogContent>
        {!template ? (
          <Typography color="text.secondary">Шаблон не выбран.</Typography>
        ) : (
          <Stack spacing={2}>
            {template.description ? (
              <Typography color="text.secondary">{template.description}</Typography>
            ) : null}
            <Chip
              size="small"
              label={template.status === "published" ? "Опубликован" : "Черновик"}
              color={template.status === "published" ? "success" : "warning"}
              sx={{ alignSelf: "flex-start" }}
            />
            <Chip
              size="small"
              label={template.assessmentKind === "exam" ? "Экзамен" : "Зачет"}
              color={template.assessmentKind === "exam" ? "error" : "info"}
              sx={{ alignSelf: "flex-start" }}
            />
            <Typography variant="body2" color="text.secondary">
              Время прохождения: {template.durationMinutes} мин.
            </Typography>
            {template.questions.map((question, index) => (
              <article key={question.id} className="assessment-template-preview__question">
                <Typography fontWeight={700}>
                  {index + 1}. {question.prompt.text}
                </Typography>
                <Stack spacing={0.6} sx={{ mt: 0.9 }}>
                  <Typography variant="body2" color="text.secondary">
                    Правильный ответ: {stringifyExpected(question.answerSpec.expected)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Пояснение: {question.feedback.explanation || "—"}
                  </Typography>
                </Stack>
                {(question.prompt.attachments ?? []).length > 0 ? (
                  <Stack
                    direction="row"
                    spacing={1}
                    flexWrap="wrap"
                    sx={{ mt: 1 }}
                    className="assessment-template-preview__attachments"
                  >
                    {(question.prompt.attachments ?? []).map((attachment) => (
                      <article
                        key={attachment.id}
                        className="assessment-template-preview__attachment"
                      >
                        {attachment.type === "image" ? (
                          <a
                            href={attachment.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="assessment-template-preview__attachment-image-link"
                          >
                            <img src={attachment.url} alt={attachment.name} />
                          </a>
                        ) : null}
                        <div className="assessment-template-preview__attachment-meta">
                          <Typography variant="caption">{attachment.name}</Typography>
                          <Button
                            size="small"
                            variant="outlined"
                            component="a"
                            href={attachment.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Открыть
                          </Button>
                        </div>
                      </article>
                    ))}
                  </Stack>
                ) : null}
              </article>
            ))}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
