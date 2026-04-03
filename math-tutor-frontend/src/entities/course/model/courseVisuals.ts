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
  "analytic-sections",
  "projection-wireframe",
  "topology",
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
    baseA: "#4E64C9",
    baseB: "#7A72D6",
    baseC: "#4AB4D2",
    glowA: "#88A4FF",
    glowB: "#6AD3E8",
    tintA: "#4D63C8",
    tintB: "#51B0D2",
    veilA: "#F6F9FF",
    veilB: "#E8EEFC",
  },
  "cobalt-cyan": {
    baseA: "#3466B8",
    baseB: "#4E83CD",
    baseC: "#42C1DB",
    glowA: "#72A6F2",
    glowB: "#6ED8E9",
    tintA: "#3D75C1",
    tintB: "#53C4DA",
    veilA: "#F6FAFF",
    veilB: "#E8F2FE",
  },
  "violet-mint": {
    baseA: "#6556C8",
    baseB: "#8A6FD4",
    baseC: "#42C9A9",
    glowA: "#9B90F5",
    glowB: "#75DEBE",
    tintA: "#6B5FC9",
    tintB: "#4CC9AE",
    veilA: "#F8F9FF",
    veilB: "#EAF2FF",
  },
  "graphite-aurora": {
    baseA: "#41567D",
    baseB: "#5A6F92",
    baseC: "#58A7D8",
    glowA: "#84AEE7",
    glowB: "#7AC4ED",
    tintA: "#4A638E",
    tintB: "#65B0DA",
    veilA: "#F5F8FF",
    veilB: "#E6EEF9",
  },
  "slate-gold": {
    baseA: "#506188",
    baseB: "#7581A8",
    baseC: "#C1A064",
    glowA: "#A6B5E8",
    glowB: "#DDC18D",
    tintA: "#5D6F98",
    tintB: "#C9A96A",
    veilA: "#F8F7FF",
    veilB: "#ECEFF9",
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
    ? `linear-gradient(146deg, color-mix(in srgb, ${palette.baseA} 54%, white) 0%, color-mix(in srgb, ${palette.baseB} 49%, white) 48%, color-mix(in srgb, ${palette.baseC} 34%, white) 100%)`
    : `linear-gradient(150deg, color-mix(in srgb, ${palette.baseA} 44%, white) 0%, color-mix(in srgb, ${palette.baseB} 40%, white) 52%, color-mix(in srgb, ${palette.baseC} 28%, white) 100%)`;

  const glowGradient = isFeatured
    ? `radial-gradient(circle at 84% 14%, color-mix(in srgb, ${palette.glowA} 45%, transparent), transparent 56%), radial-gradient(circle at 12% 90%, color-mix(in srgb, ${palette.glowB} 34%, transparent), transparent 58%)`
    : `radial-gradient(circle at 84% 14%, color-mix(in srgb, ${palette.glowA} 32%, transparent), transparent 54%), radial-gradient(circle at 12% 90%, color-mix(in srgb, ${palette.glowB} 24%, transparent), transparent 56%)`;

  const shimmerGradient = isFeatured
    ? `linear-gradient(116deg, transparent 8%, color-mix(in srgb, ${palette.tintA} 14%, transparent) 42%, transparent 76%)`
    : `linear-gradient(116deg, transparent 10%, color-mix(in srgb, ${palette.tintA} 10%, transparent) 44%, transparent 78%)`;

  const veilGradient = isFeatured
    ? `linear-gradient(168deg, color-mix(in srgb, ${palette.veilA} 82%, transparent) 0%, color-mix(in srgb, ${palette.veilB} 72%, transparent) 56%, color-mix(in srgb, ${palette.veilB} 52%, transparent) 100%)`
    : `linear-gradient(168deg, color-mix(in srgb, ${palette.veilA} 88%, transparent) 0%, color-mix(in srgb, ${palette.veilB} 78%, transparent) 56%, color-mix(in srgb, ${palette.veilB} 64%, transparent) 100%)`;

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
