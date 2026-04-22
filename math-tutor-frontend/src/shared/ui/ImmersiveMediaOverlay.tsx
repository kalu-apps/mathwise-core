import { useEffect, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";

type ImmersiveMediaOverlayProps = {
  open: boolean;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  ariaLabel?: string;
  closeLabel?: string;
  prevLabel?: string;
  nextLabel?: string;
  children: ReactNode;
};

export function ImmersiveMediaOverlay({
  open,
  onClose,
  onPrev,
  onNext,
  ariaLabel = "Просмотр медиа",
  closeLabel = "Закрыть просмотр",
  prevLabel = "Предыдущее",
  nextLabel = "Следующее",
  children,
}: ImmersiveMediaOverlayProps) {
  const canNavigate = Boolean(onPrev && onNext);

  useEffect(() => {
    if (!open || typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (!canNavigate) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        onPrev?.();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        event.stopPropagation();
        onNext?.();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [canNavigate, onClose, onNext, onPrev, open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div
      className="immersive-media-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={handleBackdropClick}
    >
      <div className="immersive-media-overlay__viewport">
        <div className="immersive-media-overlay__content">{children}</div>

        {canNavigate ? (
          <button
            type="button"
            className="immersive-media-overlay__action immersive-media-overlay__action--prev"
            aria-label={prevLabel}
            onClick={() => onPrev?.()}
          >
            <ChevronLeftRoundedIcon />
          </button>
        ) : null}

        {canNavigate ? (
          <button
            type="button"
            className="immersive-media-overlay__action immersive-media-overlay__action--next"
            aria-label={nextLabel}
            onClick={() => onNext?.()}
          >
            <ChevronRightRoundedIcon />
          </button>
        ) : null}

        <button
          type="button"
          className="immersive-media-overlay__action immersive-media-overlay__action--close"
          aria-label={closeLabel}
          onClick={onClose}
        >
          <CloseRoundedIcon />
        </button>
      </div>
    </div>,
    document.body
  );
}
