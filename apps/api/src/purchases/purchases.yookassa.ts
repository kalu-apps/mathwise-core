import crypto from "node:crypto";
import { HttpException } from "@nestjs/common";
import type { ApiRuntimeConfig } from "../config/runtime.config";
import type { CheckoutMethodDto, CheckoutProcessDto, ProviderWebhookPayloadDto } from "./purchases.types";

type YooKassaPaymentMethodType = "bank_card" | "sbp";

type YooKassaCreatePaymentRequest = {
  amount: {
    value: string;
    currency: string;
  };
  capture: boolean;
  confirmation: {
    type: "redirect";
    return_url: string;
  };
  description: string;
  metadata: Record<string, string>;
  payment_method_data?: {
    type: YooKassaPaymentMethodType;
  };
};

type YooKassaCreatePaymentResponse = {
  id?: string;
  status?: string;
  paid?: boolean;
  amount?: {
    value?: string;
    currency?: string;
  };
  confirmation?: {
    type?: string;
    confirmation_url?: string;
  };
  metadata?: Record<string, string>;
  payment_method?: {
    type?: string;
  };
};

type YooKassaWebhookObject = {
  id?: string;
  status?: string;
  paid?: boolean;
  amount?: {
    value?: string;
    currency?: string;
  };
  description?: string;
  metadata?: Record<string, unknown>;
  cancellation_details?: {
    party?: string;
    reason?: string;
  };
  payment_method?: {
    type?: string;
  };
};

type YooKassaWebhookEnvelope = {
  type?: string;
  event?: string;
  object?: YooKassaWebhookObject;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const asString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const toMoneyValue = (amount: number) => {
  const normalized = Math.max(0, Math.round(Number(amount)));
  return (normalized / 1).toFixed(2);
};

const mapCheckoutMethodToYooKassaMethod = (
  method: CheckoutMethodDto
): YooKassaPaymentMethodType | undefined => {
  if (method === "card") return "bank_card";
  if (method === "sbp") return "sbp";
  return undefined;
};

const mapYooKassaPaymentStatus = (
  status: string | undefined
): ProviderWebhookPayloadDto["status"] | null => {
  if (status === "pending" || status === "waiting_for_capture") {
    return "awaiting_payment";
  }
  if (status === "succeeded") return "paid";
  if (status === "canceled") return "canceled";
  return null;
};

export const isYooKassaEnabled = (
  runtimeConfig: Pick<ApiRuntimeConfig, "yookassaMode">
) => runtimeConfig.yookassaMode === "test" || runtimeConfig.yookassaMode === "prod";

export const buildYooKassaIdempotenceKey = (params: {
  checkoutId: string;
  scope: "create" | "retry";
  stamp: string;
}) =>
  crypto
    .createHash("sha256")
    .update(`${params.scope}:${params.checkoutId}:${params.stamp}`)
    .digest("hex")
    .slice(0, 64);

export const buildYooKassaCreatePaymentRequest = (params: {
  checkout: CheckoutProcessDto;
  runtimeConfig: Pick<
    ApiRuntimeConfig,
    "yookassaCaptureImmediately" | "yookassaReturnUrl" | "appEnv"
  >;
}): YooKassaCreatePaymentRequest => {
  const paymentMethodType = mapCheckoutMethodToYooKassaMethod(params.checkout.method);
  const payload: YooKassaCreatePaymentRequest = {
    amount: {
      value: toMoneyValue(params.checkout.amount),
      currency: params.checkout.currency || "RUB",
    },
    capture: params.runtimeConfig.yookassaCaptureImmediately,
    confirmation: {
      type: "redirect",
      return_url: params.runtimeConfig.yookassaReturnUrl,
    },
    description: `Оплата курса ${params.checkout.courseId}`,
    metadata: {
      checkoutId: params.checkout.id,
      courseId: params.checkout.courseId,
      buyerEmail: params.checkout.email,
      environment: params.runtimeConfig.appEnv,
      method: params.checkout.method,
      ...(params.checkout.userId ? { userId: params.checkout.userId } : {}),
      ...(params.checkout.tariff ? { tariff: params.checkout.tariff } : {}),
    },
  };

  if (paymentMethodType) {
    payload.payment_method_data = { type: paymentMethodType };
  }

  return payload;
};

export const createYooKassaPayment = async (params: {
  checkout: CheckoutProcessDto;
  runtimeConfig: Pick<
    ApiRuntimeConfig,
    | "yookassaShopId"
    | "yookassaSecretKey"
    | "yookassaApiBase"
    | "yookassaCaptureImmediately"
    | "yookassaReturnUrl"
    | "appEnv"
  >;
  idempotenceKey: string;
  timeoutMs?: number;
}): Promise<{
  paymentId: string;
  providerStatus: string;
  normalizedStatus: ProviderWebhookPayloadDto["status"] | null;
  providerPayload: Record<string, unknown>;
}> => {
  const endpoint = `${params.runtimeConfig.yookassaApiBase.replace(/\/+$/, "")}/payments`;
  const requestPayload = buildYooKassaCreatePaymentRequest({
    checkout: params.checkout,
    runtimeConfig: params.runtimeConfig,
  });

  const auth = Buffer.from(
    `${params.runtimeConfig.yookassaShopId}:${params.runtimeConfig.yookassaSecretKey}`
  ).toString("base64");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs ?? 15_000);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
        "Idempotence-Key": params.idempotenceKey,
      },
      body: JSON.stringify(requestPayload),
      signal: controller.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "request_failed";
    throw new HttpException(
      {
        error: "Не удалось связаться с платежным провайдером.",
        code: "provider_unreachable",
        details: message,
      },
      502
    );
  } finally {
    clearTimeout(timeout);
  }

  const rawText = await response.text();
  let responsePayload: YooKassaCreatePaymentResponse | null = null;
  try {
    responsePayload = rawText
      ? (JSON.parse(rawText) as YooKassaCreatePaymentResponse)
      : null;
  } catch {
    responsePayload = null;
  }

  if (!response.ok) {
    throw new HttpException(
      {
        error: "Платежный провайдер отклонил создание платежа.",
        code: "provider_create_failed",
        providerStatusCode: response.status,
      },
      502
    );
  }

  const paymentId = asString(responsePayload?.id);
  const providerStatus = asString(responsePayload?.status);
  if (!paymentId || !providerStatus) {
    throw new HttpException(
      {
        error: "Платежный провайдер вернул неполный ответ при создании платежа.",
        code: "provider_invalid_response",
      },
      502
    );
  }

  const confirmationUrl = asString(responsePayload?.confirmation?.confirmation_url);
  const paymentMethodType = asString(responsePayload?.payment_method?.type);
  const normalizedStatus = mapYooKassaPaymentStatus(providerStatus);

  return {
    paymentId,
    providerStatus,
    normalizedStatus,
    providerPayload: {
      provider: "yookassa",
      providerStatus,
      paymentMethodType,
      redirectUrl: confirmationUrl,
      paymentUrl: confirmationUrl,
      returnUrl: params.runtimeConfig.yookassaReturnUrl,
      rawAmount: responsePayload?.amount ?? null,
      paid: Boolean(responsePayload?.paid),
    },
  };
};

export const parseYooKassaWebhookPayload = (payload: unknown): {
  eventId: string;
  checkoutId?: string;
  providerPaymentId: string;
  status: ProviderWebhookPayloadDto["status"];
  providerRawStatus: string;
  payload: Record<string, unknown>;
} => {
  const envelope = asRecord(payload) as YooKassaWebhookEnvelope | null;
  const event = asString(envelope?.event);
  const type = asString(envelope?.type);
  const object = asRecord(envelope?.object) as YooKassaWebhookObject | null;

  const providerPaymentId = asString(object?.id);
  const providerRawStatus = asString(object?.status);
  const mappedStatus = mapYooKassaPaymentStatus(providerRawStatus);

  if (!providerPaymentId || !providerRawStatus || !mappedStatus) {
    throw new HttpException(
      {
        error: "Некорректный webhook payload YooKassa.",
        code: "provider_webhook_invalid",
      },
      400
    );
  }

  const metadata = asRecord(object?.metadata) ?? {};
  const checkoutId =
    asString(metadata.checkoutId) ?? asString(metadata.checkout_id) ?? undefined;

  const eventId = `yk:${event ?? "payment.unknown"}:${providerPaymentId}:${providerRawStatus}`;

  return {
    eventId,
    checkoutId,
    providerPaymentId,
    status: mappedStatus,
    providerRawStatus,
    payload: {
      provider: "yookassa",
      type,
      event,
      providerPaymentId,
      providerRawStatus,
      metadata,
      paid: Boolean(object?.paid),
      amount: object?.amount ?? null,
      cancellationDetails: object?.cancellation_details ?? null,
      paymentMethod: object?.payment_method ?? null,
      description: object?.description ?? null,
    },
  };
};
