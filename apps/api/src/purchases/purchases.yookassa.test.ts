import assert from "node:assert/strict";
import test from "node:test";
import {
  buildYooKassaCreatePaymentRequest,
  createYooKassaPayment,
  parseYooKassaWebhookPayload,
} from "./purchases.yookassa";

const checkout = {
  id: "checkout_1",
  userId: "user_1",
  email: "student@example.com",
  courseId: "course_1",
  method: "card",
  amount: 12990,
  tariff: "premium",
  currency: "RUB",
  state: "pending_provider",
  createdAt: "2026-04-05T00:00:00.000Z",
  updatedAt: "2026-04-05T00:00:00.000Z",
} as const;

test("yookassa: build create payment request includes metadata and method mapping", () => {
  const request = buildYooKassaCreatePaymentRequest({
    checkout,
    runtimeConfig: {
      yookassaCaptureImmediately: true,
      yookassaReturnUrl: "https://stage.mathwise.ru/courses/course_1",
      appEnv: "stage",
    },
  });

  assert.equal(request.amount.value, "12990.00");
  assert.equal(request.amount.currency, "RUB");
  assert.equal(request.capture, true);
  assert.equal(
    request.confirmation.return_url,
    "https://stage.mathwise.ru/courses/course_1"
  );
  assert.equal(request.payment_method_data?.type, "bank_card");
  assert.equal(request.metadata.checkoutId, "checkout_1");
  assert.equal(request.metadata.environment, "stage");
});

test("yookassa: parse webhook payload maps status and extracts checkout metadata", () => {
  const payload = parseYooKassaWebhookPayload({
    type: "notification",
    event: "payment.succeeded",
    object: {
      id: "2f7fbc85-000f-5000-a000-1f53cb53d6f0",
      status: "succeeded",
      paid: true,
      metadata: {
        checkoutId: "checkout_42",
        courseId: "course_42",
      },
    },
  });

  assert.equal(payload.status, "paid");
  assert.equal(payload.providerPaymentId, "2f7fbc85-000f-5000-a000-1f53cb53d6f0");
  assert.equal(payload.checkoutId, "checkout_42");
  assert.match(payload.eventId, /payment\.succeeded/);
});

test("yookassa: create payment parses provider response", async () => {
  const originalFetch = globalThis.fetch;
  let capturedRequest: RequestInit | undefined;
  try {
    globalThis.fetch = (async (_input: URL | RequestInfo, init?: RequestInit) => {
      capturedRequest = init;
      return new Response(
        JSON.stringify({
          id: "2f7fbc85-000f-5000-a000-1f53cb53d6f0",
          status: "pending",
          paid: false,
          confirmation: {
            type: "redirect",
            confirmation_url: "https://yookassa.ru/confirmation/demo",
          },
          payment_method: {
            type: "bank_card",
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }
      );
    }) as typeof fetch;

    const response = await createYooKassaPayment({
      checkout,
      runtimeConfig: {
        yookassaShopId: "shop_1",
        yookassaSecretKey: "secret_1",
        yookassaApiBase: "https://api.yookassa.ru/v3",
        yookassaCaptureImmediately: true,
        yookassaReturnUrl: "https://stage.mathwise.ru/courses/course_1",
        appEnv: "stage",
      },
      idempotenceKey: "idem_checkout_1",
      timeoutMs: 3000,
    });

    assert.equal(response.paymentId, "2f7fbc85-000f-5000-a000-1f53cb53d6f0");
    assert.equal(response.providerStatus, "pending");
    assert.equal(response.normalizedStatus, "awaiting_payment");
    assert.equal(response.providerPayload.provider, "yookassa");
    assert.equal(
      response.providerPayload.redirectUrl,
      "https://yookassa.ru/confirmation/demo"
    );

    const headers = capturedRequest?.headers as Record<string, string> | undefined;
    assert.equal(headers?.["Content-Type"], "application/json");
    assert.equal(headers?.["Idempotence-Key"], "idem_checkout_1");
    assert.ok(typeof headers?.Authorization === "string");
    assert.match(String(headers?.Authorization), /^Basic\s+/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
