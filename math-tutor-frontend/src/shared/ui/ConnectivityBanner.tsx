import SyncProblemRoundedIcon from "@mui/icons-material/SyncProblemRounded";
import WifiOffRoundedIcon from "@mui/icons-material/WifiOffRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import CloudUploadRoundedIcon from "@mui/icons-material/CloudUploadRounded";
import { Alert, Button } from "@mui/material";
import { useConnectivity } from "@/app/providers/connectivityContext";
import { t } from "@/shared/i18n";

export function ConnectivityBanner() {
  const {
    status,
    checking,
    recheck,
    retryAvailable,
    retryPending,
    retryTitle,
    retryLastAction,
    outboxPendingCount,
    outboxFlushing,
    outboxRetryAt,
    outboxRecoverableFailureCount,
    flushOutbox,
  } = useConnectivity();

  if (status === "online" && !retryAvailable && outboxPendingCount === 0) return null;

  const isOffline = status === "offline";
  const isDegraded = status === "degraded";
  const hasTransportIssue = isOffline || isDegraded;

  const title = isOffline
    ? t("connectivity.offlineTitle")
    : isDegraded
    ? t("connectivity.degradedTitle")
    : t("connectivity.retryOnlyTitle");
  const description = isOffline
    ? t("connectivity.offlineMessage")
    : isDegraded
    ? t("connectivity.degradedMessage")
    : t("connectivity.retryOnlyMessage");

  const outboxRetryTime = (() => {
    if (!outboxRetryAt) return null;
    const retryAtMs = Date.parse(outboxRetryAt);
    if (!Number.isFinite(retryAtMs)) return null;
    return new Date(retryAtMs).toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  })();

  return (
    <div className="connectivity-banner-wrap" role="region" aria-live="polite">
      <div className="connectivity-banner-container">
        <Alert
          severity={isOffline ? "error" : "warning"}
          className={`connectivity-banner connectivity-banner--${status}`}
          icon={
            isOffline ? (
              <WifiOffRoundedIcon fontSize="small" />
            ) : (
              <SyncProblemRoundedIcon fontSize="small" />
            )
          }
          action={
            <div className="connectivity-banner__actions">
              {outboxPendingCount > 0 && (
                <Button
                  color="inherit"
                  size="small"
                  startIcon={<CloudUploadRoundedIcon fontSize="small" />}
                  onClick={() => void flushOutbox()}
                  disabled={outboxFlushing}
                >
                  {outboxFlushing
                    ? t("connectivity.flushingOutbox")
                    : t("connectivity.flushOutbox")}
                </Button>
              )}
              {retryAvailable && (
                <Button
                  color="inherit"
                  size="small"
                  startIcon={<ReplayRoundedIcon fontSize="small" />}
                  onClick={() => void retryLastAction()}
                  disabled={retryPending}
                >
                  {retryPending
                    ? t("connectivity.retryingAction")
                    : t("connectivity.retryLastAction")}
                </Button>
              )}
              {hasTransportIssue && (
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
          }
        >
          <div className="connectivity-banner__content">
            <strong>{title}</strong>
            <span>{description}</span>
            {retryAvailable && retryTitle && (
              <small>{t("connectivity.retryHint", { action: retryTitle })}</small>
            )}
            {outboxPendingCount > 0 && (
              <small>
                {t("connectivity.outboxPending", { count: outboxPendingCount })}
              </small>
            )}
            {outboxPendingCount > 0 && outboxRetryTime && (
              <small>
                {t("connectivity.outboxRetryAt", {
                  time: outboxRetryTime,
                  attempts: outboxRecoverableFailureCount,
                })}
              </small>
            )}
          </div>
        </Alert>
      </div>
    </div>
  );
}
