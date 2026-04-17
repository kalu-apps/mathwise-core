import type { Course, CourseVisualPalette, CourseVisualStyle } from "./types";
import polyhedraA from "@/assets/course-visuals/polyhedra-a.svg";
import polyhedraB from "@/assets/course-visuals/polyhedra-b.svg";
import functionSpaceA from "@/assets/course-visuals/function-space-a.svg";
import functionSpaceB from "@/assets/course-visuals/function-space-b.svg";
import analyticSectionsA from "@/assets/course-visuals/analytic-sections-a.svg";
import analyticSectionsB from "@/assets/course-visuals/analytic-sections-b.svg";
import projectionWireframeA from "@/assets/course-visuals/projection-wireframe-a.svg";
import projectionWireframeB from "@/assets/course-visuals/projection-wireframe-b.svg";
import topologyRibbonA from "@/assets/course-visuals/topology-ribbon-a.svg";
import topologyRibbonB from "@/assets/course-visuals/topology-ribbon-b.svg";
import harmonicSignalA from "@/assets/course-visuals/harmonic-signal-a.svg";
import harmonicSignalB from "@/assets/course-visuals/harmonic-signal-b.svg";

const CANONICAL_VISUAL_STYLES = [
  "polyhedra",
  "function-fields",
  "projection-wireframe",
  "topology",
  "analytic-sections",
  "signal-waves",
] as const;

export const COURSE_VISUAL_STYLES = CANONICAL_VISUAL_STYLES;

export const COURSE_VISUAL_PALETTES = [
  "indigo-mineral",
  "cobalt-cyan",
  "violet-mint",
  "graphite-aurora",
  "slate-gold",
] as const;

type CanonicalCourseVisualStyle = (typeof CANONICAL_VISUAL_STYLES)[number];

export type CourseVisualMetadata = {
  visualStyle: CanonicalCourseVisualStyle;
  visualSeed: number;
  visualPalette: CourseVisualPalette;
  visualVariant: number;
};

export type CourseVisualRenderMode = "card" | "featured";

export type CourseVisualStyleInput = Pick<
  Course,
  "id" | "visualStyle" | "visualSeed" | "visualPalette" | "visualVariant"
> &
  Partial<Pick<Course, "title" | "description" | "level">>;

export type CourseVisualLayers = {
  baseGradient: string;
  patternImage: string;
  glowGradient: string;
  shimmerGradient: string;
  veilGradient: string;
};

type PaletteSpec = {
  baseA: string;
  baseB: string;
  baseC: string;
  glowA: string;
  glowB: string;
  tintA: string;
  tintB: string;
  veilA: string;
  veilB: string;
};

const MAX_VISUAL_SEED = 2_147_483_647;
const MAX_VISUAL_VARIANT = 255;

const PALETTE_MAP: Record<CourseVisualPalette, PaletteSpec> = {
  "indigo-mineral": {
    baseA: "#4A2033",
    baseB: "#6A2D4D",
    baseC: "#9D4B65",
    glowA: "#FF9B78",
    glowB: "#FFC37A",
    tintA: "#FF8C8A",
    tintB: "#F6A25B",
    veilA: "#FFE8DF",
    veilB: "#FFCBB1",
  },
  "cobalt-cyan": {
    baseA: "#4D231E",
    baseB: "#7A3626",
    baseC: "#B55331",
    glowA: "#FFAF6A",
    glowB: "#FFD487",
    tintA: "#FF8D5E",
    tintB: "#FFB773",
    veilA: "#FFECDD",
    veilB: "#FFD3AF",
  },
  "violet-mint": {
    baseA: "#4C1F3E",
    baseB: "#7A2D64",
    baseC: "#B74A8F",
    glowA: "#FF8EB0",
    glowB: "#FFC285",
    tintA: "#F870A5",
    tintB: "#F5A85F",
    veilA: "#FFE4F0",
    veilB: "#FFD0D9",
  },
  "graphite-aurora": {
    baseA: "#46241E",
    baseB: "#6F3A2B",
    baseC: "#A95A3A",
    glowA: "#FFA774",
    glowB: "#FFD19A",
    tintA: "#F58E65",
    tintB: "#F9B878",
    veilA: "#FFE9DD",
    veilB: "#FFD5BF",
  },
  "slate-gold": {
    baseA: "#4B2C1A",
    baseB: "#7A4A21",
    baseC: "#B6782F",
    glowA: "#FFD17A",
    glowB: "#FFE39A",
    tintA: "#FFBD64",
    tintB: "#F4A453",
    veilA: "#FFF0D8",
    veilB: "#FFDFAF",
  },
};

const STYLE_DEFAULT_PALETTE: Record<CanonicalCourseVisualStyle, CourseVisualPalette> = {
  polyhedra: "graphite-aurora",
  "function-fields": "indigo-mineral",
  "projection-wireframe": "slate-gold",
  topology: "violet-mint",
  "analytic-sections": "cobalt-cyan",
  "signal-waves": "indigo-mineral",
};

const STYLE_KEYWORD_RULES: Array<{
  style: CanonicalCourseVisualStyle;
  keywords: string[];
}> = [
  {
    style: "projection-wireframe",
    keywords: ["линейн", "вектор", "матриц", "пространств", "rank", "алгебр"],
  },
  {
    style: "analytic-sections",
    keywords: ["аналит", "геометр", "координат", "плоскост", "конус", "сечен"],
  },
  {
    style: "topology",
    keywords: ["алгебр", "уравнен", "тополог", "структур", "корн", "симметр"],
  },
  {
    style: "polyhedra",
    keywords: ["стереометр", "многогран", "объем", "пространствен", "кристалл"],
  },
  {
    style: "signal-waves",
    keywords: ["тригоном", "синус", "косинус", "гармони", "частот", "статист", "вероят"],
  },
  {
    style: "function-fields",
    keywords: ["матан", "предел", "производн", "интеграл", "функц", "график"],
  },
];

const STYLE_ASSET_MAP: Record<
  CanonicalCourseVisualStyle,
  { card: string[]; featured: string[] }
> = {
  polyhedra: {
    card: [polyhedraA, polyhedraB],
    featured: [polyhedraA, polyhedraB],
  },
  "function-fields": {
    card: [functionSpaceA, functionSpaceB],
    featured: [functionSpaceB, functionSpaceA],
  },
  "analytic-sections": {
    card: [analyticSectionsA, analyticSectionsB],
    featured: [analyticSectionsB, analyticSectionsA],
  },
  "projection-wireframe": {
    card: [projectionWireframeA, projectionWireframeB],
    featured: [projectionWireframeB, projectionWireframeA],
  },
  topology: {
    card: [topologyRibbonA, topologyRibbonB],
    featured: [topologyRibbonB, topologyRibbonA],
  },
  "signal-waves": {
    card: [harmonicSignalA, harmonicSignalB],
    featured: [harmonicSignalB, harmonicSignalA],
  },
};

const hashString = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const clampInt = (value: unknown, min: number, max: number): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return Math.min(max, Math.max(min, rounded));
};

const isVisualPalette = (value: unknown): value is CourseVisualPalette =>
  typeof value === "string" && COURSE_VISUAL_PALETTES.includes(value as CourseVisualPalette);

const normalizeVisualStyle = (
  value: unknown
): CanonicalCourseVisualStyle | null => {
  if (typeof value !== "string") return null;
  if (value === "lattice") return "projection-wireframe";
  if (CANONICAL_VISUAL_STYLES.includes(value as CanonicalCourseVisualStyle)) {
    return value as CanonicalCourseVisualStyle;
  }
  return null;
};

const normalizeContextText = (...values: Array<string | undefined>): string =>
  values
    .map((value) => (typeof value === "string" ? value.trim().toLowerCase() : ""))
    .filter(Boolean)
    .join(" ");

const inferVisualStyleFromContext = (
  input: Pick<CourseVisualStyleInput, "title" | "description" | "level">
): CanonicalCourseVisualStyle | null => {
  const context = normalizeContextText(input.title, input.description, input.level);
  if (!context) return null;

  for (const rule of STYLE_KEYWORD_RULES) {
    if (rule.keywords.some((keyword) => context.includes(keyword))) {
      return rule.style;
    }
  }

  return null;
};

const pickSceneBySeed = (
  metadata: CourseVisualMetadata,
  mode: CourseVisualRenderMode
): string => {
  const scenes = STYLE_ASSET_MAP[metadata.visualStyle][mode];
  const mix =
    (metadata.visualSeed ^ (metadata.visualVariant << 11) ^ (mode === "featured" ? 0x9e3779b9 : 0)) >>> 0;
  const index = mix % scenes.length;
  return scenes[index];
};

export const deriveCourseVisualMetadata = (
  courseId: string,
  preferredStyle?: CanonicalCourseVisualStyle
): CourseVisualMetadata => {
  const normalizedId = courseId.trim() || "course";
  const hash = hashString(normalizedId);
  const mixedSeed = (hash * 2654435761) >>> 0;
  const visualStyle =
    preferredStyle ?? CANONICAL_VISUAL_STYLES[hash % CANONICAL_VISUAL_STYLES.length];
  return {
    visualStyle,
    visualPalette: preferredStyle
      ? STYLE_DEFAULT_PALETTE[preferredStyle]
      : COURSE_VISUAL_PALETTES[(hash >>> 5) % COURSE_VISUAL_PALETTES.length],
    visualSeed: mixedSeed % (MAX_VISUAL_SEED + 1),
    visualVariant: (hash >>> 11) % (MAX_VISUAL_VARIANT + 1),
  };
};

export const resolveCourseVisualMetadata = (
  input: CourseVisualStyleInput
): CourseVisualMetadata => {
  const explicitStyle = normalizeVisualStyle(input.visualStyle);
  const inferredStyle = explicitStyle ?? inferVisualStyleFromContext(input);
  const fallback = deriveCourseVisualMetadata(input.id, inferredStyle ?? undefined);
  const visualStyle = explicitStyle ?? inferredStyle ?? fallback.visualStyle;
  return {
    visualStyle,
    visualPalette: isVisualPalette(input.visualPalette)
      ? input.visualPalette
      : STYLE_DEFAULT_PALETTE[visualStyle],
    visualSeed:
      clampInt(input.visualSeed, 0, MAX_VISUAL_SEED) ?? fallback.visualSeed,
    visualVariant:
      clampInt(input.visualVariant, 0, MAX_VISUAL_VARIANT) ?? fallback.visualVariant,
  };
};

export const buildCourseVisualLayers = (
  metadata: CourseVisualMetadata,
  mode: CourseVisualRenderMode = "card"
): CourseVisualLayers => {
  const palette = PALETTE_MAP[metadata.visualPalette];
  const isFeatured = mode === "featured";

  const baseGradient = isFeatured
    ? `linear-gradient(152deg, color-mix(in srgb, ${palette.baseA} 88%, #1d1226) 0%, color-mix(in srgb, ${palette.baseB} 84%, #24162c) 50%, color-mix(in srgb, ${palette.baseC} 80%, #2a182d) 100%)`
    : `linear-gradient(154deg, color-mix(in srgb, ${palette.baseA} 84%, #1d1226) 0%, color-mix(in srgb, ${palette.baseB} 80%, #24162c) 52%, color-mix(in srgb, ${palette.baseC} 76%, #2a182d) 100%)`;

  const glowGradient = isFeatured
    ? `radial-gradient(circle at 82% 16%, color-mix(in srgb, ${palette.glowA} 44%, transparent), transparent 54%), radial-gradient(circle at 16% 86%, color-mix(in srgb, ${palette.glowB} 36%, transparent), transparent 58%), radial-gradient(circle at 40% 44%, color-mix(in srgb, ${palette.glowA} 26%, transparent), transparent 70%)`
    : `radial-gradient(circle at 82% 18%, color-mix(in srgb, ${palette.glowA} 40%, transparent), transparent 56%), radial-gradient(circle at 18% 84%, color-mix(in srgb, ${palette.glowB} 30%, transparent), transparent 60%), radial-gradient(circle at 38% 42%, color-mix(in srgb, ${palette.glowA} 20%, transparent), transparent 72%)`;

  const shimmerGradient = isFeatured
    ? `linear-gradient(116deg, transparent 8%, color-mix(in srgb, ${palette.tintA} 30%, transparent) 38%, color-mix(in srgb, ${palette.tintB} 24%, transparent) 56%, transparent 80%)`
    : `linear-gradient(116deg, transparent 10%, color-mix(in srgb, ${palette.tintA} 24%, transparent) 40%, color-mix(in srgb, ${palette.tintB} 18%, transparent) 58%, transparent 82%)`;

  const veilGradient = isFeatured
    ? `radial-gradient(126% 110% at 30% 40%, color-mix(in srgb, ${palette.veilA} 30%, transparent) 0%, color-mix(in srgb, ${palette.veilB} 16%, transparent) 46%, transparent 100%), linear-gradient(166deg, color-mix(in srgb, ${palette.veilB} 10%, transparent) 0%, transparent 72%)`
    : `radial-gradient(126% 110% at 30% 40%, color-mix(in srgb, ${palette.veilA} 34%, transparent) 0%, color-mix(in srgb, ${palette.veilB} 18%, transparent) 48%, transparent 100%), linear-gradient(166deg, color-mix(in srgb, ${palette.veilB} 12%, transparent) 0%, transparent 72%)`;

  const sceneAsset = pickSceneBySeed(metadata, mode);

  return {
    baseGradient,
    patternImage: `url("${sceneAsset}")`,
    glowGradient,
    shimmerGradient,
    veilGradient,
  };
};

export const getCourseVisualFamilyLabel = (
  style: CourseVisualStyle | CanonicalCourseVisualStyle
): string => {
  const normalized = normalizeVisualStyle(style);
  switch (normalized) {
    case "polyhedra":
      return "Polyhedral Geometry";
    case "function-fields":
      return "Function Surface Graph Space";
    case "analytic-sections":
      return "Analytic Sections";
    case "projection-wireframe":
      return "Projection Wireframe Space";
    case "topology":
      return "Topology Ribbon Surface";
    case "signal-waves":
      return "Harmonic Signal Structure";
    default:
      return "Mathwise Signature Scene";
  }
};
