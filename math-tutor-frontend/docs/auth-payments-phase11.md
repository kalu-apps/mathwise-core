# Auth + Payments + Access Control (Phase 11 Trusted Session Boundary)

## Scope of Phase 11

Phase 11 hardens trust boundaries by introducing server-authoritative session actor resolution and binding critical domain operations to that actor.

This phase preserves existing user-facing flows while reducing client-side spoofing risk (`userId`, `email`, role escalation).

## 1) Server session model (cookie + persisted records)

Added auth session records to domain-backed mock DB:

- `authSessions[]` in DB schema,
- stateful session lifecycle (`active | revoked | expired`),
- TTL-based pruning and invalidation.

Authentication now creates server sessions and sets `HttpOnly` cookie:

- `POST /api/auth/magic-link` creates session and returns user payload.
- `GET /api/auth/session` resolves current server session (guest returns `200 + null`, not `401`, to avoid noisy startup logs).
- `POST /api/auth/logout` revokes session and clears cookie.
- `POST /api/dev/reset` clears session cookie alongside DB reset.

## 2) Trusted actor binding on critical endpoints

Critical routes now resolve actor from server session and reject mismatched client payload:

- `/api/access/courses`, `/api/access/courses/:id`, `/api/access/lessons/:id`
  - student cannot request another `userId`,
  - anonymous `userId` spoofing is ignored/blocked.
- `/api/purchases` and `/api/checkouts*`
  - scoped to current actor for students,
  - guest cannot request user-scoped purchases/checkouts.
- `/api/purchases/checkout`
  - authenticated actor is authoritative source of identity,
  - mismatched `userId/email` is rejected,
  - teacher purchase attempt is blocked.
- `/api/bookings*`
  - read/write/delete limited to booking owner side (student/teacher),
  - student cannot mutate payment/materials/meeting URL,
  - teacher cannot create self-booking via API.
- `/api/users/:id` (profile update)
  - only self-update allowed.
- teacher-only protected operations:
  - `/api/payments/events*`
  - `/api/support/*`
  - teacher profile/availability write endpoints
  - news create/edit/delete (session-based actor, no query spoofing).

## 3) Frontend session sync changes

Auth provider now performs session reconciliation:

- on app start it calls `GET /api/auth/session`,
- stale local auth is dropped when session is absent,
- logout now revokes server session via `/api/auth/logout`.

API client now sends cookies on all requests:

- `fetch(..., { credentials: "include" })`.

## 4) Security and behavior impact

- Business flows are unchanged from user perspective.
- Access/purchase/booking decisions are now anchored to server actor.
- Client-side privilege toggling via forged IDs/emails is reduced.

## 5) Validation

- `npm run lint` passed.
- `npm run build` passed.
