# Auth + Payments + Access Control (Phase 15 Self-Heal Consistency + Visibility)

## Scope of Phase 15

Phase 15 addresses a practical consistency gap: user may be verified and have partial artifacts, but purchased course is not visible because domain records are out of sync.

This phase adds deterministic self-healing between:

- `checkoutProcesses`
- `purchases`
- `entitlements`

without changing UI flows.

## 1) Root cause found in current data

For reported student (`iwankalugin13@gmail.com`) current DB state had:

- verified identity,
- trial booking entitlement,
- **no course checkout and no course purchase records**.

In this state course cannot appear in "My courses" by design.

Additionally, in older/migrated states a paid checkout or active entitlement could exist without a purchase row, causing hidden courses in profile/catalog reads.

## 2) New self-heal pipeline

Added helper:

- `ensureUserCourseArtifacts(...)`

What it does:

1. Re-links positive checkout attempts to user by verified email (if userId missing).
2. Re-runs idempotent provisioning for positive checkouts.
3. Ensures course entitlements exist for user purchases.
4. Recreates missing purchase rows from active course entitlements (with snapshots), when possible.

## 3) Where self-heal is executed

- After successful auth (`POST /api/auth/magic-link`).
- During access recovery (`POST /api/auth/recover-access`) for verified users.
- On purchases read (`GET /api/purchases?userId=...`) before visibility filtering.

## 4) Login gate improved

Student login precondition now allows auth not only for existing purchases/bookings, but also for checkout attempts tied to user/email:

- `created`
- `awaiting_payment`
- `paid/provisioning/provisioned`

This removes dead-end scenarios where user needs to login to complete/attach checkout but login was blocked.

## 5) Outcome

- If course was truly purchased but artifacts were inconsistent, it becomes visible automatically.
- If no purchase/checkout exists (trial-only user), course is correctly not shown.
- Reconciliation stays idempotent and backward-compatible with previous phases.

## 6) Validation

- `npm run lint` passed.
- `npm run build` passed.

