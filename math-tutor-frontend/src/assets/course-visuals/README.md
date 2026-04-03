# Mathwise Course Visuals (Pre-Rendered)

These assets are static, pre-rendered scene frames for course cards.

Design intent:
- premium math identity
- geometric and analytical motifs
- no live WebGL canvas per card in runtime lists

Families:
- `polyhedra-*`
- `function-space-*`
- `analytic-sections-*`
- `projection-wireframe-*`
- `topology-ribbon-*`
- `harmonic-signal-*`

Runtime usage is wired in:
- `/src/entities/course/model/courseVisuals.ts`
- `/src/entities/course/ui/CourseVisualBackground.tsx`

Notes:
- backgrounds are deterministic per course metadata (`visualStyle`, `visualSeed`, `visualVariant`)
- legacy `lattice` style is normalized to `projection-wireframe`
- list rendering stays lightweight because cards consume static image assets
