export type LifecycleFlushReason = "hidden" | "pagehide";

export type LifecycleSubscriptionOptions = {
  dedupeWindowMs?: number;
};

const normalizeDedupeWindow = (value: number | undefined) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value ?? 0));
};

export const subscribePageLifecycleFlush = (
  onFlush: (reason: LifecycleFlushReason) => void,
  options?: LifecycleSubscriptionOptions
) => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => undefined;
  }

  const dedupeWindowMs = normalizeDedupeWindow(options?.dedupeWindowMs);
  let lastFlushAt = 0;

  const runFlush = (reason: LifecycleFlushReason) => {
    const now = Date.now();
    if (dedupeWindowMs > 0 && now - lastFlushAt < dedupeWindowMs) {
      return;
    }
    lastFlushAt = now;
    onFlush(reason);
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      runFlush("hidden");
    }
  };

  const onPageHide = () => {
    runFlush("pagehide");
  };

  document.addEventListener("visibilitychange", onVisibilityChange, true);
  window.addEventListener("pagehide", onPageHide, true);

  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange, true);
    window.removeEventListener("pagehide", onPageHide, true);
  };
};
