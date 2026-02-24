import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import RemoveRoundedIcon from "@mui/icons-material/RemoveRounded";
import OpenInFullRoundedIcon from "@mui/icons-material/OpenInFullRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import { Typography } from "@mui/material";
import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  AssistantAction,
  AssistantEntityLink,
  AssistantRecommendation,
  AssistantResponseBlock,
  AssistantSessionMessage,
  AssistantUiState,
} from "@/shared/api/assistant-contracts";
import { AssistantResponseRenderer } from "@/features/assistant/ui/AssistantResponseBlocks/AssistantResponseRenderer";

type AssistantPanelProps = {
  open: boolean;
  state: AssistantUiState;
  blocks: AssistantResponseBlock[];
  history: AssistantSessionMessage[];
  quickActions: AssistantAction[];
  message: string;
  loading?: boolean;
  error?: string | null;
  minimized: boolean;
  onClose: () => void;
  onToggleMinimized: () => void;
  onRetry: () => void;
  onSubmit: () => void;
  onMessageChange: (value: string) => void;
  onAction: (action: AssistantAction) => void;
  onRecommendation: (item: AssistantRecommendation) => void;
  onEntityLink: (item: AssistantEntityLink) => void;
};

export function AssistantPanel({
  open,
  state,
  blocks,
  history,
  quickActions,
  message,
  loading = false,
  error,
  minimized,
  onClose,
  onToggleMinimized,
  onRetry,
  onSubmit,
  onMessageChange,
  onAction,
  onRecommendation,
  onEntityLink,
}: AssistantPanelProps) {
  const isBusy = state === "thinking" || state === "streaming" || loading;
  const hasHistory = history.length > 0;
  const panelRef = useRef<HTMLElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const panelStyle = useMemo<CSSProperties | undefined>(() => {
    if (!position) return undefined;
    return {
      left: `${position.x}px`,
      top: `${position.y}px`,
      right: "auto",
      bottom: "auto",
    };
  }, [position]);

  const clampPosition = (x: number, y: number) => {
    const panel = panelRef.current;
    if (!panel) return { x, y };
    const rect = panel.getBoundingClientRect();
    const maxX = Math.max(8, window.innerWidth - rect.width - 8);
    const maxY = Math.max(8, window.innerHeight - rect.height - 8);
    return {
      x: Math.min(Math.max(8, x), maxX),
      y: Math.min(Math.max(8, y), maxY),
    };
  };

  const handleDragStart = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragStateRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleDragMove = (event: ReactPointerEvent<HTMLElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const next = clampPosition(
      event.clientX - dragState.offsetX,
      event.clientY - dragState.offsetY
    );
    setPosition(next);
  };

  const handleDragEnd = (event: ReactPointerEvent<HTMLElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    setDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <aside
      ref={panelRef}
      style={panelStyle}
      className={`assistant-panel ${open ? "is-open" : ""} ${minimized ? "is-minimized" : ""} ${
        dragging ? "is-dragging" : ""
      } is-${state}`}
    >
      <header
        className="assistant-panel__head"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <div className="assistant-panel__title-wrap">
          <span className="assistant-panel__avatar" aria-hidden="true">
            <svg
              className="assistant-panel__avatar-glyph"
              viewBox="0 0 64 64"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M32 7V57" />
              <ellipse cx="32" cy="32" rx="7.4" ry="5.3" />
              <path d="M24 24L12.8 16.5H5.5" />
              <path d="M24.5 32H10H3.3" />
              <path d="M24 40L12.8 47.5H5.5" />
              <path d="M40 24L51.2 16.5H58.5" />
              <path d="M39.5 32H54H60.7" />
              <path d="M40 40L51.2 47.5H58.5" />
            </svg>
          </span>
          <div>
            <Typography className="assistant-panel__title">Аксиом</Typography>
            <Typography className="assistant-panel__subtitle">
              {isBusy ? "Анализирую запрос..." : "Готов к диалогу"}
            </Typography>
          </div>
        </div>
        <div className="assistant-panel__head-actions">
          <button
            type="button"
            className="assistant-panel__head-btn assistant-panel__head-btn--toggle"
            aria-label={minimized ? "Развернуть чат" : "Свернуть чат"}
            onClick={onToggleMinimized}
          >
            {minimized ? <OpenInFullRoundedIcon fontSize="inherit" /> : <RemoveRoundedIcon fontSize="inherit" />}
          </button>
          <button
            type="button"
            className="assistant-panel__head-btn assistant-panel__head-btn--refresh"
            aria-label="Повторить запрос"
            onClick={onRetry}
          >
            <RefreshRoundedIcon fontSize="inherit" />
          </button>
          <button
            type="button"
            className="assistant-panel__head-btn assistant-panel__head-btn--close"
            aria-label="Закрыть чат"
            onClick={onClose}
          >
            <CloseRoundedIcon fontSize="inherit" />
          </button>
        </div>
      </header>
      {isBusy ? <span className="assistant-panel__thinking-line" aria-hidden="true" /> : null}

      {!minimized ? (
        <>
          <div className="assistant-panel__content assistant-panel__content--chat" aria-live="polite">
        {!hasHistory ? (
          <div className="assistant-state assistant-state--empty">
            <Typography>
              Начните диалог с Аксиомом: запросите план, повторение темы или советы по курсу.
            </Typography>
          </div>
        ) : (
          <div className="assistant-chat">
            {history.map((entry) => (
              <article
                key={entry.id}
                className={`assistant-chat__message role-${entry.role}`}
              >
                <Typography className="assistant-chat__meta">
                  {entry.role === "assistant" ? "Аксиом" : "Вы"} ·{" "}
                  {new Date(entry.createdAt).toLocaleTimeString("ru-RU", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Typography>
                <Typography className="assistant-chat__text">{entry.text}</Typography>
                {entry.role === "assistant" && entry.blocks?.length ? (
                  <div className="assistant-chat__blocks">
                    <AssistantResponseRenderer
                      blocks={entry.blocks}
                      loading={false}
                      error={null}
                      onAction={onAction}
                      onRecommendation={onRecommendation}
                      onEntityLink={onEntityLink}
                    />
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}

        {error ? (
          <div className="assistant-state assistant-state--error" role="alert">
            <Typography>{error}</Typography>
          </div>
        ) : null}

        {blocks.length > 0 && !hasHistory ? (
          <AssistantResponseRenderer
            blocks={blocks}
            loading={loading}
            error={error}
            onAction={onAction}
            onRecommendation={onRecommendation}
            onEntityLink={onEntityLink}
          />
        ) : null}
          </div>

          <div className="assistant-panel__quick-actions">
            {quickActions.map((action) => (
              <button
                key={action.id}
                type="button"
                className="assistant-panel__quick-action"
                onClick={() => onAction(action)}
                disabled={isBusy}
              >
                {action.label}
              </button>
            ))}
          </div>

          <form
        className="assistant-panel__composer"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <textarea
          value={message}
          onChange={(event) => onMessageChange(event.target.value)}
          placeholder="Вопрос к Аксиому..."
          rows={1}
          aria-label="Сообщение ассистенту Аксиом"
        />
        <button
          className="assistant-panel__send-icon"
          type="submit"
          aria-label="Отправить сообщение"
          disabled={!message.trim() || isBusy}
        >
          <SendRoundedIcon fontSize="inherit" />
        </button>
          </form>
        </>
      ) : (
        <div className="assistant-panel__minimized-caption">
          <Typography>Чат свернут. Нажмите кнопку разворота, чтобы продолжить диалог.</Typography>
        </div>
      )}
    </aside>
  );
}
