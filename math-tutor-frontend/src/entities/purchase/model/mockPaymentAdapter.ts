import {
  checkoutPurchase,
  type CheckoutPayload,
} from "./storage";
import {
  cancelCheckout,
  getCheckoutStatus,
  retryCheckout,
  type CheckoutListItem,
} from "@/domain/auth-payments/model/api";
import {
  toPaymentAttemptFromCheckout,
  type PaymentAttempt,
  type PaymentAttemptMethod,
} from "./paymentAttempts";
import type { Purchase } from "./types";

export interface PaymentAdapter {
  createAttempt(params: {
    purchase: Purchase;
    method: Extract<PaymentAttemptMethod, "card" | "sbp">;
    payload: Omit<CheckoutPayload, "paymentMethod">;
    returnUrl: string;
  }): Promise<PaymentAttempt>;
  refreshAttempt(attemptId: string, purchase: Purchase): Promise<PaymentAttempt>;
  retryAttempt(attemptId: string, purchase: Purchase): Promise<PaymentAttempt>;
  cancelAttempt(attemptId: string, purchase: Purchase): Promise<PaymentAttempt>;
}

export class MockPaymentAdapter implements PaymentAdapter {
  async createAttempt(params: {
    purchase: Purchase;
    method: Extract<PaymentAttemptMethod, "card" | "sbp">;
    payload: Omit<CheckoutPayload, "paymentMethod">;
    returnUrl: string;
  }) {
    const response = await checkoutPurchase({
      ...params.payload,
      paymentMethod: params.method,
    });
    const status = await getCheckoutStatus(response.checkoutId);
    return toPaymentAttemptFromCheckout(
      params.purchase,
      {
        id: response.checkoutId,
        courseId: params.purchase.courseId,
        email: params.payload.email ?? "",
        method: params.method,
        state: status.state as CheckoutListItem["state"],
        createdAt: status.createdAt,
        updatedAt: status.updatedAt,
        userId: params.payload.userId,
      },
      status
    );
  }

  async refreshAttempt(attemptId: string, purchase: Purchase) {
    const status = await getCheckoutStatus(attemptId);
    return toPaymentAttemptFromCheckout(
      purchase,
      {
        id: attemptId,
        courseId: purchase.courseId,
        email: purchase.userId ?? "",
        method: status.method as CheckoutListItem["method"],
        state: status.state as CheckoutListItem["state"],
        createdAt: status.createdAt,
        updatedAt: status.updatedAt,
      },
      status
    );
  }

  async retryAttempt(attemptId: string, purchase: Purchase) {
    await retryCheckout(attemptId);
    return this.refreshAttempt(attemptId, purchase);
  }

  async cancelAttempt(attemptId: string, purchase: Purchase) {
    await cancelCheckout(attemptId);
    return this.refreshAttempt(attemptId, purchase);
  }
}
