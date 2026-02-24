# Reliability / Performance Phase 13

## Objective

Add a runtime safety mechanism that protects UX when interaction performance degrades in real user sessions.

## What was added

### 1) Performance degradation mode provider

Files:

- `src/app/providers/performanceModeContext.ts`
- `src/app/providers/PerformanceModeProvider.tsx`

Behavior:

- Listens to `app-performance` events (`INP`, `LONG_TASK`) from Phase 10 monitoring.
- Tracks a rolling window (`45s`) of `needs-improvement` / `poor` events.
- Auto-activates degraded mode when threshold is exceeded:
  - `poor >= 3` OR `needs-improvement >= 8`
- Keeps degraded mode active for `90s` then re-evaluates.

### 2) Global visual fallback in degraded mode

File:

- `src/styles/design-system.css`

When `data-performance-mode="degraded"` is active:

- blur tokens are set to `0`,
- transitions/animations are minimized,
- skeleton shimmer is disabled,
- heavy background overlays are softened.

This reduces main-thread and paint pressure without changing business logic.

### 3) User-visible notice

File:

- `src/shared/ui/PerformanceModeBanner.tsx`

Integration:

- Rendered globally in `MainLayout` under connectivity banner.
- Explains that lightweight mode is active and allows manual reset.

### 4) Provider wiring

File:

- `src/app/providers/AppProviders.tsx`

`PerformanceModeProvider` is mounted under `PerformanceMonitoringProvider`, so runtime events are available immediately.

## i18n updates

Added `performance.*` keys in:

- `src/shared/i18n/ru.ts`

## Scope safety

- No domain logic changes.
- No auth/payment/access state-machine changes.
- No API contract changes.
