import { api } from "@/shared/api/client";
import type {
  CourseAccessDecision,
  CourseAccessListResponse,
  LessonAccessDecision,
} from "./access";
import type { PaymentEventStatus } from "./types";
import type { CheckoutMethod, CheckoutState } from "./types";

export async function getCourseAccessDecision(params: {
  courseId: string;
  userId?: string;
}): Promise<CourseAccessDecision> {
  const query = new URLSearchParams();
  if (params.userId) {
    query.set("userId", params.userId);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return api.get<CourseAccessDecision>(
    `/access/courses/${encodeURIComponent(params.courseId)}${suffix}`
  );
}

export async function getCourseAccessList(params?: {
  userId?: string;
}): Promise<CourseAccessListResponse> {
  const query = new URLSearchParams();
  if (params?.userId) {
    query.set("userId", params.userId);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return api.get<CourseAccessListResponse>(`/access/courses${suffix}`);
}

export async function getLessonAccessDecision(params: {
  lessonId: string;
  userId?: string;
}): Promise<LessonAccessDecision> {
  const query = new URLSearchParams();
  if (params.userId) {
    query.set("userId", params.userId);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return api.get<LessonAccessDecision>(
    `/access/lessons/${encodeURIComponent(params.lessonId)}${suffix}`
  );
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
  return api.post<{
    ok: boolean;
    idempotent?: boolean;
    checkout: { id: string; state: string } | null;
  }>(`/checkouts/${encodeURIComponent(checkoutId)}/cancel`, {});
}

export async function runSupportReconciliation(params?: {
  dryRun?: boolean;
  includeHighRisk?: boolean;
  userId?: string;
  courseId?: string;
}) {
  return api.post<{
    ok: boolean;
    dryRun: boolean;
    initialCount: number;
    appliedCount?: number;
    skippedCount?: number;
    remainingCount?: number;
  }>("/support/reconciliation/run", params ?? {});
}

export type CheckoutStatusResponse = {
  checkoutId: string;
  state: string;
  method: string;
  bnplInstallmentsCount?: number;
  amount: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  isTerminal: boolean;
  payment: {
    provider: string;
    status: string;
    outcome: string;
    paymentUrl?: string;
    redirectUrl?: string;
    returnUrl?: string;
    providerPaymentId?: string;
    requiresConfirmation: boolean;
    lastProcessedAt: string | null;
    sbp?: {
      qrUrl?: string;
      deepLinkUrl?: string;
      expiresAt?: string;
    };
  };
  access: {
    identityState: string;
    entitlementState: string;
    profileComplete: boolean;
    accessState:
      | "active"
      | "awaiting_profile"
      | "awaiting_verification"
      | "paid_but_restricted";
  } | null;
};

export async function getCheckoutStatus(checkoutId: string) {
  return api.get<CheckoutStatusResponse>(
    `/checkouts/${encodeURIComponent(checkoutId)}/status`
  );
}

export async function retryCheckout(checkoutId: string) {
  return api.post<{
    ok: boolean;
    checkoutId: string;
    checkoutState: string;
    payment: {
      provider: string;
      status: string;
      outcome: string;
      paymentUrl?: string;
      redirectUrl?: string;
      returnUrl?: string;
      providerPaymentId?: string;
      requiresConfirmation: boolean;
      lastProcessedAt: string | null;
      sbp?: {
        qrUrl?: string;
        deepLinkUrl?: string;
        expiresAt?: string;
      };
    };
  }>(`/checkouts/${encodeURIComponent(checkoutId)}/retry`, {});
}

export async function confirmCheckoutPaid(checkoutId: string) {
  return api.post<{
    ok: boolean;
    checkoutId: string;
    checkoutState: string;
    payment: CheckoutStatusResponse["payment"];
    access: CheckoutStatusResponse["access"];
  }>(`/checkouts/${encodeURIComponent(checkoutId)}/confirm-paid`, {});
}

export async function getCheckoutTimeline(checkoutId: string) {
  return api.get<{
    checkoutId: string;
    state: string;
    timeline: Array<{
      at: string;
      type: string;
      details: Record<string, unknown>;
    }>;
  }>(`/checkouts/${encodeURIComponent(checkoutId)}/timeline`);
}

export type CheckoutListItem = {
  id: string;
  userId?: string;
  email: string;
  courseId: string;
  method: CheckoutMethod;
  bnplInstallmentsCount?: number;
  state: CheckoutState;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
};

export async function getCheckouts(params?: {
  userId?: string;
  email?: string;
  courseId?: string;
}) {
  const query = new URLSearchParams();
  if (params?.userId) query.set("userId", params.userId);
  if (params?.email) query.set("email", params.email);
  if (params?.courseId) query.set("courseId", params.courseId);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return api.get<CheckoutListItem[]>(`/checkouts${suffix}`);
}
