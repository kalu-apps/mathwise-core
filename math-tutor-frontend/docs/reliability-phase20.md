# Reliability Phase 20: Volatile Storage TTL + Startup Sweep

## Objective

Extend storage hardening from auth cache to volatile client keys and add startup self-cleanup to prevent stale local state from accumulating.

## Implemented

### 1) TTL for volatile update keys

- `src/shared/lib/dataUpdateBus.ts`
  - `APP_DATA_UPDATED_STORAGE_KEY` now writes via `writeStorage(...)` with `24h` TTL.
- `src/entities/news/model/storage.ts`
  - `news-feed-updated` now uses shared storage helper with `24h` TTL.
  - key exported as `NEWS_FEED_UPDATED_STORAGE_KEY` for consistent listeners.
- `src/features/news-feed/ui/NewsFeedPanel.tsx`
  - migrated storage listener to the exported key constant.

### 2) Outbox persistence governance

- `src/shared/lib/outbox.ts`
  - queue persistence now uses TTL (`7d`).
  - startup prune removes malformed/expired outbox entries (`max age 7d`).
  - `OUTBOX_STORAGE_KEY` exported for maintenance routines.

### 3) Startup storage maintenance sweep

- Added `src/app/providers/storageMaintenance.ts`.
- Added `runStorageMaintenanceSweep()` execution in `src/app/providers/AppProviders.tsx` on app start.

Sweep behavior:

- Forces envelope-based TTL eviction for known keys:
  - auth cache
  - outbox queue
  - app data update timestamp
  - news update timestamp
- Cleans up legacy pre-envelope timestamp values for volatile keys.

## Why this matters

- Reduces stale-localstate drift across long sessions and unstable connectivity.
- Prevents old outbox payloads from retrying forever.
- Keeps cross-tab update markers fresh without manual cleanup.
- Improves reliability without changing business/domain behavior.

## Scope safety

- No changes to auth/payment/access business logic.
- No route/permission changes.
- No UI behavior changes beyond storage-key consistency.
