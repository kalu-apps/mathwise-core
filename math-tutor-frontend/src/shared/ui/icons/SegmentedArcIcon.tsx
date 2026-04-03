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
  const radius = 7.1;
  const circumference = 2 * Math.PI * radius;
  const segmentLength = circumference * 0.235;
  const segmentGap = circumference - segmentLength;

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
        d="M12 6.2L13.15 8.55L15.75 8.94L13.88 10.75L14.32 13.32L12 12.08L9.68 13.32L10.12 10.75L8.25 8.94L10.85 8.55L12 6.2Z"
        fill="currentColor"
        opacity="0.12"
      />
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeDasharray={`${segmentLength.toFixed(2)} ${segmentGap.toFixed(2)}`}
        transform="rotate(-96 12 12)"
        opacity="0.56"
      />
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        stroke="var(--split-icon-accent, #52B9D7)"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeDasharray={`${segmentLength.toFixed(2)} ${segmentGap.toFixed(2)}`}
        transform="rotate(24 12 12)"
      />
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeDasharray={`${segmentLength.toFixed(2)} ${segmentGap.toFixed(2)}`}
        transform="rotate(144 12 12)"
        opacity="0.72"
      />
      <circle cx="12" cy="12" r="2.05" fill="currentColor" opacity="0.2" />
      <circle cx="12" cy="12" r="1.16" fill="currentColor" opacity="0.92" />
    </svg>
  );
}
