import { Typography } from "@mui/material";
import type { AssistantKpiCard } from "@/shared/api/assistant-contracts";

type KPIGridBlockProps = {
  title?: string;
  items: AssistantKpiCard[];
};

export function KPIGridBlock({ title, items }: KPIGridBlockProps) {
  return (
    <article className="assistant-block assistant-block--kpi">
      {title ? <Typography className="assistant-block__title">{title}</Typography> : null}
      <div className="assistant-kpi-grid">
        {items.map((item) => (
          <section key={item.id} className={`assistant-kpi-card ${item.tone ? `is-${item.tone}` : ""}`}>
            <Typography className="assistant-kpi-card__label">{item.label}</Typography>
            <Typography className="assistant-kpi-card__value">{item.value}</Typography>
            {item.trend ? (
              <Typography className="assistant-kpi-card__trend">{item.trend}</Typography>
            ) : null}
          </section>
        ))}
      </div>
    </article>
  );
}
