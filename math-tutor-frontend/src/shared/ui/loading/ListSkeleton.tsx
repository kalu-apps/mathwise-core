import { Skeleton } from "@mui/material";

type ListSkeletonProps = {
  className?: string;
  count?: number;
  itemHeight?: number;
};

export function ListSkeleton({
  className,
  count = 6,
  itemHeight = 220,
}: ListSkeletonProps) {
  const classes = ["ui-loader-list", className].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton
          key={`list-skeleton-${index}`}
          variant="rounded"
          height={itemHeight}
          className="ui-loader-list__item"
        />
      ))}
    </div>
  );
}
