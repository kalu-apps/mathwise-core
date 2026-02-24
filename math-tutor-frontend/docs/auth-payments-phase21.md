# Auth + Payments + Access Control (Phase 21 BNPL Transparency Route + Feed)

## Scope of Phase 21

This phase finalizes the next transparency steps after Phase 20:

1. Dedicated payment details route (`/profile/purchases/:id`).
2. Unified BNPL reminder feed in student profile.
3. Checkout BNPL UX enrichment (quote/fallback/availability state).
4. Teacher list-level payment visibility.

Business logic and state transitions remain unchanged and still use domain selectors/state machine.

## 1) Dedicated Payment Details route

Added route:

- `/profile/purchases/:purchaseId` (student-only)
- `/student/profile/purchases/:purchaseId` (alias)

Implemented page:

- `src/pages/profile/StudentPurchaseDetails.tsx`

Capabilities:

- purchase summary,
- payment method and status chip,
- BNPL schedule rendering,
- policy explanation block,
- support CTA.

Navigation is now consistent from:

- student profile course cards,
- BNPL banner in course details,
- BNPL lock CTA in lesson details.

Back behavior:

- payment details page now returns to the exact previous screen when available (`location.state.from`),
- fallback is browser history, then student courses tab.

## 2) Unified BNPL reminder feed in student profile

Added component:

- `src/entities/purchase/ui/BnplReminderFeed.tsx`

Integrated in `StudentProfile` as a single source reminder strip for statuses:

- upcoming,
- grace,
- restricted,
- suspended.

Each reminder has direct CTA to the purchase details route.

## 3) Checkout BNPL UX updates

In `CourseDetails` payment method selector:

- BNPL line now shows quote style:
  - `4× amount, first payment today` when available.
- fallback text:
  - “exact conditions on next step” when quote cannot be exact.
- not available case:
  - option is disabled,
  - reason shown as inline info alert,
  - selection prevented.

## 4) Teacher dashboard visibility (list-level)

In `TeacherDashboard` student cards now include high-level payment status:

- `Full` or `BNPL x/y` + status suffix (`Upcoming`, `Grace`, `Restricted`, `Suspended`).

No private details (schedule/amount/provider internals) are exposed in this list view.

## 5) Validation

- `npm run lint` ✅ passed.
- `npm run build` ✅ passed.
- `npm run audit:reliability` ⚠️ could not complete in this environment (EPERM bind on `127.0.0.1:4173`).
- `npm run smoke:network` ⚠️ same environment limitation (EPERM bind on `127.0.0.1:4173`).

## 6) Edge-case UX (recheck/attach/recover)

On payment details page:

- added `AccessStateBanner` integration for restricted states,
- added explicit `Проверить доступ` action,
- action attempts authoritative attach (`/purchases/checkout/attach`) when checkout link exists and then re-runs access recheck.

## 7) Notes for next increment

Remaining optional polish:

1. Add server-fed BNPL quote into checkout selection row (when provider quote API is available).
2. Expand teacher dashboard with compact payment filter (only students with risk states).
3. Extend reminder feed to global notification center (if needed).

## 8) Follow-up

Provider-agnostic BNPL adapter and checkout plan selection were implemented in:

- `docs/auth-payments-phase22-bnpl-provider-agnostic.md`
