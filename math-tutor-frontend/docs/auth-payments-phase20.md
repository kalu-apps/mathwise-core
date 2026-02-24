# Auth + Payments + Access Control (Phase 20 BNPL Transparency UI Foundation)

## Scope of Phase 20

Phase 20 introduces a BNPL transparency layer across catalog, course details, student profile, teacher student-view, and lesson access checks.

The implementation keeps existing role/auth/payment architecture and extends the UI/domain adapter level without changing core business flow contracts.

## 1) Purchase model extension (non-breaking)

Extended purchase typing to support normalized payment metadata:

- `paymentMethod`
- `checkoutId`
- optional `bnpl` snapshot (`provider`, `installmentsCount`, `paidCount`, `nextPaymentDate`, schedule)

This was added as optional fields, so legacy records remain readable.

## 2) BNPL policy + derived selectors

Added policy-driven selectors:

- marketing selector (`from X`) for pre-purchase UI,
- financial selector for post-purchase BNPL status,
- access-level selector (`full`, `restricted_new_content`, `suspended_readonly`).

Policy defaults:

- grace: 1–3 overdue days,
- restricted: 4–9,
- suspended: 10+.

## 3) Opened lesson tracking

Added local tracking for `openedLessonIds` keyed by `userId + courseId`.

Purpose:

- when BNPL is overdue, previously opened lessons can remain available,
- new lessons can be blocked according to policy.

## 4) Mock server normalization and persistence

Server now:

- stores `paymentMethod/checkoutId/bnpl` during purchase provisioning,
- backfills/normalizes legacy purchases on reads,
- keeps BNPL snapshots consistent for UI state derivation.

## 5) UX improvements in main surfaces

### Catalog cards

- show BNPL marketing chip (`Оплата частями от ...`) when available.

### Course details

- price block now includes BNPL line + “Как работает сплит” modal,
- added BNPL status banner for purchased BNPL flows,
- lock behavior honors policy states (`restricted_new_content` / `suspended_readonly`).

### Student profile (courses)

- card-level payment status area:
  - full payment vs BNPL progress,
  - next payment date,
  - status chip.
- added payment details dialog with schedule and policy summary.

### Teacher student profile

- course card now includes high-level financial visibility:
  - `Full` or `BNPL X/Y` with summarized status.
- no sensitive payment schedule details exposed.

### Lesson details

- added BNPL-aware guard on direct lesson entry:
  - suspended: lesson blocked, CTA to payment details,
  - restricted: unopened lessons blocked, opened/viewed lessons remain accessible.

## 6) Reliability of implementation

- `npm run lint` passed.
- `npm run build` passed.

## 7) Remaining recommended increment (next phase)

To complete the transparency flow end-to-end:

1. Add dedicated purchase details route (`/profile/purchases/:id`) in addition to dialog.
2. Add unified in-app reminder feed widget for upcoming/grace/restricted BNPL states.
3. Add teacher dashboard compact payment column in student list table (not only student detail page).
