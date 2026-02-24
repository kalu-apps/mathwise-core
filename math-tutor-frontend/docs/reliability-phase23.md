# Reliability Phase 23: Background-Aware Connectivity Recovery

## Objective

Reduce background polling overhead and avoid unnecessary recovery churn while browser tabs are inactive.

## Implemented

### 1) Visibility-aware recheck loop

File:

- `src/app/providers/ConnectivityProvider.tsx`

Changes:

- auto-recheck interval now skips execution when document is hidden,
- recheck/flush continue normally when tab is visible and online.

### 2) Wake-up recovery hooks

Added `focus` + `visibilitychange` wake-up triggers:

- when user returns to the tab and network is online,
- provider performs immediate `recheck()` and `flushOutboxQueue()`.

### 3) Small shared helper

- added `isDocumentVisible()` helper inside provider to keep visibility checks explicit and consistent.

## Why this matters

- lowers background CPU/network pressure,
- reduces chance of event storms while user is away,
- improves perceived freshness when user returns to the app.

## Scope safety

- No auth/payment/access business changes.
- No routing/permission changes.
- No visual contract changes.
