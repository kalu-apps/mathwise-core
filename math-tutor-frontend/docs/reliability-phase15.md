# Reliability / Performance Phase 15

## Objective

Reduce duplicate read traffic and prevent concurrent GET storms that increase INP and UI flicker.

## What was added

### 1) In-flight GET deduplication (request coalescing)

File:

- `src/shared/api/client.ts`

Behavior:

- Concurrent identical GET requests are merged into one network call.
- All callers receive the same promise result.
- Deduplication key includes:
  - HTTP method (`GET`)
  - path
  - request headers signature
- Entry is removed after completion (success or failure).

This lowers transport pressure and avoids repeated render churn from duplicated data loads.

### 2) GET-level control flag

`api.get(...)` now accepts optional options:

- `headers`
- `dedupe` (default `true`)

This keeps backward compatibility while allowing explicit opt-out where strict non-coalesced reads are needed.

### 3) Circuit-breaker compatibility

Deduplication is fully compatible with Phase 14 circuit breaker:

- `circuit_open` remains recoverable,
- connectivity status handling remains unchanged,
- no business state transitions were modified.

## Scope safety

- No auth/payment/entitlement flow changes.
- No route or role behavior changes.
- No UI contract changes.
