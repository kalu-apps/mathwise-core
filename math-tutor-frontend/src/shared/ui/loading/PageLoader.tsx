import { useDelayedLoading } from "@/shared/lib/useDelayedLoading";
import { t } from "@/shared/i18n";

type PageLoaderProps = {
  title?: string;
  description?: string;
  className?: string;
  minHeight?: number | string;
  showRingDelayMs?: number;
  showRingMinVisibleMs?: number;
};

export function PageLoader({
  title = t("common.loading"),
  description: _description,
  className,
  minHeight = 320,
  showRingDelayMs = 220,
  showRingMinVisibleMs = 280,
}: PageLoaderProps) {
  void _description;

  const showRing = useDelayedLoading(true, {
    delayMs: showRingDelayMs,
    minVisibleMs: showRingMinVisibleMs,
  });

  const classes = ["ui-loader", "ui-loader--page", className]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      className={classes}
      style={{ minHeight }}
      role="status"
      aria-live="polite"
      aria-label={title}
    >
      <div className="ui-loader__content">
        <div
          className={`ui-loader__spinner ${showRing ? "is-visible" : ""}`}
          aria-hidden="true"
        >
          <span className="ui-loader__spinner-core" />
        </div>
      </div>
    </section>
  );
}
