import { writeStorage } from "@/shared/lib/localDb";

export const APP_DATA_UPDATED_EVENT = "app-data-updated";
export const APP_DATA_UPDATED_STORAGE_KEY = "app-data-updated";
const APP_DATA_UPDATED_TTL_MS = 24 * 60 * 60 * 1000;

type DispatchOptions = {
  immediate?: boolean;
};

const MIN_DISPATCH_INTERVAL_MS = 120;

let flushTimer: number | null = null;
let lastDispatchAt = 0;
const pendingReasons = new Set<string>();

const flush = () => {
  if (typeof window === "undefined") return;
  flushTimer = null;
  lastDispatchAt = Date.now();

  const reasons = Array.from(pendingReasons);
  pendingReasons.clear();

  try {
    window.dispatchEvent(
      new CustomEvent(APP_DATA_UPDATED_EVENT, {
        detail: {
          at: new Date(lastDispatchAt).toISOString(),
          reasons,
        },
      })
    );
  } catch {
    // ignore
  }

  try {
    writeStorage(APP_DATA_UPDATED_STORAGE_KEY, lastDispatchAt, {
      ttlMs: APP_DATA_UPDATED_TTL_MS,
    });
  } catch {
    // ignore
  }
};

export const dispatchDataUpdate = (
  reason = "unknown",
  options?: DispatchOptions
) => {
  if (typeof window === "undefined") return;
  pendingReasons.add(reason);

  if (options?.immediate) {
    if (flushTimer !== null) {
      window.clearTimeout(flushTimer);
      flushTimer = null;
    }
    flush();
    return;
  }

  if (flushTimer !== null) return;

  const now = Date.now();
  const delay = Math.max(0, MIN_DISPATCH_INTERVAL_MS - (now - lastDispatchAt));
  flushTimer = window.setTimeout(flush, delay);
};
