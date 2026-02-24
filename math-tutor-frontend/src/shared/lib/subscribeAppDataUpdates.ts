import {
  APP_DATA_UPDATED_EVENT,
  APP_DATA_UPDATED_STORAGE_KEY,
} from "@/shared/lib/dataUpdateBus";

type SubscribeOptions = {
  storageKeys?: string[];
  includeAppEvent?: boolean;
  coalesceMs?: number;
};

export const subscribeAppDataUpdates = (
  onUpdate: () => void,
  options?: SubscribeOptions
) => {
  if (typeof window === "undefined") {
    return () => {
      // noop
    };
  }

  const storageKeys = new Set(
    options?.storageKeys?.length
      ? options.storageKeys
      : [APP_DATA_UPDATED_STORAGE_KEY]
  );
  const includeAppEvent = options?.includeAppEvent !== false;
  const coalesceMs = Math.max(0, Math.floor(options?.coalesceMs ?? 80));
  let timer: number | null = null;
  let running = false;
  let queued = false;

  const run = () => {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    void Promise.resolve()
      .then(() => onUpdate())
      .catch(() => {
        // ignore listener errors to avoid breaking global subscription chain
      })
      .finally(() => {
        running = false;
        if (queued) {
          queued = false;
          schedule();
        }
      });
  };

  const schedule = () => {
    if (timer !== null) return;
    timer = window.setTimeout(() => {
      timer = null;
      run();
    }, coalesceMs);
  };

  const storageHandler = (event: StorageEvent) => {
    if (event.storageArea !== window.localStorage) return;
    if (event.key === null) {
      schedule();
      return;
    }
    if (!storageKeys.has(event.key)) return;
    schedule();
  };

  window.addEventListener("storage", storageHandler);
  if (includeAppEvent) {
    window.addEventListener(APP_DATA_UPDATED_EVENT, schedule as EventListener);
  }

  return () => {
    window.removeEventListener("storage", storageHandler);
    if (includeAppEvent) {
      window.removeEventListener(APP_DATA_UPDATED_EVENT, schedule as EventListener);
    }
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };
};
