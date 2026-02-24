import { Button, Typography } from "@mui/material";
import type { AssistantAction } from "@/shared/api/assistant-contracts";

type QuickActionsBlockProps = {
  title?: string;
  actions: AssistantAction[];
  onAction: (action: AssistantAction) => void;
};

export function QuickActionsBlock({ title, actions, onAction }: QuickActionsBlockProps) {
  return (
    <article className="assistant-block assistant-block--quick-actions">
      {title ? <Typography className="assistant-block__title">{title}</Typography> : null}
      <div className="assistant-block__chips">
        {actions.map((action) => (
          <Button
            key={action.id}
            className="assistant-chip"
            variant="outlined"
            onClick={() => onAction(action)}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </article>
  );
}
