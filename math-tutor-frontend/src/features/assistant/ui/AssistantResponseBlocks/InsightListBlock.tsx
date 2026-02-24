import { Typography } from "@mui/material";
import type { AssistantInsight } from "@/shared/api/assistant-contracts";

type InsightListBlockProps = {
  title?: string;
  items: AssistantInsight[];
};

export function InsightListBlock({ title, items }: InsightListBlockProps) {
  return (
    <article className="assistant-block assistant-block--insights">
      {title ? <Typography className="assistant-block__title">{title}</Typography> : null}
      <div className="assistant-insight-list">
        {items.map((item) => (
          <section key={item.id} className="assistant-insight-card">
            <header>
              <Typography className="assistant-insight-card__problem">{item.problem}</Typography>
              <span className={`assistant-priority-badge priority-${item.priority}`}>P{item.priority}</span>
            </header>
            <Typography className="assistant-insight-card__evidence">{item.evidence}</Typography>
            <Typography className="assistant-insight-card__action">{item.action}</Typography>
          </section>
        ))}
      </div>
    </article>
  );
}
