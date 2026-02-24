# Reliability / Performance Phase 18

## Objective

Reduce UI reload storms caused by bursty `app-data-updated` signals after chained mutations/reconciliation operations.

## What was added

### 1) Centralized data-update bus

File:

- `src/shared/lib/dataUpdateBus.ts`

Capabilities:

- single API: `dispatchDataUpdate(reason, options?)`
- coalesces burst updates into one event
- dispatch throttling window: `120ms`
- preserves cross-tab sync via `localStorage` timestamp write
- emits `CustomEvent("app-data-updated")` with metadata (`reasons`, `at`)

### 2) Migration of update emitters to the bus

Updated files:

- `src/shared/api/client.ts` (mutation success -> `dispatchDataUpdate("api-mutation")`)
- `src/app/providers/ReconciliationRunner.tsx` (`dispatchDataUpdate("reconciliation")`)
- `src/pages/teacher/TeacherDashboard.tsx` retry path (`dispatchDataUpdate("teacher-dashboard-retry")`)

Result:

- fewer redundant reload triggers
- less visual flicker under rapid write/reconcile cycles
- no behavior change for existing listeners (event name unchanged)

## Scope safety

- No domain/business changes.
- No auth/payment/access policy changes.
- No route/permission changes.

Only event transport for UI refresh synchronization was stabilized.
