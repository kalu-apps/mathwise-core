# Auth + Payments + Access Control (Phase 19 Checkout Status + Retry + Timeline)

## Scope of Phase 19

Phase 19 adds an operational checkout status API layer for async/payment-provider-ready UX:

- authoritative checkout status endpoint,
- controlled retry endpoint for negative checkout states,
- timeline endpoint for support/debug transparency.

Core business logic, state machines, and access control remain unchanged.

## 1) Checkout status endpoint

Added endpoint:

- `GET /api/checkouts/:id/status`

Behavior:

- requires authenticated actor,
- доступ только владельцу checkout (или teacher),
- returns checkout lifecycle snapshot:
  - `state`, `method`, `amount`, `expiresAt`, terminal flag,
  - normalized payment status payload (`provider/status/outcome/paymentUrl/requiresConfirmation`),
  - current access payload when checkout is linked to a user.

This endpoint is suitable for polling after redirect/webhook-delayed payment flows.

## 2) Checkout retry endpoint

Added endpoint:

- `POST /api/checkouts/:id/retry`

Behavior:

- requires authenticated actor,
- owner/teacher guarded,
- allowed only for non-paid states,
- refreshes `expiresAt`,
- runs retry through the same trusted flow:
  - `processPaymentEvent(awaiting_payment)` ->
  - payment adapter initiation ->
  - trusted event apply ->
  - optional card auto-capture ->
  - provisioning + transactional outbox dispatch.

Result is idempotent and state-machine driven.

## 3) Checkout timeline endpoint

Added endpoint:

- `GET /api/checkouts/:id/timeline`

Returns chronological history aggregated from:

- checkout creation metadata,
- payment event ledger,
- related support actions,
- related notification outbox records.

This creates deterministic diagnostics for “paid/no access” investigations.

## 4) Client API boundary updates

Updated `src/domain/auth-payments/model/api.ts`:

- `getCheckoutStatus(checkoutId)`
- `retryCheckout(checkoutId)`
- `getCheckoutTimeline(checkoutId)`

These functions keep UI decoupled from server internals and ready for next-phase integration.

## 5) Validation

- `npm run lint` passed.
- `npm run build` passed.

## 6) Phase 19 outcome

- frontend can rely on authoritative checkout polling,
- retries use controlled transitions (no client-side entitlement toggles),
- support has timeline visibility without manual DB inspection.
