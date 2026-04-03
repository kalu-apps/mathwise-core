import type { CSSProperties } from "react";

type BrandLoaderSize = "sm" | "md" | "lg";

type BrandLoaderProps = {
  size?: BrandLoaderSize;
  className?: string;
  visible?: boolean;
};

const CELL_LAYOUT = [
  { x: 40, y: 8 },
  { x: 57, y: 8 },
  { x: 74, y: 8 },
  { x: 31, y: 23 },
  { x: 48, y: 23 },
  { x: 65, y: 23 },
  { x: 82, y: 23 },
  { x: 40, y: 38 },
  { x: 57, y: 38 },
  { x: 74, y: 38 },
];

const HEXAGON_POINTS = "8,0 16,4.6 16,13.8 8,18.4 0,13.8 0,4.6";

export function BrandLoader({
  size = "md",
  className,
  visible = true,
}: BrandLoaderProps) {
  const classes = [
    "ui-loader-brand",
    `ui-loader-brand--${size}`,
    visible ? "is-visible" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} aria-hidden="true" data-loader="brand-matrix">
      <svg
        className="ui-loader-brand__svg"
        viewBox="0 0 114 62"
        focusable="false"
        role="presentation"
      >
        {CELL_LAYOUT.map((cell, index) => (
          <polygon
            key={`${cell.x}-${cell.y}`}
            className="ui-loader-brand__cell"
            points={HEXAGON_POINTS}
            transform={`translate(${cell.x} ${cell.y})`}
            data-brand-cell={index}
            style={{ "--cell-delay": `${index * 70}ms` } as CSSProperties}
          />
        ))}
      </svg>
    </div>
  );
}
