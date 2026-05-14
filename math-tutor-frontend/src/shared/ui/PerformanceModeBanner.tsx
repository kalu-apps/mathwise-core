import SpeedRoundedIcon from "@mui/icons-material/SpeedRounded";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import { usePerformanceMode } from "@/app/providers/performanceModeContext";
import { t } from "@/shared/i18n";
import { Notice } from "./Notice";

export function PerformanceModeBanner() {
  const { isDegraded, reason, reset } = usePerformanceMode();
  if (!isDegraded) return null;

  const reasonText =
    reason === "long_task"
      ? t("performance.degradedReasonLongTask")
      : reason === "inp"
      ? t("performance.degradedReasonInp")
      : t("performance.degradedReasonMixed");

  return (
    <div className="performance-banner-wrap" role="region" aria-live="polite">
      <div className="performance-banner-container">
        <Notice
          tone="info"
          placement="global"
          density="compact"
          className="performance-banner"
          icon={<SpeedRoundedIcon fontSize="small" />}
          title={t("performance.degradedTitle")}
          actions={[
            {
              label: t("performance.restoreMode"),
              onClick: reset,
              icon: <BoltRoundedIcon fontSize="small" />,
            },
          ]}
        >
          <div className="performance-banner__content">
            <span>{t("performance.degradedDescription")}</span>
            <small>{reasonText}</small>
          </div>
        </Notice>
      </div>
    </div>
  );
}
