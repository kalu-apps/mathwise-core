import type {
  BnplPurchaseData,
  BnplQuote,
  BnplPlanPreview,
  BnplPlan,
  BnplProvider,
  BnplScheduleItem,
  BnplScheduleStatus,
  Purchase,
  PurchasePaymentMethod,
} from "./types";
import type { User } from "@/entities/user/model/types";
import { api } from "@/shared/api/client";
import { buildIdempotencyHeaders } from "@/shared/lib/idempotency";
import { dispatchDataUpdate } from "@/shared/lib/dataUpdateBus";
import { buildBnplMockPurchaseData } from "./bnplMockAdapter";
import type {
  ConsentScope,
  EntitlementState,
  IdentityState,
} from "@/domain/auth-payments/model/types";

const isPaymentMethod = (value: unknown): value is PurchasePaymentMethod =>
  value === "card" ||
  value === "sbp" ||
  value === "bnpl" ||
  value === "mock" ||
  value === "unknown";

const isBnplProvider = (value: unknown): value is BnplProvider =>
  value === "dolyami" ||
  value === "podeli" ||
  value === "unknown" ||
  value === "other";

const isScheduleStatus = (value: unknown): value is BnplScheduleStatus =>
  value === "paid" || value === "due" || value === "overdue" || value === "failed";

const isBnplLastKnownStatus = (
  value: unknown
): value is NonNullable<BnplPurchaseData["lastKnownStatus"]> =>
  value === "active" ||
  value === "completed" ||
  value === "overdue" ||
  value === "canceled";

const normalizeScheduleItem = (item: unknown): BnplScheduleItem | null => {
  if (!item || typeof item !== "object") return null;
  const data = item as {
    dueDate?: unknown;
    amount?: unknown;
    status?: unknown;
  };
  if (typeof data.dueDate !== "string" || !data.dueDate.trim()) return null;
  const amount =
    typeof data.amount === "number" && Number.isFinite(data.amount)
      ? Math.max(0, data.amount)
      : 0;
  const status = isScheduleStatus(data.status) ? data.status : "due";
  return {
    dueDate: data.dueDate,
    amount,
    status,
  };
};

const addDaysIso = (dateIso: string, days: number) => {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return dateIso;
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

const buildFallbackBnplData = (purchase: Purchase): BnplPurchaseData => {
  const installmentsCount = 4;
  const installmentAmount = Math.ceil((purchase.price ?? 0) / installmentsCount);
  const purchasedAt = purchase.purchasedAt || new Date().toISOString();
  const schedule: BnplScheduleItem[] = Array.from(
    { length: installmentsCount },
    (_, index) => ({
      dueDate: addDaysIso(purchasedAt, 14 * index),
      amount: installmentAmount,
        status: index === 0 ? "paid" : "due",
    })
  );
  const fallback = buildBnplMockPurchaseData({
    price: purchase.price ?? 0,
    purchasedAt,
    provider: "unknown",
    selectedInstallmentsCount: installmentsCount,
    paidCount: 1,
  });
  return {
    ...fallback,
    plan: {
      installmentsCount,
      paidCount: 1,
      nextPaymentDate: schedule[1]?.dueDate,
      schedule,
    },
    installmentsCount,
    paidCount: 1,
    nextPaymentDate: schedule[1]?.dueDate,
    schedule,
    lastKnownStatus: "active",
  };
};

const normalizePlanPreview = (value: unknown): BnplPlanPreview | null => {
  if (!value || typeof value !== "object") return null;
  const item = value as {
    installmentsCount?: unknown;
    periodLabel?: unknown;
    fromAmount?: unknown;
    total?: unknown;
  };
  if (
    typeof item.installmentsCount !== "number" ||
    !Number.isFinite(item.installmentsCount) ||
    item.installmentsCount <= 0
  ) {
    return null;
  }
  const normalized: BnplPlanPreview = {
    installmentsCount: Math.floor(item.installmentsCount),
    periodLabel:
      typeof item.periodLabel === "string" && item.periodLabel.trim()
        ? item.periodLabel
        : `× ${Math.floor(item.installmentsCount)} платежей`,
  };
  if (typeof item.fromAmount === "number" && Number.isFinite(item.fromAmount)) {
    normalized.fromAmount = Math.max(0, item.fromAmount);
  }
  if (typeof item.total === "number" && Number.isFinite(item.total)) {
    normalized.total = Math.max(0, item.total);
  }
  return normalized;
};

const normalizeBnplQuote = (value: unknown): BnplQuote | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const quote = value as {
    availablePlans?: unknown;
    preview?: unknown;
    disclaimer?: unknown;
  };
  const availablePlans = Array.isArray(quote.availablePlans)
    ? quote.availablePlans
        .map((item) => normalizePlanPreview(item))
        .filter((item): item is BnplPlanPreview => Boolean(item))
    : [];
  const preview = normalizePlanPreview(quote.preview);
  const disclaimer =
    typeof quote.disclaimer === "string" && quote.disclaimer.trim()
      ? quote.disclaimer
      : undefined;
  if (availablePlans.length === 0 && !preview && !disclaimer) return undefined;
  return {
    availablePlans: availablePlans.length > 0 ? availablePlans : undefined,
    preview: preview ?? availablePlans[0],
    disclaimer,
  };
};

const normalizeBnplData = (purchase: Purchase): BnplPurchaseData | undefined => {
  if (purchase.paymentMethod !== "bnpl") return undefined;

  const source = purchase.bnpl;
  if (!source || typeof source !== "object") {
    return buildFallbackBnplData(purchase);
  }

  const raw = source as {
    provider?: unknown;
    offer?: unknown;
    plan?: unknown;
    lastKnownStatus?: unknown;
    installmentsCount?: unknown;
    paidCount?: unknown;
    nextPaymentDate?: unknown;
    schedule?: unknown;
  };
  const planSource =
    raw.plan && typeof raw.plan === "object"
      ? (raw.plan as {
          installmentsCount?: unknown;
          paidCount?: unknown;
          nextPaymentDate?: unknown;
          schedule?: unknown;
        })
      : raw;

  const schedule = Array.isArray(planSource.schedule)
    ? planSource.schedule
        .map((item) => normalizeScheduleItem(item))
        .filter((item): item is BnplScheduleItem => Boolean(item))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    : [];
  const installmentsCount =
    typeof planSource.installmentsCount === "number" &&
    Number.isFinite(planSource.installmentsCount) &&
    planSource.installmentsCount > 0
      ? Math.floor(planSource.installmentsCount)
      : schedule.length > 0
      ? schedule.length
      : 4;
  const paidCount =
    typeof planSource.paidCount === "number" &&
    Number.isFinite(planSource.paidCount) &&
    planSource.paidCount >= 0
      ? Math.floor(planSource.paidCount)
      : schedule.filter((item) => item.status === "paid").length;
  const nextPaymentDate =
    typeof planSource.nextPaymentDate === "string" &&
    planSource.nextPaymentDate.trim()
      ? planSource.nextPaymentDate
      : schedule.find((item) => item.status !== "paid")?.dueDate;

  const plan: BnplPlan = {
    installmentsCount,
    paidCount: Math.min(Math.max(paidCount, 0), installmentsCount),
    nextPaymentDate,
    schedule,
  };

  return {
    provider: isBnplProvider(raw.provider) ? raw.provider : "unknown",
    offer: normalizeBnplQuote(raw.offer),
    plan,
    lastKnownStatus: isBnplLastKnownStatus(raw.lastKnownStatus)
      ? raw.lastKnownStatus
      : "active",
    // legacy flattened compatibility fields
    installmentsCount: plan.installmentsCount,
    paidCount: plan.paidCount,
    nextPaymentDate: plan.nextPaymentDate,
    schedule: plan.schedule,
  };
};

const normalizePurchase = (purchase: Purchase): Purchase => {
  const normalizedMethod = isPaymentMethod(purchase.paymentMethod)
    ? purchase.paymentMethod
    : purchase.bnpl
    ? "bnpl"
    : "unknown";
  const normalized: Purchase = {
    ...purchase,
    paymentMethod: normalizedMethod,
  };
  const bnpl = normalizeBnplData({
    ...purchase,
    paymentMethod: normalizedMethod,
  });
  if (bnpl) {
    normalized.bnpl = bnpl;
  } else {
    delete normalized.bnpl;
  }
  return normalized;
};

export async function getPurchases(
  params?: { userId?: string },
  options?: { forceFresh?: boolean }
): Promise<Purchase[]> {
  const query = new URLSearchParams();
  if (params?.userId) {
    query.set("userId", params.userId);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const purchases = await api.get<Purchase[]>(`/purchases${suffix}`, {
    dedupe: options?.forceFresh ? false : undefined,
    cacheTtlMs: options?.forceFresh ? 0 : undefined,
  });
  return purchases.map(normalizePurchase);
}

export async function savePurchases(purchases: Purchase[]): Promise<void> {
  await api.put(
    "/purchases",
    purchases.map((item) => normalizePurchase(item))
  );
}

export async function addPurchase(purchase: Purchase): Promise<void> {
  const purchases = await getPurchases({ userId: purchase.userId });
  const exists = purchases.some(
    (p) => p.userId === purchase.userId && p.courseId === purchase.courseId
  );
  if (exists) return;
  await savePurchases([...purchases, normalizePurchase(purchase)]);
}

export type CheckoutPayload = {
  userId?: string;
  email?: string;
  firstName: string;
  lastName: string;
  phone: string;
  courseId: string;
  price: number;
  paymentMethod?: "mock" | "card" | "sbp" | "bnpl";
  bnplInstallmentsCount?: number;
  consents?: {
    acceptedScopes: ConsentScope[];
  };
};

export type CheckoutAccessState =
  | "active"
  | "awaiting_profile"
  | "awaiting_verification"
  | "paid_but_restricted";

export type CheckoutPurchaseResponse = {
  user?: User;
  checkoutId: string;
  checkoutState: string;
  payment?: {
    provider: "mock" | "card" | "sbp" | "bnpl";
    status: "awaiting_payment" | "paid" | "failed" | "canceled" | "expired";
    paymentUrl?: string;
    redirectUrl?: string;
    returnUrl?: string;
    providerPaymentId?: string;
    requiresConfirmation: boolean;
    sbp?: {
      qrUrl?: string;
      deepLinkUrl?: string;
      expiresAt?: string;
    };
  };
  identityState: IdentityState;
  entitlementState: EntitlementState | "none";
  profileComplete: boolean;
  accessState: CheckoutAccessState;
};

export async function checkoutPurchase(
  payload: CheckoutPayload,
  options?: { idempotencyKey?: string }
): Promise<CheckoutPurchaseResponse> {
  return api.post<CheckoutPurchaseResponse>("/purchases/checkout", payload, {
    headers: buildIdempotencyHeaders("checkout", options?.idempotencyKey),
  });
}

export async function attachCheckoutPurchase(
  checkoutId: string,
  options?: { idempotencyKey?: string }
): Promise<CheckoutPurchaseResponse> {
  return api.post<CheckoutPurchaseResponse>("/purchases/checkout/attach", {
    checkoutId,
  }, {
    headers: buildIdempotencyHeaders("checkout_attach", options?.idempotencyKey),
  });
}

export type BnplInstallmentPaymentResponse = {
  ok: boolean;
  purchaseId: string;
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
  };
  bnpl: {
    applied: boolean;
    installmentsCount: number;
    paidCount: number;
    nextPaymentDate?: string;
    completed: boolean;
  };
  purchase: Purchase;
};

export async function payBnplInstallment(
  purchaseId: string,
  payload?: { source?: string }
): Promise<BnplInstallmentPaymentResponse> {
  const response = await api.post<BnplInstallmentPaymentResponse>(
    `/purchases/${encodeURIComponent(purchaseId)}/bnpl/pay-installment`,
    payload ?? {}
  );
  dispatchDataUpdate("purchase_bnpl_installment_paid", { immediate: true });
  return response;
}

export async function payBnplRemaining(
  purchaseId: string,
  payload?: { source?: string }
): Promise<BnplInstallmentPaymentResponse> {
  const response = await api.post<BnplInstallmentPaymentResponse>(
    `/purchases/${encodeURIComponent(purchaseId)}/bnpl/pay-remaining`,
    payload ?? {}
  );
  dispatchDataUpdate("purchase_bnpl_remaining_paid", { immediate: true });
  return response;
}

export async function deletePurchasesByCourse(courseId: string): Promise<void> {
  await api.del(`/purchases?courseId=${encodeURIComponent(courseId)}`);
}
