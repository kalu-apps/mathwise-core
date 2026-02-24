# Auth + Payments + Access Control (Phase 4 Reconciliation)

## Scope of Phase 4

Phase 4 adds deterministic reconciliation and support operations for the most expensive incidents:

- paid but no access,
- access but no paid checkout,
- duplicate purchases / multiple paid checkouts,
- refunded/canceled payment signal while access still exists.

No UI behavior was changed. The layer is backend/mock-side and operational.

## New persisted support model

Added `supportActions` in mock DB (`mock-db.json`) and `MockDb` schema:

- action type,
- optional issue code,
- user/course/checkout references,
- notes,
- timestamp.

This creates an audit trail for manual/support corrections.

## Reconciliation issue detector

Server-side detector (`buildReconciliationIssues`) now computes anomalies by `(userId, courseId)`:

- `paid_without_access`
- `access_without_paid`
- `multiple_paid_checkouts`
- `duplicate_purchases`
- `refunded_with_access`

Sources used:

- checkout processes,
- payment events ledger,
- purchases,
- active entitlements.

## New support endpoints

### 1) List issues

`GET /api/support/reconciliation/issues?userId=&courseId=`

Response:

- `count`
- `issues[]` with severity, details, linked checkout/purchase IDs.

### 2) List support actions

`GET /api/support/actions`

Returns reverse chronological audit records of applied support operations.

### 3) Apply correction

`POST /api/support/reconciliation/apply`

Payload:

- `action`:
  - `restore_access_from_paid_checkout`
  - `revoke_unpaid_access`
  - `dedupe_duplicate_purchases`
  - `refund_and_revoke_course_access`
- `userId`
- `courseId`
- optional `checkoutId`
- optional `issueCode`
- optional `notes`

Behavior:

- `restore_access_from_paid_checkout`:
  - finds valid paid/provisioned checkout,
  - runs provisioning idempotently (purchase + entitlement).
- `revoke_unpaid_access`:
  - removes purchases and progress for course,
  - revokes course entitlements.
- `dedupe_duplicate_purchases`:
  - keeps earliest purchase, removes duplicates.
- `refund_and_revoke_course_access`:
  - records reversal payment events in ledger,
  - revokes/removes access artifacts.

All successful actions are logged to `supportActions`.

## Guardrail quality

- Reconciliation is deterministic and repeat-safe.
- Payment-event replay guarantees remain intact.
- Support actions are auditable and localized to explicit `(userId, courseId)`.
- Existing user-facing flows remain unchanged.
