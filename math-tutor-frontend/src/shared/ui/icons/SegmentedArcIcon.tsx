import type { CSSProperties } from "react";

type SegmentedArcIconProps = {
  className?: string;
  size?: number;
  style?: CSSProperties;
  title?: string;
};

export function SegmentedArcIcon({
  className,
  size = 17,
  style,
  title,
}: SegmentedArcIconProps) {
  const labelled = Boolean(title);

  return (
    <svg
      className={className}
      width={size}
      height={size}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={labelled ? "img" : "presentation"}
      aria-hidden={labelled ? undefined : true}
      aria-label={labelled ? title : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M12 3.75C14.6 3.75 17.02 4.95 18.59 6.98"
        stroke="currentColor"
        strokeWidth="1.95"
        strokeLinecap="round"
        opacity="0.58"
      />
      <path
        d="M20.2 11.3C20.28 14.22 18.86 17 16.43 18.62"
        stroke="var(--split-icon-accent, #52B9D7)"
        strokeWidth="1.95"
        strokeLinecap="round"
      />
      <path
        d="M13.1 20.05C9.87 20.5 6.62 19.1 4.71 16.39C3.89 15.24 3.39 13.93 3.22 12.58"
        stroke="currentColor"
        strokeWidth="1.95"
        strokeLinecap="round"
        opacity="0.7"
      />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" opacity="0.92" />
    </svg>
  );
}
