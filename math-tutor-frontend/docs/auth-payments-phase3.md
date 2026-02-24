# Auth + Payments + Access Control (Phase 3 Implementation)

## Scope of Phase 3

Phase 3 introduces a trusted payment-event boundary and audit-friendly event ledger while preserving existing UI behavior.

Implemented in:

- `src/domain/auth-payments/model/types.ts`
- `src/domain/auth-payments/model/stateMachine.ts`
- `src/mock/db.ts`
- `src/mock/server.ts`
- `mock-db.json`

## New domain capabilities

## 1) Payment event ledger

Added `paymentEvents` collection with records:

- provider (`mock | sbp | card | bnpl`)
- external event id
- dedupe key
- checkout id
- status (`awaiting_payment | paid | failed | canceled | expired`)
- outcome (`applied | duplicate | ignored_out_of_order | ignored_missing_checkout`)
- timestamps and payload snapshot

This enables deterministic replay handling and support diagnostics.

## 2) Trusted event processor

All payment outcomes are now applied through `processPaymentEvent(...)`, not by direct checkout mutation.

Behavior:

- dedupes by `provider + externalEventId`,
- applies guarded transitions via state machine,
- handles out-of-order signals safely,
- supports late positive confirmations by moving failed/canceled/expired attempts back into payable path.

## 3) Provisioning is explicit and idempotent

`ensureCheckoutProvisioned(...)` performs:

- purchase snapshot creation if missing,
- entitlement grant/update,
- checkout transition to `provisioned`.

Running this function multiple times is safe.

## 4) New query/debug endpoints

- `GET /api/checkouts` (filter by `userId`, `email`, `courseId`)
- `GET /api/checkouts/:id`
- `POST /api/payments/events`
- `GET /api/payments/events` (optional `checkoutId`, `provider`)

These endpoints provide support/reconciliation visibility without changing UI contracts.

## 5) Checkout API behavior remains UX-compatible

`POST /api/purchases/checkout` still returns successful purchase flow for current frontend, but now:

- creates/reuses checkout attempt,
- triggers trusted mock payment event (`mock-auto-paid:<checkoutId>`),
- provisions through event processor,
- returns checkout metadata (`checkoutId`, `checkoutState`) in addition to user payload.

## 6) Data hygiene alignment with single teacher policy

Single-teacher guard now also cleans domain/payment artifacts:

- stale checkout processes,
- stale payment events,
- orphaned entitlements,
- orphaned identity/consent/lifecycle records.

## Status after Phase 3

- payment flow is state-driven and event-ledgered,
- replay/out-of-order handling exists at domain level,
- current UI scenarios remain unchanged,
- foundation is ready for real provider adapters in next phase.
