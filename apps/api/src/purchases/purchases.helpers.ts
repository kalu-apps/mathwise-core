import crypto from "node:crypto";
import type { CheckoutMethodDto } from "./purchases.types";

export const CHECKOUT_TTL_MS = 30 * 60 * 1000;
export const IDEMPOTENCY_TTL_SEC = 12 * 60 * 60;
export const LOCK_TTL_SEC = 15;

export const nowIso = () => new Date().toISOString();

export const ensureId = (prefix: string) => {
  if (typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

export const lockToken = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

export const normalizeEmail = (value: string | undefined | null) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const normalizeCheckoutMethod = (value: unknown): CheckoutMethodDto => {
  if (value === "mock" || value === "card" || value === "sbp" || value === "bnpl") {
    return value;
  }
  return "card";
};

export const normalizeInstallmentsCount = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 4;
  return Math.max(2, Math.min(12, Math.floor(parsed)));
};

export const toPositiveAmount = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Math.max(0, Math.round(fallback));
  return Math.max(0, Math.round(parsed));
};

export const buildCheckoutExpiresAt = (baseIso: string) =>
  new Date(Date.parse(baseIso) + CHECKOUT_TTL_MS).toISOString();

export const parseBnplPlan = (bnpl: unknown, purchasedAt: string) => {
  const source = bnpl && typeof bnpl === "object" ? (bnpl as Record<string, unknown>) : null;
  const plan =
    source?.plan && typeof source.plan === "object"
      ? (source.plan as Record<string, unknown>)
      : source;

  const installmentsCount = normalizeInstallmentsCount(plan?.installmentsCount);
  const paidCountRaw = Number(plan?.paidCount ?? source?.paidCount ?? 0);
  const paidCount = Number.isFinite(paidCountRaw)
    ? Math.max(0, Math.min(installmentsCount, Math.floor(paidCountRaw)))
    : 0;

  const schedule: Array<{
    dueDate: string;
    amount: number;
    status: "paid" | "due" | "overdue" | "failed";
  }> = [];
  const providedSchedule = Array.isArray(plan?.schedule)
    ? (plan.schedule as Array<Record<string, unknown>>)
    : Array.isArray(source?.schedule)
      ? (source?.schedule as Array<Record<string, unknown>>)
      : [];

  for (let index = 0; index < installmentsCount; index += 1) {
    const fallbackDate = new Date(Date.parse(purchasedAt) + 14 * 24 * 60 * 60 * 1000 * index)
      .toISOString();
    const candidate = providedSchedule[index];
    const dueDate =
      typeof candidate?.dueDate === "string" && candidate.dueDate.trim()
        ? candidate.dueDate
        : fallbackDate;
    const amountRaw = Number(candidate?.amount ?? 0);
    const amount = Number.isFinite(amountRaw) ? Math.max(0, Math.round(amountRaw)) : 0;
    const statusRaw = candidate?.status;
    const status =
      statusRaw === "paid" ||
      statusRaw === "due" ||
      statusRaw === "overdue" ||
      statusRaw === "failed"
        ? statusRaw
        : index < paidCount
          ? "paid"
          : "due";
    schedule.push({ dueDate, amount, status });
  }

  return {
    provider:
      source?.provider === "dolyami" || source?.provider === "podeli" || source?.provider === "other"
        ? source.provider
        : "unknown",
    installmentsCount,
    paidCount,
    schedule,
  };
};
