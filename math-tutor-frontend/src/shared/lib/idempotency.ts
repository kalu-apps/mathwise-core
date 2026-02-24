const randomPart = () => Math.random().toString(36).slice(2, 10);

export const createIdempotencyKey = (prefix = "op") => {
  if (
    typeof globalThis !== "undefined" &&
    "crypto" in globalThis &&
    typeof globalThis.crypto?.randomUUID === "function"
  ) {
    return `${prefix}:${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}:${Date.now().toString(36)}:${randomPart()}`;
};

export const buildIdempotencyHeaders = (prefix: string, key?: string) => ({
  "X-Idempotency-Key": key?.trim() || createIdempotencyKey(prefix),
});

