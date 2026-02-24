type StorageEnvelope<T> = {
  __storageVersion: 1;
  data: T;
  expiresAt?: number;
  updatedAt: number;
};

type WriteStorageOptions = {
  ttlMs?: number;
  throwOnError?: boolean;
};

const isEnvelope = <T>(value: unknown): value is StorageEnvelope<T> => {
  if (!value || typeof value !== "object") return false;
  return (
    "__storageVersion" in value &&
    (value as { __storageVersion?: unknown }).__storageVersion === 1 &&
    "data" in value
  );
};

const readRaw = (key: string) => {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(key);
};

const safeRemove = (key: string) => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
};

export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = readRaw(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (!isEnvelope<T>(parsed)) {
      return parsed as T;
    }
    if (typeof parsed.expiresAt === "number" && parsed.expiresAt <= Date.now()) {
      safeRemove(key);
      return fallback;
    }
    return parsed.data as T;
  } catch {
    return fallback;
  }
}

const mapStorageErrorMessage = (error: unknown) => {
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return "Недостаточно места в хранилище браузера для сохранения данных. Уменьшите размер вложений (изображений) или очистите данные сайта.";
  }
  return "Не удалось сохранить данные в локальное хранилище.";
};

export function writeStorage<T>(
  key: string,
  data: T,
  options?: WriteStorageOptions
): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    const ttlMs = Math.max(0, Math.floor(options?.ttlMs ?? 0));
    if (ttlMs > 0) {
      const envelope: StorageEnvelope<T> = {
        __storageVersion: 1,
        data,
        updatedAt: Date.now(),
        expiresAt: Date.now() + ttlMs,
      };
      localStorage.setItem(key, JSON.stringify(envelope));
      return true;
    }
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (error) {
    if (options?.throwOnError) {
      throw new Error(mapStorageErrorMessage(error));
    }
    return false;
  }
}

export function removeStorage(key: string) {
  safeRemove(key);
}
