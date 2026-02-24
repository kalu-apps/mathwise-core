import { useDelayedLoading } from "@/shared/lib/useDelayedLoading";

type PageLoaderProps = {
  title?: string;
  description?: string;
  className?: string;
  minHeight?: number | string;
  showRingDelayMs?: number;
};

export function PageLoader({
  title = "Загрузка",
  description: _description,
  className,
  minHeight = 320,
  showRingDelayMs = 120,
}: PageLoaderProps) {
  void _description;

  const showRing = useDelayedLoading(true, {
    delayMs: showRingDelayMs,
    minVisibleMs: 0,
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
