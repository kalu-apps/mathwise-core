export type Solid3dProjection = "perspective" | "orthographic";

export type Solid3dSectionKeepSide = "both" | "positive" | "negative";
export type Solid3dSectionMode = "free" | "through_points";
export type Solid3dSectionPoint = {
  label?: string;
  x: number;
  y: number;
  z: number;
  faceIndex?: number;
  triangleVertexIndices?: [number, number, number];
  barycentric?: [number, number, number];
};

export type Solid3dSectionState = {
  id: string;
  name: string;
  visible: boolean;
  mode: Solid3dSectionMode;
  pointIndices: number[];
  points: Solid3dSectionPoint[];
  offset: number;
  tiltX: number;
  tiltY: number;
  keepSide: Solid3dSectionKeepSide;
  color: string;
  thickness: number;
  fillEnabled: boolean;
  fillOpacity: number;
  showMetrics: boolean;
};

export type Solid3dClippingPreset = "none" | "small" | "medium" | "large";

export type Solid3dMeasurementType =
  | "edge"
  | "angle"
  | "area"
  | "section_area"
  | "volume";

export type Solid3dMeasurementState = {
  id: string;
  type: Solid3dMeasurementType;
  label: string;
  value: number;
  visible: boolean;
  createdAt: string;
};

export type Solid3dAngleMark = {
  id: string;
  vertexIndex: number;
  label: string;
  color: string;
  visible: boolean;
};

export type Solid3dViewState = {
  rotationX: number;
  rotationY: number;
  zoom: number;
  panX: number;
  panY: number;
  projection: Solid3dProjection;
  showAxes: boolean;
  showGrid: boolean;
  followTeacherView: boolean;
};

export type Solid3dState = {
  view: Solid3dViewState;
  vertexLabels: string[];
  sections: Solid3dSectionState[];
  clippingPreset: Solid3dClippingPreset;
  hiddenFaceIds: string[];
  faceColors: Record<string, string>;
  angleMarks: Solid3dAngleMark[];
  measurements: Solid3dMeasurementState[];
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const toFinite = (value: unknown, fallback: number) => {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const toString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const isProjection = (value: unknown): value is Solid3dProjection =>
  value === "perspective" || value === "orthographic";

const isKeepSide = (value: unknown): value is Solid3dSectionKeepSide =>
  value === "both" || value === "positive" || value === "negative";

const isSectionMode = (value: unknown): value is Solid3dSectionMode =>
  value === "free" || value === "through_points";

const isClippingPreset = (value: unknown): value is Solid3dClippingPreset =>
  value === "none" || value === "small" || value === "medium" || value === "large";

const isMeasurementType = (value: unknown): value is Solid3dMeasurementType =>
  value === "edge" ||
  value === "angle" ||
  value === "area" ||
  value === "section_area" ||
  value === "volume";

const DEFAULT_VIEW: Solid3dViewState = {
  rotationX: 14,
  rotationY: -24,
  zoom: 1,
  panX: 0,
  panY: 0,
  projection: "orthographic",
  showAxes: false,
  showGrid: false,
  followTeacherView: false,
};

export const DEFAULT_SOLID3D_STATE: Solid3dState = {
  view: DEFAULT_VIEW,
  vertexLabels: [],
  sections: [],
  clippingPreset: "none",
  hiddenFaceIds: [],
  faceColors: {},
  angleMarks: [],
  measurements: [],
};

const readSection = (value: unknown): Solid3dSectionState | null => {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<Solid3dSectionState>;
  const id = toString(source.id);
  if (!id) return null;
  const pointIndices = Array.isArray(source.pointIndices)
    ? source.pointIndices
        .map((index) => Number(index))
        .filter((index) => Number.isInteger(index) && index >= 0)
        .slice(0, 32)
    : [];
  const points = Array.isArray((source as { points?: unknown[] }).points)
    ? ((source as { points?: unknown[] }).points ?? [])
        .map((point) => {
          if (!point || typeof point !== "object") return null;
          const raw = point as Partial<Solid3dSectionPoint>;
          const triangleVertexIndices = Array.isArray(raw.triangleVertexIndices)
            ? raw.triangleVertexIndices
                .map((value) => Number(value))
                .filter((value) => Number.isInteger(value) && value >= 0)
                .slice(0, 3)
            : [];
          const barycentric = Array.isArray(raw.barycentric)
            ? raw.barycentric
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value))
                .slice(0, 3)
            : [];
          const nextPoint: Solid3dSectionPoint = {
            label: toString((raw as { label?: unknown }).label, "").trim() || undefined,
            x: toFinite(raw.x, 0),
            y: toFinite(raw.y, 0),
            z: toFinite(raw.z, 0),
          };
          if (Number.isInteger(raw.faceIndex) && Number(raw.faceIndex) >= 0) {
            nextPoint.faceIndex = Number(raw.faceIndex);
          }
          if (triangleVertexIndices.length === 3) {
            nextPoint.triangleVertexIndices = [
              triangleVertexIndices[0],
              triangleVertexIndices[1],
              triangleVertexIndices[2],
            ];
          }
          if (barycentric.length === 3) {
            nextPoint.barycentric = [barycentric[0], barycentric[1], barycentric[2]];
          }
          return nextPoint;
        })
        .filter((point): point is Solid3dSectionPoint => Boolean(point))
        .slice(0, 32)
    : [];
  const mode = isSectionMode(source.mode)
    ? source.mode
    : points.length >= 3 || pointIndices.length >= 3
      ? "through_points"
      : "free";
  return {
    id,
    name: toString(source.name, "Сечение"),
    visible: source.visible !== false,
    mode,
    pointIndices,
    points,
    offset: clamp(toFinite(source.offset, 0), -1, 1),
    tiltX: clamp(toFinite(source.tiltX, 0), -180, 180),
    tiltY: clamp(toFinite(source.tiltY, 0), -180, 180),
    keepSide: isKeepSide(source.keepSide) ? source.keepSide : "both",
    color: toString(source.color, "#ff8e3c"),
    thickness: clamp(toFinite(source.thickness, 2), 1, 8),
    fillEnabled: source.fillEnabled !== false,
    fillOpacity: clamp(toFinite(source.fillOpacity, 0.18), 0.05, 0.9),
    showMetrics: Boolean(source.showMetrics),
  };
};

const readMeasurement = (value: unknown): Solid3dMeasurementState | null => {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<Solid3dMeasurementState>;
  const id = toString(source.id);
  if (!id || !isMeasurementType(source.type)) return null;
  return {
    id,
    type: source.type,
    label: toString(source.label, "Измерение"),
    value: toFinite(source.value, 0),
    visible: source.visible !== false,
    createdAt: toString(source.createdAt, new Date().toISOString()),
  };
};

const readAngleMark = (value: unknown): Solid3dAngleMark | null => {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<Solid3dAngleMark>;
  const id = toString(source.id);
  if (!id) return null;
  const vertexIndex = Number(source.vertexIndex);
  if (!Number.isInteger(vertexIndex) || vertexIndex < 0) return null;
  return {
    id,
    vertexIndex,
    label: toString(source.label, "").trim().slice(0, 64),
    color: toString(source.color, "#ff8e3c"),
    visible: source.visible !== false,
  };
};

export const readSolid3dState = (
  meta: Record<string, unknown> | undefined
): Solid3dState => {
  const viewRaw =
    meta?.view && typeof meta.view === "object"
      ? (meta.view as Partial<Solid3dViewState>)
      : null;

  const view: Solid3dViewState = {
    rotationX: clamp(toFinite(viewRaw?.rotationX, DEFAULT_VIEW.rotationX), -180, 180),
    rotationY: clamp(toFinite(viewRaw?.rotationY, DEFAULT_VIEW.rotationY), -180, 180),
    zoom: clamp(toFinite(viewRaw?.zoom, DEFAULT_VIEW.zoom), 0.4, 2.4),
    panX: clamp(toFinite(viewRaw?.panX, DEFAULT_VIEW.panX), -1, 1),
    panY: clamp(toFinite(viewRaw?.panY, DEFAULT_VIEW.panY), -1, 1),
    projection: isProjection(viewRaw?.projection)
      ? viewRaw.projection
      : DEFAULT_VIEW.projection,
    showAxes: Boolean(viewRaw?.showAxes),
    showGrid: Boolean(viewRaw?.showGrid),
    followTeacherView: Boolean(viewRaw?.followTeacherView),
  };

  const sections = Array.isArray(meta?.sections)
    ? meta.sections
        .map(readSection)
        .filter((section): section is Solid3dSectionState => Boolean(section))
    : [];

  const measurements = Array.isArray(meta?.measurements)
    ? meta.measurements
        .map(readMeasurement)
        .filter(
          (measurement): measurement is Solid3dMeasurementState => Boolean(measurement)
        )
    : [];

  const hiddenFaceIds = Array.isArray(meta?.hiddenFaceIds)
    ? meta.hiddenFaceIds
        .map((item) => (typeof item === "string" ? item : ""))
        .filter(Boolean)
    : [];

  const faceColors =
    meta?.faceColors && typeof meta.faceColors === "object"
      ? Object.entries(meta.faceColors as Record<string, unknown>).reduce<Record<string, string>>(
          (acc, [faceId, rawColor]) => {
            if (!faceId.trim()) return acc;
            if (typeof rawColor !== "string" || !rawColor.trim()) return acc;
            acc[faceId] = rawColor;
            return acc;
          },
          {}
        )
      : {};

  const angleMarks = Array.isArray(meta?.angleMarks)
    ? meta.angleMarks
        .map(readAngleMark)
        .filter((mark): mark is Solid3dAngleMark => Boolean(mark))
        .slice(0, 128)
    : [];

  const vertexLabels = Array.isArray(meta?.vertexLabels)
    ? meta.vertexLabels
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .slice(0, 256)
    : [];

  return {
    view,
    vertexLabels,
    sections,
    clippingPreset: isClippingPreset(meta?.clippingPreset)
      ? meta.clippingPreset
      : "none",
    hiddenFaceIds,
    faceColors,
    angleMarks,
    measurements,
  };
};

export const writeSolid3dState = (
  state: Solid3dState,
  baseMeta: Record<string, unknown> | undefined
) => {
  const nextMeta: Record<string, unknown> = {
    ...(baseMeta ?? {}),
    view: {
      rotationX: clamp(toFinite(state.view.rotationX, DEFAULT_VIEW.rotationX), -180, 180),
      rotationY: clamp(toFinite(state.view.rotationY, DEFAULT_VIEW.rotationY), -180, 180),
      zoom: clamp(toFinite(state.view.zoom, DEFAULT_VIEW.zoom), 0.4, 2.4),
      panX: clamp(toFinite(state.view.panX, DEFAULT_VIEW.panX), -1, 1),
      panY: clamp(toFinite(state.view.panY, DEFAULT_VIEW.panY), -1, 1),
      projection: state.view.projection,
      showAxes: Boolean(state.view.showAxes),
      showGrid: Boolean(state.view.showGrid),
      followTeacherView: Boolean(state.view.followTeacherView),
    },
    vertexLabels: Array.isArray(state.vertexLabels)
      ? state.vertexLabels
          .map((label) => (typeof label === "string" ? label.trim() : ""))
          .slice(0, 256)
      : [],
    sections: state.sections.map((section) => ({
      id: section.id,
      name: section.name,
      visible: Boolean(section.visible),
      mode: isSectionMode(section.mode) ? section.mode : "free",
      pointIndices: Array.isArray(section.pointIndices)
        ? section.pointIndices
            .map((index) => Number(index))
            .filter((index) => Number.isInteger(index) && index >= 0)
            .slice(0, 32)
        : [],
      points: Array.isArray(section.points)
        ? section.points
            .map((point) => ({
              label: toString((point as { label?: unknown }).label, "").trim() || undefined,
              x: toFinite(point.x, 0),
              y: toFinite(point.y, 0),
              z: toFinite(point.z, 0),
              faceIndex:
                Number.isInteger(point.faceIndex) && Number(point.faceIndex) >= 0
                  ? Number(point.faceIndex)
                  : undefined,
              triangleVertexIndices:
                Array.isArray(point.triangleVertexIndices) &&
                point.triangleVertexIndices.length === 3
                  ? ([
                      Number(point.triangleVertexIndices[0]) || 0,
                      Number(point.triangleVertexIndices[1]) || 0,
                      Number(point.triangleVertexIndices[2]) || 0,
                    ] as [number, number, number])
                  : undefined,
              barycentric:
                Array.isArray(point.barycentric) && point.barycentric.length === 3
                  ? ([
                      Number(point.barycentric[0]) || 0,
                      Number(point.barycentric[1]) || 0,
                      Number(point.barycentric[2]) || 0,
                    ] as [number, number, number])
                  : undefined,
            }))
            .slice(0, 32)
        : [],
      offset: clamp(toFinite(section.offset, 0), -1, 1),
      tiltX: clamp(toFinite(section.tiltX, 0), -180, 180),
      tiltY: clamp(toFinite(section.tiltY, 0), -180, 180),
      keepSide: section.keepSide,
      color: section.color,
      thickness: clamp(toFinite(section.thickness, 2), 1, 8),
      fillEnabled: Boolean(section.fillEnabled),
      fillOpacity: clamp(toFinite(section.fillOpacity, 0.18), 0.05, 0.9),
      showMetrics: Boolean(section.showMetrics),
    })),
    clippingPreset: state.clippingPreset,
    hiddenFaceIds: state.hiddenFaceIds,
    faceColors:
      state.faceColors && typeof state.faceColors === "object"
        ? Object.entries(state.faceColors).reduce<Record<string, string>>((acc, [faceId, color]) => {
            if (!faceId.trim()) return acc;
            if (typeof color !== "string" || !color.trim()) return acc;
            acc[faceId] = color;
            return acc;
          }, {})
        : {},
    angleMarks: Array.isArray(state.angleMarks)
      ? state.angleMarks
          .map((mark) => ({
            id: toString(mark.id),
            vertexIndex: Number(mark.vertexIndex),
            label: toString(mark.label, "").trim().slice(0, 64),
            color: toString(mark.color, "#ff8e3c"),
            visible: Boolean(mark.visible),
          }))
          .filter(
            (mark) =>
              Boolean(mark.id) &&
              Number.isInteger(mark.vertexIndex) &&
              mark.vertexIndex >= 0
          )
          .slice(0, 128)
      : [],
    measurements: state.measurements.map((measurement) => ({
      id: measurement.id,
      type: measurement.type,
      label: measurement.label,
      value: measurement.value,
      visible: Boolean(measurement.visible),
      createdAt: measurement.createdAt,
    })),
  };
  return nextMeta;
};
