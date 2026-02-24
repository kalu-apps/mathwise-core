# Auth + Payments + Access Control (Phase 7 Checkout Recovery UX States)

## Scope of Phase 7

Phase 7 adds explicit user-facing states after checkout and introduces a recovery UX in auth modal without changing core domain logic.

## 1) Explicit checkout outcome states

`POST /api/purchases/checkout` now returns extended status payload:

- `identityState`
- `entitlementState`
- `profileComplete`
- `accessState`

`accessState` values:

- `active`
- `awaiting_profile`
- `awaiting_verification`
- `paid_but_restricted`

These states are derived from identity verification + entitlement status + profile completeness.

## 2) Frontend checkout flow updates

`CourseDetails` now uses structured checkout state instead of generic success text.

Result:

- clear messaging for verification/profile/restricted scenarios,
- login CTA shown when needed,
- immediate full-access activation reflected in UI when state is `active`.

## 3) Auth recovery UX

`AuthModal` now supports guided recovery:

- "Проблема со входом?" action,
- `recover-access` check with deterministic recommendation,
- resend verification action from the same modal when required.

This covers support scenarios like "paid but no access" without changing business rules.

## 4) Phase 7 outcome

- post-payment states are explicit and deterministic,
- user remediation is available directly in auth entry point,
- backend state-machine remains source of truth.
