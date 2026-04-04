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
>;

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
    baseA: "#1D2A5A",
    baseB: "#2B4782",
    baseC: "#2C6EA0",
    glowA: "#6AA7FF",
    glowB: "#58D6FF",
    tintA: "#4D79D8",
    tintB: "#4BC7F0",
    veilA: "#E8F3FF",
    veilB: "#C7DBFF",
  },
  "cobalt-cyan": {
    baseA: "#162A53",
    baseB: "#214A84",
    baseC: "#2575A6",
    glowA: "#5E9EFF",
    glowB: "#49D8F5",
    tintA: "#3D77D4",
    tintB: "#45CBEA",
    veilA: "#E9F4FF",
    veilB: "#C5DDFE",
  },
  "violet-mint": {
    baseA: "#2A245C",
    baseB: "#3E3B88",
    baseC: "#2A7B85",
    glowA: "#9C8DFF",
    glowB: "#58E1C3",
    tintA: "#6B66D7",
    tintB: "#43D3B0",
    veilA: "#EFF0FF",
    veilB: "#D1DAFF",
  },
  "graphite-aurora": {
    baseA: "#1D2A45",
    baseB: "#314867",
    baseC: "#2B6F97",
    glowA: "#78AEEB",
    glowB: "#5BC8F4",
    tintA: "#4D78B5",
    tintB: "#49B9E5",
    veilA: "#E7F0FF",
    veilB: "#C6D8F2",
  },
  "slate-gold": {
    baseA: "#2A314B",
    baseB: "#3A4E70",
    baseC: "#6A6A76",
    glowA: "#9DB3F2",
    glowB: "#E8C57A",
    tintA: "#6F83B4",
    tintB: "#D8B26A",
    veilA: "#F0EEFF",
    veilB: "#D6D8EC",
  },
};

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

export const deriveCourseVisualMetadata = (courseId: string): CourseVisualMetadata => {
  const normalizedId = courseId.trim() || "course";
  const hash = hashString(normalizedId);
  const mixedSeed = (hash * 2654435761) >>> 0;
  return {
    visualStyle: CANONICAL_VISUAL_STYLES[hash % CANONICAL_VISUAL_STYLES.length],
    visualPalette: COURSE_VISUAL_PALETTES[(hash >>> 5) % COURSE_VISUAL_PALETTES.length],
    visualSeed: mixedSeed % (MAX_VISUAL_SEED + 1),
    visualVariant: (hash >>> 11) % (MAX_VISUAL_VARIANT + 1),
  };
};

export const resolveCourseVisualMetadata = (
  input: CourseVisualStyleInput
): CourseVisualMetadata => {
  const fallback = deriveCourseVisualMetadata(input.id);
  return {
    visualStyle: normalizeVisualStyle(input.visualStyle) ?? fallback.visualStyle,
    visualPalette: isVisualPalette(input.visualPalette)
      ? input.visualPalette
      : fallback.visualPalette,
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
    ? `linear-gradient(148deg, color-mix(in srgb, ${palette.baseA} 90%, #0b152d) 0%, color-mix(in srgb, ${palette.baseB} 86%, #0f1d39) 50%, color-mix(in srgb, ${palette.baseC} 80%, #132546) 100%)`
    : `linear-gradient(150deg, color-mix(in srgb, ${palette.baseA} 86%, #0c1730) 0%, color-mix(in srgb, ${palette.baseB} 82%, #11203d) 52%, color-mix(in srgb, ${palette.baseC} 76%, #162949) 100%)`;

  const glowGradient = isFeatured
    ? `radial-gradient(circle at 82% 18%, color-mix(in srgb, ${palette.glowA} 40%, transparent), transparent 54%), radial-gradient(circle at 18% 86%, color-mix(in srgb, ${palette.glowB} 34%, transparent), transparent 58%), radial-gradient(circle at 34% 42%, color-mix(in srgb, ${palette.glowA} 24%, transparent), transparent 70%)`
    : `radial-gradient(circle at 82% 18%, color-mix(in srgb, ${palette.glowA} 36%, transparent), transparent 56%), radial-gradient(circle at 18% 86%, color-mix(in srgb, ${palette.glowB} 28%, transparent), transparent 60%), radial-gradient(circle at 34% 42%, color-mix(in srgb, ${palette.glowA} 18%, transparent), transparent 72%)`;

  const shimmerGradient = isFeatured
    ? `linear-gradient(116deg, transparent 8%, color-mix(in srgb, ${palette.tintA} 24%, transparent) 38%, color-mix(in srgb, ${palette.tintB} 18%, transparent) 56%, transparent 80%)`
    : `linear-gradient(116deg, transparent 10%, color-mix(in srgb, ${palette.tintA} 20%, transparent) 40%, color-mix(in srgb, ${palette.tintB} 14%, transparent) 58%, transparent 82%)`;

  const veilGradient = isFeatured
    ? `radial-gradient(128% 112% at 32% 38%, color-mix(in srgb, ${palette.veilA} 38%, transparent) 0%, color-mix(in srgb, ${palette.veilB} 18%, transparent) 46%, transparent 100%), linear-gradient(168deg, color-mix(in srgb, ${palette.veilB} 12%, transparent) 0%, transparent 72%)`
    : `radial-gradient(128% 112% at 32% 38%, color-mix(in srgb, ${palette.veilA} 42%, transparent) 0%, color-mix(in srgb, ${palette.veilB} 22%, transparent) 48%, transparent 100%), linear-gradient(168deg, color-mix(in srgb, ${palette.veilB} 14%, transparent) 0%, transparent 72%)`;

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
