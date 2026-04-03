export type CourseStatus = "draft" | "published";
export type CourseVisualStyle =
  | "polyhedra"
  | "function-fields"
  | "projection-wireframe"
  | "lattice"
  | "topology"
  | "analytic-sections"
  | "signal-waves";

export type CourseVisualPalette =
  | "indigo-mineral"
  | "cobalt-cyan"
  | "violet-mint"
  | "graphite-aurora"
  | "slate-gold";

export type Course = {
  id: string;
  title: string;
  description: string;
  level: string;
  priceGuided: number; // с обратной связью
  priceSelf: number; // без обратной связи
  teacherId: string;
  status: CourseStatus;
  visualStyle?: CourseVisualStyle;
  visualSeed?: number;
  visualPalette?: CourseVisualPalette;
  visualVariant?: number;
};
