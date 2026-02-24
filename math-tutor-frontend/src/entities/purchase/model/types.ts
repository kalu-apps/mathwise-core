import type { Course } from "../../course/model/types";
import type { Lesson } from "../../lesson/model/types";

export type PurchasePaymentMethod = "card" | "sbp" | "bnpl" | "mock" | "unknown";

export type BnplProvider = "unknown" | "dolyami" | "podeli" | "other";

export type BnplScheduleStatus = "paid" | "due" | "overdue" | "failed";

export type BnplInstallment = {
  dueDate: string;
  amount: number;
  status: BnplScheduleStatus;
};

export type BnplScheduleItem = BnplInstallment;

export type BnplLastKnownStatus =
  | "active"
  | "completed"
  | "overdue"
  | "canceled";

export type BnplPlanPreview = {
  installmentsCount: number;
  periodLabel: string;
  fromAmount?: number;
  total?: number;
};

export type BnplQuote = {
  availablePlans?: BnplPlanPreview[];
  preview?: BnplPlanPreview;
  disclaimer?: string;
};

export type BnplPlan = {
  installmentsCount: number;
  paidCount: number;
  nextPaymentDate?: string;
  schedule?: BnplInstallment[];
};

export type BnplPurchaseData = {
  provider: BnplProvider;
  offer?: BnplQuote;
  plan?: BnplPlan;
  lastKnownStatus?: BnplLastKnownStatus;

  // Legacy flattened compatibility fields (will be removed after full migration).
  installmentsCount?: number;
  paidCount?: number;
  nextPaymentDate?: string;
  schedule?: BnplInstallment[];
};

export type Purchase = {
  id: string;
  userId: string;
  courseId: string;
  price: number;
  purchasedAt: string;
  paymentMethod?: PurchasePaymentMethod;
  checkoutId?: string;
  bnpl?: BnplPurchaseData;
  courseSnapshot?: Course;
  lessonsSnapshot?: Lesson[];
  purchasedTestItemIds?: string[];
};
