# Visual Backlog

## Priority model

- `P0 Visual`: readability/contrast/layout overlap defects that break UX.
- `P1 Visual`: hierarchy inconsistencies, weak emphasis, state ambiguity.
- `P2 Visual`: polish/refinement opportunities.

## Current P0 Visual Regression Targets

1. Course details lesson header (`Материалы курса` + lesson count) overlap prevention.
2. Light theme pricing cards must keep premium emphasis and readable values/icons.
3. Study cabinet icon visibility in light mode.

## Recurring visual hardening cadence

Run per sprint:

1. `npm run verify`
2. `npm run visual:matrix`
3. `npm run visual:diff` (or strict mode in CI)
4. Triage differences into `P0/P1/P2`

## Exit criteria per item

1. Dark and light parity confirmed.
2. Mobile and desktop parity confirmed.
3. No new hardcoded visual debt.
4. No regressions in smoke/contrast/contracts audits.
