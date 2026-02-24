# Auth + Payments + Access Control (Phase 6 Centralized Access Guard)

## Scope of Phase 6

Phase 6 moves access decisions for courses and lessons into a centralized contract layer:

- unified server-side access decisions (`/api/access/*`),
- shared client API for access checks,
- frontend migration of key pages from ad-hoc checks to authoritative decisions.

Business flows and user scenarios stay unchanged.

## 1) New access decision model

Added shared access types:

- `CourseAccessDecision`
- `LessonAccessDecision`

Core dimensions:

- role (`anonymous|student|teacher`),
- mode (`none|preview|full`),
- reason (`anonymous|identity_unverified|entitlement_missing|...`),
- flags: `requiresAuth`, `requiresVerification`, `hasActiveCourseEntitlement`.

## 2) Server access endpoints

Added mock API endpoints:

- `GET /api/access/courses`
- `GET /api/access/courses/:courseId`
- `GET /api/access/lessons/:lessonId`

Decisions are computed from:

- role,
- identity verification state,
- active entitlements,
- lesson order (preview access),
- snapshot lesson fallback for purchased historical content.

## 3) Access computation rules

- Teacher always gets `full` mode for courses/lessons.
- Anonymous users get `preview` mode (first lesson only).
- Student gets `full` only with verified identity + active course entitlement.
- Unverified students stay in restricted preview mode.
- Missing course/lesson returns `none` with deterministic reason.

## 4) Frontend migration

Migrated to centralized access decisions:

- `src/pages/courses/Courses.tsx`
- `src/pages/courses/CourseDetails.tsx`
- `src/pages/lessons/LessonDetails.tsx`

Effects:

- lock/unlock logic is consistent across catalog/course/lesson screens,
- lesson access now uses one contract (including snapshot fallback),
- role/verification/entitlement gating is aligned with backend states.

## 5) Phase 6 outcome

- access-control checks are centralized and reusable,
- fewer duplicated ad-hoc checks in UI,
- better readiness for production backend migration (same contract shape can be kept).
