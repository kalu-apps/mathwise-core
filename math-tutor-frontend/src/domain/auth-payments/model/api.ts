import { api } from "@/shared/api/client";
import { accessGateway, purchaseGateway } from "@/shared/gateway";
import type {
  CourseAccessDecision,
  CourseAccessListResponse,
  LessonAccessDecision,
} from "./access";
import type { PaymentEventStatus } from "./types";
import type {
  CheckoutListItemContract,
  CheckoutStatusResponseContract,
} from "@/shared/contracts/purchase.contract";

export async function getCourseAccessDecision(params: {
  courseId: string;
}): Promise<CourseAccessDecision> {
  return accessGateway.getCourseAccessDecision(params);
}

export async function getCourseAccessList(): Promise<CourseAccessListResponse> {
  return accessGateway.getCourseAccessList();
}

export async function getLessonAccessDecision(params: {
  lessonId: string;
}): Promise<LessonAccessDecision> {
  return accessGateway.getLessonAccessDecision(params);
}

export type CardWebhookStatus =
  | "awaiting_payment"
  | "paid"
  | "failed"
  | "canceled"
  | "expired"
  | "refunded"
  | "chargeback";

export type CardWebhookPayload = {
  eventId: string;
  checkoutId: string;
  status: CardWebhookStatus;
  providerPaymentId?: string;
  occurredAt?: string;
  payload?: unknown;
};

export async function postCardWebhook(
  payload: CardWebhookPayload,
  headers: {
    signature: string;
    timestamp: string;
  }
) {
  return api.post<{
    ok: boolean;
    event: { status: PaymentEventStatus; outcome: string };
    checkout: { id: string; state: string } | null;
  }>("/payments/providers/card/webhook", payload, {
    notifyDataUpdate: false,
    headers: {
      "x-card-signature": headers.signature,
      "x-card-timestamp": headers.timestamp,
    },
  });
}

export async function refundCardCheckout(input: {
  checkoutId: string;
  reason?: string;
}) {
  return api.post<{
    ok: boolean;
    event: { status: PaymentEventStatus; outcome: string };
  }>("/payments/providers/card/refund", input);
}

export async function getNotificationOutbox(params?: {
  status?: "queued" | "sent" | "failed";
  template?: string;
  email?: string;
}) {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.template) query.set("template", params.template);
  if (params?.email) query.set("email", params.email);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return api.get<
    Array<{
      id: string;
      template: string;
      status: string;
      recipientEmail: string;
      createdAt: string;
      sentAt?: string;
    }>
  >(`/notifications/outbox${suffix}`);
}

export async function retryNotificationOutbox(id: string) {
  return api.post<{ ok: boolean; delivered: number }>(
    "/notifications/outbox/retry",
    { id }
  );
}

export async function cancelCheckout(checkoutId: string) {
  return purchaseGateway.cancelCheckout(checkoutId);
}

export async function runSupportReconciliation(params?: {
  dryRun?: boolean;
  includeHighRisk?: boolean;
  userId?: string;
  courseId?: string;
}) {
  return {
    ok: true,
    dryRun: params?.dryRun ?? false,
    initialCount: 0,
    appliedCount: 0,
    skippedCount: 0,
    remainingCount: 0,
  };
}

export type CheckoutStatusResponse = CheckoutStatusResponseContract;

export async function getCheckoutStatus(checkoutId: string) {
  return purchaseGateway.getCheckoutStatus(checkoutId);
}

export async function retryCheckout(checkoutId: string) {
  return purchaseGateway.retryCheckout(checkoutId);
}

export async function stageConfirmCheckout(
  checkoutId: string,
  options?: { idempotencyKey?: string }
) {
  return purchaseGateway.stageConfirmCheckout(checkoutId, options);
}

export async function getCheckoutTimeline(checkoutId: string) {
  return purchaseGateway.getCheckoutTimeline(checkoutId);
}

export type CheckoutListItem = CheckoutListItemContract;

export async function getCheckouts(params?: {
  userId?: string;
  email?: string;
  courseId?: string;
}) {
  return purchaseGateway.getCheckouts(params);
}
