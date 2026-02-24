# Reliability Phase 22: Subscriber Coalescing + Single-Flight Refresh

## Objective

Suppress burst-triggered reload storms by making data-update subscriptions coalesced and non-overlapping by default.

## Implemented

### 1) `subscribeAppDataUpdates` hardening

File:

- `src/shared/lib/subscribeAppDataUpdates.ts`

New behavior:

- configurable coalescing window (`coalesceMs`, default `80ms`),
- single-flight execution per subscriber:
  - if callback is already running, next trigger is queued once,
  - prevents parallel reload chains for the same screen,
- safe callback isolation (`catch` inside scheduler),
- cleanup now also clears pending timer.

### 2) News feed subscription unified

File:

- `src/features/news-feed/ui/NewsFeedPanel.tsx`

Changes:

- migrated to `subscribeAppDataUpdates` with `storageKeys: [NEWS_FEED_UPDATED_STORAGE_KEY]`,
- `includeAppEvent: false` (keeps news-specific channel semantics),
- removed manual duplicate `storage` subscription.

## Why this matters

- lower INP spikes under rapid mutation/reconciliation activity,
- fewer overlapping API reads on the same page,
- lower visible flicker from back-to-back state reloads.

## Scope safety

- No changes to business/domain transitions.
- No auth/payment/entitlement policy changes.
- No routing or permission changes.
