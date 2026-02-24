import type {
  CheckoutMethod,
  PaymentEventProvider,
  PaymentEventStatus,
} from "./types";

export type PaymentInitiationInput = {
  checkoutId: string;
  amount: number;
  currency: "RUB";
  method: CheckoutMethod;
  courseId: string;
  userId?: string;
  email: string;
  requestedAt: string;
};

export type PaymentInitiationDecision = {
  provider: PaymentEventProvider;
  externalEventId: string;
  status: PaymentEventStatus;
  payload?: Record<string, unknown>;
};

export type PaymentMethodAdapter = {
  provider: PaymentEventProvider;
  supports: (method: CheckoutMethod) => boolean;
  initiate: (input: PaymentInitiationInput) => PaymentInitiationDecision;
};

const createImmediatePaidAdapter = (
  provider: PaymentEventProvider,
  method: CheckoutMethod,
  source: string
): PaymentMethodAdapter => ({
  provider,
  supports: (value) => value === method,
  initiate: (input) => ({
    provider,
    externalEventId: `${provider}-auto-paid:${input.checkoutId}`,
    status: "paid",
    payload: {
      source,
      amount: input.amount,
      currency: input.currency,
      courseId: input.courseId,
      userId: input.userId,
      email: input.email,
      method: input.method,
      requestedAt: input.requestedAt,
    },
  }),
});

const createCardHostedAdapter = (): PaymentMethodAdapter => ({
  provider: "card",
  supports: (value) => value === "card",
  initiate: (input) => {
    const providerPaymentId = `card_pi_${input.checkoutId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 20)}`;
    return {
      provider: "card",
      externalEventId: `card:init:${providerPaymentId}`,
      status: "awaiting_payment",
      payload: {
        source: "card-hosted",
        providerPaymentId,
        paymentUrl: `https://pay.mock-card.local/checkout/${providerPaymentId}`,
        returnUrl: `/courses/${input.courseId}`,
        amount: input.amount,
        currency: input.currency,
        courseId: input.courseId,
        userId: input.userId,
        email: input.email,
        method: input.method,
        requestedAt: input.requestedAt,
      },
    };
  },
});

const createSbpHostedAdapter = (): PaymentMethodAdapter => ({
  provider: "sbp",
  supports: (value) => value === "sbp",
  initiate: (input) => {
    const providerPaymentId = `sbp_pi_${input.checkoutId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 20)}`;
    const requestedDate = new Date(input.requestedAt);
    const expiresAtDate = Number.isNaN(requestedDate.getTime())
      ? new Date(Date.now() + 10 * 60 * 1000)
      : new Date(requestedDate.getTime() + 10 * 60 * 1000);
    const expiresAt = expiresAtDate.toISOString();
    const qrUrl = `https://sbp.mock-pay.local/qr/${providerPaymentId}`;
    const deepLinkUrl = `bankapp://sbp/pay?paymentId=${providerPaymentId}`;

    return {
      provider: "sbp",
      externalEventId: `sbp:init:${providerPaymentId}`,
      status: "awaiting_payment",
      payload: {
        source: "sbp-hosted",
        providerPaymentId,
        qrUrl,
        deepLinkUrl,
        expiresAt,
        amount: input.amount,
        currency: input.currency,
        courseId: input.courseId,
        userId: input.userId,
        email: input.email,
        method: input.method,
        requestedAt: input.requestedAt,
      },
    };
  },
});

const mockAdapter = createImmediatePaidAdapter("mock", "mock", "checkout-api");
const cardAdapter = createCardHostedAdapter();
const sbpAdapter = createSbpHostedAdapter();
const bnplAdapter = createImmediatePaidAdapter("bnpl", "bnpl", "bnpl-adapter");

export const defaultPaymentAdapters: PaymentMethodAdapter[] = [
  cardAdapter,
  sbpAdapter,
  bnplAdapter,
  mockAdapter,
];

export const initiateCheckoutPayment = (
  input: PaymentInitiationInput,
  adapters: readonly PaymentMethodAdapter[] = defaultPaymentAdapters
): PaymentInitiationDecision => {
  const adapter =
    adapters.find((candidate) => candidate.supports(input.method)) ?? mockAdapter;
  return adapter.initiate(input);
};
