import { useId, type CSSProperties } from "react";

export type AnalyticalSurfaceLoaderSize = "sm" | "md" | "lg";

type AnalyticalSurfaceLoaderProps = {
  size?: AnalyticalSurfaceLoaderSize;
  className?: string;
  visible?: boolean;
};

const GRID_VERTICAL = [26, 64, 102, 140, 178, 216, 254, 292];
const GRID_HORIZONTAL = [44, 74, 104, 134, 164, 194];

const CONTOUR_PATHS = [
  "M 18 176 C 58 154, 100 142, 140 150 C 182 158, 224 178, 302 162",
  "M 18 162 C 56 140, 98 130, 140 138 C 186 146, 228 168, 302 152",
  "M 18 148 C 58 126, 98 116, 140 124 C 186 132, 232 156, 302 138",
  "M 18 134 C 56 112, 98 102, 142 110 C 188 118, 232 142, 302 124",
  "M 18 120 C 56 98, 98 88, 142 96 C 188 104, 232 128, 302 110",
  "M 18 106 C 54 84, 96 74, 142 82 C 188 90, 232 114, 302 96",
];

export function AnalyticalSurfaceLoader({
  size = "md",
  className,
  visible = true,
}: AnalyticalSurfaceLoaderProps) {
  const uid = useId().replace(/:/g, "");
  const bgGradientId = `analytical-bg-${uid}`;
  const fillGradientId = `analytical-fill-${uid}`;
  const contourGradientId = `analytical-contour-${uid}`;
  const ridgeGradientId = `analytical-ridge-${uid}`;

  return (
    <div
      className={[
        "ui-loader-analytical",
        `ui-loader-analytical--${size}`,
        visible ? "is-visible" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
      data-loader="analytical-surface"
    >
      <svg
        className="ui-loader-analytical__svg"
        viewBox="0 0 320 220"
        focusable="false"
        role="presentation"
      >
        <defs>
          <linearGradient id={bgGradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#111f48" />
            <stop offset="48%" stopColor="#1a3771" />
            <stop offset="100%" stopColor="#183f6d" />
          </linearGradient>
          <linearGradient id={fillGradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(119, 170, 255, 0.24)" />
            <stop offset="56%" stopColor="rgba(82, 204, 238, 0.3)" />
            <stop offset="100%" stopColor="rgba(146, 113, 245, 0.26)" />
          </linearGradient>
          <linearGradient id={contourGradientId} x1="0" y1="0.4" x2="1" y2="0.4">
            <stop offset="0%" stopColor="rgba(197, 224, 255, 0.26)" />
            <stop offset="42%" stopColor="rgba(130, 219, 255, 0.72)" />
            <stop offset="100%" stopColor="rgba(176, 156, 255, 0.46)" />
          </linearGradient>
          <linearGradient id={ridgeGradientId} x1="0" y1="0.5" x2="1" y2="0.5">
            <stop offset="0%" stopColor="rgba(204, 241, 255, 0.15)" />
            <stop offset="46%" stopColor="rgba(227, 243, 255, 0.84)" />
            <stop offset="100%" stopColor="rgba(185, 177, 255, 0.3)" />
          </linearGradient>
        </defs>

        <rect className="ui-loader-analytical__backdrop" x="0" y="0" width="320" height="220" rx="22" />
        <rect
          className="ui-loader-analytical__surface-base"
          x="0"
          y="0"
          width="320"
          height="220"
          rx="22"
          fill={`url(#${bgGradientId})`}
        />

        <g className="ui-loader-analytical__grid">
          {GRID_VERTICAL.map((x, index) => (
            <line
              key={`v-${x}`}
              className="ui-loader-analytical__grid-line"
              x1={x}
              y1={18}
              x2={x}
              y2={202}
              style={{ "--grid-delay": `${index * 70}ms` } as CSSProperties}
            />
          ))}
          {GRID_HORIZONTAL.map((y, index) => (
            <line
              key={`h-${y}`}
              className="ui-loader-analytical__grid-line"
              x1={18}
              y1={y}
              x2={302}
              y2={y}
              style={{ "--grid-delay": `${(index + 2) * 85}ms` } as CSSProperties}
            />
          ))}
        </g>

        <g className="ui-loader-analytical__surface-shell">
          <path
            className="ui-loader-analytical__surface-fill"
            d="M 16 198 L 16 136 C 62 100, 100 88, 142 96 C 188 104, 234 132, 304 116 L 304 198 Z"
            fill={`url(#${fillGradientId})`}
          />
          {CONTOUR_PATHS.map((d, index) => (
            <path
              key={`contour-${index}`}
              className="ui-loader-analytical__contour"
              d={d}
              stroke={`url(#${contourGradientId})`}
              style={{ "--contour-delay": `${index * 140}ms` } as CSSProperties}
            />
          ))}
          <path
            className="ui-loader-analytical__ridge"
            d="M 18 132 C 66 92, 106 88, 146 96 C 194 104, 238 134, 302 118"
            stroke={`url(#${ridgeGradientId})`}
          />
        </g>

        <g className="ui-loader-analytical__focus">
          <circle cx="160" cy="116" r="8.5" />
          <circle cx="160" cy="116" r="24" />
        </g>
      </svg>
    </div>
  );
}

