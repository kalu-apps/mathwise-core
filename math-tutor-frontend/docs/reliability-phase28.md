# Reliability Phase 28: Lightweight RUM Channel

## Objective

Capture real runtime degradation signals (performance and reliability) with minimal overhead and without changing business logic.

## Implemented

### 1) Client RUM reporter

- Added `src/app/providers/RumReporterProvider.tsx`.
- Listens to:
  - `app-performance`
  - `app-api-failure`
  - `app-api-success`
  - `app-action-guard`
- Batches and sends telemetry to `/api/telemetry/rum`.
- Uses:
  - periodic flush,
  - on-online flush,
  - `sendBeacon` on hidden/pagehide fallback.

### 2) Provider wiring

- Updated `src/app/providers/AppProviders.tsx` to include `RumReporterProvider`.

### 3) Mock endpoint

- Updated `src/mock/server.ts`:
  - added `POST /api/telemetry/rum` endpoint (accepts and stores capped batches).
- Updated `src/mock/db.ts`:
  - added `rumTelemetry` collection.

## Why this matters

- gives evidence from real user interaction paths, not only synthetic tests,
- helps identify recurrent INP/API/guard pain points early,
- creates baseline observability path that can be swapped to production sink later.
