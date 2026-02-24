# Reliability / Performance Phase 14

## Objective

Prevent request storms and cascading UI lag during transient backend/network instability.

## What was added

### 1) API client circuit breaker for GET requests

File:

- `src/shared/api/client.ts`

Behavior:

- Tracks recoverable GET failures per endpoint (`method + path`) in a rolling window.
- Opens a short cooldown ("circuit open") when failure threshold is reached.
- While open, further GET calls to that endpoint fail fast with a recoverable `ApiError` (`code: "circuit_open"`), instead of hammering the transport.
- Automatically resets after cooldown and closes on first successful response.

Current defaults:

- rolling window: `30s`
- threshold: `4` recoverable failures
- cooldown: `15s`

### 2) Recoverability alignment

`circuit_open` is marked as recoverable in `isRecoverableApiError(...)` so existing retry/outbox/action-guard UX continues to work without additional UI rewrites.

### 3) Connectivity status integration

File:

- `src/app/providers/ConnectivityProvider.tsx`

`circuit_open` now contributes to degraded connectivity state, so user-facing transport status remains coherent.

## Scope safety

- No payment/auth/business rule changes.
- No entitlement or domain transition changes.
- No route/permission behavior changes.

This phase is transport-level resilience only.
