import type { CheckoutProcessDto, CheckoutStateDto, PurchaseRecordDto } from "./purchases.types";

export type PurchaseRow = {
  id: string;
  userId: string;
  courseId: string;
  price: number;
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
  courseId: string;
  method: "mock" | "card" | "sbp" | "bnpl";
  bnplInstallmentsCount: number | null;
  amount: number;
  currency: string;
  state: CheckoutStateDto;
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
  courseId: row.courseId,
  method: row.method,
  bnplInstallmentsCount:
    row.bnplInstallmentsCount && Number.isFinite(row.bnplInstallmentsCount)
      ? Math.max(1, Math.floor(row.bnplInstallmentsCount))
      : undefined,
  amount: Number(row.amount),
  currency: row.currency || "RUB",
  state: row.state,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  expiresAt: row.expiresAt ?? undefined,
});
