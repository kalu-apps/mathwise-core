# Auth + Payments + Access Control (Phase 8 Reusable Restricted-State UI)

## Scope of Phase 8

Phase 8 standardizes how restricted access states are shown in UI:

- one reusable banner for access-gated states,
- one shared mapping layer from domain decisions to UI states,
- integration into course list, course details, and lesson details.

## 1) Shared UI state mapping

Added centralized mapping helpers:

- `getCourseAccessUiState(...)`
- `getLessonAccessUiState(...)`
- `getCheckoutAccessUiState(...)`

These convert domain states (`requiresAuth`, `requiresVerification`, `entitlement_missing`, checkout access state) into deterministic UI states.

## 2) Reusable component

Added `AccessStateBanner` (`src/shared/ui/AccessStateBanner.tsx`) for:

- `anonymous_preview`
- `awaiting_verification`
- `awaiting_profile`
- `paid_but_restricted`
- `entitlement_missing`

With optional login action button.

## 3) Integrations

### Courses

- Shows verification banner when course access map indicates restricted verified-state issues.

### CourseDetails

- Uses unified page banner for current access state.
- Post-checkout status is mapped to shared UI states.
- Refreshes authoritative course access decision after checkout.

### LessonDetails

- Locked state now uses shared banner and avoids duplicated mixed messaging.

## 4) Visual consistency

Added `.ui-alert` style tokenized class in design system to keep spacing/border/radius consistent for alerts and banners.

## 5) Phase 8 outcome

- restricted-state UX is now consistent across major study surfaces,
- less duplicated conditional text logic,
- better foundation for extending the same pattern to profile and booking screens.
