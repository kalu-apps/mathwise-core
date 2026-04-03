import type { Course, CourseVisualPalette, CourseVisualStyle } from "./types";

export const COURSE_VISUAL_STYLES = [
  "polyhedra",
  "function-fields",
  "lattice",
  "topology",
  "analytic-sections",
  "signal-waves",
] as const;

export const COURSE_VISUAL_PALETTES = [
  "indigo-mineral",
  "cobalt-cyan",
  "violet-mint",
  "graphite-aurora",
  "slate-gold",
] as const;

export type CourseVisualMetadata = {
  visualStyle: CourseVisualStyle;
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
};

type PaletteSpec = {
  baseA: string;
  baseB: string;
  accent: string;
  accentSoft: string;
  line: string;
  lineSoft: string;
  glow: string;
};

type Rng = () => number;

const MAX_VISUAL_SEED = 2_147_483_647;
const MAX_VISUAL_VARIANT = 11;

const PALETTE_MAP: Record<CourseVisualPalette, PaletteSpec> = {
  "indigo-mineral": {
    baseA: "#4f61d7",
    baseB: "#8d68de",
    accent: "#33c9c2",
    accentSoft: "#92d8ff",
    line: "#4f62c8",
    lineSoft: "#7a8bdd",
    glow: "#72a4ff",
  },
  "cobalt-cyan": {
    baseA: "#2f66bd",
    baseB: "#4f88d2",
    accent: "#28b8d8",
    accentSoft: "#81dcf1",
    line: "#3172b7",
    lineSoft: "#6ab8e6",
    glow: "#4cb7e2",
  },
  "violet-mint": {
    baseA: "#6f52d5",
    baseB: "#9774dd",
    accent: "#34c6a5",
    accentSoft: "#82ead0",
    line: "#6c58be",
    lineSoft: "#8ec9e8",
    glow: "#74d8bf",
  },
  "graphite-aurora": {
    baseA: "#3d547f",
    baseB: "#5b6f92",
    accent: "#58a3d7",
    accentSoft: "#a5d4ff",
    line: "#50668f",
    lineSoft: "#7898c8",
    glow: "#80b4f1",
  },
  "slate-gold": {
    baseA: "#55658e",
    baseB: "#7c83ab",
    accent: "#c8a15b",
    accentSoft: "#ebc88f",
    line: "#6d78a0",
    lineSoft: "#9fadd4",
    glow: "#d8b57f",
  },
};

const isVisualStyle = (value: unknown): value is CourseVisualStyle =>
  typeof value === "string" && COURSE_VISUAL_STYLES.includes(value as CourseVisualStyle);

const isVisualPalette = (value: unknown): value is CourseVisualPalette =>
  typeof value === "string" && COURSE_VISUAL_PALETTES.includes(value as CourseVisualPalette);

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

const mulberry32 = (seed: number): Rng => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let result = Math.imul(state ^ (state >>> 15), 1 | state);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
};

const toDataUri = (svg: string) => {
  const encoded = encodeURIComponent(svg)
    .replace(/%0A/g, "")
    .replace(/%20/g, " ");
  return `url("data:image/svg+xml,${encoded}")`;
};

const createSvgShell = (content: string, background = "transparent") => {
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 420 260' preserveAspectRatio='none'><rect width='420' height='260' fill='${background}'/>${content}</svg>`;
};

const buildFunctionPath = (
  offsetY: number,
  amplitude: number,
  frequency: number,
  phase: number
) => {
  const points: string[] = [];
  for (let x = -10; x <= 430; x += 18) {
    const y = offsetY + Math.sin(x * frequency + phase) * amplitude;
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return points.join(" ");
};

const buildPolyhedraPattern = (palette: PaletteSpec, rng: Rng) => {
  const mainX = 170 + rng() * 90;
  const mainY = 78 + rng() * 62;
  const radius = 54 + rng() * 36;
  const depth = 18 + rng() * 16;
  const secondaryX = 68 + rng() * 80;
  const secondaryY = 148 + rng() * 54;
  const secondaryRadius = 30 + rng() * 16;

  const content = `
    <g fill='none' stroke='${palette.line}' stroke-opacity='0.42' stroke-width='1.5'>
      <polygon points='${mainX - radius},${mainY} ${mainX - radius * 0.32},${mainY - radius * 0.94} ${mainX + radius * 0.7},${mainY - radius * 0.5} ${mainX + radius * 0.8},${mainY + radius * 0.44} ${mainX - radius * 0.14},${mainY + radius * 0.82}' />
      <polygon points='${mainX - radius + depth},${mainY + depth} ${mainX - radius * 0.3 + depth},${mainY - radius * 0.92 + depth} ${mainX + radius * 0.74 + depth},${mainY - radius * 0.5 + depth} ${mainX + radius * 0.84 + depth},${mainY + radius * 0.44 + depth} ${mainX - radius * 0.1 + depth},${mainY + radius * 0.84 + depth}' />
      <line x1='${mainX - radius}' y1='${mainY}' x2='${mainX - radius + depth}' y2='${mainY + depth}' />
      <line x1='${mainX - radius * 0.32}' y1='${mainY - radius * 0.94}' x2='${mainX - radius * 0.3 + depth}' y2='${mainY - radius * 0.92 + depth}' />
      <line x1='${mainX + radius * 0.7}' y1='${mainY - radius * 0.5}' x2='${mainX + radius * 0.74 + depth}' y2='${mainY - radius * 0.5 + depth}' />
      <line x1='${mainX + radius * 0.8}' y1='${mainY + radius * 0.44}' x2='${mainX + radius * 0.84 + depth}' y2='${mainY + radius * 0.44 + depth}' />
      <line x1='${mainX - radius * 0.14}' y1='${mainY + radius * 0.82}' x2='${mainX - radius * 0.1 + depth}' y2='${mainY + radius * 0.84 + depth}' />
      <polygon points='${secondaryX - secondaryRadius},${secondaryY} ${secondaryX},${secondaryY - secondaryRadius} ${secondaryX + secondaryRadius},${secondaryY} ${secondaryX},${secondaryY + secondaryRadius}' stroke='${palette.lineSoft}' stroke-opacity='0.34' />
    </g>
  `;

  return toDataUri(createSvgShell(content));
};

const buildFunctionFieldPattern = (palette: PaletteSpec, rng: Rng) => {
  const lines = Array.from({ length: 4 }, (_, index) => {
    const y = 56 + index * 46 + rng() * 6;
    const amplitude = 8 + rng() * 16;
    const frequency = 0.018 + rng() * 0.028;
    const phase = rng() * Math.PI * 2;
    const points = buildFunctionPath(y, amplitude, frequency, phase);
    const stroke = index === 1 ? palette.accent : palette.line;
    const opacity = index === 1 ? 0.52 : 0.3;
    const width = index === 1 ? 1.9 : 1.35;
    return `<polyline points='${points}' fill='none' stroke='${stroke}' stroke-opacity='${opacity.toFixed(
      2
    )}' stroke-width='${width}'/>`;
  }).join("");

  return toDataUri(createSvgShell(`<g>${lines}</g>`));
};

const buildLatticePattern = (palette: PaletteSpec, rng: Rng) => {
  const stepX = 46 + rng() * 18;
  const stepY = 38 + rng() * 14;
  const verticalLines: string[] = [];
  for (let x = -12; x <= 432; x += stepX) {
    verticalLines.push(
      `<line x1='${x.toFixed(2)}' y1='0' x2='${x.toFixed(2)}' y2='260' stroke='${palette.line}' stroke-opacity='0.2' stroke-width='1'/>`
    );
  }
  const horizontalLines: string[] = [];
  for (let y = -8; y <= 268; y += stepY) {
    horizontalLines.push(
      `<line x1='0' y1='${y.toFixed(2)}' x2='420' y2='${y.toFixed(2)}' stroke='${palette.lineSoft}' stroke-opacity='0.18' stroke-width='1'/>`
    );
  }
  const nodes = Array.from({ length: 12 }, () => {
    const x = 28 + rng() * 364;
    const y = 24 + rng() * 206;
    const r = 1.8 + rng() * 1.6;
    const fill = rng() > 0.55 ? palette.accent : palette.accentSoft;
    return `<circle cx='${x.toFixed(2)}' cy='${y.toFixed(2)}' r='${r.toFixed(2)}' fill='${fill}' fill-opacity='0.42'/>`;
  }).join("");

  return toDataUri(createSvgShell(`<g>${verticalLines.join("")}${horizontalLines.join("")}${nodes}</g>`));
};

const buildTopologyPattern = (palette: PaletteSpec, rng: Rng) => {
  const ribbons = Array.from({ length: 3 }, (_, index) => {
    const startY = 56 + index * 62 + rng() * 8;
    const cp1y = startY - (24 + rng() * 32);
    const cp2y = startY + (18 + rng() * 26);
    const endY = startY + (rng() * 22 - 11);
    const stroke = index === 0 ? palette.accent : palette.lineSoft;
    return `<path d='M -20 ${startY.toFixed(2)} C 88 ${cp1y.toFixed(2)}, 196 ${cp2y.toFixed(
      2
    )}, 440 ${endY.toFixed(2)}' fill='none' stroke='${stroke}' stroke-opacity='${
      index === 0 ? "0.42" : "0.28"
    }' stroke-width='${index === 0 ? "2.2" : "1.5"}'/>`;
  }).join("");

  return toDataUri(createSvgShell(`<g>${ribbons}</g>`));
};

const buildAnalyticSectionsPattern = (palette: PaletteSpec, rng: Rng) => {
  const centerX = 188 + rng() * 54;
  const centerY = 126 + rng() * 22;
  const radius = 58 + rng() * 24;
  const arcLarge = `<path d='M ${centerX - radius} ${centerY} A ${radius} ${radius} 0 0 1 ${
    centerX + radius
  } ${centerY}' fill='none' stroke='${palette.accent}' stroke-opacity='0.46' stroke-width='1.8'/>`;
  const arcSmall = `<path d='M ${centerX - radius * 0.6} ${centerY + radius * 0.3} A ${
    radius * 0.6
  } ${radius * 0.6} 0 0 1 ${centerX + radius * 0.6} ${centerY + radius * 0.3}' fill='none' stroke='${
    palette.line
  }' stroke-opacity='0.34' stroke-width='1.4'/>`;
  const axes = `
    <line x1='${centerX}' y1='18' x2='${centerX}' y2='242' stroke='${palette.lineSoft}' stroke-opacity='0.26' stroke-width='1.1'/>
    <line x1='16' y1='${centerY}' x2='404' y2='${centerY}' stroke='${palette.lineSoft}' stroke-opacity='0.26' stroke-width='1.1'/>
    <line x1='44' y1='38' x2='370' y2='230' stroke='${palette.line}' stroke-opacity='0.18' stroke-width='1'/>
  `;

  return toDataUri(createSvgShell(`<g>${axes}${arcLarge}${arcSmall}</g>`));
};

const buildSignalWavesPattern = (palette: PaletteSpec, rng: Rng) => {
  const waves = Array.from({ length: 5 }, (_, index) => {
    const y = 42 + index * 42 + rng() * 6;
    const amplitude = 5 + rng() * 12;
    const frequency = 0.03 + rng() * 0.02;
    const phase = rng() * Math.PI * 2;
    const points = buildFunctionPath(y, amplitude, frequency, phase);
    const stroke = index % 2 === 0 ? palette.line : palette.accentSoft;
    return `<polyline points='${points}' fill='none' stroke='${stroke}' stroke-opacity='0.28' stroke-width='1.2'/>`;
  }).join("");

  const bars = Array.from({ length: 8 }, (_, index) => {
    const width = 5 + rng() * 8;
    const height = 20 + rng() * 70;
    const x = 30 + index * 44 + rng() * 8;
    const y = 238 - height;
    const fill = index % 3 === 0 ? palette.accent : palette.lineSoft;
    return `<rect x='${x.toFixed(2)}' y='${y.toFixed(2)}' width='${width.toFixed(
      2
    )}' height='${height.toFixed(2)}' rx='2' fill='${fill}' fill-opacity='0.22'/>`;
  }).join("");

  return toDataUri(createSvgShell(`<g>${waves}${bars}</g>`));
};

const buildPatternImage = (
  metadata: CourseVisualMetadata,
  palette: PaletteSpec,
  mode: CourseVisualRenderMode
) => {
  const rng = mulberry32((metadata.visualSeed ^ (metadata.visualVariant << 13)) >>> 0);

  const patternByStyle: Record<CourseVisualStyle, string> = {
    polyhedra: buildPolyhedraPattern(palette, rng),
    "function-fields": buildFunctionFieldPattern(palette, rng),
    lattice: buildLatticePattern(palette, rng),
    topology: buildTopologyPattern(palette, rng),
    "analytic-sections": buildAnalyticSectionsPattern(palette, rng),
    "signal-waves": buildSignalWavesPattern(palette, rng),
  };

  const pattern = patternByStyle[metadata.visualStyle];
  const texture =
    mode === "featured"
      ? "radial-gradient(circle at 12% 10%, rgba(255,255,255,0.24), transparent 48%), radial-gradient(circle at 85% 86%, rgba(255,255,255,0.14), transparent 48%)"
      : "radial-gradient(circle at 12% 10%, rgba(255,255,255,0.17), transparent 42%), radial-gradient(circle at 85% 86%, rgba(255,255,255,0.1), transparent 44%)";

  return `${texture}, ${pattern}`;
};

export const deriveCourseVisualMetadata = (courseId: string): CourseVisualMetadata => {
  const normalizedId = courseId.trim() || "course";
  const hash = hashString(normalizedId);
  return {
    visualStyle: COURSE_VISUAL_STYLES[hash % COURSE_VISUAL_STYLES.length],
    visualPalette: COURSE_VISUAL_PALETTES[(hash >>> 5) % COURSE_VISUAL_PALETTES.length],
    visualSeed: (hash * 2654435761) >>> 0,
    visualVariant: (hash >>> 9) % (MAX_VISUAL_VARIANT + 1),
  };
};

export const resolveCourseVisualMetadata = (
  input: CourseVisualStyleInput
): CourseVisualMetadata => {
  const fallback = deriveCourseVisualMetadata(input.id);
  return {
    visualStyle: isVisualStyle(input.visualStyle)
      ? input.visualStyle
      : fallback.visualStyle,
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
  const baseGradient =
    mode === "featured"
      ? `linear-gradient(138deg, color-mix(in srgb, ${palette.baseA} 45%, white) 0%, color-mix(in srgb, ${palette.baseB} 40%, white) 52%, color-mix(in srgb, ${palette.accent} 30%, white) 100%)`
      : `linear-gradient(142deg, color-mix(in srgb, ${palette.baseA} 34%, white) 0%, color-mix(in srgb, ${palette.baseB} 28%, white) 56%, color-mix(in srgb, ${palette.accent} 22%, white) 100%)`;

  const glowGradient =
    mode === "featured"
      ? `radial-gradient(circle at 84% 18%, color-mix(in srgb, ${palette.glow} 40%, transparent), transparent 55%), radial-gradient(circle at 16% 86%, color-mix(in srgb, ${palette.accent} 30%, transparent), transparent 58%)`
      : `radial-gradient(circle at 84% 18%, color-mix(in srgb, ${palette.glow} 30%, transparent), transparent 52%), radial-gradient(circle at 16% 86%, color-mix(in srgb, ${palette.accent} 22%, transparent), transparent 54%)`;

  const shimmerGradient =
    mode === "featured"
      ? `linear-gradient(112deg, transparent 14%, color-mix(in srgb, ${palette.accentSoft} 24%, transparent) 40%, transparent 66%)`
      : `linear-gradient(112deg, transparent 10%, color-mix(in srgb, ${palette.accentSoft} 18%, transparent) 44%, transparent 72%)`;

  return {
    baseGradient,
    patternImage: buildPatternImage(metadata, palette, mode),
    glowGradient,
    shimmerGradient,
  };
};
