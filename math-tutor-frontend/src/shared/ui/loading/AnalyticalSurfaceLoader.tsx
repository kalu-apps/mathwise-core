import {
  useEffect,
  useId,
  useMemo,
  useState,
  type CSSProperties,
} from "react";

export type AnalyticalSurfaceLoaderSize = "sm" | "md" | "lg";

type AnalyticalSurfaceLoaderProps = {
  size?: AnalyticalSurfaceLoaderSize;
  className?: string;
  visible?: boolean;
  progress?: number;
};

type Point = {
  x: number;
  y: number;
};

const SCENE = {
  xMin: 64,
  xMax: 576,
  yMin: 42,
  yMax: 218,
  xAxis: 130,
  yAxis: 104,
  amplitude: 48,
  cycles: 2.35,
  hyperbolaCenterX: 500,
  hyperbolaScaleX: 84,
  hyperbolaScaleY: 36,
} as const;

const GRID_VERTICAL = Array.from({ length: 12 }, (_, index) => 68 + index * 44);
const GRID_HORIZONTAL = Array.from({ length: 7 }, (_, index) => 54 + index * 26);

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const toPath = (points: Point[]) =>
  points
    .map((point, index) =>
      `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
    )
    .join(" ");

const getSinePoint = (t: number, phase: number): Point => {
  const normalized = clamp(t, 0, 1);
  const span = SCENE.xMax - SCENE.xMin;
  const x = SCENE.xMin + span * normalized;
  const angle = normalized * Math.PI * 2 * SCENE.cycles + phase;
  const y = SCENE.xAxis - SCENE.amplitude * Math.sin(angle);
  return { x, y };
};

const sampleSinePoints = (
  startT: number,
  endT: number,
  phase: number,
  steps = 140
) => {
  const start = clamp(startT, 0, 1);
  const end = clamp(endT, 0, 1);
  if (end <= start) return [getSinePoint(start, phase)];
  const total = Math.max(6, Math.round((end - start) * steps));
  return Array.from({ length: total + 1 }, (_, index) => {
    const ratio = index / total;
    return getSinePoint(start + (end - start) * ratio, phase);
  });
};

const sampleHyperbolaBranch = (
  direction: -1 | 1,
  lower: boolean,
  drift: number
) => {
  const minU = 0.42;
  const maxU = 1.72;
  const steps = 58;
  return Array.from({ length: steps + 1 }, (_, index) => {
    const u = minU + (maxU - minU) * (index / steps);
    const x =
      SCENE.hyperbolaCenterX + drift + direction * u * SCENE.hyperbolaScaleX;
    const yOffset = SCENE.hyperbolaScaleY / u;
    const y = lower ? SCENE.xAxis + yOffset : SCENE.xAxis - yOffset;
    return { x, y };
  });
};

export function AnalyticalSurfaceLoader({
  size = "md",
  className,
  visible = true,
  progress,
}: AnalyticalSurfaceLoaderProps) {
  const uid = useId().replace(/:/g, "");
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [loopProgress, setLoopProgress] = useState(0.08);
  const [loopPhase, setLoopPhase] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setPrefersReducedMotion(media.matches);
    apply();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }
    media.addListener(apply);
    return () => media.removeListener(apply);
  }, []);

  const determinateProgress =
    typeof progress === "number" && Number.isFinite(progress)
      ? clamp(progress, 0, 100) / 100
      : null;

  useEffect(() => {
    if (prefersReducedMotion || determinateProgress !== null) return;
    let animationFrame = 0;
    let startedAt = 0;
    let lastTickAt = 0;
    const cycleDuration = 3.4;

    const tick = (timestamp: number) => {
      if (!startedAt) startedAt = timestamp;
      const elapsed = (timestamp - startedAt) / 1000;
      if (timestamp - lastTickAt >= 40) {
        const cycleT = (elapsed % cycleDuration) / cycleDuration;
        const easedProgress = 1 - Math.pow(1 - cycleT, 2.35);
        setLoopProgress(0.08 + easedProgress * 0.9);
        setLoopPhase(elapsed * 0.95);
        lastTickAt = timestamp;
      }
      animationFrame = window.requestAnimationFrame(tick);
    };

    animationFrame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [determinateProgress, prefersReducedMotion]);

  const revealProgress =
    determinateProgress ?? (prefersReducedMotion ? 1 : loopProgress);
  const scenePhase =
    determinateProgress !== null
      ? determinateProgress * Math.PI * 0.78
      : prefersReducedMotion
      ? 0
      : loopPhase;
  const trailStart = Math.max(0, revealProgress - 0.18);
  const revealPercent = Math.max(4, Math.round(revealProgress * 100));
  const headPoint = getSinePoint(revealProgress, scenePhase);
  const hyperbolaDrift = prefersReducedMotion ? 0 : Math.sin(scenePhase * 0.28) * 8;

  const sinePath = useMemo(
    () => toPath(sampleSinePoints(0, 1, scenePhase, 180)),
    [scenePhase]
  );

  const sineTrailPath = useMemo(
    () => toPath(sampleSinePoints(trailStart, revealProgress, scenePhase, 64)),
    [revealProgress, scenePhase, trailStart]
  );

  const hyperbolaTopLeftPath = useMemo(
    () => toPath(sampleHyperbolaBranch(-1, false, hyperbolaDrift)),
    [hyperbolaDrift]
  );
  const hyperbolaTopRightPath = useMemo(
    () => toPath(sampleHyperbolaBranch(1, false, hyperbolaDrift)),
    [hyperbolaDrift]
  );
  const hyperbolaBottomLeftPath = useMemo(
    () => toPath(sampleHyperbolaBranch(-1, true, hyperbolaDrift)),
    [hyperbolaDrift]
  );
  const hyperbolaBottomRightPath = useMemo(
    () => toPath(sampleHyperbolaBranch(1, true, hyperbolaDrift)),
    [hyperbolaDrift]
  );

  const heroGradientId = `analytical-hero-${uid}`;
  const hyperbolaGradientId = `analytical-hyperbola-${uid}`;
  const headGlowGradientId = `analytical-head-glow-${uid}`;

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
      style={{ "--loader-progress": revealProgress } as CSSProperties}
    >
      <svg
        className="ui-loader-analytical__svg"
        viewBox="0 0 640 260"
        focusable="false"
        role="presentation"
      >
        <defs>
          <linearGradient id={heroGradientId} x1="0" y1="0.76" x2="1" y2="0.24">
            <stop offset="0%" stopColor="rgba(44, 224, 255, 0.62)" />
            <stop offset="40%" stopColor="rgba(77, 188, 255, 0.98)" />
            <stop offset="70%" stopColor="rgba(171, 107, 255, 0.9)" />
            <stop offset="100%" stopColor="rgba(255, 178, 94, 0.78)" />
          </linearGradient>
          <linearGradient id={hyperbolaGradientId} x1="0" y1="0.5" x2="1" y2="0.5">
            <stop offset="0%" stopColor="rgba(123, 178, 235, 0.28)" />
            <stop offset="52%" stopColor="rgba(135, 205, 255, 0.52)" />
            <stop offset="100%" stopColor="rgba(162, 154, 255, 0.32)" />
          </linearGradient>
          <radialGradient id={headGlowGradientId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255, 198, 106, 0.96)" />
            <stop offset="40%" stopColor="rgba(126, 220, 255, 0.9)" />
            <stop offset="100%" stopColor="rgba(90, 130, 255, 0)" />
          </radialGradient>
        </defs>

        <rect
          className="ui-loader-analytical__plane"
          x={SCENE.xMin}
          y={SCENE.yMin}
          width={SCENE.xMax - SCENE.xMin}
          height={SCENE.yMax - SCENE.yMin}
          rx="10"
        />

        <g className="ui-loader-analytical__grid">
          {GRID_VERTICAL.map((x, index) => (
            <line
              key={`grid-v-${x}`}
              className="ui-loader-analytical__grid-line"
              x1={x}
              y1={SCENE.yMin}
              x2={x}
              y2={SCENE.yMax}
              style={{ "--grid-delay": `${index * 90}ms` } as CSSProperties}
            />
          ))}
          {GRID_HORIZONTAL.map((y, index) => (
            <line
              key={`grid-h-${y}`}
              className="ui-loader-analytical__grid-line"
              x1={SCENE.xMin}
              y1={y}
              x2={SCENE.xMax}
              y2={y}
              style={{ "--grid-delay": `${(index + 3) * 85}ms` } as CSSProperties}
            />
          ))}
        </g>

        <line
          className="ui-loader-analytical__axis ui-loader-analytical__axis--x"
          x1={28}
          y1={SCENE.xAxis}
          x2={612}
          y2={SCENE.xAxis}
        />
        <line
          className="ui-loader-analytical__axis ui-loader-analytical__axis--y"
          x1={SCENE.yAxis}
          y1={18}
          x2={SCENE.yAxis}
          y2={244}
        />

        <g className="ui-loader-analytical__hyperbola-layer">
          <path className="ui-loader-analytical__hyperbola" d={hyperbolaTopLeftPath} />
          <path className="ui-loader-analytical__hyperbola" d={hyperbolaTopRightPath} />
          <path className="ui-loader-analytical__hyperbola" d={hyperbolaBottomLeftPath} />
          <path className="ui-loader-analytical__hyperbola" d={hyperbolaBottomRightPath} />
          <path
            className="ui-loader-analytical__hyperbola-accent"
            d={hyperbolaTopRightPath}
            stroke={`url(#${hyperbolaGradientId})`}
          />
        </g>

        <path className="ui-loader-analytical__sine-base" d={sinePath} />
        <path
          className="ui-loader-analytical__sine-progress"
          d={sinePath}
          pathLength={100}
          stroke={`url(#${heroGradientId})`}
          strokeDasharray={`${revealPercent} 100`}
        />
        {prefersReducedMotion ? null : (
          <path
            className="ui-loader-analytical__sine-trail"
            d={sineTrailPath}
            stroke={`url(#${heroGradientId})`}
          />
        )}

        <g
          className="ui-loader-analytical__head"
          transform={`translate(${headPoint.x.toFixed(2)} ${headPoint.y.toFixed(2)})`}
        >
          <circle
            className="ui-loader-analytical__head-glow"
            r="22"
            fill={`url(#${headGlowGradientId})`}
          />
          <circle className="ui-loader-analytical__head-core" r="5.3" />
        </g>
      </svg>
    </div>
  );
}
