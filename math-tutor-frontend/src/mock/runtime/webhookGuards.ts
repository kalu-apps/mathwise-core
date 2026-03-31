import crypto from "crypto";

type CardWebhookGuardConfig = {
  secret: string;
  maxSkewSec: number;
  replayTtlSec: number;
};

type VerifyWebhookRequestInput = {
  rawBody: string;
  timestampHeader: string;
  signatureHeader: string;
  nowMs?: number;
};

type VerifyWebhookRequestResult =
  | { ok: true; timestampMs: number }
  | { ok: false; status: number; error: string };

const replayCache = new Map<string, number>();

const normalizeTimestampMs = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) return null;
    if (trimmed.length <= 10) {
      return numeric * 1000;
    }
    return numeric;
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
};

const pruneReplayCache = (nowMs: number) => {
  for (const [key, expiresAt] of replayCache.entries()) {
    if (expiresAt <= nowMs) {
      replayCache.delete(key);
    }
  }
};

const computeReplayKey = (
  rawBody: string,
  timestamp: string,
  signature: string
) =>
  crypto
    .createHash("sha256")
    .update(`${timestamp}.${signature}.${rawBody}`)
    .digest("hex");

export const computeCardWebhookSignature = (
  rawBody: string,
  timestamp: string,
  secret: string
) =>
  crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");

export const verifyCardWebhookRequest = (
  config: CardWebhookGuardConfig,
  input: VerifyWebhookRequestInput
): VerifyWebhookRequestResult => {
  const signature = input.signatureHeader.trim();
  const timestamp = input.timestampHeader.trim();
  if (!signature || !timestamp) {
    return { ok: false, status: 401, error: "Отсутствует подпись webhook." };
  }

  if (!config.secret) {
    return {
      ok: false,
      status: 500,
      error: "Webhook secret не настроен для текущего окружения.",
    };
  }

  const expected = computeCardWebhookSignature(input.rawBody, timestamp, config.secret);
  const expectedBuffer = Buffer.from(expected, "utf-8");
  const actualBuffer = Buffer.from(signature, "utf-8");
  if (
    expectedBuffer.length !== actualBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    return { ok: false, status: 401, error: "Некорректная подпись webhook." };
  }

  const timestampMs = normalizeTimestampMs(timestamp);
  if (!timestampMs) {
    return { ok: false, status: 400, error: "Некорректный timestamp webhook." };
  }

  const nowMs = input.nowMs ?? Date.now();
  const skewMs = Math.abs(nowMs - timestampMs);
  if (skewMs > config.maxSkewSec * 1000) {
    return { ok: false, status: 401, error: "Webhook timestamp вышел за допустимое окно." };
  }

  pruneReplayCache(nowMs);
  const replayKey = computeReplayKey(input.rawBody, timestamp, signature);
  const replayExpiresAt = replayCache.get(replayKey);
  if (replayExpiresAt && replayExpiresAt > nowMs) {
    return { ok: false, status: 409, error: "Повтор webhook запроса отклонен." };
  }

  replayCache.set(replayKey, nowMs + config.replayTtlSec * 1000);

  return {
    ok: true,
    timestampMs,
  };
};
