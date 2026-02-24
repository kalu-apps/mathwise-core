export const assistantMotion = {
  duration: {
    fast: 140,
    base: 180,
    soft: 240,
    panel: 280,
    streamMin: 120,
    streamMax: 180,
  },
  easing: {
    primary: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    fade: "ease-out",
  },
} as const;

export const reducedMotionQuery =
  "@media (prefers-reduced-motion: reduce), :root[data-performance-mode='degraded']";
