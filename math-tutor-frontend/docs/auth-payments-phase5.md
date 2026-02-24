# Auth + Payments + Access Control (Phase 5 Identity Conflict + Verification Gating)

## Scope of Phase 5

Phase 5 hardens identity ownership flows and enforces verification-gated access:

- strict `authenticate-and-attach` on checkout email conflicts,
- pending entitlements for unverified identities,
- activation of pending entitlements only after verified login,
- verification and recovery endpoints for support/user flows.

No feature logic/UI scenarios were removed.

## 1) Strict identity conflict policy

In `POST /api/purchases/checkout`:

- if `userId` is missing and email already exists:
  - request is rejected with safe conflict response,
  - no new user is created,
  - no auto-attach to existing account is performed.

This closes duplicate-account and wrong-account purchase attachment risk.

## 2) Verification-gated entitlement activation

Entitlements now support staged activation:

- created as `pending_activation` when identity is not verified,
- moved to `active` only for verified identities.

Applied to:

- `course_access` from checkout,
- `trial_access_limited` from trial booking.

## 3) Activation on trusted verification

`POST /api/auth/magic-link` now:

- sets identity state to `verified`,
- activates all pending entitlements for this user,
- records consent (`scope=auth`).

This makes email ownership confirmation the gate for full access.

## 4) Purchases endpoint now enforces access gate

`GET /api/purchases`:

- when `userId` is provided:
  - returns empty list if identity is not verified,
  - returns only purchases with active course entitlements.

This ensures access is entitlement-backed, not raw purchase-list backed.

## 5) New verification/recovery endpoints

### Resend verification

`POST /api/auth/verification/resend`

- accepts `email`,
- supports statuses:
  - `sent`
  - `already_verified`.

### Change email before verification

`POST /api/auth/verification/change-email`

- accepts `email` + `newEmail`,
- allowed only for unverified student identities,
- updates linked user/contact records and related domain records.

### Recover access

`POST /api/auth/recover-access`

- returns deterministic recovery diagnostics:
  - verification status,
  - checkout/purchase counts,
  - entitlement health,
  - recommended action (`verify_email|login|restore_access|no_access_records`).

## 6) Frontend data access alignment

Purchase reads are now user-scoped:

- updated `getPurchases({ userId })`,
- all student/teacher profile and course pages migrated to scoped reads.

This reduces accidental over-fetching and aligns with server-side gates.

## 7) Phase 5 outcome

- duplicate email checkout path is safe,
- unverified identities cannot receive full active access,
- verified login reliably activates pending rights,
- recovery and verification utilities are available for UX/support integration.
