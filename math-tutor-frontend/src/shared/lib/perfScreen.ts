import { useEffect } from "react";

const BUILD_IS_DEV =
  typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);

const getRouteSnapshot = () => {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
};

const getLogMeta = (screen: string, details?: Record<string, unknown>) => ({
  route: getRouteSnapshot(),
  screen,
  ...details,
});

export const logCollectionPressure = (params: {
  screen: string;
  metric: string;
  size: number;
  warnAt: number;
  errorAt: number;
  details?: Record<string, unknown>;
}) => {
  if (typeof window === "undefined") return;
  const size = Number.isFinite(params.size) ? params.size : 0;
  const meta = getLogMeta(params.screen, {
    metric: params.metric,
    size,
    warnAt: params.warnAt,
    errorAt: params.errorAt,
    ...(params.details ?? {}),
  });

  if (size >= params.errorAt) {
    console.error("[perf] collection-pressure:error", meta);
    return;
  }
  if (size >= params.warnAt) {
    console.warn("[perf] collection-pressure:warn", meta);
    return;
  }
  if (BUILD_IS_DEV && size > 0) {
    console.info("[perf] collection-pressure:ok", meta);
  }
};

export const usePerfScreenTag = (screen: string) => {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const target = document.body;
    if (!target) return;
    const previous = target.dataset.perfScreen;
    target.dataset.perfScreen = screen;
    return () => {
      if (target.dataset.perfScreen === screen) {
        if (previous) {
          target.dataset.perfScreen = previous;
        } else {
          delete target.dataset.perfScreen;
        }
      }
    };
  }, [screen]);
};
