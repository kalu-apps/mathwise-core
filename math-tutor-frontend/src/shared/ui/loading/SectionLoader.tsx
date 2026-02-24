import { Skeleton } from "@mui/material";
import { useDelayedLoading } from "@/shared/lib/useDelayedLoading";

type SectionLoaderProps = {
  className?: string;
  rows?: number;
  compact?: boolean;
  minHeight?: number | string;
  showRing?: boolean;
};

export function SectionLoader({
  className,
  rows = 2,
  compact = false,
  minHeight,
  showRing = true,
}: SectionLoaderProps) {
  const showLongWaitRing = useDelayedLoading(true, {
    delayMs: 650,
    minVisibleMs: 0,
  });

  const classes = [
    "ui-loader",
    "ui-loader--section",
    compact ? "ui-loader--compact" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} style={minHeight ? { minHeight } : undefined}>
      <div className="ui-loader__section-top">
        <Skeleton variant="text" width="40%" height={30} />
        <Skeleton variant="text" width="62%" height={22} />
      </div>
      <div className="ui-loader__section-grid">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton
            key={`section-loader-${index}`}
            variant="rounded"
            height={compact ? 88 : 126}
          />
        ))}
      </div>
      {showRing && showLongWaitRing ? (
        <div className="ui-loader__inline-ring" aria-hidden="true" />
      ) : null}
    </div>
  );
}
