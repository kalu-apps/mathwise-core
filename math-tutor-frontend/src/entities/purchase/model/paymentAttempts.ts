import {
  cancelCheckout,
  confirmCheckoutPaid,
  getCheckouts,
  getCheckoutStatus,
  retryCheckout,
  type CheckoutListItem,
  type CheckoutStatusResponse,
} from "@/domain/auth-payments/model/api";
import type { Purchase } from "./types";

export type PaymentAttemptMethod = "card" | "sbp" | "bnpl" | "mock";

export type PaymentStatus =
  | "initiated"
  | "pending"
  | "succeeded"
  | "failed"
  | "canceled"
  | "expired";

export type PaymentProvider =
  | "mock"
  | "yookassa"
  | "cloudpayments"
  | "tbank"
  | "card"
  | "sbp"
  | "bnpl"
  | "other";

export type PaymentAttempt = {
  id: string;
  purchaseId: string;
  method: PaymentAttemptMethod;
  provider: PaymentProvider;
  status: PaymentStatus;
  createdAt: string;
  updatedAt: string;
  returnUrl?: string;
  redirectUrl?: string;
  requiresRedirect?: boolean;
  errorCode?: string;
  errorMessage?: string;
  providerPayload?: Record<string, unknown>;
  sbp?: {
    qrUrl?: string;
    deepLinkUrl?: string;
    expiresAt?: string;
  };
};

export type CheckoutPaymentView = {
  method: PaymentAttemptMethod;
  status: PaymentStatus;
  canRetry: boolean;
  canCancel: boolean;
  actionableMessage: string;
  requiresRedirect: boolean;
  redirectUrl?: string;
  sbpView?: {
    qrUrl?: string;
    deepLinkUrl?: string;
    expiresAt?: string;
  };
};

export type PurchaseAccessGate = {
  isPaid: boolean;
  isPending: boolean;
  reason: string;
  cta?: { label: string; to: string };
};

const toPaymentMethod = (
  method: CheckoutListItem["method"] | string | undefined
): PaymentAttemptMethod => {
  if (method === "card" || method === "sbp" || method === "bnpl") return method;
  return "mock";
};

const toPaymentStatus = (value: string | undefined): PaymentStatus => {
  if (value === "paid" || value === "provisioned" || value === "provisioning") {
    return "succeeded";
  }
  if (value === "failed") return "failed";
  if (value === "canceled") return "canceled";
  if (value === "expired") return "expired";
  if (value === "created") return "initiated";
  return "pending";
};

const toPaymentProvider = (value: string | undefined): PaymentProvider => {
  if (
    value === "mock" ||
    value === "card" ||
    value === "sbp" ||
    value === "bnpl" ||
    value === "yookassa" ||
    value === "cloudpayments" ||
    value === "tbank"
  ) {
    return value;
  }
  return "other";
};

const defaultProviderByMethod = (method: PaymentAttemptMethod): PaymentProvider => {
  if (method === "card") return "card";
  if (method === "sbp") return "sbp";
  if (method === "bnpl") return "bnpl";
  return "mock";
};

export const toPaymentAttemptFromCheckout = (
  purchase: Purchase,
  checkout: CheckoutListItem,
  status?: CheckoutStatusResponse
): PaymentAttempt => {
  const method = toPaymentMethod(status?.method ?? checkout.method);
  const statusValue = status?.payment.status ?? checkout.state;
  const mappedStatus = toPaymentStatus(statusValue);
  const provider = toPaymentProvider(status?.payment.provider) ?? defaultProviderByMethod(method);
  const isFailure = mappedStatus === "failed" || mappedStatus === "canceled" || mappedStatus === "expired";

  return {
    id: checkout.id,
    purchaseId: purchase.id,
    method,
    provider,
    status: mappedStatus,
    createdAt: checkout.createdAt,
    updatedAt: status?.updatedAt ?? checkout.updatedAt,
    returnUrl: status?.payment.returnUrl,
    redirectUrl: status?.payment.redirectUrl,
    requiresRedirect: Boolean(status?.payment.requiresConfirmation && status?.payment.redirectUrl),
    errorCode: isFailure ? `checkout_${statusValue}` : undefined,
    errorMessage: isFailure ? "Попытка оплаты завершилась с ошибкой." : undefined,
    providerPayload:
      status?.payment.providerPaymentId || status?.payment.lastProcessedAt
        ? {
            providerPaymentId: status?.payment.providerPaymentId,
            lastProcessedAt: status?.payment.lastProcessedAt,
          }
        : undefined,
    sbp:
      method === "sbp"
        ? {
            qrUrl: status?.payment.sbp?.qrUrl,
            deepLinkUrl: status?.payment.sbp?.deepLinkUrl,
            expiresAt: status?.payment.sbp?.expiresAt,
          }
        : undefined,
  };
};

export const selectLatestPaymentAttempt = (attempts: PaymentAttempt[]) =>
  [...attempts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;

export const selectPaymentAttemptsHistory = (attempts: PaymentAttempt[]) =>
  [...attempts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const selectCheckoutPaymentView = (
  attempts: PaymentAttempt[]
): CheckoutPaymentView | null => {
  const latest = selectLatestPaymentAttempt(attempts);
  if (!latest) return null;
  const canRetry =
    latest.status === "failed" ||
    latest.status === "canceled" ||
    latest.status === "expired" ||
    latest.status === "pending";
  const canCancel = latest.status === "pending" || latest.status === "initiated";

  let actionableMessage = "Статус оплаты актуален.";
  if (latest.status === "pending") {
    actionableMessage = "Ожидаем подтверждение от платежного провайдера.";
  } else if (latest.status === "failed") {
    actionableMessage = "Оплата не прошла. Повторите попытку.";
  } else if (latest.status === "expired") {
    actionableMessage = "Срок попытки оплаты истек. Создайте новую попытку.";
  } else if (latest.status === "canceled") {
    actionableMessage = "Оплата отменена. Вы можете начать новую попытку.";
  } else if (latest.status === "succeeded") {
    actionableMessage = "Оплата подтверждена.";
  }

  return {
    method: latest.method,
    status: latest.status,
    canRetry,
    canCancel,
    actionableMessage,
    requiresRedirect: Boolean(latest.requiresRedirect),
    redirectUrl: latest.redirectUrl,
    sbpView: latest.sbp,
  };
};

export const selectPurchaseAccessGate = (
  attempts: PaymentAttempt[]
): PurchaseAccessGate => {
  const view = selectCheckoutPaymentView(attempts);
  if (!view) {
    return {
      isPaid: false,
      isPending: false,
      reason: "Попытки оплаты не найдены.",
    };
  }

  if (view.status === "succeeded") {
    return {
      isPaid: true,
      isPending: false,
      reason: "Оплата подтверждена.",
    };
  }

  if (view.status === "pending" || view.status === "initiated") {
    return {
      isPaid: false,
      isPending: true,
      reason: "Оплата в обработке. Доступ откроется после подтверждения.",
      cta: { label: "Проверить статус", to: "recheck" },
    };
  }

  return {
    isPaid: false,
    isPending: false,
    reason: "Оплата не подтверждена.",
    cta: { label: "Повторить оплату", to: "retry" },
  };
};

const enrichCheckoutAttempt = async (
  purchase: Purchase,
  checkout: CheckoutListItem
): Promise<PaymentAttempt> => {
  try {
    const status = await getCheckoutStatus(checkout.id);
    return toPaymentAttemptFromCheckout(purchase, checkout, status);
  } catch {
    return toPaymentAttemptFromCheckout(purchase, checkout);
  }
};

export const loadPaymentAttemptsForPurchase = async (params: {
  purchase: Purchase;
  userId?: string;
  email?: string;
}): Promise<PaymentAttempt[]> => {
  const { purchase, userId, email } = params;
  const checkouts = await getCheckouts({
    userId,
    email,
    courseId: purchase.courseId,
  });
  const related = checkouts
    .filter((checkout) =>
      purchase.checkoutId ? checkout.id === purchase.checkoutId || checkout.courseId === purchase.courseId : checkout.courseId === purchase.courseId
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (related.length === 0 && purchase.checkoutId) {
    return [
      {
        id: purchase.checkoutId,
        purchaseId: purchase.id,
        method: toPaymentMethod(purchase.paymentMethod),
        provider: defaultProviderByMethod(toPaymentMethod(purchase.paymentMethod)),
        status: "succeeded",
        createdAt: purchase.purchasedAt,
        updatedAt: purchase.purchasedAt,
      },
    ];
  }

  return Promise.all(related.map((checkout) => enrichCheckoutAttempt(purchase, checkout)));
};

export const retryPaymentAttempt = async (attemptId: string) => {
  const result = await retryCheckout(attemptId);
  const status = await getCheckoutStatus(result.checkoutId);
  return status;
};

export const cancelPaymentAttempt = async (attemptId: string) => {
  await cancelCheckout(attemptId);
  return getCheckoutStatus(attemptId);
};

export const confirmPaymentAttemptPaid = async (attemptId: string) => {
  const result = await confirmCheckoutPaid(attemptId);
  return {
    checkoutId: result.checkoutId,
    checkoutState: result.checkoutState,
    payment: result.payment,
  };
};
