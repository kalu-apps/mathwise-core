# Reliability Phase 26: CI Gate + Scoped Reset + Non-Blocking Confirms

## Objective

Close top-priority operational gaps:

- enforce reliability checks in CI,
- avoid destructive broad client-state resets,
- remove blocking browser confirms from critical flows.

## Implemented

### 1) CI reliability gate

- Added GitHub Actions workflow:
  - `.github/workflows/reliability-gate.yml`
- Runs on push/PR:
  - `npm ci`
  - Playwright Chromium install
  - `npm run lint`
  - `npm run build`
  - `npm run audit:reliability`
  - `npm run smoke:network`

### 2) Scoped dev reset

- Added `src/shared/lib/devReset.ts` with explicit key cleanup.
- Updated `src/pages/home/Home.tsx`:
  - replaced global `localStorage.clear()` with scoped reset helper.

### 3) Browser `window.confirm` removal

- Updated `src/pages/home/Home.tsx`:
  - replaced confirm with MUI `Dialog`.
- Updated `src/features/news-feed/ui/NewsFeedPanel.tsx`:
  - replaced delete confirm with MUI `Dialog`.

## Why this matters

- CI blocks reliability regressions earlier.
- Scoped reset prevents accidental loss of unrelated local state.
- Non-blocking dialogs reduce INP spikes and align with app UX system.
