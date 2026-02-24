# Reliability Phase 25: Scheduled Outbox Auto-Retry

## Objective

Ensure queued recoverable mutations are retried automatically at the exact backoff boundary, without requiring user interaction.

## Implemented

### 1) Timer-driven outbox retry

File:

- `src/app/providers/ConnectivityProvider.tsx`

Behavior:

- when outbox has pending items and `nextRetryAt` is set,
- provider schedules a one-shot timer up to retry timestamp,
- on timer fire, queue flush is attempted automatically if:
  - network is online,
  - tab is visible,
  - outbox is not already flushing.

### 2) Safe lifecycle

- timer is canceled on dependency changes/unmount,
- no duplicate timers while flush is active,
- remains compatible with previous online/focus/interval recovery hooks.

## Why this matters

- removes reliance on manual “Retry queue” clicks,
- prevents long idle gaps between recoverable failures and next attempt,
- improves eventual consistency under unstable networks.

## Scope safety

- No changes to auth/payment/entitlement logic.
- No route or permission changes.
- No visual contract changes.
