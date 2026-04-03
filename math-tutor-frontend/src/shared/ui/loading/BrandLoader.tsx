import type { CSSProperties } from "react";

type BrandLoaderSize = "sm" | "md" | "lg";

type BrandLoaderProps = {
  size?: BrandLoaderSize;
  className?: string;
  visible?: boolean;
};

const CELL_LAYOUT = [
  { x: 35, y: 35, row: 0, col: 0 },
  { x: 73, y: 35, row: 0, col: 1 },
  { x: 111, y: 35, row: 0, col: 2 },
  { x: 149, y: 35, row: 0, col: 3 },
  { x: 187, y: 35, row: 0, col: 4 },
  { x: 35, y: 73, row: 1, col: 0 },
  { x: 73, y: 73, row: 1, col: 1 },
  { x: 111, y: 73, row: 1, col: 2 },
  { x: 149, y: 73, row: 1, col: 3 },
  { x: 187, y: 73, row: 1, col: 4 },
  { x: 35, y: 111, row: 2, col: 0 },
  { x: 73, y: 111, row: 2, col: 1 },
  { x: 111, y: 111, row: 2, col: 2 },
  { x: 149, y: 111, row: 2, col: 3 },
  { x: 187, y: 111, row: 2, col: 4 },
  { x: 35, y: 149, row: 3, col: 0 },
  { x: 73, y: 149, row: 3, col: 1 },
  { x: 111, y: 149, row: 3, col: 2 },
  { x: 149, y: 149, row: 3, col: 3 },
  { x: 187, y: 149, row: 3, col: 4 },
  { x: 35, y: 187, row: 4, col: 0 },
  { x: 73, y: 187, row: 4, col: 1 },
  { x: 111, y: 187, row: 4, col: 2 },
  { x: 149, y: 187, row: 4, col: 3 },
  { x: 187, y: 187, row: 4, col: 4 },
];

const GRID_LINES = [
  "35 35 187 35",
  "35 73 187 73",
  "35 111 187 111",
  "35 149 187 149",
  "35 187 187 187",
  "35 35 35 187",
  "73 35 73 187",
  "111 35 111 187",
  "149 35 149 187",
  "187 35 187 187",
  "35 35 187 187",
  "35 73 149 187",
  "73 35 187 149",
  "35 149 149 35",
  "73 187 187 73",
];

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
        viewBox="0 0 222 222"
        focusable="false"
        role="presentation"
      >
        <g className="ui-loader-brand__grid">
          {GRID_LINES.map((line, index) => {
            const [x1, y1, x2, y2] = line.split(" ").map((point) => Number(point));
            return (
              <line
                key={`line-${line}`}
                className={`ui-loader-brand__grid-line ${index >= 10 ? "is-diagonal" : ""}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                style={{ "--line-delay": `${index * 55}ms` } as CSSProperties}
              />
            );
          })}
        </g>
        {CELL_LAYOUT.map((cell, index) => (
          <rect
            key={`${cell.x}-${cell.y}`}
            className={`ui-loader-brand__cell ${
              Math.abs(cell.row - 2) + Math.abs(cell.col - 2) <= 1 ? "is-core" : ""
            }`}
            x={cell.x - 8}
            y={cell.y - 8}
            width={16}
            height={16}
            rx={3}
            transform={`rotate(45 ${cell.x} ${cell.y})`}
            data-brand-cell={index}
            style={
              {
                "--cell-delay": `${(Math.abs(cell.row - 2) + Math.abs(cell.col - 2)) * 120 + index * 18}ms`,
              } as CSSProperties
            }
          />
        ))}
        <g className="ui-loader-brand__nodes">
          {CELL_LAYOUT.map((cell, index) => (
            <circle
              key={`node-${cell.x}-${cell.y}`}
              className="ui-loader-brand__node"
              cx={cell.x}
              cy={cell.y}
              r={2}
              style={{ "--node-delay": `${index * 35}ms` } as CSSProperties}
            />
          ))}
        </g>
        <g className="ui-loader-brand__center-mark">
          <path d="M85 111 L101 95 L111 105 L121 95 L137 111" />
          <path d="M85 111 L101 127 L111 117 L121 127 L137 111" />
        </g>
      </svg>
    </div>
  );
}
