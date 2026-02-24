# Auth + Payments + Access Control (Phase 17 Card Gateway Boundary + Reversals)

## Scope of Phase 17

Phase 17 upgrades payment integration from "immediate paid only" adapters to a card-ready provider boundary with:

- hosted card initiation contract,
- signed provider webhook ingestion,
- idempotent event processing,
- explicit reversal handling (refund/chargeback) with access revocation.

Business flows and access-control logic remain state-driven and backward-compatible.

## 1) Hosted card initiation contract

Updated `src/domain/auth-payments/model/paymentGateway.ts`:

- `card` adapter now starts in `awaiting_payment` and returns provider metadata:
  - `providerPaymentId`
  - `paymentUrl`
  - `returnUrl`
- `sbp/bnpl/mock` keep existing behavior.

Checkout responses now include `payment` metadata (`provider`, `status`, `paymentUrl`, `requiresConfirmation`) for UI/next-step orchestration.

## 2) Webhook trust boundary for card provider

Added server endpoint:

- `POST /api/payments/providers/card/webhook`

Features:

- verifies HMAC signature (`x-card-signature`, `x-card-timestamp`),
- maps provider statuses into authoritative domain payment statuses,
- applies events idempotently through existing `processPaymentEvent(...)`,
- provisions entitlements only via state machine (never from client flags).

## 3) Reversals and chargebacks

Card webhook now supports `refunded`/`chargeback` statuses:

- records payment event,
- revokes course access (`purchase + entitlement`) via existing domain operations,
- writes support audit entry (`refund_and_revoke_course_access`).

Added teacher operation endpoint:

- `POST /api/payments/providers/card/refund`

for deterministic mock-side reversal testing.

## 4) Mock compatibility and migration safety

To preserve current UX in local/mock flows:

- card path includes `CARD_AUTO_CAPTURE` fallback in server,
- checkout can still complete end-to-end without waiting for external callback,
- architecture is ready to disable auto-capture when real gateway is connected.

## 5) API boundary additions

Added helper client contracts in `src/domain/auth-payments/model/api.ts`:

- `postCardWebhook(...)`
- `refundCardCheckout(...)`
- `getNotificationOutbox(...)`
- `retryNotificationOutbox(...)`

Extended `src/shared/api/client.ts` to support custom headers on `post/put/delete`.

## 6) Validation target

Phase considered done when:

- lint/build pass,
- checkout still works in mock mode,
- duplicate webhook events remain idempotent,
- reversal revokes access and leaves an audit trail.
