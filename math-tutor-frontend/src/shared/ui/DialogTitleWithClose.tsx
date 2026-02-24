import type { ReactNode } from "react";
import { DialogTitle, IconButton } from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";

type DialogTitleWithCloseProps = {
  title: ReactNode;
  onClose: () => void;
  className?: string;
  closeAriaLabel?: string;
};

export function DialogTitleWithClose({
  title,
  onClose,
  className,
  closeAriaLabel = "Закрыть окно",
}: DialogTitleWithCloseProps) {
  return (
    <DialogTitle
      className={["ui-dialog-title", className].filter(Boolean).join(" ")}
    >
      <span className="ui-dialog-title__text">{title}</span>
      <IconButton
        className="ui-dialog-title__close"
        onClick={onClose}
        size="small"
        aria-label={closeAriaLabel}
      >
        <CloseRoundedIcon fontSize="small" />
      </IconButton>
    </DialogTitle>
  );
}

