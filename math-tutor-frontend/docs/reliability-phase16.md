# Reliability / Performance Phase 16

## Objective

Reduce repeated read traffic and UI re-render churn by introducing a short-lived GET response cache.

## What was added

### 1) GET response cache with TTL

File:

- `src/shared/api/client.ts`

Behavior:

- GET requests now support short in-memory caching.
- Fresh cache hit returns data instantly (no network call).
- Default TTL is intentionally small (`1.5s`) to reduce duplicate loads without noticeable staleness.

### 2) Automatic cache invalidation on successful mutations

Any successful non-GET request clears GET cache immediately.

This keeps post-save flows consistent: after writes, reads are always refreshed from source.

### 3) Optional stale fallback on transport failures

For GET calls, client now supports optional `staleIfErrorMs`:

- if enabled for a call and recoverable transport error occurs,
- previously cached (stale-but-allowed) data can be returned instead of hard fail.

Default is disabled (`0`) to preserve strict behavior unless explicitly requested.

### 4) API surface update

`api.get(path, options)` now accepts:

- `headers`
- `dedupe`
- `cacheTtlMs`
- `staleIfErrorMs`

This is backward-compatible with existing calls.

## Scope safety

- No domain logic changes (payments/auth/entitlements untouched).
- No route/permission behavior changes.
- No UI structure changes.
