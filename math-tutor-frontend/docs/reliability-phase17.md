# Reliability / Performance Phase 17

## Objective

Guarantee idempotent behavior for mutation requests across retries, lag spikes, and offline outbox replays.

## What was added

### 1) Automatic idempotency headers for non-GET API calls

File:

- `src/shared/api/client.ts`

Behavior:

- For `POST/PUT/DELETE`, client now auto-attaches `X-Idempotency-Key` if caller did not provide one.
- Existing custom idempotency headers are respected (no override).
- Added request options:
  - `idempotencyKey`
  - `idempotencyPrefix`

This makes mutation safety default-on instead of opt-in.

### 2) Stable idempotency keys in offline outbox

File:

- `src/shared/lib/outbox.ts`

Behavior:

- Outbox entries now always persist an idempotency key in headers on enqueue (if missing).
- Replays of the same queued operation reuse the same key.

This prevents duplicate writes when connectivity is unstable and outbox flush retried.

## Scope safety

- No business workflow changes.
- No role/route changes.
- No UI contract changes.

This phase strictly strengthens transport-level write safety.
