# Auth + Payments + Access Control (Phase 10 Mobile Dialog Action Stability + Focus Safety)

## Scope of Phase 10

Phase 10 finalizes mobile dialog ergonomics and focus-safety for booking/auth overlays without changing business logic, routing, or state machines.

## 1) Removed conflicting icon-only rules for auth modal

The global/mobile dialog-action contract incorrectly treated `auth-modal` as icon-only. This forced all auth action buttons to fixed small width on mobile and caused text overflow/clipping.

Updated shared styles to keep icon-only behavior only where action labels are intentionally hidden:

- `course-editor-dialog`
- `lesson-editor-dialog`
- `ui-confirm-dialog`

`auth-modal` is now excluded from icon-only width forcing.

## 2) Auth modal mobile actions now support text-safe layout

Adjusted auth modal mobile rules so only the primary icon CTA remains compact while text actions are adaptive:

- text/outlined actions can wrap and keep full readable labels,
- no forced `46px` width for all buttons,
- overflow guards (`overflow-wrap`, `word-break`) applied.

## 3) Booking focus management hardened (aria-hidden warning mitigation)

Added a shared local `blurActiveElement()` usage in booking action flow before opening dialogs/alerts:

- open booking calendar dialog,
- open guest checkout dialog,
- show attention/feedback dialog.

Also centralized message popup opening via `showMessage(...)` to ensure consistent focus reset before `setMessageOpen(true)`.

This reduces cases where a focused element remains inside an aria-hidden subtree during modal transitions.

## 4) Validation

- `npm run lint` passed.
- `npm run build` passed.

## 5) Phase 10 outcome

- mobile dialog actions are stable for mixed icon + text scenarios,
- auth modal no longer compresses text actions into icon-sized controls,
- booking overlays are more robust with respect to focus and accessibility warnings,
- no behavioral/domain logic changes introduced.
