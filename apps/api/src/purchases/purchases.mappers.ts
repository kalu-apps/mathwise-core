import type { CheckoutProcessDto, CheckoutStateDto, PurchaseRecordDto } from "./purchases.types";

export type PurchaseRow = {
  id: string;
  userId: string;
  courseId: string;
  price: number;
  tariff: "standard" | "premium" | null;
  purchasedAt: string;
  paymentMethod: string | null;
  checkoutId: string | null;
  bnpl: unknown;
  courseSnapshot: unknown;
  lessonsSnapshot: unknown;
  purchasedTestItemIds: unknown;
};

export type CheckoutRow = {
  id: string;
  userId: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  courseId: string;
  method: "mock" | "card" | "sbp" | "bnpl";
  bnplInstallmentsCount: number | null;
  amount: number;
  tariff: "standard" | "premium" | null;
  currency: string;
  state: CheckoutStateDto;
  providerPaymentId: string | null;
  providerEventId: string | null;
  providerPayload: unknown;
  consentSnapshot: unknown;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
};

const normalizePurchasedTestItemIds = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
  return normalized.length > 0 ? normalized : undefined;
};

export const mapPurchaseRow = (row: PurchaseRow): PurchaseRecordDto => ({
  id: row.id,
  userId: row.userId,
  courseId: row.courseId,
  price: Number(row.price),
  tariff: row.tariff ?? undefined,
  purchasedAt: row.purchasedAt,
  paymentMethod: row.paymentMethod ?? undefined,
  checkoutId: row.checkoutId ?? undefined,
  bnpl: row.bnpl ?? undefined,
  courseSnapshot:
    row.courseSnapshot && typeof row.courseSnapshot === "object"
      ? row.courseSnapshot
      : undefined,
  lessonsSnapshot: Array.isArray(row.lessonsSnapshot)
    ? row.lessonsSnapshot
    : undefined,
  purchasedTestItemIds: normalizePurchasedTestItemIds(row.purchasedTestItemIds),
});

export const mapCheckoutRow = (row: CheckoutRow): CheckoutProcessDto => ({
  id: row.id,
  userId: row.userId ?? undefined,
  email: row.email,
  firstName: row.firstName ?? undefined,
  lastName: row.lastName ?? undefined,
  phone: row.phone ?? undefined,
  courseId: row.courseId,
  method: row.method,
  bnplInstallmentsCount:
    row.bnplInstallmentsCount && Number.isFinite(row.bnplInstallmentsCount)
      ? Math.max(1, Math.floor(row.bnplInstallmentsCount))
      : undefined,
  amount: Number(row.amount),
  tariff: row.tariff ?? undefined,
  currency: row.currency || "RUB",
  state: row.state,
  providerPaymentId: row.providerPaymentId ?? undefined,
  providerEventId: row.providerEventId ?? undefined,
  providerPayload:
    row.providerPayload && typeof row.providerPayload === "object"
      ? (row.providerPayload as Record<string, unknown>)
      : undefined,
  consentSnapshot: Array.isArray(row.consentSnapshot)
    ? row.consentSnapshot
        .map((value) => (typeof value === "string" ? value : ""))
        .filter((value) => value.length > 0)
    : undefined,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  expiresAt: row.expiresAt ?? undefined,
});
