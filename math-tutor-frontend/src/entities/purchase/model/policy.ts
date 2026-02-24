import type { BnplScheduleItem } from "./types";

export type PurchaseFinancialStatus =
  | "ok"
  | "upcoming"
  | "grace"
  | "restricted"
  | "suspended";

export type PurchaseAccessLevel =
  | "full"
  | "restricted_new_content"
  | "suspended_readonly";

export type BnplPolicyConfig = {
  graceDays: number;
  restrictedFromDay: number;
  suspendedFromDay: number;
  upcomingWindowDays: number;
};

export const DEFAULT_BNPL_POLICY: BnplPolicyConfig = {
  graceDays: 3,
  restrictedFromDay: 4,
  suspendedFromDay: 10,
  upcomingWindowDays: 3,
};

export const DEFAULT_BNPL_MARKETING_CONFIG = {
  minCoursePrice: 3_000,
  installmentsCount: 4,
  periodLabel: "× 4 платежа",
};

const toDayStartMs = (value: Date | string) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return Number.NaN;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

export const getNextDueDate = (
  schedule: BnplScheduleItem[] | undefined,
  now = new Date()
) => {
  if (!Array.isArray(schedule) || schedule.length === 0) return null;
  const nowMs = now.getTime();
  const next = schedule
    .filter((item) => item.status !== "paid")
    .map((item) => ({
      dueDate: item.dueDate,
      dueMs: new Date(item.dueDate).getTime(),
    }))
    .filter((item) => Number.isFinite(item.dueMs))
    .sort((a, b) => a.dueMs - b.dueMs)
    .find((item) => item.dueMs >= nowMs);
  return next?.dueDate ?? null;
};

export const getOverdueDays = (
  schedule: BnplScheduleItem[] | undefined,
  now = new Date()
) => {
  if (!Array.isArray(schedule) || schedule.length === 0) return 0;
  const nowDayMs = toDayStartMs(now);
  if (!Number.isFinite(nowDayMs)) return 0;

  const firstOverdue = schedule
    .filter((item) => item.status !== "paid")
    .map((item) => ({
      dueDayMs: toDayStartMs(item.dueDate),
    }))
    .filter((item) => Number.isFinite(item.dueDayMs) && item.dueDayMs < nowDayMs)
    .sort((a, b) => a.dueDayMs - b.dueDayMs)[0];

  if (!firstOverdue) return 0;
  const deltaMs = nowDayMs - firstOverdue.dueDayMs;
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.floor(deltaMs / dayMs));
};

export const getDaysUntilDate = (date: string | undefined, now = new Date()) => {
  if (!date) return null;
  const dateDayMs = toDayStartMs(date);
  const nowDayMs = toDayStartMs(now);
  if (!Number.isFinite(dateDayMs) || !Number.isFinite(nowDayMs)) return null;
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((dateDayMs - nowDayMs) / dayMs);
};

export const getFinancialStatusFromOverdueDays = (
  overdueDays: number,
  policy: BnplPolicyConfig = DEFAULT_BNPL_POLICY
): PurchaseFinancialStatus => {
  if (overdueDays >= policy.suspendedFromDay) return "suspended";
  if (overdueDays >= policy.restrictedFromDay) return "restricted";
  if (overdueDays >= 1 && overdueDays <= policy.graceDays) return "grace";
  return "ok";
};

export const mapFinancialStatusToAccessLevel = (
  status: PurchaseFinancialStatus
): PurchaseAccessLevel => {
  if (status === "restricted") return "restricted_new_content";
  if (status === "suspended") return "suspended_readonly";
  return "full";
};
