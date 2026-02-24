# Reliability Phase 24: Outbox Backoff + Transparent Retry State

## Objective

Prevent retry storms for offline/degraded mutation queue and expose deterministic retry timing in UI.

## Implemented

### 1) Recoverable-failure backoff for outbox flush

File:

- `src/shared/lib/outbox.ts`

Behavior:

- if outbox flush fails with recoverable transport error:
  - increments `recoverableFailureCount`,
  - computes exponential backoff with jitter,
  - sets `nextRetryAt`,
  - blocks new flush attempts until retry window is reached.
- on successful send or non-recoverable failure:
  - resets retry counters and retry window.

Added snapshot fields:

- `nextRetryAt`
- `recoverableFailureCount`

### 2) Connectivity context propagation

Files:

- `src/app/providers/connectivityContext.ts`
- `src/app/providers/ConnectivityProvider.tsx`

Added context values:

- `outboxRetryAt`
- `outboxRecoverableFailureCount`

### 3) Banner visibility of retry schedule

File:

- `src/shared/ui/ConnectivityBanner.tsx`

When queue is pending and backoff is active, banner now shows next retry time and current consecutive failure count.

### 4) i18n updates

File:

- `src/shared/i18n/ru.ts`

Added:

- `connectivity.outboxRetryAt`

## Why this matters

- avoids aggressive repeated flush attempts during unstable network periods,
- lowers request pressure and UI churn,
- gives user/operator clear visibility into recovery progress.

## Scope safety

- No auth/payment/domain-state changes.
- No route/permission changes.
- No business-flow rewiring.
