import { Button, Typography } from "@mui/material";
import type { AssistantRecommendation } from "@/shared/api/assistant-contracts";

type RecommendationListBlockProps = {
  title?: string;
  items: AssistantRecommendation[];
  onFollowRecommendation?: (item: AssistantRecommendation) => void;
};

export function RecommendationListBlock({
  title,
  items,
  onFollowRecommendation,
}: RecommendationListBlockProps) {
  return (
    <article className="assistant-block assistant-block--recommendations">
      {title ? <Typography className="assistant-block__title">{title}</Typography> : null}
      <div className="assistant-recommendation-list">
        {items.map((item) => (
          <section key={item.id} className={`assistant-recommendation-card priority-${item.priority}`}>
            <header>
              <Typography className="assistant-recommendation-card__title">{item.title}</Typography>
              <span className="assistant-recommendation-card__type">{item.type}</span>
            </header>
            <Typography className="assistant-recommendation-card__reason">{item.reason}</Typography>
            <div className="assistant-recommendation-card__footer">
              <span className="assistant-priority-badge">Приоритет {item.priority}</span>
              <Button
                size="small"
                variant="outlined"
                className="assistant-recommendation-card__cta"
                onClick={() => onFollowRecommendation?.(item)}
              >
                {item.cta.label}
              </Button>
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
