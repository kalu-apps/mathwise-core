# Auth + Payments + Access Control (Phase 14 Identity Conflict Attach Flow)

## Scope of Phase 14

Phase 14 completes safe Flow C (`authenticate-and-attach`) for guest checkout with an email that already belongs to an existing account.

Goal: prevent duplicate users while preserving recoverability and idempotent purchase provisioning.

## 1) Conflict checkout is now persisted (not dropped)

In `POST /api/purchases/checkout`:

- if guest email already exists, server no longer attempts to create a duplicate user,
- instead it creates/reuses a detached checkout attempt (`userId` is not assigned yet),
- returns deterministic conflict payload:
  - `409`
  - `code: "identity_conflict_auth_required"`
  - `checkoutId`
  - `nextAction: "login_and_attach"`

This keeps the attempt recoverable and auditable.

## 2) New attach endpoint after trusted login

Added:

- `POST /api/purchases/checkout/attach`

Behavior:

- requires active session actor (`student`),
- validates checkout ownership by normalized email match,
- blocks cross-account attach attempts,
- links checkout to authenticated user id,
- runs payment initiation via adapter layer (Phase 12),
- processes trusted event idempotently,
- provisions purchase/entitlement through existing state machine,
- returns unified checkout/access payload.

## 3) Frontend integration

`CourseDetails` now handles identity conflict as a structured API case:

- on `identity_conflict_auth_required`, stores `checkoutId`,
- prompts login,
- after successful auth, auto-calls attach endpoint,
- updates course access/purchase UI with same post-checkout state mapping.

## 4) Why this closes a real gap

Before this phase:

- conflict path was safe but forced full retry after login.

After this phase:

- conflict path is still safe,
- and also recoverable/idempotent without losing checkout context.

## 5) Validation

- `npm run lint` passed.
- `npm run build` passed.

