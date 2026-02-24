# Auth + Payments + Access Control (Phase 1 Foundation)

## 1) Goal of Phase 1

Establish a stable, implementation-agnostic domain contract before deeper refactoring:

- freeze domain states and transitions,
- define trusted boundaries and idempotency rules,
- align current mock-server behavior with a single canonical teacher account.

Phase 1 does **not** redesign UI or replace business scenarios. It creates a safe base for Phases 2+.

## 2) Current Baseline (Project-Specific)

- Runtime: `React + TypeScript + Vite`.
- Backend boundary: local mock API (`src/mock/server.ts`) + persisted `mock-db.json`.
- Auth mode: email magic-link simulation.
- Access mode: purchase/bookings/progress records.

Teacher baseline constraint introduced in Phase 1:

- only one teacher identity is valid,
- canonical teacher email: `kalygina73@mail.ru`,
- legacy teacher-role entities are cleaned server-side.

## 3) Domain Model (Frozen Contract)

### Checkout / Purchase Process

States:

- `created`
- `awaiting_payment`
- `paid`
- `failed`
- `canceled`
- `expired`
- `provisioning`
- `provisioned`

Allowed transitions:

- `created -> awaiting_payment|canceled|expired`
- `awaiting_payment -> paid|failed|canceled|expired`
- `paid -> provisioning`
- `provisioning -> provisioned`
- `failed|canceled|expired` are terminal for current attempt

Rules:

- transition handlers must be idempotent,
- duplicate confirmations cannot grant duplicate entitlements.

### User Identity

States:

- `anonymous`
- `known_unverified`
- `verified`
- `restricted`

Rules:

- email is primary unique identity key,
- no duplicate account for same normalized email,
- existing email path must be `authenticate-and-attach`, not `create`.

### Entitlements / Access Rights

States:

- `pending_activation`
- `active`
- `expired`
- `revoked`

Types:

- `course_access`
- `premium_timebound`
- `trial_access_limited`

Rules:

- UI flags cannot grant access,
- access checks must be entitlement-driven.

### Trial Booking

States:

- `requested`
- `scheduled`
- `completed`
- `canceled`

Rules:

- trial flow remains independent from payment flow,
- optional entitlement side-effects must be explicit.

### Consent Records

States:

- `captured`
- `superseded`

Required fields:

- `documentVersion`
- `scope`
- `capturedAt`
- `actorId|email`

## 4) Trusted Boundaries (Ports)

Phase 1 freezes boundaries to avoid coupling:

- `AuthPort` (request link, verify ownership, resolve identity conflict)
- `PaymentsPort` (create intent, query status, consume provider events)
- `EntitlementsPort` (grant/revoke/list with idempotency)
- `BookingsPort` (create/reschedule/cancel trial/regular booking)
- `ConsentPort` (capture/query legal acceptance by version and scope)
- `AuditPort` (append immutable domain events)

Adapters can be mock/local now and production later, without rewriting domain flows.

## 5) Idempotency + Replay Guard (Required Contract)

- Every payment/provider callback must include unique external event key.
- Internal processing must dedupe by `eventKey + provider + checkoutId`.
- Out-of-order events must be accepted but mapped to valid transition graph only.
- Reprocessing same event must return same terminal result.

## 6) Recovery / Support Contract

Mandatory support paths:

- resend verification,
- change email before verification completion,
- recover access after payment with delayed return,
- reconcile paid/no-access and refunded/has-access cases.

## 7) Russia Readiness Contract

- architecture must keep PII storage localizable in RU perimeter,
- consent capture is mandatory and versioned,
- domain contract must not hardcode non-localizable assumptions.

## 8) Phase 1 Acceptance Criteria

- canonical teacher identity enforced by server (`kalygina73@mail.ru`),
- legacy teacher-role data cleanup is deterministic and safe,
- domain states/transitions are documented and frozen,
- boundaries for payments/auth/access/booking/consent are explicit for next phases.

## 9) Out of Scope for Phase 1

- full payment provider implementation,
- full entitlement engine migration,
- webhook processor extraction into separate module,
- final production compliance/legal text management UI.
