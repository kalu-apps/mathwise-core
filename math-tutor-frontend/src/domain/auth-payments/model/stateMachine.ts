import type {
  CheckoutState,
  EntitlementState,
  IdentityState,
  TrialBookingState,
} from "./types";

type TransitionMap<S extends string> = Record<S, readonly S[]>;

const canTransition = <S extends string>(
  map: TransitionMap<S>,
  from: S,
  to: S
) => from === to || map[from].includes(to);

const assertTransition = <S extends string>(
  map: TransitionMap<S>,
  entityName: string,
  from: S,
  to: S
) => {
  if (!canTransition(map, from, to)) {
    throw new Error(
      `${entityName}: invalid transition "${from}" -> "${to}"`
    );
  }
};

const checkoutTransitions: TransitionMap<CheckoutState> = {
  created: ["pending_provider", "canceled", "expired"],
  pending_provider: ["provider_confirmed", "failed", "canceled", "expired"],
  provider_confirmed: ["provision_pending", "provisioned", "failed"],
  provision_pending: [
    "provisioned",
    "email_verification_pending",
    "provision_failed_retryable",
    "failed",
  ],
  provisioned: [],
  email_verification_pending: [],
  email_correction_required: ["pending_provider", "provider_confirmed", "failed"],
  provision_failed_retryable: ["pending_provider", "provider_confirmed", "failed"],
  failed: ["pending_provider", "provider_confirmed"],
  canceled: ["pending_provider"],
  expired: ["pending_provider"],
};

const identityTransitions: TransitionMap<IdentityState> = {
  anonymous: ["known_unverified", "restricted"],
  known_unverified: ["verified", "restricted"],
  verified: ["restricted"],
  restricted: ["known_unverified", "verified"],
};

const entitlementTransitions: TransitionMap<EntitlementState> = {
  pending_activation: ["active", "revoked", "expired"],
  active: ["expired", "revoked"],
  expired: ["active", "revoked"],
  revoked: ["active"],
};

const bookingTransitions: TransitionMap<TrialBookingState> = {
  requested: ["scheduled", "canceled"],
  scheduled: ["completed", "canceled"],
  completed: [],
  canceled: [],
};

export const assertCheckoutTransition = (from: CheckoutState, to: CheckoutState) => {
  assertTransition(checkoutTransitions, "checkout", from, to);
};

export const assertIdentityTransition = (from: IdentityState, to: IdentityState) => {
  assertTransition(identityTransitions, "identity", from, to);
};

export const assertEntitlementTransition = (
  from: EntitlementState,
  to: EntitlementState
) => {
  assertTransition(entitlementTransitions, "entitlement", from, to);
};

export const assertBookingTransition = (
  from: TrialBookingState,
  to: TrialBookingState
) => {
  assertTransition(bookingTransitions, "trial_booking", from, to);
};
