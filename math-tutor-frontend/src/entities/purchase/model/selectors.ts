import type {
  BnplPlanPreview,
  BnplPurchaseData,
  BnplPlan,
  BnplProvider,
  BnplScheduleItem,
  Purchase,
  PurchasePaymentMethod,
} from "./types";
import {
  DEFAULT_BNPL_MARKETING_CONFIG,
  DEFAULT_BNPL_POLICY,
  getDaysUntilDate,
  getFinancialStatusFromOverdueDays,
  getNextDueDate,
  getOverdueDays,
  mapFinancialStatusToAccessLevel,
  type PurchaseAccessLevel,
  type PurchaseFinancialStatus,
} from "./policy";
import { getBnplMockOffer } from "./bnplMockAdapter";

export type BnplMarketingInfo = {
  isAvailable: boolean;
  fromAmount: number | null;
  installmentsCount: number;
  periodLabel: string;
  disclaimer: string;
  availablePlans: BnplPlanPreview[];
};

export type PurchaseFinancialView = {
  paymentMethod: PurchasePaymentMethod;
  paymentLabel: string;
  providerLabel: string | null;
  paidCount: number | null;
  installmentsCount: number | null;
  nextPaymentDate: string | null;
  schedule: BnplScheduleItem[];
  financialStatus: PurchaseFinancialStatus;
  overdueDays: number;
  accessLevel: PurchaseAccessLevel;
  isScheduleKnown: boolean;
};

const getProviderLabel = (provider: BnplProvider | undefined) => {
  if (provider === "dolyami") return "Долями";
  if (provider === "podeli") return "Подели";
  if (provider === "other") return "Провайдер оплаты частями";
  if (provider === "unknown" || !provider) return "Провайдер оплаты частями";
  return provider;
};

const normalizeBnplPlan = (bnpl?: BnplPurchaseData): BnplPlan | undefined => {
  if (!bnpl || typeof bnpl !== "object") return undefined;
  if (bnpl.plan) return bnpl.plan;
  if (
    typeof bnpl.installmentsCount !== "number" &&
    typeof bnpl.paidCount !== "number" &&
    typeof bnpl.nextPaymentDate !== "string" &&
    !Array.isArray(bnpl.schedule)
  ) {
    return undefined;
  }
  return {
    installmentsCount: Math.max(1, Math.floor(bnpl.installmentsCount ?? 4)),
    paidCount: Math.max(0, Math.floor(bnpl.paidCount ?? 0)),
    nextPaymentDate:
      typeof bnpl.nextPaymentDate === "string" ? bnpl.nextPaymentDate : undefined,
    schedule: Array.isArray(bnpl.schedule) ? bnpl.schedule : undefined,
  };
};

const normalizeSchedule = (plan?: BnplPlan) => {
  if (!Array.isArray(plan?.schedule)) return [];
  return [...plan.schedule].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
};

const normalizeInstallmentCount = (
  plan: BnplPlan | undefined,
  schedule: BnplScheduleItem[]
) => {
  if (typeof plan?.installmentsCount === "number" && plan.installmentsCount > 0) {
    return Math.floor(plan.installmentsCount);
  }
  if (schedule.length > 0) return schedule.length;
  return DEFAULT_BNPL_MARKETING_CONFIG.installmentsCount;
};

const normalizePaidCount = (
  plan: BnplPlan | undefined,
  schedule: BnplScheduleItem[]
) => {
  if (typeof plan?.paidCount === "number" && plan.paidCount >= 0) {
    return Math.floor(plan.paidCount);
  }
  if (schedule.length > 0) {
    return schedule.filter((item) => item.status === "paid").length;
  }
  return 0;
};

export const selectBnplMarketingInfo = (
  price: number | undefined
): BnplMarketingInfo => {
  const normalizedPrice = Number.isFinite(price) ? Math.max(0, Number(price)) : 0;
  const offer = getBnplMockOffer({
    price: normalizedPrice,
  });
  if (!offer.isAvailable) {
    return {
      isAvailable: false,
      fromAmount: null,
      installmentsCount: DEFAULT_BNPL_MARKETING_CONFIG.installmentsCount,
      periodLabel: DEFAULT_BNPL_MARKETING_CONFIG.periodLabel,
      disclaimer: offer.quote.disclaimer ?? "",
      availablePlans: [],
    };
  }

  const preview =
    offer.quote.preview ??
    offer.quote.availablePlans?.[0] ?? {
      installmentsCount: DEFAULT_BNPL_MARKETING_CONFIG.installmentsCount,
      periodLabel: DEFAULT_BNPL_MARKETING_CONFIG.periodLabel,
    };
  const availablePlans = offer.quote.availablePlans ?? (offer.quote.preview ? [offer.quote.preview] : []);
  return {
    isAvailable: true,
    fromAmount:
      typeof preview.fromAmount === "number"
        ? preview.fromAmount
        : normalizedPrice > 0
          ? Math.ceil(normalizedPrice / preview.installmentsCount)
          : null,
    installmentsCount: preview.installmentsCount,
    periodLabel: preview.periodLabel,
    disclaimer:
      offer.quote.disclaimer ??
      "Точный график платежей рассчитывается на этапе checkout провайдером оплаты частями.",
    availablePlans,
  };
};

export const selectPurchaseFinancialView = (
  purchase: Purchase,
  now = new Date()
): PurchaseFinancialView => {
  const method = purchase.paymentMethod ?? "unknown";
  if (method !== "bnpl") {
    return {
      paymentMethod: method,
      paymentLabel: "Оплачено полностью",
      providerLabel: null,
      paidCount: null,
      installmentsCount: null,
      nextPaymentDate: null,
      schedule: [],
      financialStatus: "ok",
      overdueDays: 0,
      accessLevel: "full",
      isScheduleKnown: true,
    };
  }

  const normalizedPlan = normalizeBnplPlan(purchase.bnpl);
  const schedule = normalizeSchedule(normalizedPlan);
  const installmentsCount = normalizeInstallmentCount(normalizedPlan, schedule);
  const paidCount = normalizePaidCount(normalizedPlan, schedule);
  const nextPaymentDate =
    normalizedPlan?.nextPaymentDate ??
    purchase.bnpl?.nextPaymentDate ??
    getNextDueDate(schedule, now);
  const overdueDays = getOverdueDays(schedule, now);
  const baseStatus = getFinancialStatusFromOverdueDays(overdueDays);
  const daysUntilNext = getDaysUntilDate(nextPaymentDate ?? undefined, now);
  const financialStatus: PurchaseFinancialStatus =
    baseStatus === "ok" &&
    typeof daysUntilNext === "number" &&
    daysUntilNext >= 0 &&
    daysUntilNext <= DEFAULT_BNPL_POLICY.upcomingWindowDays
      ? "upcoming"
      : baseStatus;

  const isScheduleKnown = schedule.length > 0;
  return {
    paymentMethod: "bnpl",
    paymentLabel: `Оплата частями • ${paidCount}/${installmentsCount}`,
    providerLabel: getProviderLabel(purchase.bnpl?.provider),
    paidCount,
    installmentsCount,
    nextPaymentDate: nextPaymentDate ?? null,
    schedule,
    financialStatus,
    overdueDays,
    accessLevel: isScheduleKnown
      ? mapFinancialStatusToAccessLevel(financialStatus)
      : "full",
    isScheduleKnown,
  };
};

export const selectCourseAccessState = (purchase: Purchase | null | undefined) => {
  if (!purchase) {
    return {
      hasPurchase: false,
      financialStatus: "ok" as PurchaseFinancialStatus,
      accessLevel: "full" as PurchaseAccessLevel,
    };
  }
  const financial = selectPurchaseFinancialView(purchase);
  return {
    hasPurchase: true,
    financialStatus: financial.financialStatus,
    accessLevel: financial.accessLevel,
    paymentMethod: financial.paymentMethod,
    overdueDays: financial.overdueDays,
    nextPaymentDate: financial.nextPaymentDate,
  };
};

export const isBnplPurchase = (purchase: Purchase | null | undefined) =>
  (purchase?.paymentMethod ?? "unknown") === "bnpl";
