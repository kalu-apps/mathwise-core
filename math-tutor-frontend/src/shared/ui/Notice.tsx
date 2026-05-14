import type { ReactNode } from "react";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";

export type NoticeTone = "neutral" | "info" | "success" | "warning" | "critical";
export type NoticePlacement = "inline" | "global" | "dashboard" | "toast";
export type NoticeDensity = "regular" | "compact";

export type NoticeAction = {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  ariaLabel?: string;
};

type NoticeProps = {
  tone?: NoticeTone;
  placement?: NoticePlacement;
  density?: NoticeDensity;
  title?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode | null;
  actions?: NoticeAction[];
  onClose?: () => void;
  className?: string;
  role?: "status" | "alert" | "region";
  ariaLive?: "polite" | "assertive" | "off";
};

const defaultIconByTone: Record<NoticeTone, ReactNode> = {
  neutral: <InfoOutlinedIcon fontSize="small" />,
  info: <InfoOutlinedIcon fontSize="small" />,
  success: <CheckCircleOutlineRoundedIcon fontSize="small" />,
  warning: <WarningAmberRoundedIcon fontSize="small" />,
  critical: <ErrorOutlineRoundedIcon fontSize="small" />,
};

export function Notice({
  tone = "info",
  placement = "inline",
  density = "regular",
  title,
  children,
  icon,
  actions = [],
  onClose,
  className,
  role,
  ariaLive,
}: NoticeProps) {
  const classes = [
    "notice",
    `notice--${tone}`,
    `notice--${placement}`,
    `notice--${density}`,
  ];
  if (className) classes.push(className);

  const resolvedIcon = icon === undefined ? defaultIconByTone[tone] : icon;
  const resolvedRole = role ?? (tone === "critical" ? "alert" : "status");
  const resolvedAriaLive = ariaLive ?? (tone === "critical" ? "assertive" : "polite");

  return (
    <section className={classes.join(" ")} role={resolvedRole} aria-live={resolvedAriaLive}>
      {resolvedIcon !== null ? (
        <span className="notice__icon" aria-hidden="true">
          {resolvedIcon}
        </span>
      ) : null}
      <div className="notice__body">
        {title ? <strong className="notice__title">{title}</strong> : null}
        {children ? <div className="notice__content">{children}</div> : null}
      </div>
      {actions.length > 0 ? (
        <div className="notice__actions">
          {actions.map((action, index) => (
            <button
              key={`${action.label}-${index}`}
              type="button"
              className={`notice__action notice__action--${action.variant ?? "primary"}`}
              onClick={action.onClick}
              disabled={action.disabled || action.loading}
              aria-label={action.ariaLabel}
            >
              {action.loading ? <span className="notice__action-spinner" /> : action.icon}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      ) : null}
      {onClose ? (
        <button
          type="button"
          className="notice__close"
          onClick={onClose}
          aria-label="Закрыть уведомление"
        >
          <CloseRoundedIcon fontSize="small" />
        </button>
      ) : null}
    </section>
  );
}
