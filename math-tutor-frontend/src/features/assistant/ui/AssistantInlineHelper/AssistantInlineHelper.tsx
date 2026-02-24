import { Typography } from "@mui/material";
import type { AssistantAction } from "@/shared/api/assistant-contracts";

type AssistantInlineHelperProps = {
  visible: boolean;
  title: string;
  hint?: string;
  actions: AssistantAction[];
  onAction: (action: AssistantAction) => void;
  anchor?: { x: number; y: number } | null;
};

export function AssistantInlineHelper({
  visible,
  title,
  hint,
  actions,
  onAction,
  anchor,
}: AssistantInlineHelperProps) {
  if (!visible) return null;

  const style =
    anchor != null
      ? {
          left: `${anchor.x}px`,
          top: `${anchor.y}px`,
          right: "auto",
          bottom: "auto",
        }
      : undefined;

  return (
    <aside className="assistant-inline-helper" style={style}>
      <span className="assistant-inline-helper__arrow" aria-hidden="true" />
      <Typography className="assistant-inline-helper__title">{title}</Typography>
      {hint ? <Typography className="assistant-inline-helper__hint">{hint}</Typography> : null}
      <div className="assistant-inline-helper__actions">
        {actions.slice(0, 4).map((action) => (
          <button
            key={action.id}
            type="button"
            className="assistant-inline-helper__chip"
            onClick={() => onAction(action)}
          >
            {action.label}
          </button>
        ))}
      </div>
    </aside>
  );
}
