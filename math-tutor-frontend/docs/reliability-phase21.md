# Reliability Phase 21: Storage Event Noise Isolation

## Objective

Eliminate unnecessary data reloads caused by unfiltered `storage` listeners reacting to unrelated `localStorage` updates.

## Implemented

### 1) Centralized subscription helper

- Added `src/shared/lib/subscribeAppDataUpdates.ts`.

Behavior:

- subscribes to `app-data-updated` custom event,
- listens to `storage` events only for allowed keys,
- defaults to `APP_DATA_UPDATED_STORAGE_KEY`,
- handles `localStorage.clear()` (`event.key === null`) as a global refresh signal.

### 2) Migration of page-level listeners

Replaced ad-hoc dual listeners (`storage` + `app-data-updated`) with the shared helper in:

- `src/pages/teacher/TeacherDashboard.tsx`
- `src/pages/teacher/TeacherStudentProfile.tsx`
- `src/pages/profile/StudentProfile.tsx`
- `src/pages/booking/Booking.tsx`
- `src/pages/about-teacher/AboutTeacher.tsx`
- `src/features/auth/model/useRecoverAccessNotice.ts`

### 3) Preserved specialized channels

- `NewsFeedPanel` keeps its dedicated `news-feed-updated` storage key listener.
- No change to domain/business behavior, only event noise reduction.

## Why this matters

- Prevents reload storms when unrelated keys are written (theme, auth cache, outbox, etc.).
- Reduces avoidable re-renders and INP spikes.
- Makes cross-tab synchronization explicit and maintainable.

## Scope safety

- No changes to auth/payment/entitlement logic.
- No API contract changes.
- No routing or permission changes.
