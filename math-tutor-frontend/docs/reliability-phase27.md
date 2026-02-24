# Reliability Phase 27: Route Lazy-Loading + Action Watchdog

## Objective

Improve runtime responsiveness and prevent indefinite pending states.

## Implemented

### 1) Lazy route loading

- Updated `src/app/router/index.tsx`:
  - switched route pages to `React.lazy(...)`,
  - wrapped route elements in `Suspense`,
  - added consistent route fallback spinner.

### 2) Action guard timeout watchdog

- Updated `src/shared/lib/useActionGuard.ts`:
  - added configurable timeout (`timeoutMs`) with safe bounds,
  - default timeout: `30s`,
  - introduced timeout error path as recoverable for retry flows,
  - ensures timer cleanup in all code paths.

- Updated `src/shared/i18n/ru.ts`:
  - added timeout message `connectivity.actionTimeout`.

## Why this matters

- lower initial route payload pressure improves first interaction smoothness,
- watchdog prevents “forever pending” UI states under network hangs,
- retries remain controlled through existing reliability stack.
