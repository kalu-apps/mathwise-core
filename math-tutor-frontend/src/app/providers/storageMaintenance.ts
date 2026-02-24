import { readStorage } from "@/shared/lib/localDb";
import { AUTH_STORAGE_KEY } from "@/features/auth/model/constants";
import { OUTBOX_STORAGE_KEY } from "@/shared/lib/outbox";
import { APP_DATA_UPDATED_STORAGE_KEY } from "@/shared/lib/dataUpdateBus";
import { NEWS_FEED_UPDATED_STORAGE_KEY } from "@/entities/news/model/storage";

const LEGACY_TIMED_KEYS: Array<{ key: string; maxAgeMs: number }> = [
  { key: APP_DATA_UPDATED_STORAGE_KEY, maxAgeMs: 24 * 60 * 60 * 1000 },
  { key: NEWS_FEED_UPDATED_STORAGE_KEY, maxAgeMs: 24 * 60 * 60 * 1000 },
];

const cleanupLegacyTimestampKey = (key: string, maxAgeMs: number) => {
  if (typeof window === "undefined") return;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return;
  }
  if (!raw) return;

  // Envelope-based values are managed by localDb TTL on read.
  if (raw.startsWith("{")) return;

  const value = Number(raw);
  if (!Number.isFinite(value) || Date.now() - value > maxAgeMs) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
};

export const runStorageMaintenanceSweep = () => {
  // Trigger TTL eviction for envelope-managed keys.
  readStorage(AUTH_STORAGE_KEY, null);
  readStorage(OUTBOX_STORAGE_KEY, []);
  readStorage(APP_DATA_UPDATED_STORAGE_KEY, null);
  readStorage(NEWS_FEED_UPDATED_STORAGE_KEY, null);

  // Cleanup for old pre-envelope timestamp values.
  LEGACY_TIMED_KEYS.forEach(({ key, maxAgeMs }) =>
    cleanupLegacyTimestampKey(key, maxAgeMs)
  );
};
