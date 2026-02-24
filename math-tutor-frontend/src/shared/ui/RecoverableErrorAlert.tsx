import { useState } from "react";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import { Alert, Button } from "@mui/material";
import { ApiError, isRecoverableApiError } from "@/shared/api/client";
import { useConnectivity } from "@/app/providers/connectivityContext";
import { t } from "@/shared/i18n";

type Props = {
  error: unknown;
  onRetry?: () => Promise<void> | void;
  retryLabel?: string;
  forceRetry?: boolean;
  onClose?: () => void;
  className?: string;
};

const toMessage = (error: unknown) => {
  if (!error) return t("errors.defaultMessage");
  if (error instanceof ApiError) return error.message || t("errors.defaultMessage");
  if (error instanceof Error) return error.message || t("errors.defaultMessage");
  if (typeof error === "string" && error.trim().length > 0) return error;
  return t("errors.defaultMessage");
};

export function RecoverableErrorAlert({
  error,
  onRetry,
  retryLabel,
  forceRetry = false,
  onClose,
  className,
}: Props) {
  const { status, checking, recheck } = useConnectivity();
  const [retrying, setRetrying] = useState(false);

  const message = toMessage(error);
  const isRecoverable = forceRetry || isRecoverableApiError(error);
  const canRetry = Boolean(onRetry) && isRecoverable;
  const canRecheck = status !== "online";

  const handleRetry = async () => {
    if (!onRetry || retrying) return;
    try {
      setRetrying(true);
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  const classes = ["ui-alert", "ui-alert--recoverable"];
  if (className) classes.push(className);

  return (
    <Alert
      severity={isRecoverable ? "warning" : "error"}
      className={classes.join(" ")}
      onClose={onClose}
      action={
        canRetry || canRecheck ? (
          <div className="ui-alert__actions">
            {canRetry && (
              <Button
                color="inherit"
                size="small"
                startIcon={<ReplayRoundedIcon fontSize="small" />}
                onClick={() => void handleRetry()}
                disabled={retrying}
              >
                {retrying
                  ? t("connectivity.retryingAction")
                  : retryLabel ?? t("connectivity.retryLastAction")}
              </Button>
            )}
            {canRecheck && (
              <Button
                color="inherit"
                size="small"
                startIcon={<RefreshRoundedIcon fontSize="small" />}
                onClick={() => void recheck()}
                disabled={checking}
              >
                {checking ? t("connectivity.rechecking") : t("connectivity.recheck")}
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      {message}
    </Alert>
  );
}
