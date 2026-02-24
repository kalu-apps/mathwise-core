# Visual Architecture (Frontend)

## Purpose
This document defines how the visual layer is designed, governed, and extended in the portal.
It exists to keep UI quality stable while feature logic keeps evolving.

## Non-Functional Constraints
1. Visual changes must not alter business logic, routing, permissions, data flow, or API behavior.
2. Dark and Light themes must share the same semantic token structure.
3. Visual debt is controlled by automated audits and budgets.

## Core Stack
1. `React 19 + TypeScript + Vite`
2. `MUI` for behavior/accessibility primitives
3. `SCSS` + `CSS variables` for product-owned appearance

## Visual Source of Truth
1. `src/styles/design-system.css`
   - semantic tokens
   - shared visual primitives
   - global MUI skinning layer
2. `src/styles/visual-refactor-overrides.scss`
   - single composition entrypoint for visual modules
3. `src/styles/visual/_core.scss`
   - global contracts (surfaces, dialogs, tags, inputs, spacing, typography)
4. `src/styles/visual/migrated/*.scss`
   - page/feature styling modules using shared tokens/contracts

## Token Model
### Foundation tokens
1. radii
2. spacing
3. typography
4. blur/focus/shadow primitives

### Semantic tokens
1. backgrounds/surfaces: `--surface-*`, `--bg-*`
2. text hierarchy: `--text-primary`, `--text-secondary`, `--text-muted`, `--text-disabled`
3. borders/elevation: `--border-*`, `--shadow-*`
4. brand/accent gradients: `--gradient-*`, `--brand-*`
5. feedback states: `--feedback-success|warning|danger|info`

### Component-level tokens
1. field ergonomics: `--field-*`
2. chip/status ergonomics: `--chip-*`
3. dialog sizing: `--dialog-*`
4. pricing-specific emphasis: `--price-*`, `--plan-badge-*`
5. panel/header ergonomics: `ui-panel-head*`

## Shared Contracts
1. **Input contract**
   - consistent content inset, placeholder contrast, multiline padding
   - no text touching field edges
2. **Status/Tag contract**
   - unified size, weight, spacing, truncation behavior
   - semantic variants: scheduled/inprogress/completed/trial/paid/unpaid
3. **Dialog contract**
   - global desktop/mobile sizing
   - compact/wide profile via class modifiers
   - sticky action area on mobile
   - standardized title row with close action via `DialogTitleWithClose` + `ui-dialog-title*`
4. **Safe text contract**
   - no overflow collisions for titles/meta text
   - controlled wrap/ellipsis behavior in constrained layouts
5. **Panel head contract**
   - unified capsule spacing and line-height via `ui-panel-head`, `ui-panel-head__title`, `ui-panel-head__description`
   - no text touching rounded borders on teacher/student analytic panels
6. **Hero background contract**
   - avoid heavy image assets in above-the-fold zones
   - prefer token-driven CSS gradients/aurora layers for LCP safety

## Why MUI Was Kept
1. Existing app behavior already depends on MUI interactions and accessibility primitives.
2. Full visual ownership is achieved through tokens + global skin + local modules.
3. This minimizes migration risk while preserving speed of frontend iteration.

## Visual QA Pipeline
### Static quality gates
1. `npm run audit:visual`
2. `npm run audit:contracts`
3. `npm run audit:contrast`
4. `npm run smoke:visual`

### Regression and CI gates
1. `npm run visual:matrix` generates 40 scenario matrix
2. `npm run visual:capture` captures current screenshots
3. `npm run visual:diff` compares baseline/current
4. `npm run visual:gate` runs strict gate for CI usage

### Performance gate
1. `npm run audit:visual-performance`
2. Controls blur usage and final built CSS/image budgets
3. Heavy background assets in critical viewports are disallowed unless explicitly justified

## Build/Chunk Strategy
1. Vendor chunk splitting is configured in `vite.config.ts`.
2. UI libraries and router/react runtime are split into dedicated chunks.
3. The goal is to reduce single-bundle pressure without changing app behavior.

## Workflow for New UI Work
1. Start with semantic token usage.
2. Reuse existing contracts (`ui-dialog`, `ui-dialog-title`, `ui-status-chip`, `ui-panel-head`, input contract).
3. Add page-level styles only if primitive/contract layers are insufficient.
4. Run `npm run verify` before merge.

## Anti-Patterns (Forbidden)
1. Hardcoded colors in TS/TSX logic files.
2. Ad-hoc one-off dialog sizing per page when global contract is sufficient.
3. Parallel visual systems without token linkage.
4. Visual tweaks that silently reduce contrast in Light theme.

## Future Evolution
1. Add screenshot baselines to repository and enable strict diff as mandatory PR gate.
2. Continue reducing inline style debt in TSX.
3. Convert remaining page-specific status styles to pure shared primitives.
4. Keep visual system docs updated with every new contract.
