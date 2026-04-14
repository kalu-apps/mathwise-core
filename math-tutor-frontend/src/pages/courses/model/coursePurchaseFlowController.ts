import { ApiError } from "@/shared/api/client";
import {
  checkoutPurchase,
  type CheckoutPayload,
  type CheckoutPurchaseResponse,
} from "@/entities/purchase/model/storage";
import {
  cancelCheckout,
  retryCheckout,
  stageConfirmCheckout,
} from "@/domain/auth-payments/model/api";
import {
  getIdentityIntentStatus,
  startIdentityIntent,
  verifyIdentityIntent,
} from "@/features/auth/model/api";
import { mapIdentityIntentStatusMessage } from "@/pages/courses/model/identityIntentBridge";

export const resolveCheckoutPaymentUrl = (
  payment:
    | CheckoutPurchaseResponse["payment"]
    | {
        redirectUrl?: string | null;
        paymentUrl?: string | null;
        sbp?: {
          deepLinkUrl?: string | null;
          qrUrl?: string | null;
        } | null;
      }
    | undefined
): string | null =>
  payment?.redirectUrl ??
  payment?.paymentUrl ??
  payment?.sbp?.deepLinkUrl ??
  payment?.sbp?.qrUrl ??
  null;

export const startCourseCheckoutIdentityIntent = async (params: {
  email: string;
  courseId: string | null;
}) => {
  const started = await startIdentityIntent({
    channel: "email",
    email: params.email.trim().toLowerCase(),
    metadata: {
      source: "course_checkout",
      courseId: params.courseId,
    },
  });

  return {
    intentId: started.intentId,
    expiresAt: started.expiresAt ?? null,
    message: started.message || mapIdentityIntentStatusMessage(started.state),
  };
};

export const verifyCourseCheckoutIdentityIntent = async (params: {
  intentId: string;
  code: string;
}) => {
  const verified = await verifyIdentityIntent({
    intentId: params.intentId.trim(),
    code: params.code.trim(),
  });

  return {
    intentId: verified.intentId ?? null,
    state: verified.state,
    expiresAt: verified.expiresAt ?? null,
    nextAction: verified.nextAction ?? null,
    message: verified.message || mapIdentityIntentStatusMessage(verified.state),
  };
};

export const resolveVerifiedCheckoutIntent = async (intentId: string) => {
  const intentStatus = await getIdentityIntentStatus(intentId);
  if (intentStatus.state === "verified") {
    return {
      ok: true as const,
      intentId: intentStatus.intentId,
      expiresAt: intentStatus.expiresAt ?? null,
      message: mapIdentityIntentStatusMessage(intentStatus.state),
    };
  }
  return {
    ok: false as const,
    intentId: null,
    state: intentStatus.state,
    expiresAt: intentStatus.expiresAt ?? null,
    message: mapIdentityIntentStatusMessage(intentStatus.state),
  };
};

export const submitCourseCheckout = async (
  payload: CheckoutPayload
): Promise<CheckoutPurchaseResponse> => {
  return checkoutPurchase(payload);
};

export const shouldOpenLoginAttachAction = (error: unknown): boolean => {
  if (error instanceof Error && error.message.includes("Авторизуйтесь")) {
    return true;
  }
  if (!(error instanceof ApiError)) return false;
  const code = ((error.details ?? {}) as { code?: string }).code;
  return (
    code === "identity_intent_required" ||
    code === "identity_intent_context_mismatch" ||
    code === "identity_conflict_auth_required"
  );
};

export const resolvePendingAttachCheckoutId = (error: unknown): string | null => {
  if (!(error instanceof ApiError)) return null;
  const details = (error.details ?? {}) as { code?: string; checkoutId?: string };
  if (details.code !== "identity_conflict_auth_required") return null;
  return typeof details.checkoutId === "string" && details.checkoutId ? details.checkoutId : null;
};

export const retryCheckoutPayment = async (checkoutId: string) => {
  const result = await retryCheckout(checkoutId);
  return resolveCheckoutPaymentUrl(result.payment);
};

export const confirmStageCheckoutPayment = async (checkoutId: string) => {
  const result = await stageConfirmCheckout(checkoutId);
  return resolveCheckoutPaymentUrl(result.payment);
};

export const cancelCourseCheckout = async (checkoutId: string) => {
  await cancelCheckout(checkoutId);
};
