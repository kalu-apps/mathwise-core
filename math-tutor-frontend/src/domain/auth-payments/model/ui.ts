import type { CourseAccessDecision, LessonAccessDecision } from "./access";
import type { CheckoutAccessState } from "@/entities/purchase/model/storage";

export type AccessUiState =
  | "anonymous_preview"
  | "awaiting_verification"
  | "awaiting_profile"
  | "paid_but_restricted"
  | "entitlement_missing";

export type AccessUiSeverity = "info" | "warning";

export type AccessGateActionId = "login" | "recover" | "recheck" | "profile";

type AccessStateMeta = {
  severity: AccessUiSeverity;
  messageKey:
    | "access.anonymousPreview"
    | "access.awaitingVerification"
    | "access.awaitingProfile"
    | "access.paidButRestricted"
    | "access.entitlementMissing";
  actions: AccessGateActionId[];
};

const ACCESS_STATE_META: Record<AccessUiState, AccessStateMeta> = {
  anonymous_preview: {
    severity: "info",
    messageKey: "access.anonymousPreview",
    actions: ["login"],
  },
  awaiting_verification: {
    severity: "warning",
    messageKey: "access.awaitingVerification",
    actions: ["recover", "login"],
  },
  awaiting_profile: {
    severity: "info",
    messageKey: "access.awaitingProfile",
    actions: ["profile", "recover", "login"],
  },
  paid_but_restricted: {
    severity: "warning",
    messageKey: "access.paidButRestricted",
    actions: ["recheck", "recover", "login"],
  },
  entitlement_missing: {
    severity: "info",
    messageKey: "access.entitlementMissing",
    actions: ["login"],
  },
};

export const getAccessStateMeta = (state: AccessUiState): AccessStateMeta =>
  ACCESS_STATE_META[state];

export const getAccessGateActions = (params: {
  state: AccessUiState;
  hasLogin?: boolean;
  hasRecover?: boolean;
  hasRecheck?: boolean;
  hasProfile?: boolean;
}): AccessGateActionId[] => {
  const {
    state,
    hasLogin = false,
    hasRecover = false,
    hasRecheck = false,
    hasProfile = false,
  } = params;
  return ACCESS_STATE_META[state].actions.filter((action) => {
    if (action === "login") return hasLogin;
    if (action === "recover") return hasRecover;
    if (action === "recheck") return hasRecheck;
    if (action === "profile") return hasProfile;
    return false;
  });
};

export const getCourseAccessUiState = (params: {
  decision?: CourseAccessDecision | null;
  hasPurchase?: boolean;
  isTeacher?: boolean;
}): AccessUiState | null => {
  const { decision, hasPurchase, isTeacher } = params;
  if (isTeacher) return null;
  if (!decision) return null;

  if (decision.requiresAuth) return "anonymous_preview";
  if (decision.requiresVerification) return "awaiting_verification";
  if (hasPurchase && !decision.canAccessAllLessons) return "paid_but_restricted";
  if (decision.reason === "entitlement_missing" && !decision.canAccessAllLessons) {
    return "entitlement_missing";
  }
  return null;
};

export const getCatalogAccessUiState = (params: {
  decisions?: CourseAccessDecision[] | null;
  isStudent?: boolean;
}): AccessUiState | null => {
  const { decisions, isStudent } = params;
  if (!isStudent || !decisions || decisions.length === 0) return null;
  if (decisions.some((decision) => decision.requiresVerification)) {
    return "awaiting_verification";
  }
  return null;
};

export const getLessonAccessUiState = (
  decision?: LessonAccessDecision | null
): AccessUiState | null => {
  if (!decision) return null;
  if (decision.requiresAuth) return "anonymous_preview";
  if (decision.requiresVerification) return "awaiting_verification";
  if (!decision.canAccess && decision.reason === "entitlement_missing") {
    return "entitlement_missing";
  }
  return null;
};

export const getCheckoutAccessUiState = (
  accessState?: CheckoutAccessState
): AccessUiState | null => {
  if (!accessState) return null;
  if (accessState === "awaiting_profile") return "awaiting_profile";
  if (accessState === "awaiting_verification") return "awaiting_verification";
  if (accessState === "paid_but_restricted") return "paid_but_restricted";
  return null;
};

export const getRecoverRecommendationUiState = (
  recommendation?:
    | "complete_profile"
    | "verify_email"
    | "login"
    | "restore_access"
    | "no_access_records"
): AccessUiState | null => {
  if (!recommendation) return null;
  if (recommendation === "complete_profile") return "awaiting_profile";
  if (recommendation === "verify_email") return "awaiting_verification";
  if (recommendation === "restore_access") return "paid_but_restricted";
  return null;
};
