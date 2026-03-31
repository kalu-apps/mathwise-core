export type CheckoutMethodDto = "mock" | "card" | "sbp" | "bnpl";

export type CheckoutStateDto =
  | "created"
  | "awaiting_payment"
  | "paid"
  | "failed"
  | "canceled"
  | "expired"
  | "provisioning"
  | "provisioned";

export type CheckoutPaymentStatusDto =
  | "awaiting_payment"
  | "paid"
  | "failed"
  | "canceled"
  | "expired";

export type CheckoutAccessStateDto =
  | "active"
  | "awaiting_profile"
  | "awaiting_verification"
  | "paid_but_restricted";

export type CheckoutPaymentDto = {
  provider: CheckoutMethodDto;
  status: CheckoutPaymentStatusDto;
  outcome: "applied" | "awaiting_user_action" | "canceled" | "failed";
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

export type PurchaseRecordDto = {
  id: string;
  userId: string;
  courseId: string;
  price: number;
  purchasedAt: string;
  paymentMethod?: string;
  checkoutId?: string;
  bnpl?: unknown;
  courseSnapshot?: unknown;
  lessonsSnapshot?: unknown;
  purchasedTestItemIds?: string[];
};

export type CheckoutProcessDto = {
  id: string;
  userId?: string;
  email: string;
  courseId: string;
  method: CheckoutMethodDto;
  bnplInstallmentsCount?: number;
  amount: number;
  currency: string;
  state: CheckoutStateDto;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
};

export type CheckoutListItemDto = CheckoutProcessDto;

export type CheckoutStatusResponseDto = {
  checkoutId: string;
  state: CheckoutStateDto;
  method: CheckoutMethodDto;
  bnplInstallmentsCount?: number;
  amount: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  isTerminal: boolean;
  payment: CheckoutPaymentDto;
  access: {
    identityState: "unverified" | "verified";
    entitlementState: "none" | "active";
    profileComplete: boolean;
    accessState: CheckoutAccessStateDto;
  } | null;
};

export type CheckoutPayloadDto = {
  userId?: string;
  email?: string;
  firstName: string;
  lastName: string;
  phone: string;
  courseId: string;
  price: number;
  paymentMethod?: CheckoutMethodDto;
  bnplInstallmentsCount?: number;
  consents?: {
    acceptedScopes: string[];
  };
};

export type CheckoutPurchaseResponseDto = {
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: "student" | "teacher";
    phone?: string;
    photo?: string;
  };
  checkoutId: string;
  checkoutState: CheckoutStateDto;
  payment?: CheckoutPaymentDto;
  identityState: "unverified" | "verified";
  entitlementState: "none" | "active";
  profileComplete: boolean;
  accessState: CheckoutAccessStateDto;
};

export type CheckoutActionResponseDto = {
  ok: boolean;
  checkoutId: string;
  checkoutState: CheckoutStateDto;
  payment: CheckoutPaymentDto;
  access: CheckoutStatusResponseDto["access"];
};

export type CancelCheckoutResponseDto = {
  ok: boolean;
  idempotent?: boolean;
  checkout: {
    id: string;
    state: CheckoutStateDto;
  } | null;
};

export type CheckoutTimelineResponseDto = {
  checkoutId: string;
  state: CheckoutStateDto;
  timeline: Array<{
    at: string;
    type: string;
    details: Record<string, unknown>;
  }>;
};

export type BnplInstallmentPaymentResponseDto = {
  ok: boolean;
  purchaseId: string;
  checkoutId: string;
  checkoutState: CheckoutStateDto;
  payment: CheckoutPaymentDto;
  bnpl: {
    applied: boolean;
    installmentsCount: number;
    paidCount: number;
    nextPaymentDate?: string;
    completed: boolean;
  };
  purchase: PurchaseRecordDto;
};

export const isTerminalCheckoutState = (state: CheckoutStateDto) =>
  state === "failed" ||
  state === "canceled" ||
  state === "expired" ||
  state === "provisioned";
