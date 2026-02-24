import { Typography } from "@mui/material";
import type { AssistantChecklistItem } from "@/shared/api/assistant-contracts";

type ChecklistBlockProps = {
  title?: string;
  items: AssistantChecklistItem[];
};

export function ChecklistBlock({ title, items }: ChecklistBlockProps) {
  return (
    <article className="assistant-block assistant-block--checklist">
      {title ? <Typography className="assistant-block__title">{title}</Typography> : null}
      <ul className="assistant-checklist">
        {items.map((item) => (
          <li
            key={item.id}
            className={`assistant-checklist__item ${item.checked ? "is-checked" : ""} ${item.severity ? `is-${item.severity}` : ""}`}
          >
            <span className="assistant-checklist__marker" aria-hidden="true" />
            <Typography component="span" className="assistant-checklist__label">
              {item.label}
            </Typography>
          </li>
        ))}
      </ul>
    </article>
  );
}
