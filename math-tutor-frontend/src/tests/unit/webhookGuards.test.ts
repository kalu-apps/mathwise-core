import { describe, expect, it } from "vitest";
import {
  computeCardWebhookSignature,
  verifyCardWebhookRequest,
} from "../../mock/runtime/webhookGuards";

describe("webhookGuards", () => {
  it("rejects stale timestamp", () => {
    const secret = "test-secret";
    const nowMs = Date.now();
    const staleTimestamp = new Date(nowMs - 10 * 60 * 1000).toISOString();
    const rawBody = JSON.stringify({ eventId: "evt-stale", checkoutId: "co-1", status: "paid" });
    const signature = computeCardWebhookSignature(rawBody, staleTimestamp, secret);

    const result = verifyCardWebhookRequest(
      {
        secret,
        maxSkewSec: 60,
        replayTtlSec: 300,
      },
      {
        rawBody,
        timestampHeader: staleTimestamp,
        signatureHeader: signature,
        nowMs,
      }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(401);
  });

  it("rejects replay request", () => {
    const secret = "test-secret";
    const nowMs = Date.now();
    const timestamp = new Date(nowMs).toISOString();
    const rawBody = JSON.stringify({ eventId: "evt-replay", checkoutId: "co-2", status: "paid" });
    const signature = computeCardWebhookSignature(rawBody, timestamp, secret);

    const first = verifyCardWebhookRequest(
      {
        secret,
        maxSkewSec: 300,
        replayTtlSec: 300,
      },
      {
        rawBody,
        timestampHeader: timestamp,
        signatureHeader: signature,
        nowMs,
      }
    );
    expect(first.ok).toBe(true);

    const replay = verifyCardWebhookRequest(
      {
        secret,
        maxSkewSec: 300,
        replayTtlSec: 300,
      },
      {
        rawBody,
        timestampHeader: timestamp,
        signatureHeader: signature,
        nowMs: nowMs + 1,
      }
    );

    expect(replay.ok).toBe(false);
    if (replay.ok) return;
    expect(replay.status).toBe(409);
  });
});
