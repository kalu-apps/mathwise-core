import SyncProblemRoundedIcon from "@mui/icons-material/SyncProblemRounded";
import WifiOffRoundedIcon from "@mui/icons-material/WifiOffRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import CloudUploadRoundedIcon from "@mui/icons-material/CloudUploadRounded";
import { useConnectivity } from "@/app/providers/connectivityContext";
import { t } from "@/shared/i18n";
import { Notice, type NoticeAction } from "./Notice";

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

  void outboxRetryAt;
  void outboxRecoverableFailureCount;

  const action: NoticeAction | null =
    outboxPendingCount > 0
      ? {
          label: outboxFlushing
            ? t("connectivity.flushingOutbox")
            : t("connectivity.flushOutbox"),
          onClick: () => void flushOutbox(),
          disabled: outboxFlushing,
          loading: outboxFlushing,
          icon: <CloudUploadRoundedIcon fontSize="small" />,
        }
      : retryAvailable
      ? {
          label: retryPending
            ? t("connectivity.retryingAction")
            : t("connectivity.retryLastAction"),
          onClick: () => void retryLastAction(),
          disabled: retryPending,
          loading: retryPending,
          icon: <ReplayRoundedIcon fontSize="small" />,
        }
      : hasTransportIssue
      ? {
          label: checking ? t("connectivity.rechecking") : t("connectivity.recheck"),
          onClick: () => void recheck(),
          disabled: checking,
          loading: checking,
          icon: <RefreshRoundedIcon fontSize="small" />,
        }
      : null;

  return (
    <div className="connectivity-banner-wrap" role="region" aria-live="polite">
      <div className="connectivity-banner-container">
        <Notice
          tone={isOffline ? "critical" : "warning"}
          placement="global"
          className={`connectivity-banner connectivity-banner--${status}`}
          icon={
            isOffline ? (
              <WifiOffRoundedIcon fontSize="small" />
            ) : (
              <SyncProblemRoundedIcon fontSize="small" />
            )
          }
          title={title}
          actions={action ? [action] : undefined}
        >
          <div className="connectivity-banner__content">
            <span>{description}</span>
            {retryAvailable && retryTitle && (
              <small>{t("connectivity.retryHint", { action: retryTitle })}</small>
            )}
            {outboxPendingCount > 0 && (
              <small>
                {t("connectivity.outboxPending", { count: outboxPendingCount })}
              </small>
            )}
          </div>
        </Notice>
      </div>
    </div>
  );
}
