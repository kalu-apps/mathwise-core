import crypto from "node:crypto";
import { HttpException } from "@nestjs/common";
import type { RedisService } from "../redis/redis.service";
import type {
  CheckoutPaymentDto,
  CheckoutProcessDto,
  CheckoutStateDto,
  ProviderWebhookPayloadDto,
  PurchaseTariffDto,
} from "./purchases.types";
import { isTerminalCheckoutState } from "./purchases.types";

export const readCourseSnapshotPrice = (course: {
  priceGuided: number;
  priceSelf: number;
}) => Math.max(0, Math.round(Number(course.priceSelf ?? course.priceGuided ?? 0)));

export const resolveCheckoutTariff = (
  value: unknown,
  fallback: PurchaseTariffDto = "standard"
): PurchaseTariffDto =>
  value === "premium"
    ? "premium"
    : value === "standard"
      ? "standard"
      : fallback;

const timingSafeEquals = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

export const signWebhookPayload = (
  secret: string,
  timestamp: string,
  payload: ProviderWebhookPayloadDto
) =>
  crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${JSON.stringify(payload)}`)
    .digest("hex");

export const verifyWebhookRequest = async (params: {
  payload: ProviderWebhookPayloadDto;
  signature: string;
  timestamp: string;
  allowLocalInsecureFallback?: boolean;
  runtimeConfig: {
    appEnv: string;
    cardWebhookSecret: string;
    cardWebhookMaxSkewSec: number;
    cardWebhookReplayTtlSec: number;
  };
  redisService: Pick<RedisService, "setIfAbsent">;
}) => {
  const timestamp = params.timestamp?.trim();
  const signature = params.signature?.trim();
  if (!timestamp || !signature) {
    throw new HttpException({ error: "Webhook headers are required." }, 400);
  }

  const tsMs = Date.parse(timestamp);
  if (!Number.isFinite(tsMs)) {
    throw new HttpException({ error: "Invalid webhook timestamp." }, 400);
  }

  const skewSec = Math.abs(Date.now() - tsMs) / 1000;
  if (skewSec > params.runtimeConfig.cardWebhookMaxSkewSec) {
    throw new HttpException({ error: "Webhook timestamp is stale." }, 409);
  }

  const expected = signWebhookPayload(
    params.runtimeConfig.cardWebhookSecret,
    timestamp,
    params.payload
  );
  const allowFallback =
    params.runtimeConfig.appEnv === "local" && params.allowLocalInsecureFallback;
  if (!allowFallback && !timingSafeEquals(signature, expected)) {
    throw new HttpException({ error: "Webhook signature mismatch." }, 401);
  }

  const replayKey = `card:webhook:replay:${signature}`;
  const acquired = await params.redisService.setIfAbsent(
    replayKey,
    "1",
    params.runtimeConfig.cardWebhookReplayTtlSec
  );
  if (!acquired) {
    throw new HttpException({ error: "Webhook replay detected." }, 409);
  }
};

export const computeProviderTransition = (
  current: CheckoutStateDto,
  status: ProviderWebhookPayloadDto["status"]
): { nextState: CheckoutStateDto | null; outcome: string } => {
  if (status === "paid") {
    if (
      current === "provider_confirmed" ||
      current === "provision_pending" ||
      current === "provisioned" ||
      current === "email_verification_pending"
    ) {
      return { nextState: current, outcome: "duplicate" };
    }
    if (current === "failed" || current === "canceled" || current === "expired") {
      return { nextState: null, outcome: "ignored_out_of_order" };
    }
    return { nextState: "provider_confirmed", outcome: "applied" };
  }

  if (status === "awaiting_payment") {
    if (isTerminalCheckoutState(current)) {
      return { nextState: null, outcome: "ignored_out_of_order" };
    }
    return { nextState: "pending_provider", outcome: "applied" };
  }

  if (status === "failed") {
    if (current === "provisioned" || current === "email_verification_pending") {
      return { nextState: null, outcome: "ignored_out_of_order" };
    }
    return { nextState: "failed", outcome: "applied" };
  }

  if (status === "canceled") {
    if (current === "provisioned" || current === "email_verification_pending") {
      return { nextState: null, outcome: "ignored_out_of_order" };
    }
    return { nextState: "canceled", outcome: "applied" };
  }

  if (status === "expired") {
    if (current === "provisioned" || current === "email_verification_pending") {
      return { nextState: null, outcome: "ignored_out_of_order" };
    }
    return { nextState: "expired", outcome: "applied" };
  }

  return { nextState: null, outcome: "ignored_out_of_order" };
};

export const buildPaymentPayload = (
  checkout: CheckoutProcessDto
): CheckoutPaymentDto => {
  const status: CheckoutPaymentDto["status"] =
    checkout.state === "created" || checkout.state === "pending_provider"
      ? "awaiting_provider"
      : checkout.state === "provider_confirmed" ||
          checkout.state === "provision_pending" ||
          checkout.state === "provisioned" ||
          checkout.state === "email_verification_pending" ||
          checkout.state === "email_correction_required"
        ? "provider_confirmed"
        : checkout.state === "failed" || checkout.state === "provision_failed_retryable"
          ? "failed"
          : checkout.state === "canceled"
            ? "canceled"
            : "expired";

  const outcome: CheckoutPaymentDto["outcome"] =
    status === "awaiting_provider"
      ? "awaiting_provider_event"
      : status === "provider_confirmed"
        ? "applied"
        : status === "canceled" || status === "expired"
          ? "canceled"
          : "failed";

  const base: CheckoutPaymentDto = {
    provider: checkout.method,
    status,
    outcome,
    providerPaymentId:
      checkout.providerPaymentId ?? `${checkout.method}_pi_${checkout.id.slice(-12)}`,
    requiresConfirmation: false,
    lastProcessedAt: status === "awaiting_provider" ? null : checkout.updatedAt,
  };

  if (checkout.method === "card") {
    return {
      ...base,
      paymentUrl: `https://pay.mock-card.local/checkout/${checkout.id}`,
      redirectUrl: `https://pay.mock-card.local/checkout/${checkout.id}`,
      returnUrl: `/courses/${encodeURIComponent(checkout.courseId)}`,
    };
  }

  if (checkout.method === "sbp") {
    return {
      ...base,
      sbp: {
        qrUrl: `https://qr.mock-sbp.local/${checkout.id}`,
        deepLinkUrl: `bankapp://sbp/pay/${checkout.id}`,
        expiresAt: checkout.expiresAt,
      },
    };
  }

  return base;
};
