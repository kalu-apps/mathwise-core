# Visual System Rules

This project uses a single token-driven visual layer.

## Source of truth

- `src/styles/design-system.css` contains tokens, shared primitives, and global MUI skin.
- `src/styles/visual-refactor-overrides.scss` is the single visual entrypoint that composes:
  - `src/styles/visual/_core.scss`
  - `src/styles/visual/migrated/*.scss`

## Hard rules

- Do not import `@/styles/*.scss` from components/pages/features/entities.
- Keep style imports only in `src/main.tsx`:
  - `@/styles/design-system.css`
  - `@/styles/visual-refactor-overrides.scss`
- Do not add Tailwind directives or Tailwind dependencies.
- Do not hardcode colors inside TS/TSX; use tokenized classes/variables.

## Workflow

1. Add or update tokens/primitives in `design-system.css`.
2. Add visual selectors in `visual/_core.scss` (preferred) or `visual/migrated/*`.
3. Run checks:
   - `npm run lint`
   - `npm run audit:visual`
   - `npm run audit:contracts`
   - `npm run audit:contrast`
   - `npm run smoke:visual`
   - `npm run visual:matrix`
   - `npm run visual:diff`
   - `npm run build`
   - `npm run audit:visual-performance`

## Goal

Preserve logic and behavior while keeping visuals centralized, testable, and maintainable.

## Definition Of Done (UI task)

1. New UI uses semantic tokens, not one-off colors.
2. States are complete: `default/hover/active/focus-visible/disabled/loading`.
3. Dark and Light visuals are both adjusted.
4. Mobile layout is validated for dialog/card/list states.
5. `npm run verify` passes locally.

## Component Contracts

1. `CourseDetails`: lesson header (`title + counter`) must not overlap at any breakpoint.
2. `Pricing cards`: title/value/icon must use pricing semantic tokens.
3. `Study cabinet`: icon visibility must pass in dark and light themes.
4. `Dialogs`: shared mobile ergonomics and safe action area.
5. `Statuses/tags`: unified rhythm, contrast, and hierarchy.
6. `Performance`: blur/CSS/image budgets must pass after build.

## Related docs

1. `docs/visual-smoke-pass.md`
2. `docs/visual-regression.md`
3. `docs/visual-roadmap-40.md`
4. `docs/visual-backlog.md`
5. `docs/visual-architecture.md`

## 19-Point Visual Checklist (Completed Baseline)

1. All style entrypoints are centralized in `src/main.tsx`.
2. `src/styles/design-system.css` is the single token source.
3. All variables referenced in visual SCSS are defined in tokens.
4. Dark and Light themes share the same semantic token model.
5. Headings, text, and muted states use semantic text tokens only.
6. Buttons use shared primary/secondary state tokens.
7. Inputs/search fields use shared input tokens and placeholder rules.
8. Chips/tags/statuses use shared tag tokens and consistent uppercase rhythm.
9. Cards/panels use shared surface/border/shadow tokens.
10. Alert spacing and readability are consistent across pages.
11. Skeleton/loading visuals are unified and tokenized.
12. Empty/error/not-found surfaces are unified.
13. Dialogs use consistent mobile-first ergonomics (width/height/actions).
14. Course catalog visuals are tokenized with contrast-safe segment states.
15. Course details pricing/roadmap cards are contrast-safe in both themes.
16. Booking calendar availability/selection states are tokenized.
17. Student profile cards/calendar/lesson tags are tokenized and mobile-safe.
18. Teacher dashboard and teacher-student profile cards are tokenized and mobile-safe.
19. Visual audit metrics are enforced and validated in `npm run verify`.
