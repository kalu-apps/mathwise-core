import SendRoundedIcon from "@mui/icons-material/SendRounded";
import OpenInFullRoundedIcon from "@mui/icons-material/OpenInFullRounded";
import RemoveRoundedIcon from "@mui/icons-material/RemoveRounded";
import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import { IconButton, Typography } from "@mui/material";
import type { AssistantAction, AssistantUiState } from "@/shared/api/assistant-contracts";

type AssistantDockProps = {
  open: boolean;
  state: AssistantUiState;
  message: string;
  placeholder?: string;
  quickActions: AssistantAction[];
  onMessageChange: (value: string) => void;
  onSubmit: () => void;
  onAction: (action: AssistantAction) => void;
  onToggleOpen: () => void;
  onOpenPanel: () => void;
};

export function AssistantDock({
  open,
  state,
  message,
  placeholder = "Сформулируйте задачу для Аксиома",
  quickActions,
  onMessageChange,
  onSubmit,
  onAction,
  onToggleOpen,
  onOpenPanel,
}: AssistantDockProps) {
  const isBusy = state === "thinking" || state === "streaming";

  return (
    <section className={`assistant-dock ${open ? "is-open" : ""} is-${state}`}>
      <header className="assistant-dock__row">
        <div className="assistant-dock__identity">
          <span className="assistant-dock__orb" aria-hidden="true" />
          <div>
            <Typography className="assistant-dock__title">Аксиом</Typography>
            <Typography className="assistant-dock__subtitle">
              {isBusy ? "AI думает..." : "Готов к анализу"}
            </Typography>
          </div>
        </div>
        <div className="assistant-dock__controls">
          <IconButton aria-label="Открыть панель" onClick={onOpenPanel}>
            <OpenInFullRoundedIcon fontSize="inherit" />
          </IconButton>
          <IconButton aria-label={open ? "Свернуть" : "Развернуть"} onClick={onToggleOpen}>
            {open ? <RemoveRoundedIcon fontSize="inherit" /> : <AutorenewRoundedIcon fontSize="inherit" />}
          </IconButton>
        </div>
      </header>

      {open ? (
        <>
          <div className="assistant-dock__input-wrap">
            <textarea
              value={message}
              onChange={(event) => onMessageChange(event.target.value)}
              placeholder={placeholder}
              rows={1}
              aria-label="Сообщение ассистенту"
            />
            <IconButton
              aria-label="Отправить запрос"
              onClick={onSubmit}
              disabled={!message.trim() || isBusy}
            >
              <SendRoundedIcon fontSize="inherit" />
            </IconButton>
          </div>

          <div className="assistant-dock__chips" role="list">
            {quickActions.map((action) => (
              <button
                key={action.id}
                type="button"
                className="assistant-dock__chip"
                onClick={() => onAction(action)}
              >
                {action.label}
              </button>
            ))}
          </div>

          <span className={`assistant-dock__progress ${isBusy ? "is-running" : ""}`} aria-hidden="true" />
        </>
      ) : null}
    </section>
  );
}
