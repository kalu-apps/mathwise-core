import { Skeleton, Typography } from "@mui/material";
import type {
  AssistantAction,
  AssistantEntityLink,
  AssistantRecommendation,
  AssistantResponseBlock,
} from "@/shared/api/assistant-contracts";
import { ChecklistBlock } from "@/features/assistant/ui/AssistantResponseBlocks/ChecklistBlock";
import { EntityLinksBlock } from "@/features/assistant/ui/AssistantResponseBlocks/EntityLinksBlock";
import { InsightListBlock } from "@/features/assistant/ui/AssistantResponseBlocks/InsightListBlock";
import { KPIGridBlock } from "@/features/assistant/ui/AssistantResponseBlocks/KPIGridBlock";
import { QuickActionsBlock } from "@/features/assistant/ui/AssistantResponseBlocks/QuickActionsBlock";
import { RecommendationListBlock } from "@/features/assistant/ui/AssistantResponseBlocks/RecommendationListBlock";
import { TextBlock } from "@/features/assistant/ui/AssistantResponseBlocks/TextBlock";

type AssistantResponseRendererProps = {
  blocks: AssistantResponseBlock[];
  loading?: boolean;
  error?: string | null;
  emptyLabel?: string;
  onAction: (action: AssistantAction) => void;
  onRecommendation: (item: AssistantRecommendation) => void;
  onEntityLink: (item: AssistantEntityLink) => void;
};

export function AssistantResponseRenderer({
  blocks,
  loading = false,
  error,
  emptyLabel = "Пока нет рекомендаций. Запустите анализ или задайте вопрос.",
  onAction,
  onRecommendation,
  onEntityLink,
}: AssistantResponseRendererProps) {
  if (loading) {
    return (
      <div className="assistant-blocks assistant-blocks--loading" aria-busy="true" aria-live="polite">
        <Skeleton variant="rounded" height={72} />
        <Skeleton variant="rounded" height={112} />
        <Skeleton variant="rounded" height={96} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="assistant-state assistant-state--error" role="alert">
        <Typography>{error}</Typography>
      </div>
    );
  }

  if (blocks.length === 0) {
    return (
      <div className="assistant-state assistant-state--empty">
        <Typography>{emptyLabel}</Typography>
      </div>
    );
  }

  return (
    <div className="assistant-blocks" aria-live="polite">
      {blocks.map((block) => {
        switch (block.type) {
          case "text":
            return (
              <TextBlock
                key={block.id}
                title={block.title}
                text={block.text}
                tone={block.tone}
              />
            );
          case "warning_banner":
            return (
              <TextBlock
                key={block.id}
                title={block.title}
                text={block.message}
                tone="warning"
              />
            );
          case "recommendation_list":
            return (
              <RecommendationListBlock
                key={block.id}
                title={block.title}
                items={block.items}
                onFollowRecommendation={onRecommendation}
              />
            );
          case "kpi_cards":
            return <KPIGridBlock key={block.id} title={block.title} items={block.items} />;
          case "insight_list":
            return <InsightListBlock key={block.id} title={block.title} items={block.items} />;
          case "checklist":
            return <ChecklistBlock key={block.id} title={block.title} items={block.items} />;
          case "quick_actions":
            return (
              <QuickActionsBlock
                key={block.id}
                title={block.title}
                actions={block.actions}
                onAction={onAction}
              />
            );
          case "entity_links":
            return (
              <EntityLinksBlock
                key={block.id}
                title={block.title}
                links={block.links}
                onOpen={onEntityLink}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
