import SpeedRoundedIcon from "@mui/icons-material/SpeedRounded";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import { Alert, Button } from "@mui/material";
import { usePerformanceMode } from "@/app/providers/performanceModeContext";
import { t } from "@/shared/i18n";

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
        <Alert
          severity="info"
          className="performance-banner"
          icon={<SpeedRoundedIcon fontSize="small" />}
          action={
            <Button
              color="inherit"
              size="small"
              startIcon={<BoltRoundedIcon fontSize="small" />}
              onClick={reset}
            >
              {t("performance.restoreMode")}
            </Button>
          }
        >
          <div className="performance-banner__content">
            <strong>{t("performance.degradedTitle")}</strong>
            <span>{t("performance.degradedDescription")}</span>
            <small>{reasonText}</small>
          </div>
        </Alert>
      </div>
    </div>
  );
}
