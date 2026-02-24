import { api, isRecoverableApiError } from "@/shared/api/client";
import { readStorage, writeStorage } from "@/shared/lib/localDb";
import { generateId } from "@/shared/lib/id";
import { buildIdempotencyHeaders } from "@/shared/lib/idempotency";

type OutboxMethod = "POST" | "PUT" | "DELETE";

type OutboxEntry = {
  id: string;
  title: string;
  method: OutboxMethod;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  notifyDataUpdate?: boolean;
  dedupeKey?: string;
  createdAt: string;
  updatedAt: string;
};

type OutboxSnapshot = {
  pendingCount: number;
  flushing: boolean;
  lastError: string | null;
  lastFlushedAt: string | null;
  nextRetryAt: string | null;
  recoverableFailureCount: number;
};

type EnqueueOptions = {
  title: string;
  method: OutboxMethod;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  notifyDataUpdate?: boolean;
  dedupeKey?: string;
};

export const OUTBOX_STORAGE_KEY = "APP_OUTBOX_QUEUE_V1";
const OUTBOX_STORAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OUTBOX_ENTRY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const OUTBOX_RETRY_BASE_DELAY_MS = 1_500;
const OUTBOX_RETRY_MAX_DELAY_MS = 60_000;

const queue: OutboxEntry[] = readStorage<OutboxEntry[]>(OUTBOX_STORAGE_KEY, []);
let flushing = false;
let lastError: string | null = null;
let lastFlushedAt: string | null = null;
let nextRetryAtMs = 0;
let recoverableFailureCount = 0;

const listeners = new Set<() => void>();

const parseIsoMs = (value?: string) => {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const getEntryTimestamp = (entry: OutboxEntry) =>
  parseIsoMs(entry.updatedAt) ?? parseIsoMs(entry.createdAt);

const persistQueue = () => {
  writeStorage(OUTBOX_STORAGE_KEY, queue, { ttlMs: OUTBOX_STORAGE_TTL_MS });
};

const pruneExpiredQueueEntries = () => {
  const now = Date.now();
  const before = queue.length;
  const next = queue.filter((entry) => {
    const ts = getEntryTimestamp(entry);
    if (ts === null) return false;
    return now - ts <= OUTBOX_ENTRY_MAX_AGE_MS;
  });

  if (next.length === before) return;
  queue.splice(0, queue.length, ...next);
  persistQueue();
};

const emit = () => {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // ignore
    }
  });
};

pruneExpiredQueueEntries();

const getIsOnline = () =>
  typeof navigator === "undefined" ? true : navigator.onLine !== false;

const getRetryBackoffMs = (failureCount: number) => {
  const exponent = Math.max(0, failureCount - 1);
  const raw = OUTBOX_RETRY_BASE_DELAY_MS * Math.pow(2, exponent);
  const capped = Math.min(OUTBOX_RETRY_MAX_DELAY_MS, raw);
  const jitter = Math.floor(capped * (0.15 + Math.random() * 0.25));
  return Math.min(OUTBOX_RETRY_MAX_DELAY_MS, capped + jitter);
};

const ensureIdempotencyHeaders = (
  method: OutboxMethod,
  headers?: Record<string, string>
) => {
  const normalized = { ...(headers ?? {}) };
  const hasIdempotencyHeader = Object.keys(normalized).some(
    (key) => key.toLowerCase() === "x-idempotency-key"
  );
  if (hasIdempotencyHeader) return normalized;
  return {
    ...normalized,
    ...buildIdempotencyHeaders(`outbox-${method.toLowerCase()}`),
  };
};

const executeEntry = async (entry: OutboxEntry) => {
  if (entry.method === "POST") {
    await api.post(entry.path, entry.body, {
      headers: entry.headers,
      notifyDataUpdate: entry.notifyDataUpdate,
    });
    return;
  }
  if (entry.method === "PUT") {
    await api.put(entry.path, entry.body, {
      headers: entry.headers,
      notifyDataUpdate: entry.notifyDataUpdate,
    });
    return;
  }
  await api.del(entry.path, {
    headers: entry.headers,
    notifyDataUpdate: entry.notifyDataUpdate,
  });
};

export const subscribeOutbox = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getOutboxSnapshot = (): OutboxSnapshot => ({
  pendingCount: queue.length,
  flushing,
  lastError,
  lastFlushedAt,
  nextRetryAt: nextRetryAtMs > 0 ? new Date(nextRetryAtMs).toISOString() : null,
  recoverableFailureCount,
});

export const enqueueOutboxRequest = (options: EnqueueOptions) => {
  const now = new Date().toISOString();
  const dedupeKey = options.dedupeKey?.trim();
  const nextEntry: OutboxEntry = {
    id: generateId(),
    title: options.title,
    method: options.method,
    path: options.path,
    body: options.body,
    headers: ensureIdempotencyHeaders(options.method, options.headers),
    notifyDataUpdate: options.notifyDataUpdate,
    dedupeKey,
    createdAt: now,
    updatedAt: now,
  };

  if (dedupeKey) {
    const existingIndex = queue.findIndex((entry) => entry.dedupeKey === dedupeKey);
    if (existingIndex >= 0) {
      const existing = queue[existingIndex];
      queue[existingIndex] = {
        ...existing,
        ...nextEntry,
        id: existing.id,
        createdAt: existing.createdAt,
      };
    } else {
      queue.push(nextEntry);
    }
  } else {
    queue.push(nextEntry);
  }

  persistQueue();
  emit();

  if (getIsOnline()) {
    void flushOutboxQueue();
  }
};

export const flushOutboxQueue = async () => {
  const now = Date.now();
  if (flushing) return;
  if (!queue.length) return;
  if (!getIsOnline()) return;
  if (nextRetryAtMs > now) return;

  flushing = true;
  emit();

  try {
    while (queue.length > 0) {
      const current = queue[0];
      try {
        await executeEntry(current);
        queue.shift();
        lastError = null;
        nextRetryAtMs = 0;
        recoverableFailureCount = 0;
        lastFlushedAt = new Date().toISOString();
        persistQueue();
        emit();
      } catch (error) {
        if (isRecoverableApiError(error)) {
          lastError = error instanceof Error ? error.message : "recoverable_error";
          recoverableFailureCount += 1;
          nextRetryAtMs = Date.now() + getRetryBackoffMs(recoverableFailureCount);
          break;
        }
        queue.shift();
        lastError = error instanceof Error ? error.message : "outbox_item_failed";
        nextRetryAtMs = 0;
        recoverableFailureCount = 0;
        persistQueue();
        emit();
      }
    }
  } finally {
    flushing = false;
    emit();
  }
};
