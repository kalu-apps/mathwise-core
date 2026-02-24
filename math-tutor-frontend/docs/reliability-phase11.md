# Reliability / Performance Phase 11

## Objective

Introduce explicit QA fail-gates for runtime reliability and performance:

1. `INP p75`
2. API error rate
3. Duplicate-submit rate

This complements existing visual/perf static audits and targets interaction stability under real browser execution.

## What was added

### 1) Action guard telemetry

`src/shared/lib/useActionGuard.ts` now emits `app-action-guard` events:

- `started`
- `blocked_local`
- `blocked_global`
- `succeeded`
- `failed`

No business behavior changed; this is observability only.

### 2) Reliability SLO gate runner

New script: `scripts/reliability-slo-gate.mjs`

The runner:

1. starts local app server (`dev` by default),
2. opens desktop + mobile scenarios in Playwright,
3. listens to:
   - `app-performance`
   - `app-api-success`
   - `app-api-failure`
   - `app-action-guard`
4. computes SLO metrics and fails on threshold breach.

### 3) Centralized SLO thresholds

Config file: `docs/reliability-slo-gates.json`

Current defaults:

- `inpP75Max`: `500`
- `apiErrorRateMax`: `0.12`
- `duplicateSubmitRateMax`: `0.08`
- `minInpSamples`: `5`
- `minApiRequests`: `10`

All thresholds are overridable via env vars in CI.

### 4) Report artifact

Output file after run:

- `docs/reliability-slo-report.json`

Contains metric aggregates, threshold values, and gate result context.

## How to run

```bash
npm run audit:reliability
```

## Notes

- `401 /auth/session` is excluded from API failure metric as expected baseline for anonymous startup checks.
- This phase does not alter domain rules, checkout logic, or UI behavior.
