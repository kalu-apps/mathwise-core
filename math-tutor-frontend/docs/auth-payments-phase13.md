# Auth + Payments + Access Control (Phase 13 Versioned Consent Enforcement)

## Scope of Phase 13

Phase 13 adds explicit, versioned consent enforcement to purchase and trial-booking flows while preserving existing domain states, routing, and access rules.

## 1) Consent policy is now explicit

Added endpoint:

- `GET /api/legal/consent-policy`

Returns:

- `documentVersion` (currently `ru-legal-v1`)
- required scopes for checkout
- required scopes for trial booking

## 2) Server-side consent enforcement

Implemented helpers in mock domain boundary (`mock/server.ts`):

- consent scope validation
- required-scope check against current document version
- idempotent consent capture for missing scopes

`ensureVersionedConsents(...)` now gates:

- `POST /api/purchases/checkout` with required scopes:
  - `terms`
  - `privacy`
  - `checkout`
- `POST /api/bookings` with required scopes:
  - `terms`
  - `privacy`
  - `trial_booking`

If required consents are not present and not provided in payload, API returns deterministic conflict:

- `409`
- `code: "consent_required"`
- `requiredScopes[]`
- `documentVersion`

## 3) Frontend flow updates

To match server-side enforcement:

- Course purchase dialog now collects explicit consent checkboxes before submit.
- Booking page (calendar flow) now requires consent checkboxes before booking.
- Student profile booking panel now requires consent checkboxes before creating booking.

Both booking and checkout payloads now pass `consents.acceptedScopes`.

## 4) Backward compatibility

- Existing successful flows remain unchanged once current-version consent exists.
- Consent capture remains idempotent and audit-friendly.
- No changes to entitlement state machine, payment event processing, or access decision logic.

## 5) Validation

- `npm run lint` passed.
- `npm run build` passed.

