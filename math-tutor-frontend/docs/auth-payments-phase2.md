# Auth + Payments + Access Control (Phase 2 Implementation)

## Scope of Phase 2

Phase 2 introduces an explicit domain state-transition layer and connects it to the existing mock backend without changing UI behavior.

Implemented in:

- `src/domain/auth-payments/model/types.ts`
- `src/domain/auth-payments/model/stateMachine.ts`
- `src/mock/db.ts`
- `src/mock/server.ts`

## What is now state-driven

### 1) Checkout process

Checkout process records are persisted in `db.checkoutProcesses` with states:

- `created`
- `awaiting_payment`
- `paid`
- `provisioning`
- `provisioned`
- (`failed | canceled | expired` reserved as terminal negative states)

In mock checkout flow (`POST /api/purchases/checkout`), transitions are explicit and validated by state machine guards.

### 2) Identity state

Identity records are persisted in `db.identity` (by normalized email):

- `known_unverified`
- `verified`
- (`anonymous | restricted` reserved)

Identity is upserted via auth, checkout, and booking flows using transition guards.

### 3) Entitlements

Entitlements are persisted in `db.entitlements`:

- kind: `course_access`, `trial_access_limited`
- state: `pending_activation -> active` (revocation supported)

Course checkout provisions `course_access`; trial booking provisions `trial_access_limited`.

### 4) Trial booking lifecycle

Booking lifecycle records are persisted in `db.bookingLifecycle`:

- `requested -> scheduled`
- `scheduled -> canceled` (on delete)

Transitions are validated and safe against invalid transition attempts.

### 5) Consents

Consent records are persisted in `db.consents` with:

- `scope` (`auth`, `checkout`, `trial_booking`, etc.),
- `documentVersion` (currently `ru-legal-v1`),
- timestamp and actor linkage (`email`, optional `userId`).

## Reliability improvements added

1. **Idempotency baseline for checkout**
- Derived `idempotencyKey = normalizedEmail:courseId`.
- Repeated checkout requests reuse process state and avoid duplicate purchase grants.

2. **Explicit transition validation**
- Invalid transitions now fail at domain guard layer instead of silently mutating data.

3. **Teacher data consistency**
- Single-teacher enforcement remains active and now also cleans domain collections:
  - checkout processes,
  - entitlements,
  - identity records,
  - consents,
  - booking lifecycle records.

## Backward compatibility

- Existing UI flows are preserved.
- Existing purchase, booking, progress, and profile endpoints continue to work.
- New domain collections are additive and do not break current screens.

## Out of scope (next phase)

- Real payment provider/webhook adapters (SBP/BNPL/card production implementations),
- external event dedupe ledger with provider event IDs,
- full reconciliation APIs for support tooling.
