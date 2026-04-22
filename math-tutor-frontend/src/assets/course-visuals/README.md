# Mathwise Course Visuals (Pre-Rendered)

These assets are static, pre-rendered scene frames for course cards.
Each family is tied to a real mathematical archetype instead of decorative abstractions.

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

Archetypes:
- `polyhedra-*`: stereometry solids (cube / regular octahedron)
- `function-space-*`: analysis surfaces (elliptic paraboloid / hyperbolic paraboloid)
- `analytic-sections-*`: cone-plane conic sections (ellipse / hyperbola)
- `projection-wireframe-*`: vector basis + matrix projection frame
- `topology-ribbon-*`: Möbius strip and torus / torus-knot-inspired loop
- `harmonic-signal-*`: unit circle + harmonic projection / Lissajous

Canonical formula anchors used in the design system:
- cube: `(±1, ±1, ±1)`; octahedron: `|x| + |y| + |z| = 1`
- paraboloid: `z = x² + y²`; saddle: `z = x² - y²`
- conics: `x²/a² + y²/b² = 1`, `x²/a² - y²/b² = 1`
- Möbius strip parametric surface:
  - `x=(R+s cos(t/2)) cos t`
  - `y=(R+s cos(t/2)) sin t`
  - `z=s sin(t/2)`
- Lissajous: `x=A sin(at+δ)`, `y=B sin(bt)`

Reference catalog used for canonical grounding:
- https://mathworld.wolfram.com/Cube.html
- https://mathworld.wolfram.com/RegularOctahedron.html
- https://mathworld.wolfram.com/Paraboloid.html
- https://mathworld.wolfram.com/HyperbolicParaboloid.html
- https://mathworld.wolfram.com/ConicSection.html
- https://mathworld.wolfram.com/MoebiusStrip.html
- https://mathworld.wolfram.com/TorusKnot.html
- https://mathworld.wolfram.com/LissajousCurve.html

Runtime usage is wired in:
- `/src/entities/course/model/courseVisuals.ts`

Notes:
- backgrounds can be resolved deterministically per course metadata (`visualStyle`, `visualSeed`, `visualVariant`)
- legacy `lattice` style is normalized to `projection-wireframe`
- list rendering can stay lightweight by using static image assets instead of runtime scene generation
