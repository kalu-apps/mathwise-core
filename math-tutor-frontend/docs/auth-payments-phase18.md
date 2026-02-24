# Auth + Payments + Access Control (Phase 18 Checkout Lifecycle + Auto-Reconcile Run)

## Scope of Phase 18

Phase 18 adds operational lifecycle controls for checkout attempts and a deterministic auto-reconciliation run endpoint for support operations.

This phase is backend/domain focused and does not change user-facing feature logic.

## 1) Checkout TTL + automatic expiration

Implemented in `src/mock/server.ts`:

- introduced checkout TTL (`CHECKOUT_TTL_MS`, 30 minutes),
- new `expiresAt` assignment for newly created checkout attempts,
- `expiresAt` refresh for reused active attempts (`created|awaiting_payment`),
- server-side sweeper `expireStaleCheckouts(...)` executed in request middleware.

Behavior:

- stale `created|awaiting_payment` checkouts are moved to `expired` through the trusted payment-event processor,
- expiration is idempotent (dedupe by generated event id),
- paid/provisioned checkouts are never auto-expired by this sweeper.

## 2) Authoritative checkout cancellation endpoint

Added endpoint:

- `POST /api/checkouts/:id/cancel`

Rules:

- requires authenticated actor,
- allows checkout owner (student) or teacher (support context),
- `paid|provisioning|provisioned` are protected from cancel via this path (`409`),
- already terminal states return idempotent success payload,
- active pre-payment states are canceled through `processPaymentEvent(...)`.

This keeps cancellation inside the same trusted state machine and audit/event pipeline.

## 3) Bulk support reconciliation run

Added endpoint:

- `POST /api/support/reconciliation/run`

Payload:

- `dryRun?: boolean`
- `includeHighRisk?: boolean`
- optional scope filters: `userId`, `courseId`

Execution model:

- builds current reconciliation issue set,
- classifies actions into safe/manual buckets,
- applies safe fixes deterministically (or returns plan in `dryRun` mode),
- returns applied/skipped summary and remaining issues.

Auto-applied fixes:

- `paid_without_access` -> restore access from paid checkout
- `duplicate_purchases` -> dedupe purchases
- `refunded_with_access` -> revoke access (only when `includeHighRisk=true`)

Manual-review only:

- `access_without_paid`
- `multiple_paid_checkouts`

## 4) Client boundary updates

Added API helpers in:

- `src/domain/auth-payments/model/api.ts`

New functions:

- `cancelCheckout(checkoutId)`
- `runSupportReconciliation(params)`

These expose Phase 18 operations without coupling UI to server internals.

## 5) Phase 18 outcome

- checkout lifecycle now has explicit expiration and cancellation controls,
- stale pending attempts are cleaned automatically and safely,
- support gets deterministic bulk reconciliation with dry-run capability,
- all actions remain state-driven, idempotent, and aligned with existing trust boundaries.
