import type { Purchase } from "@/entities/purchase/model/types";
import type {
  CheckoutMethod,
  CheckoutState,
  ConsentScope,
  EntitlementState,
  IdentityState,
} from "@/domain/auth-payments/model/types";

export type CheckoutPayloadContract = {
  userId?: string;
  email?: string;
  identityIntentId?: string;
  firstName: string;
  lastName: string;
  phone: string;
  courseId: string;
  price: number;
  tariff?: "standard" | "premium";
  paymentMethod?: "card" | "sbp" | "bnpl";
  bnplInstallmentsCount?: number;
  consents?: {
    acceptedScopes: ConsentScope[];
  };
};

export type CheckoutAccessStateContract =
  | "active"
  | "awaiting_profile"
  | "awaiting_verification"
  | "paid_but_restricted";

export type CheckoutPurchaseResponseContract = {
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
  checkoutState: string;
  payment?: {
    provider: "card" | "sbp" | "bnpl";
    status:
      | "awaiting_provider"
      | "provider_confirmed"
      | "paid"
      | "failed"
      | "canceled"
      | "expired";
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
  accessState: CheckoutAccessStateContract;
  identityCompletionState?:
    | "pending_identity_verification"
    | "pending_account_finalization"
    | "pending_first_password"
    | "completed";
  firstPasswordRequired?: boolean;
  identityCompleted?: boolean;
};

export type BnplInstallmentPaymentResponseContract = {
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

export type CancelCheckoutResponseContract = {
  ok: boolean;
  idempotent?: boolean;
  checkout: { id: string; state: string } | null;
};

export type CheckoutStatusResponseContract = {
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
    accessState: CheckoutAccessStateContract;
  } | null;
  identityCompletionState?:
    | "pending_identity_verification"
    | "pending_account_finalization"
    | "pending_first_password"
    | "completed";
  firstPasswordRequired?: boolean;
  identityCompleted?: boolean;
};

export type CheckoutActionResponseContract = {
  ok: boolean;
  checkoutId: string;
  checkoutState: string;
  payment: CheckoutStatusResponseContract["payment"];
  access?: CheckoutStatusResponseContract["access"];
  confirmationSource?: "stage_stub";
};

export type CheckoutTimelineResponseContract = {
  checkoutId: string;
  state: string;
  timeline: Array<{
    at: string;
    type: string;
    details: Record<string, unknown>;
  }>;
};

export type CheckoutListItemContract = {
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

export type GetCheckoutsParamsContract = {
  userId?: string;
  email?: string;
  courseId?: string;
};

export type GetPurchasesParamsContract = {
  userId?: string;
};
