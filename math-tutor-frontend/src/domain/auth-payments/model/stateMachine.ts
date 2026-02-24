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
  created: ["awaiting_payment", "paid", "canceled", "expired"],
  awaiting_payment: ["paid", "failed", "canceled", "expired"],
  paid: ["provisioning", "failed", "canceled", "expired"],
  failed: ["awaiting_payment", "paid"],
  canceled: ["awaiting_payment", "paid"],
  expired: ["awaiting_payment", "paid"],
  provisioning: ["provisioned"],
  provisioned: [],
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
