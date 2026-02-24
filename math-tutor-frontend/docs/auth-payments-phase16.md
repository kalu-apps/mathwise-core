# Auth + Payments + Access Control (Phase 16 Transactional Email Outbox)

## Scope of Phase 16

Phase 16 introduces a server-side transactional email boundary with outbox semantics.

Goal: make notification delivery state-driven and idempotent, without coupling critical access decisions to UI actions.

## 1) Domain extension: Outbox records

Added `OutboxRecord` in domain model (`src/domain/auth-payments/model/types.ts`) with:

- channel (`email`)
- template type
- dedupe key
- recipient/user/checkout bindings
- delivery status (`queued | sent | failed`)
- delivery audit fields (`attemptCount`, `sentAt`, `lastError`)

`MockDb` now persists `outbox[]` (`src/mock/db.ts`), and collection auto-bootstrap is handled in `ensureDomainCollections(...)`.

## 2) Server-side outbox pipeline

In `src/mock/server.ts` added:

- `enqueueOutboxEmail(...)` with dedupe by `dedupeKey`
- `dispatchOutboxQueue(...)` (mock transporter boundary)
- template builder `buildOutboxTemplate(...)`
- serialization for payload metadata

This keeps notification generation deterministic and retry-safe.

## 3) New transactional triggers (state-driven)

Notifications are now generated from authoritative state transitions:

- checkout positive states (`paid/provisioning/provisioned`) -> `purchase_success` or `verification_required`
- verification resend flow -> `verification_resend`
- recover-access flow -> `access_recovery`

No access rights are granted from email events; email is informational only.

## 4) Observability and support operations

Added teacher-only endpoints:

- `GET /api/notifications/outbox` (filter by status/template/email)
- `POST /api/notifications/outbox/retry` (re-queue and dispatch specific record)

This gives deterministic support tooling for delivery troubleshooting.

## 5) Compatibility and safety

- Existing auth/checkout/access behavior is preserved.
- Email triggers are idempotent via dedupe keys.
- No client trust assumptions added.
- No hard dependency on a real ESP: current dispatcher is a mock boundary that can be replaced by SMTP/ESP adapter later.

## 6) Validation

- `npm run lint` passed.
- `npm run build` passed.
