import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { jsPDF } from "jspdf";
import {
  Alert,
  Avatar,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Select,
  Switch,
  Tooltip,
  TextField,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import ContentCutRoundedIcon from "@mui/icons-material/ContentCutRounded";
import GroupRoundedIcon from "@mui/icons-material/GroupRounded";
import MicRoundedIcon from "@mui/icons-material/MicRounded";
import MicOffRoundedIcon from "@mui/icons-material/MicOffRounded";
import ForumRoundedIcon from "@mui/icons-material/ForumRounded";
import SentimentSatisfiedRoundedIcon from "@mui/icons-material/SentimentSatisfiedRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import CreateRoundedIcon from "@mui/icons-material/CreateRounded";
import BorderColorRoundedIcon from "@mui/icons-material/BorderColorRounded";
import PanToolRoundedIcon from "@mui/icons-material/PanToolRounded";
import AdsClickRoundedIcon from "@mui/icons-material/AdsClickRounded";
import HorizontalRuleRoundedIcon from "@mui/icons-material/HorizontalRuleRounded";
import DragHandleRoundedIcon from "@mui/icons-material/DragHandleRounded";
import FiberManualRecordRoundedIcon from "@mui/icons-material/FiberManualRecordRounded";
import PentagonRoundedIcon from "@mui/icons-material/PentagonRounded";
import TextFieldsRoundedIcon from "@mui/icons-material/TextFieldsRounded";
import DeleteSweepRoundedIcon from "@mui/icons-material/DeleteSweepRounded";
import MyLocationRoundedIcon from "@mui/icons-material/MyLocationRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import AutoFixHighRoundedIcon from "@mui/icons-material/AutoFixHighRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import PhotoCameraRoundedIcon from "@mui/icons-material/PhotoCameraRounded";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import LockOpenRoundedIcon from "@mui/icons-material/LockOpenRounded";
import FilterCenterFocusRoundedIcon from "@mui/icons-material/FilterCenterFocusRounded";
import SaveAltRoundedIcon from "@mui/icons-material/SaveAltRounded";
import StickyNote2RoundedIcon from "@mui/icons-material/StickyNote2Rounded";
import ViewInArRoundedIcon from "@mui/icons-material/ViewInArRounded";
import ZoomInRoundedIcon from "@mui/icons-material/ZoomInRounded";
import ZoomOutRoundedIcon from "@mui/icons-material/ZoomOutRounded";
import CenterFocusStrongRoundedIcon from "@mui/icons-material/CenterFocusStrongRounded";
import FullscreenRoundedIcon from "@mui/icons-material/FullscreenRounded";
import FullscreenExitRoundedIcon from "@mui/icons-material/FullscreenExitRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import LayersRoundedIcon from "@mui/icons-material/LayersRounded";
import UnfoldLessRoundedIcon from "@mui/icons-material/UnfoldLessRounded";
import UnfoldMoreRoundedIcon from "@mui/icons-material/UnfoldMoreRounded";
import UndoRoundedIcon from "@mui/icons-material/UndoRounded";
import RedoRoundedIcon from "@mui/icons-material/RedoRounded";
import PolylineRoundedIcon from "@mui/icons-material/PolylineRounded";
import CropFreeRoundedIcon from "@mui/icons-material/CropFreeRounded";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import SwapVertRoundedIcon from "@mui/icons-material/SwapVertRounded";
import FormatBoldRoundedIcon from "@mui/icons-material/FormatBoldRounded";
import FormatItalicRoundedIcon from "@mui/icons-material/FormatItalicRounded";
import FormatUnderlinedRoundedIcon from "@mui/icons-material/FormatUnderlinedRounded";
import FormatAlignLeftRoundedIcon from "@mui/icons-material/FormatAlignLeftRounded";
import FormatAlignCenterRoundedIcon from "@mui/icons-material/FormatAlignCenterRounded";
import FormatAlignRightRoundedIcon from "@mui/icons-material/FormatAlignRightRounded";
import FormatColorTextRoundedIcon from "@mui/icons-material/FormatColorTextRounded";
import FormatColorFillRoundedIcon from "@mui/icons-material/FormatColorFillRounded";
import KeyboardDoubleArrowDownRoundedIcon from "@mui/icons-material/KeyboardDoubleArrowDownRounded";
import { useAuth } from "@/features/auth/model/AuthContext";
import {
  appendWorkbookEvents,
  createWorkbookInvite,
  endWorkbookSession,
  getWorkbookEvents,
  getWorkbookSession,
  getWorkbookSnapshot,
  heartbeatWorkbookPresence,
  openWorkbookSession,
  recognizeWorkbookInk,
  renderWorkbookPdfPages,
  saveWorkbookSnapshot,
  subscribeWorkbookEventsStream,
} from "@/features/workbook/model/api";
import type {
  WorkbookBoardSettings,
  WorkbookBoardObject,
  WorkbookChatMessage,
  WorkbookComment,
  WorkbookConstraint,
  WorkbookDocumentAsset,
  WorkbookDocumentState,
  WorkbookEvent,
  WorkbookLayer,
  WorkbookLibraryState,
  WorkbookPoint,
  WorkbookSceneLayer,
  WorkbookSession,
  WorkbookSessionParticipant,
  WorkbookSessionSettings,
  WorkbookTimerState,
  WorkbookStroke,
  WorkbookTool,
} from "@/features/workbook/model/types";
import {
  createEmptyScene,
  encodeScenePayload,
  normalizeChatMessagePayload,
  normalizeDocumentAnnotationPayload,
  normalizeDocumentAssetPayload,
  normalizeObjectPayload,
  normalizeScenePayload,
  normalizeStrokePayload,
} from "@/features/workbook/model/scene";
import { WorkbookCanvas } from "@/features/workbook/ui/WorkbookCanvas";
import {
  SOLID3D_PRESETS,
  getSolid3dTemplate,
  resolveSolid3dPresetId,
} from "@/features/workbook/model/solid3d";
import {
  computeSectionPolygon,
  getSolid3dMesh,
  type Solid3dMesh,
} from "@/features/workbook/model/solid3dGeometry";
import {
  DEFAULT_SOLID3D_STATE,
  readSolid3dState,
  type Solid3dSectionPoint,
  type Solid3dState,
  type Solid3dSectionState,
  writeSolid3dState,
} from "@/features/workbook/model/solid3dState";
import {
  FUNCTION_GRAPH_PRESETS,
  GRAPH_FUNCTION_COLORS,
  isFunctionExpressionValid,
  normalizeGraphScale,
  normalizeFunctionExpression,
  sanitizeFunctionGraphDrafts,
  validateFunctionExpression,
  type GraphFunctionDraft,
} from "@/features/workbook/model/functionGraph";
import {
  recognizeSmartInkBatch,
  recognizeSmartInkStroke,
  type SmartInkDetectedResult,
} from "@/features/workbook/model/smartInk";
import { PageLoader } from "@/shared/ui/loading";
import { generateId } from "@/shared/lib/id";
import {
  getTeacherChatThreads,
  sendTeacherChatMessage,
} from "@/features/chat/model/api";
import type { TeacherChatThread } from "@/features/chat/model/types";

const POLL_INTERVAL_MS = 300;
const PRESENCE_INTERVAL_MS = 2_500;
const AUTOSAVE_INTERVAL_MS = 9_000;
const SESSION_CHAT_SCROLL_BOTTOM_THRESHOLD_PX = 28;
const MAIN_SCENE_LAYER_ID = "main";
const MAIN_SCENE_LAYER_NAME = "Основной слой";
const WORKBOOK_CHAT_EMOJIS = [
  "👍",
  "✅",
  "👏",
  "🔥",
  "💡",
  "🤝",
  "🙂",
  "😊",
  "🎯",
  "📌",
  "💬",
  "🧠",
  "⭐",
  "📚",
  "📝",
  "📐",
  "📎",
  "🚀",
  "💥",
  "🙌",
  "👌",
  "😎",
  "🤔",
  "❗",
  "❓",
  "🎓",
  "🧩",
  "📈",
  "🔍",
  "⏱️",
];

const parseChatTimestamp = (value: string | null | undefined) => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const defaultColorByLayer: Record<WorkbookLayer, string> = {
  board: "#4f63ff",
  annotations: "#ff8e3c",
};

const defaultWidthByTool: Partial<Record<WorkbookTool, number>> = {
  area_select: 2,
  pen: 3,
  highlighter: 12,
  eraser: 14,
  function_graph: 2,
  compass: 2,
  point: 3,
  line: 3,
  arrow: 3,
  rectangle: 3,
  ellipse: 3,
  triangle: 3,
  polygon: 3,
  text: 3,
  frame: 2,
  divider: 2,
  sticker: 2,
  comment: 2,
};

const HISTORY_EVENT_TYPES = new Set<WorkbookEvent["type"]>([
  "board.stroke",
  "board.stroke.delete",
  "annotations.stroke",
  "annotations.stroke.delete",
  "board.object.create",
  "board.object.update",
  "board.object.delete",
  "board.object.pin",
  "board.clear",
  "annotations.clear",
  "geometry.constraint.add",
  "geometry.constraint.remove",
  "board.settings.update",
  "document.asset.add",
  "document.annotation.add",
  "document.annotation.clear",
]);

const DEFAULT_SETTINGS: WorkbookSessionSettings = {
  undoPolicy: "teacher_only",
  strictGeometry: false,
  smartInk: {
    mode: "basic",
    confidenceThreshold: 0.72,
    smartShapes: true,
    smartTextOcr: false,
    smartMathOcr: false,
  },
  studentControls: {
    canDraw: true,
    canSelect: true,
    canDelete: false,
    canInsertImage: true,
    canClear: false,
    canExport: true,
    canUseLaser: true,
  },
};

type MediaSignalPayload =
  | { kind: "offer"; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; candidate: RTCIceCandidateInit };

const DEFAULT_BOARD_SETTINGS: WorkbookBoardSettings = {
  title: "Рабочая тетрадь",
  showGrid: true,
  gridSize: 22,
  gridColor: "rgba(92, 129, 192, 0.32)",
  backgroundColor: "#ffffff",
  snapToGrid: false,
  smartInk: {
    mode: "basic",
    confidenceThreshold: 0.72,
    smartShapes: true,
    smartTextOcr: false,
    smartMathOcr: false,
  },
  showPageNumbers: false,
  currentPage: 1,
  pagesCount: 1,
  activeFrameId: null,
  autoSectionDividers: false,
  dividerStep: 960,
  sceneLayers: [
    {
      id: MAIN_SCENE_LAYER_ID,
      name: MAIN_SCENE_LAYER_NAME,
      createdAt: new Date().toISOString(),
    },
  ],
  activeSceneLayerId: MAIN_SCENE_LAYER_ID,
};

const DEFAULT_LIBRARY: WorkbookLibraryState = {
  folders: [],
  items: [],
  formulas: [],
  templates: [],
};

type SmartInkMode = "off" | "basic" | "full";

type SmartInkOptions = {
  mode: SmartInkMode;
  confidenceThreshold: number;
  smartShapes: boolean;
  smartTextOcr: boolean;
  smartMathOcr: boolean;
};

const normalizeSmartInkOptions = (
  source?: Partial<SmartInkOptions> | null
): SmartInkOptions => {
  const fallback = DEFAULT_SETTINGS.smartInk ?? {
    mode: "basic" as SmartInkMode,
    confidenceThreshold: 0.72,
    smartShapes: true,
    smartTextOcr: false,
    smartMathOcr: false,
  };
  const mode: SmartInkMode =
    source?.mode === "off" || source?.mode === "basic" || source?.mode === "full"
      ? source.mode
      : fallback.mode;
  const confidenceThresholdRaw =
    typeof source?.confidenceThreshold === "number" &&
    Number.isFinite(source.confidenceThreshold)
      ? source.confidenceThreshold
      : fallback.confidenceThreshold;
  const confidenceThreshold = Math.max(0.35, Math.min(0.98, confidenceThresholdRaw));
  const smartShapes =
    typeof source?.smartShapes === "boolean" ? source.smartShapes : fallback.smartShapes;
  const smartTextOcr =
    typeof source?.smartTextOcr === "boolean" ? source.smartTextOcr : fallback.smartTextOcr;
  const smartMathOcr =
    typeof source?.smartMathOcr === "boolean" ? source.smartMathOcr : fallback.smartMathOcr;
  if (mode === "off") {
    return {
      mode,
      confidenceThreshold,
      smartShapes: false,
      smartTextOcr: false,
      smartMathOcr: false,
    };
  }
  if (mode === "basic") {
    return {
      mode,
      confidenceThreshold,
      smartShapes,
      smartTextOcr: false,
      smartMathOcr: false,
    };
  }
  return {
    mode,
    confidenceThreshold,
    smartShapes,
    smartTextOcr,
    smartMathOcr,
  };
};

const FALLBACK_PERMISSIONS: WorkbookSessionParticipant["permissions"] = {
  canDraw: true,
  canAnnotate: true,
  canUseMedia: true,
  canUseChat: true,
  canInvite: false,
  canManageSession: false,
  canSelect: true,
  canDelete: false,
  canInsertImage: true,
  canClear: false,
  canExport: true,
  canUseLaser: true,
};

const getSectionPointLabel = (index: number) => `P${index + 1}`;
const getSolidVertexLabel = (index: number) => `V${index + 1}`;

const makeUniqueSectionPointLabel = (
  desired: string,
  fallback: string,
  used: Set<string>
) => {
  const baseRaw = desired.trim().slice(0, 16) || fallback;
  const base = baseRaw.slice(0, 16) || fallback;
  let candidate = base;
  let counter = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = String(counter);
    const trimmedBase = base.slice(0, Math.max(1, 16 - suffix.length));
    candidate = `${trimmedBase}${suffix}`;
    counter += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
};

const ensureUniqueSectionPointLabels = (points: Solid3dSectionPoint[]) => {
  const used = new Set<string>();
  return points.map((point, index) => ({
    ...point,
    label: makeUniqueSectionPointLabel(
      point.label ?? "",
      getSectionPointLabel(index),
      used
    ),
  }));
};

const getFigureVertexLabel = (index: number) => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (index < alphabet.length) return alphabet[index];
  return `${alphabet[index % alphabet.length]}${Math.floor(index / alphabet.length)}`;
};

const collectBoardObjectLabels = (object: WorkbookBoardObject) => {
  const labels: string[] = [];
  if (object.type === "line" || object.type === "arrow") {
    if (typeof object.meta?.startLabel === "string") {
      labels.push(object.meta.startLabel);
    }
    if (typeof object.meta?.endLabel === "string") {
      labels.push(object.meta.endLabel);
    }
  }
  if (object.type === "point" && typeof object.meta?.label === "string") {
    labels.push(object.meta.label);
  }
  if (Array.isArray(object.meta?.vertexLabels)) {
    object.meta.vertexLabels.forEach((label) => {
      if (typeof label === "string") {
        labels.push(label);
      }
    });
  }
  if (Array.isArray(object.meta?.sections)) {
    object.meta.sections.forEach((section: unknown) => {
      if (!section || typeof section !== "object") return;
      const typedSection = section as { points?: unknown };
      if (!Array.isArray(typedSection.points)) return;
      typedSection.points.forEach((point: unknown) => {
        if (point && typeof point === "object" && typeof (point as { label?: unknown }).label === "string") {
          labels.push((point as { label: string }).label);
        }
      });
    });
  }
  return labels.map((label) => label.trim().toLowerCase()).filter(Boolean);
};

const getNextUniqueBoardLabel = (used: Set<string>, indexSeed: number) => {
  let attempt = Math.max(0, indexSeed);
  while (attempt < 4096) {
    const base = getFigureVertexLabel(attempt);
    if (!used.has(base.toLowerCase())) {
      used.add(base.toLowerCase());
      return base;
    }
    attempt += 1;
  }
  const fallback = `P${indexSeed + 1}`;
  used.add(fallback.toLowerCase());
  return fallback;
};

const clampGraphOffset = (value: number) => Math.max(-999, Math.min(999, value));

const mergeBoardObjectWithPatch = (
  current: WorkbookBoardObject,
  patch: Partial<WorkbookBoardObject>
): WorkbookBoardObject => {
  const hasMetaPatch = Object.prototype.hasOwnProperty.call(patch, "meta");
  if (!hasMetaPatch) {
    return {
      ...current,
      ...patch,
    };
  }
  const patchMeta = patch.meta;
  if (!patchMeta || typeof patchMeta !== "object" || Array.isArray(patchMeta)) {
    return {
      ...current,
      ...patch,
      meta: patchMeta,
    };
  }
  const currentMeta =
    current.meta && typeof current.meta === "object" && !Array.isArray(current.meta)
      ? (current.meta as Record<string, unknown>)
      : {};
  const nextMeta = {
    ...currentMeta,
    ...(patchMeta as Record<string, unknown>),
  };
  return {
    ...current,
    ...patch,
    meta: nextMeta,
  };
};

const resolveGraphFunctionsFromObject = (object: WorkbookBoardObject): GraphFunctionDraft[] => {
  if (object.type !== "function_graph") return [];
  const raw = Array.isArray(object.meta?.functions) ? object.meta.functions : [];
  return raw.reduce<GraphFunctionDraft[]>((acc, item, index) => {
    if (!item || typeof item !== "object") return acc;
    const typed = item as Partial<GraphFunctionDraft>;
    const expression =
      typeof typed.expression === "string"
        ? normalizeFunctionExpression(typed.expression)
        : "";
    if (!expression) return acc;
    return [
      ...acc,
      {
        id: typeof typed.id === "string" && typed.id ? typed.id : generateId(),
        expression,
        color:
          typeof typed.color === "string" && typed.color
            ? typed.color
            : GRAPH_FUNCTION_COLORS[index % GRAPH_FUNCTION_COLORS.length],
        visible: typed.visible !== false,
        dashed: Boolean(typed.dashed),
        width:
          typeof typed.width === "number" && Number.isFinite(typed.width)
            ? Math.max(1, Math.min(6, typed.width))
            : 2,
        offsetX:
          typeof typed.offsetX === "number" && Number.isFinite(typed.offsetX)
            ? clampGraphOffset(typed.offsetX)
            : 0,
        offsetY:
          typeof typed.offsetY === "number" && Number.isFinite(typed.offsetY)
            ? clampGraphOffset(typed.offsetY)
            : 0,
        scaleX: normalizeGraphScale(typed.scaleX ?? 1, 1),
        scaleY: normalizeGraphScale(typed.scaleY ?? 1, 1),
      },
    ];
  }, []);
};

const areGraphFunctionDraftListsEqual = (
  left: GraphFunctionDraft[],
  right: GraphFunctionDraft[]
) => {
  if (left.length !== right.length) return false;
  return left.every((item, index) => {
    const next = right[index];
    if (!next) return false;
    return (
      item.id === next.id &&
      item.expression === next.expression &&
      item.color === next.color &&
      item.visible === next.visible &&
      item.dashed === next.dashed &&
      (item.width ?? 2) === (next.width ?? 2) &&
      (item.offsetX ?? 0) === (next.offsetX ?? 0) &&
      (item.offsetY ?? 0) === (next.offsetY ?? 0) &&
      (item.scaleX ?? 1) === (next.scaleX ?? 1) &&
      (item.scaleY ?? 1) === (next.scaleY ?? 1)
    );
  });
};

const TEXT_FONT_OPTIONS = [
  { value: "\"Fira Sans\", \"Segoe UI\", sans-serif", label: "Fira Sans" },
  { value: "\"IBM Plex Sans\", \"Segoe UI\", sans-serif", label: "IBM Plex Sans" },
  { value: "\"JetBrains Mono\", \"Fira Mono\", monospace", label: "JetBrains Mono" },
  { value: "\"PT Sans\", \"Segoe UI\", sans-serif", label: "PT Sans" },
];

const is2dFigureObject = (object: WorkbookBoardObject | null) =>
  Boolean(
    object &&
      (object.type === "rectangle" || object.type === "triangle" || object.type === "polygon")
  );

const is2dFigureClosed = (object: WorkbookBoardObject) => {
  if (object.type !== "polygon") return true;
  if (!Array.isArray(object.points) || object.points.length < 2) return true;
  return object.meta?.closed !== false;
};

const resolve2dFigureVertices = (object: WorkbookBoardObject): WorkbookPoint[] => {
  const x = object.x;
  const y = object.y;
  const width = object.width;
  const height = object.height;
  const left = Math.min(x, x + width);
  const right = Math.max(x, x + width);
  const top = Math.min(y, y + height);
  const bottom = Math.max(y, y + height);
  if (object.type === "rectangle") {
    return [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
    ];
  }
  if (object.type === "triangle") {
    return [
      { x: left + (right - left) / 2, y: top },
      { x: left, y: bottom },
      { x: right, y: bottom },
    ];
  }
  if (Array.isArray(object.points) && object.points.length >= 2) {
    return object.points;
  }
  const sides = Math.max(3, Math.min(12, Math.floor(object.sides ?? 5)));
  const cx = left + (right - left) / 2;
  const cy = top + (bottom - top) / 2;
  const rx = Math.max(1, (right - left) / 2);
  const ry = Math.max(1, (bottom - top) / 2);
  return Array.from({ length: sides }, (_, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / sides;
    return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
  });
};

const ROUND_SOLID_PRESETS = new Set([
  "cylinder",
  "cone",
  "truncated_cone",
  "sphere",
  "hemisphere",
  "torus",
]);

const getSolidSectionPointLimit = (
  presetId: string | null,
  mesh: Solid3dMesh | null
) => {
  if (!mesh) return 8;
  if (presetId && ROUND_SOLID_PRESETS.has(presetId)) return 12;
  return Math.max(4, Math.min(12, mesh.faces.length || mesh.vertices.length || 8));
};

const getPointsBounds = (points: WorkbookPoint[]) => {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 1, height: 1 };
  }
  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;
  points.forEach((point) => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  });
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
};

type ConnectedFigureKind =
  | "segment"
  | "triangle"
  | "square"
  | "rectangle"
  | "rhombus"
  | "trapezoid_right"
  | "trapezoid_isosceles"
  | "trapezoid_scalene"
  | "quadrilateral"
  | "pentagon"
  | "hexagon"
  | "polygon";

const approxEqual = (left: number, right: number, toleranceRatio = 0.08) =>
  Math.abs(left - right) <= Math.max(1e-2, Math.max(Math.abs(left), Math.abs(right)) * toleranceRatio);

const vectorSub = (from: WorkbookPoint, to: WorkbookPoint) => ({
  x: to.x - from.x,
  y: to.y - from.y,
});

const vectorDot = (left: WorkbookPoint, right: WorkbookPoint) => left.x * right.x + left.y * right.y;
const vectorCross = (left: WorkbookPoint, right: WorkbookPoint) => left.x * right.y - left.y * right.x;
const vectorLen = (value: WorkbookPoint) => Math.hypot(value.x, value.y);

const vectorsParallel = (left: WorkbookPoint, right: WorkbookPoint) => {
  const leftLength = vectorLen(left);
  const rightLength = vectorLen(right);
  if (leftLength < 1e-6 || rightLength < 1e-6) return false;
  return Math.abs(vectorCross(left, right)) <= leftLength * rightLength * 0.08;
};

const vectorsPerpendicular = (left: WorkbookPoint, right: WorkbookPoint) => {
  const leftLength = vectorLen(left);
  const rightLength = vectorLen(right);
  if (leftLength < 1e-6 || rightLength < 1e-6) return false;
  return Math.abs(vectorDot(left, right)) <= leftLength * rightLength * 0.12;
};

const classifyConnectedFigureKind = (points: WorkbookPoint[]): ConnectedFigureKind => {
  if (points.length <= 1) return "polygon";
  if (points.length === 2) return "segment";
  if (points.length === 3) return "triangle";
  if (points.length === 5) return "pentagon";
  if (points.length === 6) return "hexagon";
  if (points.length !== 4) return "polygon";

  const edges = [
    vectorSub(points[0], points[1]),
    vectorSub(points[1], points[2]),
    vectorSub(points[2], points[3]),
    vectorSub(points[3], points[0]),
  ];
  const lengths = edges.map((edge) => vectorLen(edge));
  const allEqual = lengths.every((length) => approxEqual(length, lengths[0]));

  const oppositePairAParallel = vectorsParallel(edges[0], edges[2]);
  const oppositePairBParallel = vectorsParallel(edges[1], edges[3]);
  const hasRightAngles =
    vectorsPerpendicular(edges[0], edges[1]) &&
    vectorsPerpendicular(edges[1], edges[2]) &&
    vectorsPerpendicular(edges[2], edges[3]) &&
    vectorsPerpendicular(edges[3], edges[0]);

  if (hasRightAngles && allEqual) return "square";
  if (hasRightAngles) return "rectangle";
  if (allEqual) return "rhombus";

  const isTrapezoid = (oppositePairAParallel || oppositePairBParallel) && !(
    oppositePairAParallel && oppositePairBParallel
  );
  if (!isTrapezoid) return "quadrilateral";

  const baseIndices = oppositePairAParallel ? [0, 2] : [1, 3];
  const legIndices = oppositePairAParallel ? [1, 3] : [0, 2];
  const isRight =
    vectorsPerpendicular(edges[baseIndices[0]], edges[legIndices[0]]) ||
    vectorsPerpendicular(edges[baseIndices[0]], edges[legIndices[1]]) ||
    vectorsPerpendicular(edges[baseIndices[1]], edges[legIndices[0]]) ||
    vectorsPerpendicular(edges[baseIndices[1]], edges[legIndices[1]]);
  if (isRight) return "trapezoid_right";

  const isIsosceles = approxEqual(lengths[legIndices[0]], lengths[legIndices[1]]);
  return isIsosceles ? "trapezoid_isosceles" : "trapezoid_scalene";
};

const getWorkbookObjectTypeLabel = (object: WorkbookBoardObject) => {
  if (object.type === "point") return "Точка";
  if (object.type === "line" || object.type === "arrow") {
    return object.meta?.lineKind === "segment" ? "Отрезок" : "Линия";
  }
  if (object.type === "rectangle") return "Прямоугольник";
  if (object.type === "ellipse") return "Эллипс";
  if (object.type === "triangle") return "Треугольник";
  if (object.type === "polygon") {
    const kind =
      typeof object.meta?.figureKind === "string" ? object.meta.figureKind : "";
    if (kind === "triangle") return "Треугольник";
    if (kind === "square") return "Квадрат";
    if (kind === "rectangle") return "Прямоугольник";
    if (kind === "rhombus") return "Ромб";
    if (kind === "trapezoid_right") return "Прямоугольная трапеция";
    if (kind === "trapezoid_isosceles") return "Равнобедренная трапеция";
    if (kind === "trapezoid_scalene") return "Неравнобедренная трапеция";
    if (kind === "quadrilateral") return "Четырёхугольник";
    if (kind === "pentagon") return "Пятиугольник";
    if (kind === "hexagon") return "Шестиугольник";
    return "Многоугольник";
  }
  if (object.type === "text") return "Текст";
  if (object.type === "section_divider") return "Разделитель";
  if (object.type === "sticker") return "Заметка";
  if (object.type === "solid3d") return "3D-фигура";
  if (object.type === "image") return "Изображение";
  return "Объект";
};

const getDefaultToolWidth = (targetTool: WorkbookTool) =>
  defaultWidthByTool[targetTool] ?? 3;

const normalizeSceneLayersForBoard = (
  sourceLayers: WorkbookSceneLayer[] | undefined,
  activeSceneLayerId: string | undefined
) => {
  const unique = (sourceLayers ?? []).reduce<WorkbookSceneLayer[]>((acc, layer) => {
    if (!layer?.id || acc.some((entry) => entry.id === layer.id)) return acc;
    return [...acc, layer];
  }, []);
  if (!unique.some((layer) => layer.id === MAIN_SCENE_LAYER_ID)) {
    unique.unshift({
      id: MAIN_SCENE_LAYER_ID,
      name: MAIN_SCENE_LAYER_NAME,
      createdAt: new Date().toISOString(),
    });
  }
  const resolvedActiveLayerId =
    typeof activeSceneLayerId === "string" &&
    unique.some((layer) => layer.id === activeSceneLayerId)
      ? activeSceneLayerId
      : MAIN_SCENE_LAYER_ID;
  return {
    sceneLayers: unique,
    activeSceneLayerId: resolvedActiveLayerId,
  };
};

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(file);
  });

const SolidPresetPreview = ({ presetId }: { presetId: string }) => {
  const template = getSolid3dTemplate(presetId);
  const isRoundPreset =
    presetId === "cylinder" ||
    presetId === "cone" ||
    presetId === "truncated_cone" ||
    presetId === "sphere" ||
    presetId === "hemisphere" ||
    presetId === "torus";
  const mapX = (value: number) => 10 + (value / 100) * 100;
  const mapY = (value: number) => 10 + (value / 100) * 80;
  const pathArc = (
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    part: "front" | "back"
  ) => {
    const sweep = part === "front" ? 0 : 1;
    return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 ${sweep} ${cx + rx} ${cy}`;
  };

  return (
    <svg viewBox="0 0 120 100" role="img" aria-hidden="true">
      {!isRoundPreset
        ? (
            <>
              {template.faces?.map((face, index) => (
                <polygon
                  key={`face-${template.id}-${index}`}
                  points={face.points
                    .map((point) => `${mapX(point.x)},${mapY(point.y)}`)
                    .join(" ")}
                  fill="rgba(63, 78, 145, 0.12)"
                  stroke="none"
                />
              ))}
              {template.segments.map((segment, index) => (
                <line
                  key={`segment-${template.id}-${index}`}
                  x1={mapX(segment.from.x)}
                  y1={mapY(segment.from.y)}
                  x2={mapX(segment.to.x)}
                  y2={mapY(segment.to.y)}
                  stroke="#111827"
                  strokeWidth={2}
                  strokeDasharray={segment.hidden ? "6 5" : undefined}
                  strokeLinecap="round"
                />
              ))}
            </>
          )
        : null}
      {presetId === "cylinder" ? (
        <>
          <ellipse cx={60} cy={30} rx={24} ry={7} fill="none" stroke="#111827" strokeWidth={2} />
          <line x1={36} y1={30} x2={36} y2={74} stroke="#111827" strokeWidth={2} />
          <line x1={84} y1={30} x2={84} y2={74} stroke="#111827" strokeWidth={2} />
          <path d={pathArc(60, 74, 24, 7, "front")} fill="none" stroke="#111827" strokeWidth={2} />
          <path d={pathArc(60, 74, 24, 7, "back")} fill="none" stroke="#111827" strokeWidth={2} strokeDasharray="6 5" />
        </>
      ) : null}
      {presetId === "cone" ? (
        <>
          <line x1={60} y1={18} x2={36} y2={76} stroke="#111827" strokeWidth={2} />
          <line x1={60} y1={18} x2={84} y2={76} stroke="#111827" strokeWidth={2} />
          <path d={pathArc(60, 76, 24, 7, "front")} fill="none" stroke="#111827" strokeWidth={2} />
          <path d={pathArc(60, 76, 24, 7, "back")} fill="none" stroke="#111827" strokeWidth={2} strokeDasharray="6 5" />
        </>
      ) : null}
      {presetId === "truncated_cone" ? (
        <>
          <ellipse cx={60} cy={28} rx={13} ry={4} fill="none" stroke="#111827" strokeWidth={2} />
          <line x1={47} y1={28} x2={36} y2={76} stroke="#111827" strokeWidth={2} />
          <line x1={73} y1={28} x2={84} y2={76} stroke="#111827" strokeWidth={2} />
          <path d={pathArc(60, 76, 24, 7, "front")} fill="none" stroke="#111827" strokeWidth={2} />
          <path d={pathArc(60, 76, 24, 7, "back")} fill="none" stroke="#111827" strokeWidth={2} strokeDasharray="6 5" />
        </>
      ) : null}
      {presetId === "sphere" ? (
        <>
          <circle cx={60} cy={50} r={28} fill="rgba(63, 78, 145, 0.08)" stroke="#111827" strokeWidth={2} />
          <path d={pathArc(60, 50, 28, 7, "front")} fill="none" stroke="#111827" strokeWidth={2} />
          <path d={pathArc(60, 50, 28, 7, "back")} fill="none" stroke="#111827" strokeWidth={2} strokeDasharray="6 5" />
        </>
      ) : null}
      {presetId === "hemisphere" ? (
        <>
          <path d="M 32 58 A 28 28 0 0 1 88 58" fill="rgba(63, 78, 145, 0.08)" stroke="#111827" strokeWidth={2} />
          <path d={pathArc(60, 58, 28, 7, "front")} fill="none" stroke="#111827" strokeWidth={2} />
          <path d={pathArc(60, 58, 28, 7, "back")} fill="none" stroke="#111827" strokeWidth={2} strokeDasharray="6 5" />
        </>
      ) : null}
      {presetId === "torus" ? (
        <>
          <ellipse cx={60} cy={50} rx={30} ry={18} fill="rgba(63, 78, 145, 0.06)" stroke="#111827" strokeWidth={2} />
          <ellipse cx={60} cy={50} rx={14} ry={8} fill="none" stroke="#111827" strokeWidth={2} />
          <path d={pathArc(60, 50, 30, 8, "back")} fill="none" stroke="#111827" strokeWidth={2} strokeDasharray="6 5" />
        </>
      ) : null}
    </svg>
  );
};

const makeRegularPolygonPoints = (sides: number) => {
  const safeSides = Math.max(3, Math.min(12, Math.floor(sides)));
  const centerX = 50;
  const centerY = 50;
  const radius = 34;
  return Array.from({ length: safeSides }, (_, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / safeSides;
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  })
    .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");
};

const ShapeCatalogPreview = ({
  variant,
  sides = 5,
}: {
  variant:
    | "polygon"
    | "rectangle"
    | "ellipse"
    | "polyline"
    | "trapezoid"
    | "trapezoid_right"
    | "trapezoid_scalene"
    | "rhombus";
  sides?: number;
}) => {
  if (variant === "rectangle") {
    return (
      <svg viewBox="0 0 100 100" role="img" aria-hidden="true">
        <rect
          x={16}
          y={24}
          width={68}
          height={52}
          rx={8}
          ry={8}
          fill="rgba(79, 99, 255, 0.08)"
          stroke="#4f63ff"
          strokeWidth={5}
        />
      </svg>
    );
  }
  if (variant === "ellipse") {
    return (
      <svg viewBox="0 0 100 100" role="img" aria-hidden="true">
        <ellipse
          cx={50}
          cy={50}
          rx={33}
          ry={25}
          fill="rgba(79, 99, 255, 0.08)"
          stroke="#4f63ff"
          strokeWidth={5}
        />
      </svg>
    );
  }
  if (variant === "polyline") {
    return (
      <svg viewBox="0 0 100 100" role="img" aria-hidden="true">
        <polyline
          points="14,70 30,38 47,62 62,28 83,54"
          fill="none"
          stroke="#4f63ff"
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={14} cy={70} r={3.5} fill="#4f63ff" />
        <circle cx={83} cy={54} r={3.5} fill="#4f63ff" />
      </svg>
    );
  }
  if (variant === "trapezoid") {
    return (
      <svg viewBox="0 0 100 100" role="img" aria-hidden="true">
        <polygon
          points="28,28 72,28 84,74 16,74"
          fill="rgba(79, 99, 255, 0.08)"
          stroke="#4f63ff"
          strokeWidth={5}
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (variant === "trapezoid_right") {
    return (
      <svg viewBox="0 0 100 100" role="img" aria-hidden="true">
        <polygon
          points="24,24 66,24 84,74 24,74"
          fill="rgba(79, 99, 255, 0.08)"
          stroke="#4f63ff"
          strokeWidth={5}
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (variant === "trapezoid_scalene") {
    return (
      <svg viewBox="0 0 100 100" role="img" aria-hidden="true">
        <polygon
          points="22,30 74,22 86,74 14,74"
          fill="rgba(79, 99, 255, 0.08)"
          stroke="#4f63ff"
          strokeWidth={5}
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (variant === "rhombus") {
    return (
      <svg viewBox="0 0 100 100" role="img" aria-hidden="true">
        <polygon
          points="50,18 82,50 50,82 18,50"
          fill="rgba(79, 99, 255, 0.08)"
          stroke="#4f63ff"
          strokeWidth={5}
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 100 100" role="img" aria-hidden="true">
      <polygon
        points={makeRegularPolygonPoints(sides)}
        fill="rgba(79, 99, 255, 0.08)"
        stroke="#4f63ff"
        strokeWidth={5}
        strokeLinejoin="round"
      />
    </svg>
  );
};

type ClearRequest = {
  requestId: string;
  targetLayer: WorkbookLayer;
  authorUserId: string;
};

type DocsWindowState = {
  open: boolean;
  pinned: boolean;
  maximized: boolean;
};

type WorkbookSceneSnapshot = {
  boardStrokes: WorkbookStroke[];
  boardObjects: WorkbookBoardObject[];
  constraints: WorkbookConstraint[];
  annotationStrokes: WorkbookStroke[];
  chatMessages: WorkbookChatMessage[];
  comments: WorkbookComment[];
  timerState: WorkbookTimerState | null;
  boardSettings: WorkbookBoardSettings;
  libraryState: WorkbookLibraryState;
  documentState: WorkbookDocumentState;
};

export default function WorkbookSessionPage() {
  const { user } = useAuth();
  const { sessionId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [session, setSession] = useState<WorkbookSession | null>(null);
  const [boardStrokes, setBoardStrokes] = useState<WorkbookStroke[]>([]);
  const [boardObjects, setBoardObjects] = useState<WorkbookBoardObject[]>([]);
  const [constraints, setConstraints] = useState<WorkbookConstraint[]>([]);
  const [annotationStrokes, setAnnotationStrokes] = useState<WorkbookStroke[]>([]);
  const [chatMessages, setChatMessages] = useState<WorkbookChatMessage[]>([]);
  const [comments, setComments] = useState<WorkbookComment[]>([]);
  const [timerState, setTimerState] = useState<WorkbookTimerState | null>(null);
  const [boardSettings, setBoardSettings] =
    useState<WorkbookBoardSettings>(DEFAULT_BOARD_SETTINGS);
  const [libraryState, setLibraryState] =
    useState<WorkbookLibraryState>(DEFAULT_LIBRARY);
  const [documentState, setDocumentState] = useState<WorkbookDocumentState>({
    assets: [],
    activeAssetId: null,
    page: 1,
    zoom: 1,
    annotations: [],
  });
  const [tool, setTool] = useState<WorkbookTool>("pen");
  const [layer] = useState<WorkbookLayer>("board");
  const [strokeColor] = useState(defaultColorByLayer.board);
  const [strokeWidth, setStrokeWidth] = useState(getDefaultToolWidth("pen"));
  const [polygonSides, setPolygonSides] = useState(5);
  const [polygonMode, setPolygonMode] = useState<"regular" | "points">("regular");
  const [polygonPreset, setPolygonPreset] = useState<
    "regular" | "trapezoid" | "trapezoid_right" | "trapezoid_scalene" | "rhombus"
  >("regular");
  const textPreset = "";
  const [lineStyle, setLineStyle] = useState<"solid" | "dashed">("solid");
  const [lineWidthDraft, setLineWidthDraft] = useState(3);
  const [graphExpressionDraft, setGraphExpressionDraft] = useState("");
  const [graphDraftFunctions, setGraphDraftFunctions] = useState<GraphFunctionDraft[]>([]);
  const [smartInkOptions, setSmartInkOptions] = useState<SmartInkOptions>(
    normalizeSmartInkOptions(DEFAULT_SETTINGS.smartInk)
  );
  const [selectedGraphPresetId, setSelectedGraphPresetId] = useState<string | null>(null);
  const [graphDraftError, setGraphDraftError] = useState<string | null>(null);
  const [graphFunctionsDraft, setGraphFunctionsDraft] = useState<GraphFunctionDraft[]>([]);
  const [graphCatalogCursorActive, setGraphCatalogCursorActive] = useState(false);
  const [graphWorkbenchTab, setGraphWorkbenchTab] = useState<"catalog" | "work">(
    "catalog"
  );
  const [dividerWidthDraft, setDividerWidthDraft] = useState(2);
  const [noteDraftText, setNoteDraftText] = useState("Заметка");
  const [solid3dInspectorTab, setSolid3dInspectorTab] = useState<"figure" | "section">(
    "section"
  );
  const [activeSolidSectionId, setActiveSolidSectionId] = useState<string | null>(null);
  const [solid3dSectionPointCollecting, setSolid3dSectionPointCollecting] = useState<
    string | null
  >(null);
  const [solid3dSectionPointTarget, setSolid3dSectionPointTarget] = useState<{
    sectionId: string;
    pointIndex: number;
  } | null>(null);
  const [solid3dDraftPoints, setSolid3dDraftPoints] = useState<{
    objectId: string;
    points: Solid3dSectionPoint[];
  } | null>(null);
  const [canvasViewport, setCanvasViewport] = useState<WorkbookPoint>({ x: 0, y: 0 });
  const [spacePanActive, setSpacePanActive] = useState(false);
  const [viewportZoom, setViewportZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [utilityTab, setUtilityTab] = useState<
    "settings" | "notes" | "graph" | "transform" | "layers"
  >(
    "settings"
  );
  const [isUtilityPanelOpen, setIsUtilityPanelOpen] = useState(false);
  const [isUtilityPanelCollapsed, setIsUtilityPanelCollapsed] = useState(false);
  const [utilityPanelPosition, setUtilityPanelPosition] = useState({ x: 0, y: 86 });
  const [utilityPanelDragState, setUtilityPanelDragState] = useState<{
    startClientX: number;
    startClientY: number;
    startLeft: number;
    startTop: number;
  } | null>(null);
  const [frameFocusMode] = useState<"all" | "active">("all");
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [selectedConstraintId, setSelectedConstraintId] = useState<string | null>(null);
  const [focusPoint, setFocusPoint] = useState<WorkbookPoint | null>(null);
  const [pointerPoint, setPointerPoint] = useState<WorkbookPoint | null>(null);
  const [objectContextMenu, setObjectContextMenu] = useState<{
    objectId: string;
    x: number;
    y: number;
  } | null>(null);
  const [shapeVertexContextMenu, setShapeVertexContextMenu] = useState<{
    objectId: string;
    vertexIndex: number;
    x: number;
    y: number;
    label: string;
  } | null>(null);
  const [lineEndpointContextMenu, setLineEndpointContextMenu] = useState<{
    objectId: string;
    endpoint: "start" | "end";
    x: number;
    y: number;
    label: string;
  } | null>(null);
  const [solid3dVertexContextMenu, setSolid3dVertexContextMenu] = useState<{
    objectId: string;
    vertexIndex: number;
    x: number;
    y: number;
    label: string;
  } | null>(null);
  const [solid3dPointContextMenu, setSolid3dPointContextMenu] = useState<{
    objectId: string;
    sectionId: string;
    pointIndex: number;
    x: number;
    y: number;
    label: string;
  } | null>(null);
  const [solid3dSectionContextMenu, setSolid3dSectionContextMenu] = useState<{
    objectId: string;
    sectionId: string;
    x: number;
    y: number;
  } | null>(null);
  const [pointLabelDraft, setPointLabelDraft] = useState("");
  const [shapeVertexLabelDraft, setShapeVertexLabelDraft] = useState("");
  const [lineEndpointLabelDraft, setLineEndpointLabelDraft] = useState("");
  const [selectedLineStartLabelDraft, setSelectedLineStartLabelDraft] = useState("");
  const [selectedLineEndLabelDraft, setSelectedLineEndLabelDraft] = useState("");
  const [selectedTextDraft, setSelectedTextDraft] = useState("");
  const [selectedTextFontSizeDraft, setSelectedTextFontSizeDraft] = useState(18);
  const [shapeVertexLabelDrafts, setShapeVertexLabelDrafts] = useState<string[]>([]);
  const [shapeAngleNoteDrafts, setShapeAngleNoteDrafts] = useState<string[]>([]);
  const [shapeSegmentNoteDrafts, setShapeSegmentNoteDrafts] = useState<string[]>([]);
  const lineDraftObjectIdRef = useRef<string | null>(null);
  const shapeDraftObjectIdRef = useRef<string | null>(null);
  const dividerDraftObjectIdRef = useRef<string | null>(null);
  const graphDraftObjectIdRef = useRef<string | null>(null);
  const graphCatalogCursorTimeoutRef = useRef<number | null>(null);
  const suppressAutoPanelSelectionRef = useRef<string | null>(null);
  const [latestSeq, setLatestSeq] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [inviteCandidates, setInviteCandidates] = useState<TeacherChatThread[]>([]);
  const [inviteSearch, setInviteSearch] = useState("");
  const [loadingInviteCandidates, setLoadingInviteCandidates] = useState(false);
  const [sendingInviteThreadId, setSendingInviteThreadId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [isStereoDialogOpen, setIsStereoDialogOpen] = useState(false);
  const [isShapesDialogOpen, setIsShapesDialogOpen] = useState(false);
  const [exportingSections, setExportingSections] = useState(false);
  const [docsWindow, setDocsWindow] = useState<DocsWindowState>({
    open: false,
    pinned: false,
    maximized: false,
  });
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pendingClearRequest, setPendingClearRequest] = useState<ClearRequest | null>(
    null
  );
  const [awaitingClearRequest, setAwaitingClearRequest] =
    useState<ClearRequest | null>(null);
  const [confirmedClearRequest, setConfirmedClearRequest] =
    useState<ClearRequest | null>(null);
  const [mediaState, setMediaState] = useState({
    micEnabled: false,
  });
  const [isSessionChatOpen, setIsSessionChatOpen] = useState(false);
  const [isSessionChatMinimized, setIsSessionChatMinimized] = useState(false);
  const [isSessionChatMaximized, setIsSessionChatMaximized] = useState(false);
  const [isSessionChatAtBottom, setIsSessionChatAtBottom] = useState(true);
  const [isWorkbookStreamConnected, setIsWorkbookStreamConnected] = useState(false);
  const [sessionChatDraft, setSessionChatDraft] = useState("");
  const [isSessionChatEmojiOpen, setIsSessionChatEmojiOpen] = useState(false);
  const [sessionChatPosition, setSessionChatPosition] = useState({ x: 24, y: 96 });
  const [sessionChatReadAt, setSessionChatReadAt] = useState<string | null>(null);
  const [areaSelection, setAreaSelection] = useState<{
    objectIds: string[];
    rect: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const [areaSelectionContextMenu, setAreaSelectionContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const areaSelectionClipboardRef = useRef<WorkbookBoardObject[] | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "unsaved" | "saving" | "error">(
    "saved"
  );
  const [saveIndicatorState, setSaveIndicatorState] = useState<
    "saved" | "unsaved" | "saving" | "error"
  >("saved");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [undoDepth, setUndoDepth] = useState(0);
  const [redoDepth, setRedoDepth] = useState(0);
  const sessionRootRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const boardFileInputRef = useRef<HTMLInputElement | null>(null);
  const docsInputRef = useRef<HTMLInputElement | null>(null);
  const focusResetTimerRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const isSavingRef = useRef(false);
  const laserClearInFlightRef = useRef(false);
  const saveIndicatorTimerRef = useRef<number | null>(null);
  const autosaveDebounceRef = useRef<number | null>(null);
  const smartInkDebounceRef = useRef<number | null>(null);
  const smartInkStrokeBufferRef = useRef<WorkbookStroke[]>([]);
  const smartInkProcessedStrokeIdsRef = useRef<Set<string>>(new Set());
  const dirtyRevisionRef = useRef(0);
  const pendingAutosaveAfterSaveRef = useRef(false);
  const persistSnapshotsRef = useRef<
    ((options?: { silent?: boolean; force?: boolean }) => Promise<boolean>) | null
  >(null);
  const undoStackRef = useRef<WorkbookSceneSnapshot[]>([]);
  const redoStackRef = useRef<WorkbookSceneSnapshot[]>([]);
  const latestSeqRef = useRef(0);
  const processedEventIdsRef = useRef<Set<string>>(new Set());
  const localAudioStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteAudioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const sessionChatListRef = useRef<HTMLDivElement | null>(null);
  const sessionChatRef = useRef<HTMLDivElement | null>(null);
  const sessionChatShouldScrollToUnreadRef = useRef(false);
  const sessionChatDragStateRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const makingOfferPeerIdsRef = useRef<Set<string>>(new Set());

  const fallbackBackPath = "/workbook";
  const fromPath = searchParams.get("from") || fallbackBackPath;
  const isEnded = session?.status === "ended";

  const actorParticipant = useMemo(
    () => session?.participants.find((participant) => participant.userId === user?.id) ?? null,
    [session?.participants, user?.id]
  );
  const actorPermissions = actorParticipant?.permissions ?? FALLBACK_PERMISSIONS;
  const canManageSession = Boolean(actorPermissions.canManageSession);
  const canInvite = Boolean(actorPermissions.canInvite);
  const canDraw = Boolean(actorPermissions.canDraw && !isEnded && !awaitingClearRequest);
  const canSelect = Boolean(actorPermissions.canSelect && !isEnded);
  const canInsertImage = Boolean(actorPermissions.canInsertImage && !isEnded);
  const canDelete = Boolean(actorPermissions.canDelete && !isEnded);
  const canUseLaser = Boolean(actorPermissions.canUseLaser && !isEnded);
  const canUseMedia = Boolean(actorPermissions.canUseMedia);
  const canUseSessionChat = Boolean(actorPermissions.canUseChat);
  const canSendSessionChat = canUseSessionChat && !isEnded;
  const isClassSession = session?.kind === "CLASS";
  const showCollaborationPanels = Boolean(isClassSession);
  const participantCards = useMemo(
    () =>
      [...(session?.participants ?? [])].sort((left, right) => {
        if (left.roleInSession !== right.roleInSession) {
          return left.roleInSession === "teacher" ? -1 : 1;
        }
        if (left.isOnline !== right.isOnline) {
          return left.isOnline ? -1 : 1;
        }
        return left.displayName.localeCompare(right.displayName, "ru");
      }),
    [session?.participants]
  );
  const onlineParticipantsCount = useMemo(
    () => participantCards.filter((participant) => participant.isOnline).length,
    [participantCards]
  );
  const connectedStudentIds = useMemo(
    () =>
      new Set(
        session?.participants
          .filter((participant) => participant.roleInSession === "student")
          .map((participant) => participant.userId) ?? []
      ),
    [session?.participants]
  );
  const filteredInviteCandidates = useMemo(() => {
    const normalizedQuery = inviteSearch.trim().toLowerCase();
    if (!normalizedQuery) return inviteCandidates;
    return inviteCandidates.filter((candidate) => {
      const name = candidate.studentName.toLowerCase();
      return name.includes(normalizedQuery);
    });
  }, [inviteCandidates, inviteSearch]);
  const sessionChatReadStorageKey = useMemo(
    () => (sessionId && user?.id ? `workbook:chat-read:${sessionId}:${user.id}` : ""),
    [sessionId, user?.id]
  );
  const unreadSessionChatMessages = useMemo(() => {
    if (!user?.id) return [];
    const readTimestamp = parseChatTimestamp(sessionChatReadAt);
    return chatMessages.filter(
      (message) =>
        message.authorUserId !== user.id &&
        parseChatTimestamp(message.createdAt) > readTimestamp
    );
  }, [chatMessages, sessionChatReadAt, user?.id]);
  const sessionChatUnreadCount = unreadSessionChatMessages.length;
  const firstUnreadSessionChatMessageId = unreadSessionChatMessages[0]?.id ?? null;

  useEffect(() => {
    latestSeqRef.current = latestSeq;
  }, [latestSeq]);

  const persistSessionChatReadAt = useCallback(
    (value: string | null) => {
      if (!sessionChatReadStorageKey || typeof window === "undefined") return;
      if (!value) {
        window.localStorage.removeItem(sessionChatReadStorageKey);
        return;
      }
      window.localStorage.setItem(sessionChatReadStorageKey, value);
    },
    [sessionChatReadStorageKey]
  );

  const markSessionChatReadToLatest = useCallback(() => {
    const latestMessage = chatMessages[chatMessages.length - 1];
    if (!latestMessage) return;
    const latestTimestamp = latestMessage.createdAt;
    setSessionChatReadAt((current) => {
      if (parseChatTimestamp(current) >= parseChatTimestamp(latestTimestamp)) {
        return current;
      }
      persistSessionChatReadAt(latestTimestamp);
      return latestTimestamp;
    });
  }, [chatMessages, persistSessionChatReadAt]);

  const scrollSessionChatToLatest = useCallback((behavior: ScrollBehavior = "auto") => {
    const container = sessionChatListRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    });
    setIsSessionChatAtBottom(true);
  }, []);

  const scrollSessionChatToMessage = useCallback(
    (messageId: string, behavior: ScrollBehavior = "auto") => {
      const container = sessionChatListRef.current;
      if (!container) return false;
      const target = container.querySelector<HTMLElement>(
        `[data-session-chat-message-id="${messageId}"]`
      );
      if (!target) return false;
      target.scrollIntoView({
        block: "start",
        behavior,
      });
      return true;
    },
    []
  );

  const filterUnseenWorkbookEvents = useCallback((events: WorkbookEvent[]) => {
    const unseen: WorkbookEvent[] = [];
    events.forEach((event) => {
      if (!event?.id || processedEventIdsRef.current.has(event.id)) return;
      processedEventIdsRef.current.add(event.id);
      unseen.push(event);
    });
    if (processedEventIdsRef.current.size > 50_000) {
      processedEventIdsRef.current.clear();
      unseen.slice(-2_000).forEach((event) => {
        if (event?.id) {
          processedEventIdsRef.current.add(event.id);
        }
      });
    }
    return unseen;
  }, []);

  const isParticipantBoardToolsEnabled = useCallback(
    (participant: WorkbookSessionParticipant) =>
      Boolean(
        participant.permissions.canDraw &&
          participant.permissions.canAnnotate &&
          participant.permissions.canSelect &&
          participant.permissions.canDelete &&
          participant.permissions.canInsertImage &&
          participant.permissions.canClear &&
          participant.permissions.canExport &&
          participant.permissions.canUseLaser
      ),
    []
  );

  const detachRemoteAudio = useCallback((remoteUserId: string) => {
    const audioElement = remoteAudioElementsRef.current.get(remoteUserId);
    if (audioElement) {
      try {
        audioElement.pause();
      } catch {
        // ignore media pause errors
      }
      audioElement.srcObject = null;
      remoteAudioElementsRef.current.delete(remoteUserId);
    }
  }, []);

  const closePeerConnection = useCallback(
    (remoteUserId: string) => {
      const connection = peerConnectionsRef.current.get(remoteUserId);
      if (connection) {
        try {
          connection.onicecandidate = null;
          connection.ontrack = null;
          connection.onconnectionstatechange = null;
          connection.close();
        } catch {
          // ignore close errors
        }
        peerConnectionsRef.current.delete(remoteUserId);
      }
      pendingIceCandidatesRef.current.delete(remoteUserId);
      makingOfferPeerIdsRef.current.delete(remoteUserId);
      detachRemoteAudio(remoteUserId);
    },
    [detachRemoteAudio]
  );

  const closeAllPeerConnections = useCallback(() => {
    Array.from(peerConnectionsRef.current.keys()).forEach((peerId) => {
      closePeerConnection(peerId);
    });
  }, [closePeerConnection]);

  const ensureLocalAudioStream = useCallback(async () => {
    if (localAudioStreamRef.current) return localAudioStreamRef.current;
    const hasWindow = typeof window !== "undefined";
    const isLocalhost =
      hasWindow &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1" ||
        window.location.hostname === "::1");
    if (hasWindow && !window.isSecureContext && !isLocalhost) {
      setError(
        "Микрофон доступен только в защищённом режиме: откройте сайт по HTTPS (или localhost)."
      );
      return null;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("В текущем браузере недоступен API микрофона (getUserMedia).");
      return null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      stream.getAudioTracks().forEach((track) => {
        track.enabled = mediaState.micEnabled;
      });
      localAudioStreamRef.current = stream;
      setError((current) => {
        if (!current) return current;
        return current.includes("микрофон") || current.includes("Микрофон") ? null : current;
      });
      return stream;
    } catch (reason) {
      if (reason instanceof DOMException) {
        if (reason.name === "NotAllowedError") {
          setError("Доступ к микрофону запрещён. Разрешите его в настройках браузера.");
          return null;
        }
        if (reason.name === "NotFoundError") {
          setError("Не найдено доступное устройство микрофона.");
          return null;
        }
        if (reason.name === "NotReadableError") {
          setError("Микрофон занят другим приложением. Освободите устройство и повторите.");
          return null;
        }
        if (reason.name === "SecurityError") {
          setError("Браузер заблокировал микрофон: откройте страницу по HTTPS.");
          return null;
        }
      }
      setError("Не удалось подключить микрофон.");
      return null;
    }
  }, [mediaState.micEnabled]);

  const queuePendingIceCandidate = useCallback(
    (remoteUserId: string, candidate: RTCIceCandidateInit) => {
      const pending = pendingIceCandidatesRef.current.get(remoteUserId) ?? [];
      pending.push(candidate);
      pendingIceCandidatesRef.current.set(remoteUserId, pending);
    },
    []
  );

  const flushPendingIceCandidates = useCallback(
    async (remoteUserId: string, connection: RTCPeerConnection) => {
      const pending = pendingIceCandidatesRef.current.get(remoteUserId);
      if (!pending?.length) return;
      for (const candidate of pending) {
        await connection.addIceCandidate(candidate).catch(() => undefined);
      }
      pendingIceCandidatesRef.current.delete(remoteUserId);
    },
    []
  );

  const sendMediaSignal = useCallback(
    async (toUserId: string, signal: MediaSignalPayload) => {
      if (!sessionId) return;
      try {
        const response = await appendWorkbookEvents({
          sessionId,
          events: [
            {
              type: "media.signal",
              payload: { toUserId, signal },
            },
          ],
        });
        setLatestSeq((current) => Math.max(current, response.latestSeq));
      } catch {
        // transient media signaling errors are tolerated
      }
    },
    [sessionId]
  );

  const ensurePeerConnection = useCallback(
    async (remoteUserId: string) => {
      const existing = peerConnectionsRef.current.get(remoteUserId);
      if (existing) return existing;
      const connection = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      peerConnectionsRef.current.set(remoteUserId, connection);
      connection.onicecandidate = (event) => {
        if (!event.candidate) return;
        void sendMediaSignal(remoteUserId, {
          kind: "ice",
          candidate: event.candidate.toJSON(),
        });
      };
      connection.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (!remoteStream) return;
        let audioElement = remoteAudioElementsRef.current.get(remoteUserId);
        if (!audioElement) {
          audioElement = new Audio();
          audioElement.autoplay = true;
          audioElement.muted = false;
          remoteAudioElementsRef.current.set(remoteUserId, audioElement);
        }
        if (audioElement.srcObject !== remoteStream) {
          audioElement.srcObject = remoteStream;
        }
        void audioElement.play().catch(() => undefined);
      };
      connection.onconnectionstatechange = () => {
        if (connection.connectionState === "failed" || connection.connectionState === "closed") {
          closePeerConnection(remoteUserId);
        }
      };
      const localStream =
        localAudioStreamRef.current ??
        (mediaState.micEnabled ? await ensureLocalAudioStream() : null);
      if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0] ?? null;
        if (audioTrack) {
          const alreadyAdded = connection
            .getSenders()
            .some((sender) => sender.track && sender.track.id === audioTrack.id);
          if (!alreadyAdded) {
            connection.addTrack(audioTrack, localStream);
          }
        } else if (connection.getTransceivers().length === 0) {
          connection.addTransceiver("audio", { direction: "recvonly" });
        }
      } else if (connection.getTransceivers().length === 0) {
        connection.addTransceiver("audio", { direction: "recvonly" });
      }
      return connection;
    },
    [closePeerConnection, ensureLocalAudioStream, mediaState.micEnabled, sendMediaSignal]
  );

  const syncLocalAudioTrackToConnection = useCallback(
    async (connection: RTCPeerConnection) => {
      const localStream = localAudioStreamRef.current;
      if (!localStream) return false;
      const localTrack = localStream.getAudioTracks()[0] ?? null;
      if (!localTrack) return false;
      const audioTransceiver =
        connection
          .getTransceivers()
          .find((transceiver) => transceiver.receiver.track?.kind === "audio") ?? null;
      if (audioTransceiver) {
        const senderTrackId = audioTransceiver.sender.track?.id;
        if (senderTrackId === localTrack.id) return false;
        await audioTransceiver.sender.replaceTrack(localTrack).catch(() => undefined);
        if (audioTransceiver.direction === "recvonly") {
          try {
            audioTransceiver.direction = "sendrecv";
          } catch {
            // ignore direction update issues
          }
        }
        return true;
      }
      connection.addTrack(localTrack, localStream);
      return true;
    },
    []
  );

  const createAndSendOffer = useCallback(
    async (remoteUserId: string, connection?: RTCPeerConnection) => {
      if (makingOfferPeerIdsRef.current.has(remoteUserId)) return;
      makingOfferPeerIdsRef.current.add(remoteUserId);
      try {
        const targetConnection = connection ?? (await ensurePeerConnection(remoteUserId));
        if (targetConnection.signalingState !== "stable") return;
        const offer = await targetConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false,
        });
        await targetConnection.setLocalDescription(offer);
        if (!targetConnection.localDescription) return;
        await sendMediaSignal(remoteUserId, {
          kind: "offer",
          sdp: targetConnection.localDescription.toJSON() as RTCSessionDescriptionInit,
        });
      } catch {
        // ignore transient offer errors; next polling cycle will retry
      } finally {
        makingOfferPeerIdsRef.current.delete(remoteUserId);
      }
    },
    [ensurePeerConnection, sendMediaSignal]
  );

  const handleIncomingMediaSignal = useCallback(
    async (event: WorkbookEvent) => {
      const payload =
        event.payload && typeof event.payload === "object"
          ? (event.payload as { toUserId?: unknown; signal?: unknown })
          : null;
      if (!payload || payload.toUserId !== user?.id) return;
      const signal =
        payload.signal && typeof payload.signal === "object"
          ? (payload.signal as Partial<MediaSignalPayload>)
          : null;
      if (!signal || typeof signal.kind !== "string") return;
      const remoteUserId = event.authorUserId;
      try {
        const connection = await ensurePeerConnection(remoteUserId);
        if (signal.kind === "offer" && signal.sdp) {
          if (connection.signalingState !== "stable") {
            await connection.setLocalDescription({ type: "rollback" }).catch(() => undefined);
          }
          await connection.setRemoteDescription(signal.sdp);
          await flushPendingIceCandidates(remoteUserId, connection);
          if (mediaState.micEnabled && !localAudioStreamRef.current) {
            await ensureLocalAudioStream();
          }
          await syncLocalAudioTrackToConnection(connection);
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          if (connection.localDescription) {
            await sendMediaSignal(remoteUserId, {
              kind: "answer",
              sdp: connection.localDescription.toJSON() as RTCSessionDescriptionInit,
            });
          }
          return;
        }
        if (signal.kind === "answer" && signal.sdp) {
          await connection.setRemoteDescription(signal.sdp);
          await flushPendingIceCandidates(remoteUserId, connection);
          return;
        }
        if (signal.kind === "ice" && signal.candidate) {
          const candidate = signal.candidate;
          if (connection.remoteDescription || connection.pendingRemoteDescription) {
            await connection.addIceCandidate(candidate).catch(() => {
              queuePendingIceCandidate(remoteUserId, candidate);
            });
          } else {
            queuePendingIceCandidate(remoteUserId, candidate);
          }
        }
      } catch {
        // signaling or SDP errors can happen during reconnect; ignore and wait for next offer
      }
    },
    [
      ensureLocalAudioStream,
      ensurePeerConnection,
      flushPendingIceCandidates,
      mediaState.micEnabled,
      queuePendingIceCandidate,
      sendMediaSignal,
      syncLocalAudioTrackToConnection,
      user?.id,
    ]
  );
  const boardLocked = Boolean(awaitingClearRequest);
  const canEdit = !isEnded && (canDraw || canSelect);
  const isTeacherActor = Boolean(
    actorParticipant?.roleInSession === "teacher" || actorPermissions.canManageSession
  );
  const canUseUndo = Boolean(
    !isEnded &&
      session &&
      (session.kind === "PERSONAL" ||
        session.settings.undoPolicy === "everyone" ||
        (session.settings.undoPolicy === "teacher_only" && isTeacherActor) ||
        (session.settings.undoPolicy === "own_only" && isTeacherActor))
  );
  const normalizedSceneLayers = useMemo(
    () =>
      normalizeSceneLayersForBoard(
        boardSettings.sceneLayers,
        boardSettings.activeSceneLayerId
      ),
    [boardSettings.activeSceneLayerId, boardSettings.sceneLayers]
  );
  const activeSceneLayerId = normalizedSceneLayers.activeSceneLayerId;

  const getObjectSceneLayerId = useCallback((object: WorkbookBoardObject) => {
    const layerId =
      object.meta && typeof object.meta === "object" && typeof object.meta.sceneLayerId === "string"
        ? object.meta.sceneLayerId
        : "";
    return layerId.trim() || MAIN_SCENE_LAYER_ID;
  }, []);

  const compositionLayers = useMemo(
    () =>
      normalizedSceneLayers.sceneLayers.filter(
        (layerItem) =>
          layerItem.id !== MAIN_SCENE_LAYER_ID &&
          boardObjects.some((object) => getObjectSceneLayerId(object) === layerItem.id)
      ),
    [boardObjects, getObjectSceneLayerId, normalizedSceneLayers.sceneLayers]
  );
  const compositionObjectsByLayer = useMemo(() => {
    const grouped = new Map<string, WorkbookBoardObject[]>();
    boardObjects.forEach((object) => {
      const layerId = getObjectSceneLayerId(object);
      if (layerId === MAIN_SCENE_LAYER_ID) return;
      const existing = grouped.get(layerId);
      if (existing) {
        existing.push(object);
      } else {
        grouped.set(layerId, [object]);
      }
    });
    return grouped;
  }, [boardObjects, getObjectSceneLayerId]);

  const captureSceneSnapshot = useCallback((): WorkbookSceneSnapshot => {
    const clone = <T,>(value: T): T => structuredClone(value);
    return {
      boardStrokes: clone(boardStrokes),
      boardObjects: clone(boardObjects),
      constraints: clone(constraints),
      annotationStrokes: clone(annotationStrokes),
      chatMessages: clone(chatMessages),
      comments: clone(comments),
      timerState: timerState ? clone(timerState) : null,
      boardSettings: clone(boardSettings),
      libraryState: clone(libraryState),
      documentState: clone(documentState),
    };
  }, [
    annotationStrokes,
    boardObjects,
    boardSettings,
    boardStrokes,
    comments,
    constraints,
    chatMessages,
    documentState,
    libraryState,
    timerState,
  ]);

  const restoreSceneSnapshot = useCallback((snapshot: WorkbookSceneSnapshot) => {
    setBoardStrokes(snapshot.boardStrokes);
    setBoardObjects(snapshot.boardObjects);
    setConstraints(snapshot.constraints);
    setAnnotationStrokes(snapshot.annotationStrokes);
    setChatMessages(snapshot.chatMessages);
    setComments(snapshot.comments);
    setTimerState(snapshot.timerState);
    setBoardSettings((current) => {
      const next = normalizeSceneLayersForBoard(
        snapshot.boardSettings.sceneLayers,
        snapshot.boardSettings.activeSceneLayerId
      );
      return {
        ...current,
        ...snapshot.boardSettings,
        sceneLayers: next.sceneLayers,
        activeSceneLayerId: next.activeSceneLayerId,
      };
    });
    setLibraryState(snapshot.libraryState);
    setDocumentState(snapshot.documentState);
  }, []);

  const toScenePayload = useCallback(
    (snapshot: WorkbookSceneSnapshot) =>
      encodeScenePayload({
        strokes: [...snapshot.boardStrokes, ...snapshot.annotationStrokes],
        objects: snapshot.boardObjects,
        constraints: snapshot.constraints,
        chat: snapshot.chatMessages,
        comments: snapshot.comments,
        timer: snapshot.timerState,
        boardSettings: snapshot.boardSettings,
        library: snapshot.libraryState,
        document: snapshot.documentState,
      }),
    []
  );

  const scheduleAutosave = useCallback((delayMs = 1100) => {
    if (autosaveDebounceRef.current !== null) {
      window.clearTimeout(autosaveDebounceRef.current);
      autosaveDebounceRef.current = null;
    }
    autosaveDebounceRef.current = window.setTimeout(() => {
      autosaveDebounceRef.current = null;
      void persistSnapshotsRef.current?.({ force: true });
    }, Math.max(200, delayMs));
  }, []);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    dirtyRevisionRef.current += 1;
    pendingAutosaveAfterSaveRef.current = true;
    setSaveState("saving");
    scheduleAutosave();
  }, [scheduleAutosave]);

  const pushHistorySnapshot = useCallback(() => {
    const snapshot = captureSceneSnapshot();
    const nextUndo = [...undoStackRef.current, snapshot];
    undoStackRef.current = nextUndo.slice(-80);
    redoStackRef.current = [];
    setUndoDepth(undoStackRef.current.length);
    setRedoDepth(0);
  }, [captureSceneSnapshot]);

  const rollbackHistorySnapshot = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    setUndoDepth(undoStackRef.current.length);
  }, []);

  const applyIncomingEvents = useCallback(
    (events: WorkbookEvent[]) => {
      if (events.length === 0) return;
      events.forEach((event) => {
        try {
        if (event.type === "board.undo" || event.type === "board.redo") {
          const payload = event.payload as { scene?: unknown };
          if (!payload.scene || typeof payload.scene !== "object") return;
          const normalized = normalizeScenePayload(payload.scene);
          restoreSceneSnapshot({
            boardStrokes: normalized.strokes.filter((stroke) => stroke.layer === "board"),
            boardObjects: normalized.objects,
            constraints: normalized.constraints,
            annotationStrokes: normalized.strokes.filter(
              (stroke) => stroke.layer === "annotations"
            ),
            chatMessages: normalized.chat,
            comments: normalized.comments,
            timerState: normalized.timer,
            boardSettings: normalized.boardSettings,
            libraryState: normalized.library,
            documentState: normalized.document,
          });
          return;
        }
        if (event.type === "board.stroke") {
          const stroke = normalizeStrokePayload((event.payload as { stroke?: unknown })?.stroke);
          if (!stroke || stroke.layer !== "board") return;
          setBoardStrokes((current) =>
            current.some((item) => item.id === stroke.id) ? current : [...current, stroke]
          );
          return;
        }
        if (event.type === "board.stroke.delete") {
          const strokeId = (event.payload as { strokeId?: unknown })?.strokeId;
          if (typeof strokeId !== "string") return;
          setBoardStrokes((current) => current.filter((item) => item.id !== strokeId));
          return;
        }
        if (event.type === "annotations.stroke") {
          const stroke = normalizeStrokePayload((event.payload as { stroke?: unknown })?.stroke);
          if (!stroke || stroke.layer !== "annotations") return;
          setAnnotationStrokes((current) =>
            current.some((item) => item.id === stroke.id) ? current : [...current, stroke]
          );
          return;
        }
        if (event.type === "annotations.stroke.delete") {
          const strokeId = (event.payload as { strokeId?: unknown })?.strokeId;
          if (typeof strokeId !== "string") return;
          setAnnotationStrokes((current) => current.filter((item) => item.id !== strokeId));
          return;
        }
        if (event.type === "board.object.create") {
          const object = normalizeObjectPayload((event.payload as { object?: unknown })?.object);
          if (!object) return;
          setBoardObjects((current) =>
            current.some((item) => item.id === object.id) ? current : [...current, object]
          );
          return;
        }
        if (event.type === "board.object.update") {
          const payload = event.payload as {
            objectId?: unknown;
            patch?: unknown;
          };
          const objectId = typeof payload.objectId === "string" ? payload.objectId : "";
          const patch =
            payload.patch && typeof payload.patch === "object"
              ? (payload.patch as Partial<WorkbookBoardObject>)
              : null;
          if (!objectId || !patch) return;
          setBoardObjects((current) => {
            let found = false;
            const next = current.map((item) => {
              if (item.id !== objectId) return item;
              found = true;
              return mergeBoardObjectWithPatch(item, patch);
            });
            return found ? next : current;
          });
          return;
        }
        if (event.type === "board.object.delete") {
          const objectId = (event.payload as { objectId?: unknown })?.objectId;
          if (typeof objectId !== "string") return;
          setBoardObjects((current) => current.filter((item) => item.id !== objectId));
          setConstraints((current) =>
            current.filter(
              (constraint) =>
                constraint.sourceObjectId !== objectId &&
                constraint.targetObjectId !== objectId
            )
          );
          if (selectedObjectId === objectId) {
            setSelectedObjectId(null);
          }
          return;
        }
        if (event.type === "board.object.pin") {
          const payload = event.payload as {
            objectId?: unknown;
            pinned?: unknown;
          };
          const objectId = typeof payload.objectId === "string" ? payload.objectId : "";
          if (!objectId) return;
          setBoardObjects((current) =>
            current.map((item) =>
              item.id === objectId ? { ...item, pinned: Boolean(payload.pinned) } : item
            )
          );
          return;
        }
        if (event.type === "board.clear") {
          setBoardStrokes([]);
          setBoardObjects([]);
          setConstraints([]);
          setSelectedObjectId(null);
          setSelectedConstraintId(null);
          setPendingClearRequest(null);
          setAwaitingClearRequest(null);
          return;
        }
        if (event.type === "annotations.clear") {
          setAnnotationStrokes([]);
          return;
        }
        if (event.type === "board.clear.request") {
          const payload = event.payload as {
            requestId?: unknown;
            targetLayer?: unknown;
          };
          const requestId =
            typeof payload.requestId === "string" ? payload.requestId : generateId();
          const targetLayer =
            payload.targetLayer === "annotations" ? "annotations" : "board";
          const request: ClearRequest = {
            requestId,
            targetLayer,
            authorUserId: event.authorUserId,
          };
          setPendingClearRequest(request);
          if (event.authorUserId === user?.id) {
            setAwaitingClearRequest(request);
          }
          return;
        }
        if (event.type === "board.clear.confirm") {
          const requestId = (event.payload as { requestId?: unknown })?.requestId;
          if (typeof requestId !== "string") return;
          if (awaitingClearRequest && awaitingClearRequest.requestId === requestId) {
            setConfirmedClearRequest(awaitingClearRequest);
          }
          setPendingClearRequest((current) => {
            if (!current || current.requestId !== requestId) return current;
            return null;
          });
          setAwaitingClearRequest((current) => {
            if (!current || current.requestId !== requestId) return current;
            return null;
          });
          return;
        }
        if (event.type === "focus.point") {
          const payload = event.payload as {
            target?: unknown;
            point?: unknown;
            mode?: unknown;
          };
          if (payload.target !== "board") return;
          const mode =
            payload.mode === "pin" || payload.mode === "move" || payload.mode === "clear"
              ? payload.mode
              : "flash";
          if (mode === "clear") {
            setPointerPoint(null);
            return;
          }
          const point = payload.point as Partial<WorkbookPoint> | undefined;
          if (!point || typeof point.x !== "number" || typeof point.y !== "number") return;
          if (mode === "pin" || mode === "move") {
            setPointerPoint({ x: point.x, y: point.y });
          }
          setFocusPoint({ x: point.x, y: point.y });
          if (focusResetTimerRef.current !== null) {
            window.clearTimeout(focusResetTimerRef.current);
          }
          focusResetTimerRef.current = window.setTimeout(() => {
            setFocusPoint(null);
            focusResetTimerRef.current = null;
          }, 800);
          return;
        }
        if (event.type === "media.signal") {
          void handleIncomingMediaSignal(event);
          return;
        }
        if (event.type === "document.asset.add") {
          const asset = normalizeDocumentAssetPayload(
            (event.payload as { asset?: unknown })?.asset
          );
          if (!asset) return;
          setDocumentState((current) => ({
            ...current,
            assets: current.assets.some((item) => item.id === asset.id)
              ? current.assets
              : [...current.assets, asset],
            activeAssetId: current.activeAssetId ?? asset.id,
          }));
          return;
        }
        if (event.type === "document.state.update") {
          const payload = event.payload as {
            activeAssetId?: unknown;
            page?: unknown;
            zoom?: unknown;
          };
          setDocumentState((current) => ({
            ...current,
            activeAssetId:
              typeof payload.activeAssetId === "string"
                ? payload.activeAssetId
                : current.activeAssetId,
            page:
              typeof payload.page === "number" && Number.isFinite(payload.page)
                ? Math.max(1, Math.floor(payload.page))
                : current.page,
            zoom:
              typeof payload.zoom === "number" && Number.isFinite(payload.zoom)
                ? Math.max(0.2, Math.min(4, payload.zoom))
                : current.zoom,
          }));
          return;
        }
        if (event.type === "document.annotation.add") {
          const annotation = normalizeDocumentAnnotationPayload(
            (event.payload as { annotation?: unknown })?.annotation
          );
          if (!annotation) return;
          setDocumentState((current) => ({
            ...current,
            annotations: [...current.annotations, annotation],
          }));
          return;
        }
        if (event.type === "document.annotation.clear") {
          setDocumentState((current) => ({
            ...current,
            annotations: [],
          }));
          return;
        }
        if (event.type === "geometry.constraint.add") {
          const payload = event.payload as { constraint?: unknown };
          if (!payload.constraint || typeof payload.constraint !== "object") return;
          const typed = payload.constraint as WorkbookConstraint;
          if (!typed.id || !typed.type || !typed.sourceObjectId || !typed.targetObjectId) {
            return;
          }
          setConstraints((current) => {
            const exists = current.some((item) => item.id === typed.id);
            if (!exists) return [...current, typed];
            return current.map((item) => (item.id === typed.id ? { ...item, ...typed } : item));
          });
          return;
        }
        if (event.type === "geometry.constraint.remove") {
          const constraintId = (event.payload as { constraintId?: unknown })?.constraintId;
          if (typeof constraintId !== "string") return;
          setConstraints((current) => current.filter((item) => item.id !== constraintId));
          setSelectedConstraintId((current) =>
            current === constraintId ? null : current
          );
          return;
        }
        if (event.type === "board.settings.update") {
          const payload = event.payload as { boardSettings?: unknown };
          if (!payload.boardSettings || typeof payload.boardSettings !== "object") return;
          setBoardSettings((current) => {
            const merged = {
              ...current,
              ...(payload.boardSettings as Partial<WorkbookBoardSettings>),
            };
            const normalizedLayers = normalizeSceneLayersForBoard(
              merged.sceneLayers,
              merged.activeSceneLayerId
            );
            return {
              ...merged,
              sceneLayers: normalizedLayers.sceneLayers,
              activeSceneLayerId: normalizedLayers.activeSceneLayerId,
            };
          });
          return;
        }
        if (event.type === "library.folder.upsert") {
          const payload = event.payload as { folder?: unknown };
          if (!payload.folder || typeof payload.folder !== "object") return;
          const folder = payload.folder as WorkbookLibraryState["folders"][number];
          if (!folder.id) return;
          setLibraryState((current) => {
            const exists = current.folders.some((item) => item.id === folder.id);
            return {
              ...current,
              folders: exists
                ? current.folders.map((item) =>
                    item.id === folder.id ? { ...item, ...folder } : item
                  )
                : [...current.folders, folder],
            };
          });
          return;
        }
        if (event.type === "library.folder.remove") {
          const payload = event.payload as { folderId?: unknown };
          if (typeof payload.folderId !== "string") return;
          setLibraryState((current) => ({
            ...current,
            folders: current.folders.filter((item) => item.id !== payload.folderId),
            items: current.items.map((item) =>
              item.folderId === payload.folderId ? { ...item, folderId: null } : item
            ),
          }));
          return;
        }
        if (event.type === "library.item.upsert") {
          const payload = event.payload as { item?: unknown };
          if (!payload.item || typeof payload.item !== "object") return;
          const item = payload.item as WorkbookLibraryState["items"][number];
          if (!item.id) return;
          setLibraryState((current) => {
            const exists = current.items.some((entry) => entry.id === item.id);
            return {
              ...current,
              items: exists
                ? current.items.map((entry) =>
                    entry.id === item.id ? { ...entry, ...item } : entry
                  )
                : [...current.items, item],
            };
          });
          return;
        }
        if (event.type === "library.item.remove") {
          const payload = event.payload as { itemId?: unknown };
          if (typeof payload.itemId !== "string") return;
          setLibraryState((current) => ({
            ...current,
            items: current.items.filter((item) => item.id !== payload.itemId),
          }));
          return;
        }
        if (event.type === "library.template.upsert") {
          const payload = event.payload as { template?: unknown };
          if (!payload.template || typeof payload.template !== "object") return;
          const template = payload.template as WorkbookLibraryState["templates"][number];
          if (!template.id) return;
          setLibraryState((current) => {
            const exists = current.templates.some((entry) => entry.id === template.id);
            return {
              ...current,
              templates: exists
                ? current.templates.map((entry) =>
                    entry.id === template.id ? { ...entry, ...template } : entry
                  )
                : [...current.templates, template],
            };
          });
          return;
        }
        if (event.type === "library.template.remove") {
          const payload = event.payload as { templateId?: unknown };
          if (typeof payload.templateId !== "string") return;
          setLibraryState((current) => ({
            ...current,
            templates: current.templates.filter(
              (template) => template.id !== payload.templateId
            ),
          }));
          return;
        }
        if (event.type === "comments.upsert") {
          const payload = event.payload as { comment?: unknown };
          if (!payload.comment || typeof payload.comment !== "object") return;
          const comment = payload.comment as WorkbookComment;
          if (!comment.id) return;
          setComments((current) => {
            const exists = current.some((item) => item.id === comment.id);
            return exists
              ? current.map((item) =>
                  item.id === comment.id ? { ...item, ...comment } : item
                )
              : [...current, comment];
          });
          return;
        }
        if (event.type === "comments.remove") {
          const payload = event.payload as { commentId?: unknown };
          if (typeof payload.commentId !== "string") return;
          setComments((current) =>
            current.filter((comment) => comment.id !== payload.commentId)
          );
          return;
        }
        if (event.type === "timer.update") {
          const payload = event.payload as { timer?: unknown };
          if (payload.timer === null) {
            setTimerState(null);
            return;
          }
          if (!payload.timer || typeof payload.timer !== "object") return;
          const timer = payload.timer as WorkbookTimerState;
          if (!timer.id) return;
          setTimerState(timer);
          return;
        }
        if (event.type === "settings.update") {
          const payload = event.payload as {
            settings?: Partial<WorkbookSessionSettings>;
          };
          const incomingSettings = payload.settings;
          if (!incomingSettings) return;
          setSession((current) =>
            current
              ? {
                  ...current,
                  settings: {
                    ...current.settings,
                    ...incomingSettings,
                    studentControls: {
                      ...current.settings.studentControls,
                      ...incomingSettings.studentControls,
                    },
                    smartInk: normalizeSmartInkOptions(incomingSettings.smartInk),
                  },
                }
              : current
          );
          if (incomingSettings.smartInk) {
            setSmartInkOptions(normalizeSmartInkOptions(incomingSettings.smartInk));
          }
          return;
        }
        if (event.type === "permissions.update") {
          const payload = event.payload as {
            userId?: unknown;
            permissions?: unknown;
          };
          const targetUserId =
            typeof payload.userId === "string" ? payload.userId : "";
          const patch =
            payload.permissions && typeof payload.permissions === "object"
              ? (payload.permissions as Partial<WorkbookSessionParticipant["permissions"]>)
              : null;
          if (!targetUserId || !patch) return;
          setSession((current) => {
            if (!current) return current;
            return {
              ...current,
              participants: current.participants.map((participant) =>
                participant.userId === targetUserId
                  ? {
                      ...participant,
                      permissions: {
                        ...participant.permissions,
                        ...patch,
                      },
                    }
                  : participant
              ),
            };
          });
          return;
        }
        if (event.type === "chat.message") {
          const message = normalizeChatMessagePayload(
            (event.payload as { message?: unknown })?.message
          );
          if (!message) return;
          setChatMessages((current) =>
            current.some((item) => item.id === message.id) ? current : [...current, message]
          );
        }
        } catch (error) {
          console.warn("Workbook event apply failed", event.type, error);
        }
      });
    },
    [awaitingClearRequest, handleIncomingMediaSignal, restoreSceneSnapshot, selectedObjectId, user?.id]
  );

  const loadSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      setLoading(true);
      setError(null);
      const [sessionData, boardSnapshot, annotationSnapshot] = await Promise.all([
        getWorkbookSession(sessionId),
        getWorkbookSnapshot(sessionId, "board"),
        getWorkbookSnapshot(sessionId, "annotations"),
      ]);
      setSession(sessionData);

      const normalizedBoard = normalizeScenePayload(boardSnapshot?.payload ?? createEmptyScene());
      const normalizedAnnotations = normalizeScenePayload(
        annotationSnapshot?.payload ?? createEmptyScene()
      );
      const restoredSmartInk = normalizeSmartInkOptions(
        normalizedBoard.boardSettings.smartInk ?? sessionData.settings?.smartInk
      );
      setSmartInkOptions(restoredSmartInk);

      setBoardStrokes(normalizedBoard.strokes.filter((stroke) => stroke.layer === "board"));
      setBoardObjects(normalizedBoard.objects.filter((item) => item.layer === "board"));
      setConstraints(normalizedBoard.constraints);
      setChatMessages(normalizedBoard.chat);
      setComments(normalizedBoard.comments);
      setTimerState(normalizedBoard.timer);
      setBoardSettings(() => {
        const normalizedLayers = normalizeSceneLayersForBoard(
          normalizedBoard.boardSettings.sceneLayers,
          normalizedBoard.boardSettings.activeSceneLayerId
        );
        return {
          ...DEFAULT_BOARD_SETTINGS,
          ...normalizedBoard.boardSettings,
          ...normalizedLayers,
          smartInk: restoredSmartInk,
          title:
            normalizedBoard.boardSettings.title ||
            sessionData.title ||
            DEFAULT_BOARD_SETTINGS.title,
        };
      });
      setLibraryState({
        ...DEFAULT_LIBRARY,
        ...normalizedBoard.library,
      });
      setDocumentState(normalizedBoard.document);
      setAnnotationStrokes(
        normalizedAnnotations.strokes.filter((stroke) => stroke.layer === "annotations")
      );
      const loadedLatestSeq = Math.max(boardSnapshot?.version ?? 0, annotationSnapshot?.version ?? 0);
      setLatestSeq(loadedLatestSeq);
      latestSeqRef.current = loadedLatestSeq;
      processedEventIdsRef.current.clear();
      smartInkStrokeBufferRef.current = [];
      smartInkProcessedStrokeIdsRef.current = new Set();
      dirtyRef.current = false;
      undoStackRef.current = [];
      redoStackRef.current = [];
      setUndoDepth(0);
      setRedoDepth(0);
      setSaveState("saved");
      setLastSavedAt(new Date().toISOString());
      await openWorkbookSession(sessionId);
    } catch {
      setError("Не удалось открыть сессию рабочей тетради.");
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (!sessionId || !session || isWorkbookStreamConnected) return;
    let active = true;
    const poll = async () => {
      try {
        const response = await getWorkbookEvents(sessionId, latestSeqRef.current);
        if (!active) return;
        const unseenEvents = filterUnseenWorkbookEvents(response.events);
        if (unseenEvents.length > 0) {
          applyIncomingEvents(unseenEvents);
        }
        const nextLatest = Math.max(
          latestSeqRef.current,
          response.latestSeq,
          ...unseenEvents.map((event) => event.seq)
        );
        if (nextLatest > latestSeqRef.current) {
          latestSeqRef.current = nextLatest;
          setLatestSeq(nextLatest);
        }
      } catch {
        // ignore transient polling errors
      }
    };
    void poll();
    const intervalId = window.setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [
    applyIncomingEvents,
    filterUnseenWorkbookEvents,
    isWorkbookStreamConnected,
    session,
    sessionId,
  ]);

  useEffect(() => {
    if (!sessionId || !session) return;
    const unsubscribe = subscribeWorkbookEventsStream({
      sessionId,
      onEvents: (payload) => {
        if (payload.sessionId !== sessionId) return;
        const unseenEvents = filterUnseenWorkbookEvents(payload.events);
        if (unseenEvents.length > 0) {
          applyIncomingEvents(unseenEvents);
        }
        const nextLatest = Math.max(
          latestSeqRef.current,
          payload.latestSeq,
          ...unseenEvents.map((event) => event.seq)
        );
        if (nextLatest > latestSeqRef.current) {
          latestSeqRef.current = nextLatest;
          setLatestSeq(nextLatest);
        }
      },
      onConnectionChange: setIsWorkbookStreamConnected,
    });
    return () => {
      setIsWorkbookStreamConnected(false);
      unsubscribe();
    };
  }, [applyIncomingEvents, filterUnseenWorkbookEvents, session, sessionId]);

  useEffect(() => {
    const normalized = normalizeSmartInkOptions(smartInkOptions);
    setBoardSettings((current) => ({
      ...current,
      smartInk: normalized,
    }));
  }, [smartInkOptions]);

  useEffect(() => {
    if (!sessionId || !session) return;
    let active = true;
    const heartbeat = async () => {
      try {
        const response = await heartbeatWorkbookPresence(sessionId);
        if (!active) return;
        setSession((current) =>
          current ? { ...current, participants: response.participants } : current
        );
      } catch {
        // ignore transient presence errors
      }
    };
    void heartbeat();
    const intervalId = window.setInterval(() => {
      void heartbeat();
    }, PRESENCE_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [session, sessionId]);

  useEffect(() => {
    let cancelled = false;
    const syncMicState = async () => {
      if (!session || session.kind !== "CLASS" || !canUseMedia || isEnded) return;
      if (!mediaState.micEnabled) {
        const stream = localAudioStreamRef.current;
        if (!stream) return;
        stream.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
        return;
      }
      const stream = localAudioStreamRef.current ?? (await ensureLocalAudioStream());
      if (cancelled || !stream) return;
      stream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
      const connections = Array.from(peerConnectionsRef.current.entries());
      for (const [remoteUserId, connection] of connections) {
        const updated = await syncLocalAudioTrackToConnection(connection);
        if (updated) {
          await createAndSendOffer(remoteUserId, connection);
        }
      }
    };
    void syncMicState();
    return () => {
      cancelled = true;
    };
  }, [
    canUseMedia,
    createAndSendOffer,
    ensureLocalAudioStream,
    isEnded,
    mediaState.micEnabled,
    session,
    syncLocalAudioTrackToConnection,
  ]);

  useEffect(() => {
    if (canUseMedia || !mediaState.micEnabled) return;
    setMediaState((current) => ({ ...current, micEnabled: false }));
  }, [canUseMedia, mediaState.micEnabled]);

  useEffect(() => {
    if (!sessionChatReadStorageKey) {
      setSessionChatReadAt(null);
      return;
    }
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(sessionChatReadStorageKey);
    setSessionChatReadAt(stored && stored.trim().length > 0 ? stored : null);
  }, [sessionChatReadStorageKey]);

  useEffect(() => {
    if (!canUseSessionChat && isSessionChatOpen) {
      setIsSessionChatOpen(false);
      setIsSessionChatEmojiOpen(false);
      setSessionChatDraft("");
    }
  }, [canUseSessionChat, isSessionChatOpen]);

  useEffect(() => {
    if (!isSessionChatOpen || isSessionChatMinimized) return;
    const hasUnread = Boolean(firstUnreadSessionChatMessageId);
    if (sessionChatShouldScrollToUnreadRef.current) {
      sessionChatShouldScrollToUnreadRef.current = false;
      if (hasUnread && firstUnreadSessionChatMessageId) {
        const scrolled = scrollSessionChatToMessage(firstUnreadSessionChatMessageId);
        if (!scrolled) {
          window.requestAnimationFrame(() => {
            void scrollSessionChatToMessage(firstUnreadSessionChatMessageId);
          });
        }
        return;
      }
      scrollSessionChatToLatest();
      return;
    }
    if (isSessionChatAtBottom) {
      scrollSessionChatToLatest();
      if (sessionChatUnreadCount > 0) {
        markSessionChatReadToLatest();
      }
    }
  }, [
    chatMessages,
    firstUnreadSessionChatMessageId,
    isSessionChatAtBottom,
    isSessionChatMinimized,
    isSessionChatOpen,
    markSessionChatReadToLatest,
    scrollSessionChatToLatest,
    scrollSessionChatToMessage,
    sessionChatUnreadCount,
  ]);

  useEffect(() => {
    if (!isSessionChatOpen || isSessionChatMinimized) return;
    const container = sessionChatListRef.current;
    if (!container) return;
    const handleScroll = () => {
      const distanceToBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      const nextAtBottom = distanceToBottom <= SESSION_CHAT_SCROLL_BOTTOM_THRESHOLD_PX;
      setIsSessionChatAtBottom(nextAtBottom);
      if (nextAtBottom && sessionChatUnreadCount > 0) {
        markSessionChatReadToLatest();
      }
    };
    handleScroll();
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [
    isSessionChatMinimized,
    isSessionChatOpen,
    markSessionChatReadToLatest,
    sessionChatUnreadCount,
  ]);

  useEffect(() => {
    if (!isSessionChatOpen || isSessionChatMinimized || isSessionChatMaximized) return;
    const panel = sessionChatRef.current;
    if (!panel || typeof window === "undefined") return;
    const panelWidth = panel.offsetWidth || 420;
    const panelHeight = panel.offsetHeight || 420;
    const maxX = Math.max(8, window.innerWidth - panelWidth - 8);
    const maxY = Math.max(8, window.innerHeight - panelHeight - 8);
    setSessionChatPosition((current) => ({
      x: Math.min(maxX, Math.max(8, current.x)),
      y: Math.min(maxY, Math.max(8, current.y)),
    }));
  }, [isSessionChatMaximized, isSessionChatMinimized, isSessionChatOpen]);

  useEffect(() => {
    if (!isSessionChatOpen || isSessionChatMaximized || isSessionChatMinimized) return;
    const onPointerMove = (event: PointerEvent) => {
      const dragState = sessionChatDragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      const panel = sessionChatRef.current;
      if (!panel) return;
      const panelWidth = panel.offsetWidth || 420;
      const panelHeight = panel.offsetHeight || 420;
      const maxX = Math.max(8, window.innerWidth - panelWidth - 8);
      const maxY = Math.max(8, window.innerHeight - panelHeight - 8);
      setSessionChatPosition({
        x: Math.min(maxX, Math.max(8, event.clientX - dragState.offsetX)),
        y: Math.min(maxY, Math.max(8, event.clientY - dragState.offsetY)),
      });
    };
    const onPointerUp = (event: PointerEvent) => {
      const dragState = sessionChatDragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      sessionChatDragStateRef.current = null;
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      sessionChatDragStateRef.current = null;
    };
  }, [isSessionChatMaximized, isSessionChatMinimized, isSessionChatOpen]);

  useEffect(() => {
    if (!session || session.kind !== "CLASS" || !canUseMedia || isEnded || !user?.id) {
      closeAllPeerConnections();
      if (isEnded || !session || session?.kind !== "CLASS") {
        const stream = localAudioStreamRef.current;
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
        }
        localAudioStreamRef.current = null;
      }
      return;
    }
    const relevantParticipantIds = new Set(
      session.participants
        .filter((participant) => participant.isOnline)
        .filter((participant) => participant.userId !== user.id)
        .filter((participant) =>
          user.role === "teacher"
            ? participant.roleInSession === "student"
            : participant.roleInSession === "teacher"
        )
        .map((participant) => participant.userId)
    );

    Array.from(peerConnectionsRef.current.keys()).forEach((peerId) => {
      if (!relevantParticipantIds.has(peerId)) {
        closePeerConnection(peerId);
      }
    });

    if (user.role !== "teacher") return;
    const connectToOnlineStudents = async () => {
      for (const participant of session.participants) {
        if (
          participant.userId === user.id ||
          participant.roleInSession !== "student" ||
            !participant.isOnline
        ) {
          continue;
        }
        try {
          const connection = await ensurePeerConnection(participant.userId);
          if (localAudioStreamRef.current) {
            await syncLocalAudioTrackToConnection(connection);
          }
          if (connection.signalingState !== "stable") continue;
          if (connection.remoteDescription) continue;
          await createAndSendOffer(participant.userId, connection);
        } catch {
          // ignore one-off connection errors and keep reconnect loop alive
        }
      }
    };
    void connectToOnlineStudents();
  }, [
    canUseMedia,
    closeAllPeerConnections,
    closePeerConnection,
    createAndSendOffer,
    ensurePeerConnection,
    isEnded,
    session,
    syncLocalAudioTrackToConnection,
    user?.id,
    user?.role,
  ]);

  useEffect(
    () => () => {
      closeAllPeerConnections();
      const stream = localAudioStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      localAudioStreamRef.current = null;
    },
    [closeAllPeerConnections]
  );

  const persistSnapshots = useCallback(async (options?: { silent?: boolean; force?: boolean }) => {
    if (!sessionId) return false;
    if (!options?.force && !dirtyRef.current) return true;
    if (isSavingRef.current) {
      pendingAutosaveAfterSaveRef.current = true;
      return true;
    }
    isSavingRef.current = true;
    pendingAutosaveAfterSaveRef.current = false;
    const revisionAtSaveStart = dirtyRevisionRef.current;
    if (!options?.silent) {
      setSaveState("saving");
    }
    try {
      await Promise.all([
        saveWorkbookSnapshot({
          sessionId,
          layer: "board",
          version: latestSeq,
          payload: encodeScenePayload({
            strokes: boardStrokes,
            objects: boardObjects,
            constraints,
            chat: chatMessages,
            comments,
            timer: timerState,
            boardSettings,
            library: libraryState,
            document: documentState,
          }),
        }),
        saveWorkbookSnapshot({
          sessionId,
          layer: "annotations",
          version: latestSeq,
          payload: encodeScenePayload({
            strokes: annotationStrokes,
            chat: [],
          }),
        }),
      ]);

      if (dirtyRevisionRef.current === revisionAtSaveStart) {
        dirtyRef.current = false;
        setSaveState("saved");
        setLastSavedAt(new Date().toISOString());
      } else {
        dirtyRef.current = true;
        pendingAutosaveAfterSaveRef.current = true;
        setSaveState("saving");
      }

      return true;
    } catch {
      setSaveState("error");
      return false;
    } finally {
      isSavingRef.current = false;
      if (pendingAutosaveAfterSaveRef.current) {
        scheduleAutosave(320);
      }
    }
  }, [
    annotationStrokes,
    boardObjects,
    boardStrokes,
    constraints,
    chatMessages,
    comments,
    timerState,
    boardSettings,
    libraryState,
    documentState,
    latestSeq,
    scheduleAutosave,
    sessionId,
  ]);

  useEffect(() => {
    persistSnapshotsRef.current = persistSnapshots;
    return () => {
      persistSnapshotsRef.current = null;
    };
  }, [persistSnapshots]);

  useEffect(() => {
    const onBeforeUnload = () => {
      void persistSnapshots({ silent: true, force: true });
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [persistSnapshots]);

  useEffect(() => {
    const flushPendingChanges = () => {
      if (!dirtyRef.current) return;
      void persistSnapshotsRef.current?.({ silent: true, force: true });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushPendingChanges();
      }
    };
    window.addEventListener("pagehide", flushPendingChanges);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flushPendingChanges);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!sessionId || !session) return;
    const intervalId = window.setInterval(() => {
      if (!dirtyRef.current) return;
      void persistSnapshots({ force: true });
    }, AUTOSAVE_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [persistSnapshots, session, sessionId]);

  useEffect(
    () => () => {
      if (dirtyRef.current) {
        void persistSnapshots({ silent: true, force: true });
      }
    },
    [persistSnapshots]
  );

  useEffect(
    () => () => {
      if (focusResetTimerRef.current !== null) {
        window.clearTimeout(focusResetTimerRef.current);
        focusResetTimerRef.current = null;
      }
    },
    []
  );

  useEffect(
    () => () => {
      if (autosaveDebounceRef.current !== null) {
        window.clearTimeout(autosaveDebounceRef.current);
        autosaveDebounceRef.current = null;
      }
    },
    []
  );

  useEffect(
    () => () => {
      if (smartInkDebounceRef.current !== null) {
        window.clearTimeout(smartInkDebounceRef.current);
        smartInkDebounceRef.current = null;
      }
    },
    []
  );

  useEffect(() => {
    if (smartInkOptions.mode !== "off") return;
    smartInkStrokeBufferRef.current = [];
    if (smartInkDebounceRef.current !== null) {
      window.clearTimeout(smartInkDebounceRef.current);
      smartInkDebounceRef.current = null;
    }
  }, [smartInkOptions.mode]);

  const appendEventsAndApply = useCallback(
    async (events: Array<{ type: WorkbookEvent["type"]; payload: unknown }>) => {
      if (!sessionId) return;
      const trackHistory = events.some((event) => HISTORY_EVENT_TYPES.has(event.type));
      if (trackHistory) {
        pushHistorySnapshot();
      }
      try {
        const response = await appendWorkbookEvents({
          sessionId,
          events,
        });
        const unseenEvents = filterUnseenWorkbookEvents(response.events);
        if (unseenEvents.length > 0) {
          applyIncomingEvents(unseenEvents);
        }
        const nextLatest = Math.max(
          latestSeqRef.current,
          response.latestSeq,
          ...unseenEvents.map((event) => event.seq)
        );
        if (nextLatest > latestSeqRef.current) {
          latestSeqRef.current = nextLatest;
          setLatestSeq(nextLatest);
        }
        if (trackHistory) {
          markDirty();
        }
      } catch (error) {
        if (trackHistory) {
          rollbackHistorySnapshot();
        }
        throw error;
      }
    },
    [
      applyIncomingEvents,
      filterUnseenWorkbookEvents,
      markDirty,
      pushHistorySnapshot,
      rollbackHistorySnapshot,
      sessionId,
    ]
  );

  const clearLayerNow = useCallback(
    async (target: WorkbookLayer) => {
      await appendEventsAndApply([
        {
          type: target === "board" ? "board.clear" : "annotations.clear",
          payload: {},
        },
      ]);
      setPendingClearRequest(null);
      setAwaitingClearRequest(null);
    },
    [appendEventsAndApply]
  );

  const commitBoardSettings = useCallback(
    async (patch: Partial<WorkbookBoardSettings>) => {
      if (session?.kind === "CLASS" && !canManageSession) return;
      const mergedSettings = { ...boardSettings, ...patch };
      const normalizedLayers = normalizeSceneLayersForBoard(
        mergedSettings.sceneLayers,
        mergedSettings.activeSceneLayerId
      );
      const nextSettings: WorkbookBoardSettings = {
        ...mergedSettings,
        sceneLayers: normalizedLayers.sceneLayers,
        activeSceneLayerId: normalizedLayers.activeSceneLayerId,
      };
      try {
        await appendEventsAndApply([
          {
            type: "board.settings.update",
            payload: { boardSettings: nextSettings },
          },
        ]);
      } catch {
        setError("Не удалось сохранить настройки доски.");
      }
    },
    [appendEventsAndApply, boardSettings, canManageSession, session?.kind]
  );

  const upsertLibraryItem = useCallback(
    async (item: WorkbookLibraryState["items"][number]) => {
      try {
        await appendEventsAndApply([
          {
            type: "library.item.upsert",
            payload: { item },
          },
        ]);
      } catch {
        setError("Не удалось сохранить материал в библиотеке.");
      }
    },
    [appendEventsAndApply]
  );

  const updateTimer = useCallback(
    async (timer: WorkbookTimerState | null) => {
      try {
        await appendEventsAndApply([
          {
            type: "timer.update",
            payload: { timer },
          },
        ]);
      } catch {
        setError("Не удалось синхронизировать таймер.");
      }
    },
    [appendEventsAndApply]
  );

  useEffect(() => {
    if (!timerState || timerState.status !== "running") return;
    const intervalId = window.setInterval(() => {
      setTimerState((current) => {
        if (!current || current.status !== "running") return current;
        if (current.remainingSec <= 1) {
          const completed: WorkbookTimerState = {
            ...current,
            remainingSec: 0,
            status: "done",
            updatedAt: new Date().toISOString(),
          };
          void updateTimer(completed);
          return completed;
        }
        return {
          ...current,
          remainingSec: current.remainingSec - 1,
          updatedAt: new Date().toISOString(),
        };
      });
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [timerState, updateTimer]);

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!sessionRootRef.current) {
        setIsFullscreen(false);
        return;
      }
      setIsFullscreen(document.fullscreenElement === sessionRootRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    const rootNode = sessionRootRef.current;
    if (!rootNode) return;
    try {
      if (document.fullscreenElement === rootNode) {
        await document.exitFullscreen();
        return;
      }
      await rootNode.requestFullscreen();
    } catch {
      setError("Не удалось переключить полноэкранный режим.");
    }
  };

  const zoomIn = () => {
    setViewportZoom((current) => Math.min(3, Number((current + 0.1).toFixed(2))));
  };

  const zoomOut = () => {
    setViewportZoom((current) => Math.max(0.3, Number((current - 0.1).toFixed(2))));
  };

  const resetZoom = () => {
    setViewportZoom(1);
  };

  const openUtilityPanel = useCallback(
    (
      tab: "settings" | "notes" | "graph" | "transform" | "layers",
      options?: {
        toggle?: boolean;
      }
    ) => {
      const allowToggle = options?.toggle ?? true;
      if (allowToggle && isUtilityPanelOpen && utilityTab === tab) {
        const isSolid3dSelected = Boolean(
          selectedObjectId &&
            boardObjects.some(
              (object) => object.id === selectedObjectId && object.type === "solid3d"
            )
        );
        if (tab === "transform" && isFullscreen && isSolid3dSelected) {
          return;
        }
        setIsUtilityPanelOpen(false);
        return;
      }
      setUtilityTab(tab);
      setIsUtilityPanelOpen(true);
      setIsUtilityPanelCollapsed(false);
      if (!workspaceRef.current) return;
      const rect = workspaceRef.current.getBoundingClientRect();
      setUtilityPanelPosition((current) => {
        const fallbackX = Math.max(rect.left + 8, rect.right - 420);
        const fallbackY = Math.max(rect.top + 8, 86);
        const nextX = current.x > 0 ? current.x : fallbackX;
        const nextY = current.y > 0 ? current.y : fallbackY;
        const minX = rect.left + 8;
        const minY = rect.top + 8;
        const maxX = Math.max(minX + 24, rect.right - 320);
        const maxY = Math.max(minY + 24, rect.bottom - 120);
        return {
          x: Math.max(minX, Math.min(maxX, nextX)),
          y: Math.max(minY, Math.min(maxY, nextY)),
        };
      });
    },
    [
      boardObjects,
      isFullscreen,
      isUtilityPanelOpen,
      selectedObjectId,
      utilityTab,
    ]
  );

  const handleUtilityPanelDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (target instanceof HTMLElement) {
      const interactive = target.closest(
        "button, input, textarea, select, option, a, [role='button'], .MuiButtonBase-root, .MuiInputBase-root, .MuiFormControl-root, .MuiSelect-root, .MuiSwitch-root"
      );
      if (interactive) return;
    }
    event.preventDefault();
    setUtilityPanelDragState({
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLeft: utilityPanelPosition.x,
      startTop: utilityPanelPosition.y,
    });
  };

  const activateGraphCatalogCursor = useCallback(() => {
    if (graphCatalogCursorTimeoutRef.current !== null) {
      window.clearTimeout(graphCatalogCursorTimeoutRef.current);
      graphCatalogCursorTimeoutRef.current = null;
    }
    setGraphCatalogCursorActive(true);
    graphCatalogCursorTimeoutRef.current = window.setTimeout(() => {
      setGraphCatalogCursorActive(false);
      graphCatalogCursorTimeoutRef.current = null;
    }, 1300);
  }, []);

  useEffect(
    () => () => {
      if (graphCatalogCursorTimeoutRef.current !== null) {
        window.clearTimeout(graphCatalogCursorTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!utilityPanelDragState) return;
    const onPointerMove = (event: PointerEvent) => {
      const deltaX = event.clientX - utilityPanelDragState.startClientX;
      const deltaY = event.clientY - utilityPanelDragState.startClientY;
      const workspaceRect = workspaceRef.current?.getBoundingClientRect();
      const minX = (workspaceRect?.left ?? 0) + 8;
      const minY = (workspaceRect?.top ?? 0) + 8;
      const maxX = Math.max(minX + 24, (workspaceRect?.right ?? window.innerWidth) - 320);
      const maxY = Math.max(minY + 24, (workspaceRect?.bottom ?? window.innerHeight) - 120);
      setUtilityPanelPosition({
        x: Math.max(minX, Math.min(maxX, utilityPanelDragState.startLeft + deltaX)),
        y: Math.max(minY, Math.min(maxY, utilityPanelDragState.startTop + deltaY)),
      });
    };
    const onPointerUp = () => setUtilityPanelDragState(null);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [utilityPanelDragState]);

  useEffect(() => {
    if (!isUtilityPanelOpen) return;
    if (!workspaceRef.current) return;
    setUtilityPanelPosition((current) => {
      const rect = workspaceRef.current?.getBoundingClientRect();
      if (!rect) return current;
      const fallbackX = Math.max(rect.left + 8, rect.right - 420);
      const fallbackY = Math.max(rect.top + 8, 86);
      const nextX = current.x > 0 ? current.x : fallbackX;
      const nextY = current.y > 0 ? current.y : fallbackY;
      const minX = rect.left + 8;
      const minY = rect.top + 8;
      const maxX = Math.max(minX + 24, rect.right - 320);
      const maxY = Math.max(minY + 24, rect.bottom - 120);
      return {
        x: Math.max(minX, Math.min(maxX, nextX)),
        y: Math.max(minY, Math.min(maxY, nextY)),
      };
    });
  }, [isFullscreen, isUtilityPanelOpen]);

  const utilityPanelTitle = useMemo(() => {
    if (utilityTab === "settings") return "Настройки доски";
    if (utilityTab === "notes") return "Заметки";
    if (utilityTab === "graph") return "Графики функции";
    if (utilityTab === "layers") return "Слои";
    return "Трансформации";
  }, [utilityTab]);

  const handleCreateNoteSticker = async () => {
    const text = noteDraftText.trim();
    if (!text) return;
    await commitObjectCreate({
      id: generateId(),
      type: "sticker",
      layer: "board",
      x: 140 + boardObjects.length * 4,
      y: 120 + boardObjects.length * 4,
      width: 200,
      height: 120,
      color: "#e6af2e",
      fill: "rgba(255, 244, 163, 0.92)",
      strokeWidth: 1.8,
      opacity: 1,
      text,
      authorUserId: user?.id ?? "unknown",
      createdAt: new Date().toISOString(),
      page: boardSettings.currentPage,
    });
    setNoteDraftText("");
  };

  const handleDeleteNoteSticker = async (objectId: string) => {
    if (!canDelete) {
      setError("Удаление заметок ограничено текущими правами.");
      return;
    }
    await commitObjectDelete(objectId);
  };

  const constraintShapeTypes = useMemo(
    () =>
      new Set([
        "line",
        "arrow",
        "rectangle",
        "ellipse",
        "triangle",
        "polygon",
        "solid3d",
        "section3d",
        "net3d",
      ]),
    []
  );
  const applyConstraintsForObject = useCallback(
    (object: WorkbookBoardObject, allObjects: WorkbookBoardObject[]) => {
      if (!session?.settings?.strictGeometry) return object;
      if (!constraintShapeTypes.has(object.type)) return object;
      const relevant = constraints.filter(
        (constraint) =>
          constraint.enabled &&
          (constraint.sourceObjectId === object.id ||
            constraint.targetObjectId === object.id)
      );
      if (relevant.length === 0) return object;

      const next = { ...object };
      relevant.forEach((constraint) => {
        const otherId =
          constraint.sourceObjectId === next.id
            ? constraint.targetObjectId
            : constraint.sourceObjectId;
        const other = allObjects.find((candidate) => candidate.id === otherId);
        if (!other || !constraintShapeTypes.has(other.type)) return;
        const otherDx = other.width;
        const otherDy = other.height;
        const currentLength = Math.hypot(next.width, next.height) || 1;
        const otherLength = Math.hypot(otherDx, otherDy) || 1;
        const otherAngle = Math.atan2(otherDy, otherDx);
        const currentAngle = Math.atan2(next.height, next.width);

        if (constraint.type === "parallel") {
          next.width = Math.cos(otherAngle) * currentLength;
          next.height = Math.sin(otherAngle) * currentLength;
        }
        if (constraint.type === "perpendicular") {
          const targetAngle = otherAngle + Math.PI / 2;
          next.width = Math.cos(targetAngle) * currentLength;
          next.height = Math.sin(targetAngle) * currentLength;
        }
        if (constraint.type === "equal_length") {
          next.width = Math.cos(currentAngle) * otherLength;
          next.height = Math.sin(currentAngle) * otherLength;
        }
      });
      return next;
    },
    [constraintShapeTypes, constraints, session?.settings?.strictGeometry]
  );

  const handleConfirmClear = async () => {
    if (!pendingClearRequest || pendingClearRequest.authorUserId === user?.id) return;
    try {
      await appendEventsAndApply([
        {
          type: "board.clear.confirm",
          payload: {
            requestId: pendingClearRequest.requestId,
          },
        },
      ]);
      setPendingClearRequest(null);
    } catch {
      setError("Не удалось подтвердить очистку.");
    }
  };

  useEffect(() => {
    if (!confirmedClearRequest) return;
    void clearLayerNow(confirmedClearRequest.targetLayer).finally(() => {
      setConfirmedClearRequest(null);
    });
  }, [clearLayerNow, confirmedClearRequest]);

  const requestSmartInkAdapter = useCallback(
    async (strokes: WorkbookStroke[]) => {
      if (!sessionId) return null;
      if (smartInkOptions.mode !== "full") return null;
      if (!smartInkOptions.smartTextOcr && !smartInkOptions.smartMathOcr) return null;
      try {
        const response = await recognizeWorkbookInk({
          sessionId,
          strokes: strokes.map((stroke) => ({
            id: stroke.id,
            points: stroke.points,
            width: stroke.width,
            color: stroke.color,
          })),
          preferMath: smartInkOptions.smartMathOcr,
        });
        if (!response || !response.result) return null;
        return {
          text: response.result.text ?? "",
          latex: response.result.latex ?? undefined,
          confidence:
            typeof response.result.confidence === "number"
              ? response.result.confidence
              : undefined,
        };
      } catch {
        return null;
      }
    },
    [
      sessionId,
      smartInkOptions.mode,
      smartInkOptions.smartMathOcr,
      smartInkOptions.smartTextOcr,
    ]
  );

  const processSmartInkBuffer = useCallback(async () => {
    if (smartInkOptions.mode === "off") return;
    const buffer = smartInkStrokeBufferRef.current.filter(
      (stroke) => !smartInkProcessedStrokeIdsRef.current.has(stroke.id)
    );
    if (!buffer.length) return;

    const recognitionConfig = {
      smartShapes: smartInkOptions.smartShapes,
      smartTextOcr: smartInkOptions.smartTextOcr,
      smartMathOcr: smartInkOptions.smartMathOcr,
      handwritingAdapter: async (input: {
        stroke: WorkbookStroke;
        points: WorkbookPoint[];
      }) => {
        const sourceStrokes =
          buffer.length > 1 && input.points.length > input.stroke.points.length + 2
            ? buffer
            : [input.stroke];
        return requestSmartInkAdapter(sourceStrokes);
      },
    };

    const applyRecognized = async (
      strokes: WorkbookStroke[],
      result: SmartInkDetectedResult
    ) => {
      const objectMeta =
        result.object.meta && typeof result.object.meta === "object"
          ? result.object.meta
          : {};
      const objectWithPage: WorkbookBoardObject = {
        ...result.object,
        page: result.object.page ?? boardSettings.currentPage,
        meta: {
          ...objectMeta,
          sceneLayerId: activeSceneLayerId,
          smartInkKind: result.kind,
          smartInkConfidence: result.confidence,
        },
      };
      const events: Array<{ type: WorkbookEvent["type"]; payload: unknown }> = [
        {
          type: "board.object.create",
          payload: { object: objectWithPage },
        },
        ...strokes.map((stroke) => ({
          type: "board.stroke.delete" as const,
          payload: { strokeId: stroke.id },
        })),
      ];
      try {
        await appendEventsAndApply(events);
        strokes.forEach((stroke) => {
          smartInkProcessedStrokeIdsRef.current.add(stroke.id);
        });
        smartInkStrokeBufferRef.current = smartInkStrokeBufferRef.current.filter(
          (item) => !strokes.some((stroke) => stroke.id === item.id)
        );
        setSelectedObjectId(objectWithPage.id);
      } catch {
        setError("Не удалось применить Smart Ink преобразование.");
      }
    };

    const threshold = smartInkOptions.confidenceThreshold;

    if (smartInkOptions.mode === "full" && buffer.length >= 2) {
      const batchResult = await recognizeSmartInkBatch(buffer, recognitionConfig);
      if (batchResult.kind !== "none" && batchResult.confidence >= threshold) {
        await applyRecognized(buffer, batchResult);
        return;
      }
    }

    const lastStroke = buffer[buffer.length - 1];
    const singleResult = await recognizeSmartInkStroke(lastStroke, recognitionConfig);
    if (singleResult.kind !== "none" && singleResult.confidence >= threshold) {
      await applyRecognized([lastStroke], singleResult);
      return;
    }

    if (smartInkStrokeBufferRef.current.length > 8) {
      smartInkStrokeBufferRef.current = smartInkStrokeBufferRef.current.slice(-8);
    }
  }, [
    requestSmartInkAdapter,
    smartInkOptions.confidenceThreshold,
    smartInkOptions.mode,
    smartInkOptions.smartMathOcr,
    smartInkOptions.smartShapes,
    smartInkOptions.smartTextOcr,
    activeSceneLayerId,
    appendEventsAndApply,
    boardSettings.currentPage,
  ]);

  const queueSmartInkStroke = useCallback(
    (stroke: WorkbookStroke) => {
      if (smartInkOptions.mode === "off") return;
      smartInkStrokeBufferRef.current = [...smartInkStrokeBufferRef.current, stroke];
      if (smartInkDebounceRef.current !== null) {
        window.clearTimeout(smartInkDebounceRef.current);
      }
      smartInkDebounceRef.current = window.setTimeout(() => {
        smartInkDebounceRef.current = null;
        void processSmartInkBuffer();
      }, smartInkOptions.mode === "full" ? 620 : 360);
    },
    [processSmartInkBuffer, smartInkOptions.mode]
  );

  const commitStroke = async (stroke: WorkbookStroke) => {
    if (!sessionId || !canDraw) return;
    const type = stroke.layer === "board" ? "board.stroke" : "annotations.stroke";
    try {
      await appendEventsAndApply([{ type, payload: { stroke } }]);
      if (stroke.layer === "board" && stroke.tool === "pen") {
        queueSmartInkStroke(stroke);
      }
    } catch {
      setError("Не удалось синхронизировать штрих. Проверьте подключение.");
    }
  };

  const commitStrokeDelete = async (strokeId: string, targetLayer: WorkbookLayer) => {
    if (!sessionId || !canDelete) return;
    const type =
      targetLayer === "annotations"
        ? ("annotations.stroke.delete" as const)
        : ("board.stroke.delete" as const);
    try {
      await appendEventsAndApply([{ type, payload: { strokeId } }]);
    } catch {
      setError("Не удалось удалить штрих.");
    }
  };

  const commitObjectCreate = async (object: WorkbookBoardObject) => {
    if (!sessionId || !canDraw) return;
    const currentMeta =
      object.meta && typeof object.meta === "object" ? object.meta : {};
    const objectWithPage: WorkbookBoardObject = {
      ...object,
      page: object.page ?? boardSettings.currentPage,
      meta: {
        ...currentMeta,
        sceneLayerId: activeSceneLayerId,
      },
    };
    setBoardObjects((current) =>
      current.some((item) => item.id === objectWithPage.id)
        ? current
        : [...current, objectWithPage]
    );
    try {
      await appendEventsAndApply([
        {
          type: "board.object.create",
          payload: { object: objectWithPage },
        },
      ]);
      if (objectWithPage.type === "image" && objectWithPage.imageUrl) {
        const now = new Date().toISOString();
        void upsertLibraryItem({
          id: generateId(),
          name: objectWithPage.imageName || "Изображение с доски",
          type: "image",
          ownerUserId: user?.id ?? "unknown",
          sourceUrl: objectWithPage.imageUrl,
          createdAt: now,
          updatedAt: now,
          folderId: null,
        });
      }
    } catch {
      setBoardObjects((current) =>
        current.filter((item) => item.id !== objectWithPage.id)
      );
      setSelectedObjectId((current) =>
        current === objectWithPage.id ? null : current
      );
      setError("Не удалось создать объект.");
    }
  };

  const commitObjectUpdate = useCallback(
    async (objectId: string, patch: Partial<WorkbookBoardObject>) => {
      if (!sessionId || !canSelect) return;
      const currentObject = boardObjects.find((item) => item.id === objectId);
      if (!currentObject) return;
      const merged = mergeBoardObjectWithPatch(currentObject, patch);
      const constrained = applyConstraintsForObject(merged, boardObjects);
      const shouldApplyGeometryPatch =
        patch.x !== undefined ||
        patch.y !== undefined ||
        patch.width !== undefined ||
        patch.height !== undefined;
      const normalizedPatch: Partial<WorkbookBoardObject> = shouldApplyGeometryPatch
        ? {
            ...patch,
            x: constrained.x,
            y: constrained.y,
            width: constrained.width,
            height: constrained.height,
          }
        : patch;
      try {
        await appendEventsAndApply([
          {
            type: "board.object.update",
            payload: { objectId, patch: normalizedPatch },
          },
        ]);
      } catch {
        setError("Не удалось обновить объект.");
      }
    },
    [appendEventsAndApply, applyConstraintsForObject, boardObjects, canSelect, sessionId]
  );

  const commitObjectDelete = async (objectId: string) => {
    if (!sessionId || !canDelete) return;
    const targetObject = boardObjects.find((item) => item.id === objectId);
    const targetLayerId = targetObject ? getObjectSceneLayerId(targetObject) : MAIN_SCENE_LAYER_ID;
    const shouldPruneLayer =
      targetLayerId !== MAIN_SCENE_LAYER_ID &&
      boardObjects.filter(
        (object) =>
          object.id !== objectId && getObjectSceneLayerId(object) === targetLayerId
      ).length === 0;
    const nextSettings: WorkbookBoardSettings | null = shouldPruneLayer
      ? {
          ...boardSettings,
          sceneLayers: normalizedSceneLayers.sceneLayers.filter(
            (entry) => entry.id !== targetLayerId
          ),
          activeSceneLayerId:
            boardSettings.activeSceneLayerId === targetLayerId
              ? MAIN_SCENE_LAYER_ID
              : boardSettings.activeSceneLayerId,
        }
      : null;
    try {
      const events: Array<{ type: WorkbookEvent["type"]; payload: unknown }> = [
        {
          type: "board.object.delete",
          payload: { objectId },
        },
      ];
      if (nextSettings) {
        events.push({
          type: "board.settings.update",
          payload: { boardSettings: nextSettings },
        });
      }
      await appendEventsAndApply(events);
    } catch {
      setError("Не удалось удалить объект.");
    }
  };

  const commitObjectPin = async (objectId: string, pinned: boolean) => {
    if (!sessionId || !canManageSession) return;
    try {
      await appendEventsAndApply([
        {
          type: "board.object.pin",
          payload: { objectId, pinned },
        },
      ]);
    } catch {
      setError("Не удалось изменить закрепление объекта.");
    }
  };

  const scaleObject = async (factor: number, objectId?: string) => {
    if (!canSelect) return;
    const targetObjectId = objectId ?? selectedObjectId;
    if (!targetObjectId) return;
    const targetObject = boardObjects.find((item) => item.id === targetObjectId);
    if (!targetObject) return;
    const safeFactor = Number.isFinite(factor) ? factor : 1;
    if (safeFactor <= 0) return;
    const nextWidth = targetObject.width * safeFactor;
    const nextHeight = targetObject.height * safeFactor;
    if (Array.isArray(targetObject.points) && targetObject.points.length > 0) {
      const bounds = getPointsBounds(targetObject.points);
      const centerX = bounds.minX + bounds.width / 2;
      const centerY = bounds.minY + bounds.height / 2;
      const scaledPoints = targetObject.points.map((point) => ({
        x: centerX + (point.x - centerX) * safeFactor,
        y: centerY + (point.y - centerY) * safeFactor,
      }));
      const scaledBounds = getPointsBounds(scaledPoints);
      await commitObjectUpdate(targetObject.id, {
        x: scaledBounds.minX,
        y: scaledBounds.minY,
        width: scaledBounds.width,
        height: scaledBounds.height,
        points: scaledPoints,
      });
      return;
    }
    await commitObjectUpdate(targetObject.id, {
      width: Math.abs(nextWidth) < 1 ? Math.sign(nextWidth || 1) : nextWidth,
      height: Math.abs(nextHeight) < 1 ? Math.sign(nextHeight || 1) : nextHeight,
    });
  };

  const mirrorSelectedObject = useCallback(
    async (axis: "horizontal" | "vertical") => {
      if (!selectedObjectId || !canSelect) return;
      const targetObject = boardObjects.find((item) => item.id === selectedObjectId);
      if (!targetObject) return;

      const centerX = targetObject.x + targetObject.width / 2;
      const centerY = targetObject.y + targetObject.height / 2;

      if (Array.isArray(targetObject.points) && targetObject.points.length > 0) {
        const mirroredPoints = targetObject.points.map((point) => ({
          x: axis === "horizontal" ? centerX * 2 - point.x : point.x,
          y: axis === "vertical" ? centerY * 2 - point.y : point.y,
        }));
        const bounds = getPointsBounds(mirroredPoints);
        await commitObjectUpdate(targetObject.id, {
          points: mirroredPoints,
          x: bounds.minX,
          y: bounds.minY,
          width: bounds.width,
          height: bounds.height,
        });
        return;
      }

      if (targetObject.type === "line" || targetObject.type === "arrow") {
        const start = { x: targetObject.x, y: targetObject.y };
        const end = {
          x: targetObject.x + targetObject.width,
          y: targetObject.y + targetObject.height,
        };
        const mirroredStart =
          axis === "horizontal"
            ? { x: centerX * 2 - start.x, y: start.y }
            : { x: start.x, y: centerY * 2 - start.y };
        const mirroredEnd =
          axis === "horizontal"
            ? { x: centerX * 2 - end.x, y: end.y }
            : { x: end.x, y: centerY * 2 - end.y };
        await commitObjectUpdate(targetObject.id, {
          x: mirroredStart.x,
          y: mirroredStart.y,
          width: mirroredEnd.x - mirroredStart.x,
          height: mirroredEnd.y - mirroredStart.y,
        });
        return;
      }

      if (targetObject.type === "solid3d") {
        const state = readSolid3dState(targetObject.meta);
        const nextState =
          axis === "horizontal"
            ? {
                ...state,
                view: {
                  ...state.view,
                  rotationY: -state.view.rotationY,
                },
              }
            : {
                ...state,
                view: {
                  ...state.view,
                  rotationX: -state.view.rotationX,
                },
              };
        await commitObjectUpdate(targetObject.id, {
          meta: writeSolid3dState(nextState, targetObject.meta),
        });
        return;
      }

      const baseRotation =
        typeof targetObject.rotation === "number" && Number.isFinite(targetObject.rotation)
          ? targetObject.rotation
          : 0;
      await commitObjectUpdate(targetObject.id, {
        rotation:
          axis === "horizontal" ? -baseRotation : Math.PI - baseRotation,
      });
    },
    [boardObjects, canSelect, commitObjectUpdate, selectedObjectId]
  );

  const deleteAreaSelectionObjects = useCallback(async () => {
    if (!canDelete || !areaSelection || areaSelection.objectIds.length === 0) return;
    const objectIds = areaSelection.objectIds.filter((id) =>
      boardObjects.some((object) => object.id === id && !object.pinned)
    );
    if (objectIds.length === 0) {
      setAreaSelectionContextMenu(null);
      return;
    }
    try {
      const deletingSet = new Set(objectIds);
      const layerIdsToRemove = normalizedSceneLayers.sceneLayers
        .filter((layerItem) => layerItem.id !== MAIN_SCENE_LAYER_ID)
        .filter((layerItem) => {
          const layerObjects = boardObjects.filter(
            (object) => getObjectSceneLayerId(object) === layerItem.id
          );
          if (layerObjects.length === 0) return false;
          return layerObjects.every((object) => deletingSet.has(object.id));
        })
        .map((layerItem) => layerItem.id);
      const events: Array<{ type: WorkbookEvent["type"]; payload: unknown }> = objectIds.map(
        (objectId) => ({
          type: "board.object.delete" as const,
          payload: { objectId },
        })
      );
      if (layerIdsToRemove.length > 0) {
        const nextSettings: WorkbookBoardSettings = {
          ...boardSettings,
          sceneLayers: normalizedSceneLayers.sceneLayers.filter(
            (layerItem) => !layerIdsToRemove.includes(layerItem.id)
          ),
          activeSceneLayerId: layerIdsToRemove.includes(boardSettings.activeSceneLayerId)
            ? MAIN_SCENE_LAYER_ID
            : boardSettings.activeSceneLayerId,
        };
        events.push({
          type: "board.settings.update",
          payload: {
            boardSettings: nextSettings,
          },
        });
      }
      await appendEventsAndApply(events);
      setAreaSelection(null);
      setAreaSelectionContextMenu(null);
      if (selectedObjectId && objectIds.includes(selectedObjectId)) {
        setSelectedObjectId(null);
      }
    } catch {
      setError("Не удалось удалить объекты из выделенной области.");
    }
  }, [
    appendEventsAndApply,
    areaSelection,
    boardObjects,
    boardSettings,
    canDelete,
    getObjectSceneLayerId,
    normalizedSceneLayers.sceneLayers,
    selectedObjectId,
  ]);

  const copyAreaSelectionObjects = useCallback(() => {
    if (!canSelect || !areaSelection || areaSelection.objectIds.length === 0) return;
    const selectedObjects = areaSelection.objectIds
      .map((id) => boardObjects.find((object) => object.id === id))
      .filter(
        (object): object is WorkbookBoardObject =>
          object != null && !object.pinned
      );
    if (selectedObjects.length === 0) {
      areaSelectionClipboardRef.current = null;
      return;
    }
    areaSelectionClipboardRef.current = selectedObjects.map((object) =>
      structuredClone<WorkbookBoardObject>(object)
    );
    setAreaSelectionContextMenu(null);
  }, [areaSelection, boardObjects, canSelect]);

  const pasteAreaSelectionObjects = useCallback(async () => {
    if (!canSelect) return;
    const clipboard = areaSelectionClipboardRef.current;
    if (!clipboard || clipboard.length === 0) return;
    const now = new Date().toISOString();
    const offset = 24;
    const createEvents = clipboard.map((object) => ({
      type: "board.object.create" as const,
      payload: {
        object: {
          ...object,
          id: generateId(),
          x: object.x + offset,
          y: object.y + offset,
          createdAt: now,
          authorUserId: user?.id ?? object.authorUserId,
        },
      },
    }));
    try {
      await appendEventsAndApply(createEvents);
      setAreaSelectionContextMenu(null);
    } catch {
      setError("Не удалось вставить скопированную область.");
    }
  }, [appendEventsAndApply, canSelect, user?.id]);

  const cutAreaSelectionObjects = useCallback(async () => {
    if (!canDelete || !areaSelection || areaSelection.objectIds.length === 0) return;
    copyAreaSelectionObjects();
    await deleteAreaSelectionObjects();
  }, [areaSelection, canDelete, copyAreaSelectionObjects, deleteAreaSelectionObjects]);

  const createCompositionFromAreaSelection = useCallback(async () => {
    if (!canSelect || !areaSelection || areaSelection.objectIds.length === 0) return;
    const objectIds = areaSelection.objectIds.filter((id) =>
      boardObjects.some((object) => object.id === id && !object.pinned)
    );
    if (objectIds.length < 2) {
      setError("Для композиции выберите минимум два объекта.");
      return;
    }
    const existingLayerNames = new Set(normalizedSceneLayers.sceneLayers.map((item) => item.name));
    let index = normalizedSceneLayers.sceneLayers.length;
    let layerName = `Композиция ${index}`;
    while (existingLayerNames.has(layerName)) {
      index += 1;
      layerName = `Композиция ${index}`;
    }
    const layerId = generateId();
    const createdAt = new Date().toISOString();
    const nextSettings: WorkbookBoardSettings = {
      ...boardSettings,
      sceneLayers: [
        ...normalizedSceneLayers.sceneLayers,
        {
          id: layerId,
          name: layerName,
          createdAt,
        },
      ],
      activeSceneLayerId: boardSettings.activeSceneLayerId,
    };
    const updateEvents = objectIds.map((objectId) => {
      const object = boardObjects.find((item) => item.id === objectId);
      return {
        type: "board.object.update" as const,
        payload: {
          objectId,
          patch: {
            meta: {
              ...(object?.meta ?? {}),
              sceneLayerId: layerId,
            },
          },
        },
      };
    });
    try {
      await appendEventsAndApply([
        ...updateEvents,
        {
          type: "board.settings.update",
          payload: {
            boardSettings: nextSettings,
          },
        },
      ]);
      setAreaSelectionContextMenu(null);
    } catch {
      setError("Не удалось создать композицию.");
    }
  }, [
    appendEventsAndApply,
    areaSelection,
    boardObjects,
    boardSettings,
    canSelect,
    normalizedSceneLayers.sceneLayers,
  ]);

  const removeObjectFromComposition = useCallback(
    async (objectId: string, layerId: string) => {
      if (!canSelect || !objectId || !layerId || layerId === MAIN_SCENE_LAYER_ID) return;
      const target = boardObjects.find((object) => object.id === objectId);
      if (!target) return;
      const remainingObjects = boardObjects.filter(
        (object) => object.id !== objectId && getObjectSceneLayerId(object) === layerId
      );
      const nextSettings: WorkbookBoardSettings | null =
        remainingObjects.length === 0
          ? {
              ...boardSettings,
              sceneLayers: normalizedSceneLayers.sceneLayers.filter(
                (entry) => entry.id !== layerId
              ),
              activeSceneLayerId:
                boardSettings.activeSceneLayerId === layerId
                  ? MAIN_SCENE_LAYER_ID
                  : boardSettings.activeSceneLayerId,
            }
          : null;
      const updateEvents: Array<{ type: WorkbookEvent["type"]; payload: unknown }> = [
        {
          type: "board.object.update",
          payload: {
            objectId,
            patch: {
              meta: {
                ...(target.meta ?? {}),
                sceneLayerId: MAIN_SCENE_LAYER_ID,
              },
            },
          },
        },
      ];
      if (nextSettings) {
        updateEvents.push({
          type: "board.settings.update",
          payload: {
            boardSettings: nextSettings,
          },
        });
      }
      try {
        await appendEventsAndApply(updateEvents);
      } catch {
        setError("Не удалось убрать объект из композиции.");
      }
    },
    [
      appendEventsAndApply,
      boardObjects,
      boardSettings,
      canSelect,
      getObjectSceneLayerId,
      normalizedSceneLayers.sceneLayers,
    ]
  );

  const dissolveCompositionLayer = useCallback(
    async (layerId: string) => {
      if (!layerId || layerId === MAIN_SCENE_LAYER_ID || !canSelect) return;
      const groupedObjects = boardObjects.filter(
        (object) => getObjectSceneLayerId(object) === layerId
      );
      const updateEvents = groupedObjects.map((object) => ({
        type: "board.object.update" as const,
        payload: {
          objectId: object.id,
          patch: {
            meta: {
              ...(object.meta ?? {}),
              sceneLayerId: MAIN_SCENE_LAYER_ID,
            },
          },
        },
      }));
      const nextSettings: WorkbookBoardSettings = {
        ...boardSettings,
        sceneLayers: normalizedSceneLayers.sceneLayers.filter((entry) => entry.id !== layerId),
        activeSceneLayerId:
          boardSettings.activeSceneLayerId === layerId
            ? MAIN_SCENE_LAYER_ID
            : boardSettings.activeSceneLayerId,
      };
      try {
        await appendEventsAndApply([
          ...updateEvents,
          {
            type: "board.settings.update",
            payload: {
              boardSettings: nextSettings,
            },
          },
        ]);
      } catch {
      setError("Не удалось удалить композицию.");
      }
    },
    [
      appendEventsAndApply,
      boardObjects,
      boardSettings,
      canSelect,
      getObjectSceneLayerId,
      normalizedSceneLayers.sceneLayers,
    ]
  );

  const focusObjectInWorkspace = useCallback((objectId: string) => {
    setSelectedConstraintId(null);
    setSelectedObjectId(objectId);
    setTool("select");
    openUtilityPanel("transform", { toggle: false });
  }, [openUtilityPanel]);

  const updateSelectedLineMeta = useCallback(
    async (
      patch: Partial<{
        lineKind: "line" | "segment";
        lineStyle: "solid" | "dashed";
        startLabel: string;
        endLabel: string;
      }>
    ) => {
      if (!selectedObjectId || !canSelect) return;
      const target = boardObjects.find((item) => item.id === selectedObjectId);
      if (!target || (target.type !== "line" && target.type !== "arrow")) return;
      const nextMeta = {
        ...(target.meta ?? {}),
        ...patch,
      };
      await commitObjectUpdate(target.id, {
        type: "line",
        meta: nextMeta,
      });
    },
    [boardObjects, canSelect, commitObjectUpdate, selectedObjectId]
  );

  const updateSelectedObjectMeta = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!selectedObjectId || !canSelect) return;
      const target = boardObjects.find((item) => item.id === selectedObjectId);
      if (!target) return;
      await commitObjectUpdate(target.id, {
        meta: {
          ...(target.meta ?? {}),
          ...patch,
        },
      });
    },
    [boardObjects, canSelect, commitObjectUpdate, selectedObjectId]
  );

  const updateSelectedLineObject = useCallback(
    async (patch: Partial<WorkbookBoardObject>) => {
      if (!selectedObjectId || !canSelect) return;
      const target = boardObjects.find((item) => item.id === selectedObjectId);
      if (!target || (target.type !== "line" && target.type !== "arrow")) return;
      await commitObjectUpdate(target.id, patch);
    },
    [boardObjects, canSelect, commitObjectUpdate, selectedObjectId]
  );

  const updateSelectedFunctionGraphMeta = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!selectedObjectId || !canSelect) return;
      const target = boardObjects.find((item) => item.id === selectedObjectId);
      if (!target || target.type !== "function_graph") return;
      await commitObjectUpdate(target.id, {
        meta: {
          ...(target.meta ?? {}),
          ...patch,
        },
      });
    },
    [boardObjects, canSelect, commitObjectUpdate, selectedObjectId]
  );

  const commitSelectedFunctionGraphDraft = useCallback(
    async (nextFunctions: GraphFunctionDraft[]) => {
      const fallbackFunctions = sanitizeFunctionGraphDrafts(nextFunctions, {
        ensureNonEmpty: false,
      });
      await updateSelectedFunctionGraphMeta({
        functions: fallbackFunctions,
      });
    },
    [updateSelectedFunctionGraphMeta]
  );

  const updateSelectedFunctionGraphAppearance = useCallback(
    (patch: { axisColor?: string; planeColor?: string }) => {
      void updateSelectedFunctionGraphMeta({
        ...(typeof patch.axisColor === "string" ? { axisColor: patch.axisColor } : {}),
        ...(typeof patch.planeColor === "string" ? { planeColor: patch.planeColor } : {}),
      });
    },
    [updateSelectedFunctionGraphMeta]
  );

  const pushSelectedGraphFunctions = useCallback(
    (nextFunctions: GraphFunctionDraft[]) => {
      const sanitized = sanitizeFunctionGraphDrafts(nextFunctions, {
        ensureNonEmpty: false,
      });
      setGraphFunctionsDraft(sanitized);
      void commitSelectedFunctionGraphDraft(sanitized);
    },
    [commitSelectedFunctionGraphDraft]
  );

  const commitSelectedLineEndpointLabel = useCallback(
    async (endpoint: "start" | "end", valueOverride?: string) => {
      if (!selectedObjectId) return;
      const target = boardObjects.find((item) => item.id === selectedObjectId);
      if (!target || (target.type !== "line" && target.type !== "arrow")) return;
      if (target.meta?.lineKind !== "segment") return;
      const value =
        valueOverride ?? (endpoint === "start" ? selectedLineStartLabelDraft : selectedLineEndLabelDraft);
      const key = endpoint === "start" ? "startLabel" : "endLabel";
      const currentRaw = target.meta?.[key];
      const current = typeof currentRaw === "string" ? currentRaw : "";
      const next = value.slice(0, 12);
      if (next === current) return;
      await updateSelectedLineMeta({ [key]: next });
    },
    [
      boardObjects,
      selectedObjectId,
      selectedLineEndLabelDraft,
      selectedLineStartLabelDraft,
      updateSelectedLineMeta,
    ]
  );

  const commitSelectedLineWidth = useCallback(async () => {
    if (!selectedObjectId) return;
    const target = boardObjects.find((item) => item.id === selectedObjectId);
    if (!target || (target.type !== "line" && target.type !== "arrow")) return;
    const next = Math.max(1, Math.min(18, Math.round(lineWidthDraft)));
    const currentWidth = target.strokeWidth ?? 3;
    if (Math.abs(next - currentWidth) < 0.01) return;
    await updateSelectedLineObject({ strokeWidth: next });
  }, [boardObjects, lineWidthDraft, selectedObjectId, updateSelectedLineObject]);

  const appendSelectedGraphFunction = useCallback(
    (expressionOverride?: string) => {
      const selectedGraphObject =
        selectedObjectId != null
          ? boardObjects.find((item) => item.id === selectedObjectId)
          : null;
      if (!selectedGraphObject || selectedGraphObject.type !== "function_graph") return;
      const validation = validateFunctionExpression(
        expressionOverride ?? graphExpressionDraft
      );
      if (!validation.ok) {
        setGraphDraftError(validation.error ?? "Проверьте формулу.");
        return;
      }
      const nextFunctions = [
        ...graphFunctionsDraft,
        {
          id: generateId(),
          expression: validation.expression,
          color: GRAPH_FUNCTION_COLORS[graphFunctionsDraft.length % GRAPH_FUNCTION_COLORS.length],
          visible: true,
          dashed: false,
          width: 2,
          offsetX: 0,
          offsetY: 0,
          scaleX: 1,
          scaleY: 1,
        },
      ];
      pushSelectedGraphFunctions(nextFunctions);
      setGraphExpressionDraft("");
      setGraphDraftError(null);
    },
    [
      graphExpressionDraft,
      boardObjects,
      graphFunctionsDraft,
      pushSelectedGraphFunctions,
      selectedObjectId,
    ]
  );

  const removeSelectedGraphFunction = useCallback(
    (id: string) => {
      if (graphFunctionsDraft.length <= 1) return;
      const nextFunctions = graphFunctionsDraft.filter((entry) => entry.id !== id);
      pushSelectedGraphFunctions(nextFunctions);
    },
    [graphFunctionsDraft, pushSelectedGraphFunctions]
  );

  const updateSelectedGraphFunction = useCallback(
    (id: string, patch: Partial<GraphFunctionDraft>) => {
      const nextFunctions = graphFunctionsDraft.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry
      );
      pushSelectedGraphFunctions(nextFunctions);
    },
    [graphFunctionsDraft, pushSelectedGraphFunctions]
  );

  const reflectGraphFunctionByAxis = useCallback(
    (id: string, axis: "x" | "y") => {
      const selectedGraphObject =
        selectedObjectId != null
          ? boardObjects.find((item) => item.id === selectedObjectId)
          : null;
      const applyToSelected = selectedGraphObject?.type === "function_graph";
      const applyReflection = (entry: GraphFunctionDraft): GraphFunctionDraft => {
        if (entry.id !== id) return entry;
        const scaleX = normalizeGraphScale(entry.scaleX ?? 1, 1);
        const scaleY = normalizeGraphScale(entry.scaleY ?? 1, 1);
        const offsetX = clampGraphOffset(entry.offsetX ?? 0);
        const offsetY = clampGraphOffset(entry.offsetY ?? 0);
        if (axis === "x") {
          return {
            ...entry,
            scaleY: normalizeGraphScale(-scaleY, scaleY),
            offsetY: clampGraphOffset(-offsetY),
          };
        }
        return {
          ...entry,
          scaleX: normalizeGraphScale(-scaleX, scaleX),
          offsetX: clampGraphOffset(-offsetX),
        };
      };

      if (applyToSelected) {
        const nextFunctions = graphFunctionsDraft.map(applyReflection);
        pushSelectedGraphFunctions(nextFunctions);
        return;
      }

      setGraphDraftFunctions((current) => current.map(applyReflection));
    },
    [
      boardObjects,
      graphFunctionsDraft,
      pushSelectedGraphFunctions,
      selectedObjectId,
    ]
  );

  const updateSelectedTextFormatting = useCallback(
    async (
      patch: Partial<WorkbookBoardObject>,
      metaPatch?: Partial<{
        textColor: string;
        textBackground: string;
        textFontFamily: string;
        textBold: boolean;
        textItalic: boolean;
        textUnderline: boolean;
        textAlign: "left" | "center" | "right";
      }>
    ) => {
      if (!selectedObjectId || !canSelect) return;
      const selectedTextObject =
        boardObjects.find((item) => item.id === selectedObjectId) ?? null;
      if (!selectedTextObject || selectedTextObject.type !== "text") return;
      await commitObjectUpdate(selectedTextObject.id, {
        ...patch,
        ...(metaPatch
          ? {
              meta: {
                ...(selectedTextObject.meta ?? {}),
                ...metaPatch,
              },
            }
          : {}),
      });
    },
    [boardObjects, canSelect, commitObjectUpdate, selectedObjectId]
  );

  const normalizeGraphExpressionDraft = useCallback(
    (id: string, rawExpression: string, selectedMode: boolean) => {
      const normalized = normalizeFunctionExpression(rawExpression);
      if (selectedMode) {
        setGraphFunctionsDraft((current) =>
          current.map((entry) =>
            entry.id === id ? { ...entry, expression: normalized } : entry
          )
        );
        return;
      }
      setGraphDraftFunctions((current) =>
        current.map((entry) =>
          entry.id === id ? { ...entry, expression: normalized } : entry
        )
      );
    },
    []
  );

  const commitSelectedGraphExpressions = useCallback(() => {
    const selectedGraphObject =
      selectedObjectId != null
        ? boardObjects.find((item) => item.id === selectedObjectId)
        : null;
    if (!selectedGraphObject || selectedGraphObject.type !== "function_graph") return;
    void commitSelectedFunctionGraphDraft(graphFunctionsDraft);
  }, [
    boardObjects,
    commitSelectedFunctionGraphDraft,
    graphFunctionsDraft,
    selectedObjectId,
  ]);

  const updateSelectedDividerMeta = useCallback(
    async (patch: Partial<{ lineStyle: "solid" | "dashed" }>) => {
      if (!selectedObjectId || !canSelect) return;
      const target = boardObjects.find((item) => item.id === selectedObjectId);
      if (!target || target.type !== "section_divider") return;
      await commitObjectUpdate(target.id, {
        meta: {
          ...(target.meta ?? {}),
          ...patch,
        },
      });
    },
    [boardObjects, canSelect, commitObjectUpdate, selectedObjectId]
  );

  const updateSelectedDividerObject = useCallback(
    async (patch: Partial<WorkbookBoardObject>) => {
      if (!selectedObjectId || !canSelect) return;
      const target = boardObjects.find((item) => item.id === selectedObjectId);
      if (!target || target.type !== "section_divider") return;
      await commitObjectUpdate(target.id, patch);
    },
    [boardObjects, canSelect, commitObjectUpdate, selectedObjectId]
  );

  const commitSelectedDividerWidth = useCallback(async () => {
    if (!selectedObjectId) return;
    const target = boardObjects.find((item) => item.id === selectedObjectId);
    if (!target || target.type !== "section_divider") return;
    const next = Math.max(1, Math.min(18, Math.round(dividerWidthDraft)));
    const current = target.strokeWidth ?? 2;
    if (Math.abs(next - current) < 0.01) return;
    await updateSelectedDividerObject({ strokeWidth: next });
  }, [boardObjects, dividerWidthDraft, selectedObjectId, updateSelectedDividerObject]);

  const renamePointObject = useCallback(
    async (objectId: string, label: string) => {
      const target = boardObjects.find((item) => item.id === objectId);
      if (!target || target.type !== "point") return;
      await commitObjectUpdate(objectId, {
        meta: {
          ...(target.meta ?? {}),
          label: label.trim().slice(0, 12),
        },
      });
    },
    [boardObjects, commitObjectUpdate]
  );

  const renameShape2dVertexByObjectId = useCallback(
    async (objectId: string, vertexIndex: number, label: string) => {
      const target = boardObjects.find((item) => item.id === objectId);
      if (!target || !is2dFigureObject(target)) return;
      const vertices = resolve2dFigureVertices(target);
      if (!vertices.length || vertexIndex < 0 || vertexIndex >= vertices.length) return;
      const raw = Array.isArray(target.meta?.vertexLabels) ? target.meta.vertexLabels : [];
      const next = vertices.map((_, index) => {
        const current = typeof raw[index] === "string" ? raw[index].trim() : "";
        return current || getFigureVertexLabel(index);
      });
      next[vertexIndex] = label.trim().slice(0, 12) || getFigureVertexLabel(vertexIndex);
      await commitObjectUpdate(target.id, {
        meta: {
          ...(target.meta ?? {}),
          vertexLabels: next,
        },
      });
    },
    [boardObjects, commitObjectUpdate]
  );

  const renameLineEndpointByObjectId = useCallback(
    async (objectId: string, endpoint: "start" | "end", label: string) => {
      const target = boardObjects.find((item) => item.id === objectId);
      if (!target || (target.type !== "line" && target.type !== "arrow")) return;
      if (target.meta?.lineKind !== "segment") return;
      const nextLabel = label.trim().slice(0, 12);
      await commitObjectUpdate(target.id, {
        meta: {
          ...(target.meta ?? {}),
          [endpoint === "start" ? "startLabel" : "endLabel"]: nextLabel,
        },
      });
    },
    [boardObjects, commitObjectUpdate]
  );

  const connectPointObjectsChronologically = useCallback(async () => {
    if (!sessionId || !canDraw) return;
    const points = boardObjects
      .filter((object): object is WorkbookBoardObject & { type: "point" } => object.type === "point")
      .slice()
      .sort((a, b) => {
        const left = Date.parse(a.createdAt);
        const right = Date.parse(b.createdAt);
        if (Number.isFinite(left) && Number.isFinite(right) && left !== right) return left - right;
        return a.id.localeCompare(b.id);
      });
    if (points.length < 2) {
      setError("Нужно минимум две точки, чтобы объединить их.");
      return;
    }

    const used = new Set<string>();
    const pointIds = new Set(points.map((point) => point.id));
    boardObjects.forEach((object) => {
      if (pointIds.has(object.id)) return;
      collectBoardObjectLabels(object).forEach((label) => used.add(label));
    });

    const labels = points.map((_, index) => getNextUniqueBoardLabel(used, index));
    const polylinePoints = points.map((point) => ({
      x: point.x + point.width / 2,
      y: point.y + point.height / 2,
    }));
    const bounds = getPointsBounds(polylinePoints);
    const createdAt = new Date().toISOString();
    const fallbackColor = "#4f63ff";
    const figureKind = classifyConnectedFigureKind(polylinePoints);
    const created: WorkbookBoardObject =
      polylinePoints.length === 2
        ? {
            id: generateId(),
            type: "line",
            layer: "board",
            x: polylinePoints[0].x,
            y: polylinePoints[0].y,
            width: polylinePoints[1].x - polylinePoints[0].x,
            height: polylinePoints[1].y - polylinePoints[0].y,
            color: fallbackColor,
            fill: "transparent",
            strokeWidth: 2,
            opacity: 1,
            authorUserId: user?.id ?? "unknown",
            createdAt,
            meta: {
              sceneLayerId: activeSceneLayerId,
              lineKind: "segment",
              lineStyle: "solid",
              startLabel: labels[0],
              endLabel: labels[1],
              figureKind: "segment",
            },
          }
        : {
            id: generateId(),
            type: "polygon",
            layer: "board",
            x: bounds.minX,
            y: bounds.minY,
            width: bounds.width,
            height: bounds.height,
            color: fallbackColor,
            fill: "transparent",
            strokeWidth: 2,
            opacity: 1,
            points: polylinePoints,
            sides: polylinePoints.length,
            authorUserId: user?.id ?? "unknown",
            createdAt,
            meta: {
              sceneLayerId: activeSceneLayerId,
              polygonMode: "points",
              polygonPreset: "regular",
              closed: true,
              figureKind,
              vertexLabels: labels,
              showAngles: false,
              vertexColors: Array.from({ length: polylinePoints.length }, () => fallbackColor),
              angleNotes: Array.from({ length: polylinePoints.length }, () => ""),
              angleColors: Array.from({ length: polylinePoints.length }, () => fallbackColor),
              segmentNotes: Array.from({ length: polylinePoints.length }, () => ""),
              segmentColors: Array.from({ length: polylinePoints.length }, () => fallbackColor),
            },
          };

    const deleteEvents = points.map((point) => ({
      type: "board.object.delete" as const,
      payload: { objectId: point.id },
    }));

    try {
      await appendEventsAndApply([
        {
          type: "board.object.create",
          payload: { object: created },
        },
        ...deleteEvents,
      ]);
      setSelectedObjectId(created.id);
    } catch {
      setError("Не удалось объединить точки.");
    }
  }, [activeSceneLayerId, appendEventsAndApply, boardObjects, canDraw, sessionId, user?.id]);

  const updateSelectedShape2dMeta = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!selectedObjectId || !canSelect) return;
      const target = boardObjects.find((item) => item.id === selectedObjectId);
      if (!target || !is2dFigureObject(target)) return;
      await commitObjectUpdate(target.id, {
        meta: {
          ...(target.meta ?? {}),
          ...patch,
        },
      });
    },
    [boardObjects, canSelect, commitObjectUpdate, selectedObjectId]
  );

  const renameSelectedShape2dVertex = useCallback(
    async (index: number, label: string) => {
      if (!selectedObjectId) return;
      const target = boardObjects.find((item) => item.id === selectedObjectId);
      if (!target || !is2dFigureObject(target)) return;
      const vertices = resolve2dFigureVertices(target);
      if (!vertices.length) return;
      const raw = Array.isArray(target.meta?.vertexLabels) ? target.meta.vertexLabels : [];
      const next = vertices.map((_, vertexIndex) => {
        const value = typeof raw[vertexIndex] === "string" ? raw[vertexIndex].trim() : "";
        return value || getFigureVertexLabel(vertexIndex);
      });
      next[index] = label.trim().slice(0, 12) || getFigureVertexLabel(index);
      await updateSelectedShape2dMeta({ vertexLabels: next });
    },
    [boardObjects, selectedObjectId, updateSelectedShape2dMeta]
  );

  const updateSelectedShape2dAngleNote = useCallback(
    async (index: number, value: string) => {
      if (!selectedObjectId) return;
      const target = boardObjects.find((item) => item.id === selectedObjectId);
      if (!target || !is2dFigureObject(target)) return;
      const vertices = resolve2dFigureVertices(target);
      if (!vertices.length) return;
      const raw = Array.isArray(target.meta?.angleNotes) ? target.meta.angleNotes : [];
      const next = vertices.map((_, itemIndex) =>
        typeof raw[itemIndex] === "string" ? raw[itemIndex] : ""
      );
      next[index] = value.slice(0, 24);
      await updateSelectedShape2dMeta({ angleNotes: next });
    },
    [boardObjects, selectedObjectId, updateSelectedShape2dMeta]
  );

  const updateSelectedShape2dSegmentNote = useCallback(
    async (index: number, value: string) => {
      if (!selectedObjectId) return;
      const target = boardObjects.find((item) => item.id === selectedObjectId);
      if (!target || !is2dFigureObject(target)) return;
      const vertices = resolve2dFigureVertices(target);
      if (vertices.length < 2) return;
      const closed = is2dFigureClosed(target);
      const segmentCount = closed ? vertices.length : Math.max(0, vertices.length - 1);
      const raw = Array.isArray(target.meta?.segmentNotes) ? target.meta.segmentNotes : [];
      const next = Array.from({ length: segmentCount }, (_, itemIndex) =>
        typeof raw[itemIndex] === "string" ? raw[itemIndex] : ""
      );
      next[index] = value.slice(0, 24);
      await updateSelectedShape2dMeta({ segmentNotes: next });
    },
    [boardObjects, selectedObjectId, updateSelectedShape2dMeta]
  );

  const updateSelectedShape2dVertexColor = useCallback(
    async (index: number, color: string) => {
      if (!selectedObjectId) return;
      const target = boardObjects.find((item) => item.id === selectedObjectId);
      if (!target || !is2dFigureObject(target)) return;
      const vertices = resolve2dFigureVertices(target);
      if (!vertices.length) return;
      const raw = Array.isArray(target.meta?.vertexColors) ? target.meta.vertexColors : [];
      const fallback = target.color || "#4f63ff";
      const next = vertices.map((_, itemIndex) =>
        typeof raw[itemIndex] === "string" && raw[itemIndex] ? raw[itemIndex] : fallback
      );
      next[index] = color || fallback;
      await updateSelectedShape2dMeta({ vertexColors: next });
    },
    [boardObjects, selectedObjectId, updateSelectedShape2dMeta]
  );

  const updateSelectedShape2dAngleColor = useCallback(
    async (index: number, color: string) => {
      if (!selectedObjectId) return;
      const target = boardObjects.find((item) => item.id === selectedObjectId);
      if (!target || !is2dFigureObject(target)) return;
      const vertices = resolve2dFigureVertices(target);
      if (!vertices.length) return;
      const raw = Array.isArray(target.meta?.angleColors) ? target.meta.angleColors : [];
      const fallback = target.color || "#4f63ff";
      const next = vertices.map((_, itemIndex) =>
        typeof raw[itemIndex] === "string" && raw[itemIndex] ? raw[itemIndex] : fallback
      );
      next[index] = color || fallback;
      await updateSelectedShape2dMeta({ angleColors: next });
    },
    [boardObjects, selectedObjectId, updateSelectedShape2dMeta]
  );

  const updateSelectedShape2dSegmentColor = useCallback(
    async (index: number, color: string) => {
      if (!selectedObjectId) return;
      const target = boardObjects.find((item) => item.id === selectedObjectId);
      if (!target || !is2dFigureObject(target)) return;
      const vertices = resolve2dFigureVertices(target);
      if (vertices.length < 2) return;
      const closed = is2dFigureClosed(target);
      const segmentCount = closed ? vertices.length : Math.max(0, vertices.length - 1);
      const raw = Array.isArray(target.meta?.segmentColors) ? target.meta.segmentColors : [];
      const fallback = target.color || "#4f63ff";
      const next = Array.from({ length: segmentCount }, (_, itemIndex) =>
        typeof raw[itemIndex] === "string" && raw[itemIndex] ? raw[itemIndex] : fallback
      );
      next[index] = color || fallback;
      await updateSelectedShape2dMeta({ segmentColors: next });
    },
    [boardObjects, selectedObjectId, updateSelectedShape2dMeta]
  );

  const updateSelectedSolid3dState = async (
    updater: (state: Solid3dState) => Solid3dState,
    objectIdOverride?: string
  ) => {
    if (!canSelect) return;
    const targetObjectId = objectIdOverride ?? selectedObjectId;
    if (!targetObjectId) return;
    const targetObject = boardObjects.find(
      (item): item is WorkbookBoardObject & { type: "solid3d" } =>
        item.id === targetObjectId && item.type === "solid3d"
    );
    if (!targetObject) return;
    const currentState = readSolid3dState(targetObject.meta);
    const nextState = updater(currentState);
    await commitObjectUpdate(targetObject.id, {
      meta: writeSolid3dState(nextState, targetObject.meta),
    });
  };

  const setSolid3dHiddenEdges = async (hidden: boolean) => {
    await updateSelectedSolid3dState((state) => {
      const current = new Set(state.hiddenFaceIds);
      if (hidden) {
        current.add("hidden_edges");
      } else {
        current.delete("hidden_edges");
      }
      return {
        ...state,
        hiddenFaceIds: [...current],
      };
    });
  };

  const setSolid3dFaceColor = async (faceIndex: number, color: string) => {
    if (!Number.isInteger(faceIndex) || faceIndex < 0) return;
    await updateSelectedSolid3dState((state) => ({
      ...state,
      faceColors: {
        ...(state.faceColors ?? {}),
        [String(faceIndex)]: color || "#5f6aa0",
      },
    }));
  };

  const resetSolid3dFaceColors = async () => {
    await updateSelectedSolid3dState((state) => ({
      ...state,
      faceColors: {},
    }));
  };

  const addSolid3dAngleMark = async () => {
    if (!selectedSolidMesh) return;
    const existing = selectedSolid3dState?.angleMarks ?? [];
    const used = new Set(existing.map((mark) => mark.vertexIndex));
    const vertexIndex = selectedSolidMesh.vertices.findIndex((_, index) => !used.has(index));
    if (vertexIndex < 0) {
      setError("Для этой фигуры уже добавлены все возможные пометки углов.");
      return;
    }
    await updateSelectedSolid3dState((state) => ({
      ...state,
      angleMarks: [
        ...(state.angleMarks ?? []),
        {
          id: generateId(),
          vertexIndex,
          label: "",
          color: "#ff8e3c",
          visible: true,
        },
      ],
    }));
  };

  const updateSolid3dAngleMark = async (
    markId: string,
    patch: Partial<{ vertexIndex: number; label: string; color: string; visible: boolean }>
  ) => {
    await updateSelectedSolid3dState((state) => ({
      ...state,
      angleMarks: (state.angleMarks ?? []).map((mark) =>
        mark.id === markId
          ? {
              ...mark,
              ...patch,
              label:
                typeof patch.label === "string"
                  ? patch.label.trim().slice(0, 64)
                  : mark.label,
            }
          : mark
      ),
    }));
  };

  const deleteSolid3dAngleMark = async (markId: string) => {
    await updateSelectedSolid3dState((state) => ({
      ...state,
      angleMarks: (state.angleMarks ?? []).filter((mark) => mark.id !== markId),
    }));
  };

  const getPointLimitForSolidObject = (object: WorkbookBoardObject) => {
    if (object.type !== "solid3d") return 8;
    const presetId =
      typeof object.meta?.presetId === "string" ? object.meta.presetId : "cube";
    const mesh = getSolid3dMesh(
      presetId,
      Math.max(1, Math.abs(object.width)),
      Math.max(1, Math.abs(object.height))
    );
    return getSolidSectionPointLimit(presetId, mesh);
  };

  const addDraftPointToSolid = (payload: { objectId: string; point: Solid3dSectionPoint }) => {
    const targetObject = boardObjects.find((item) => item.id === payload.objectId);
    if (!targetObject || targetObject.type !== "solid3d") return;
    if (solid3dSectionPointCollecting !== targetObject.id) return;
    const triangleIndices = payload.point.triangleVertexIndices ?? [];
    const barycentric = payload.point.barycentric ?? [];
    const hasEdgeOrVertexBarycentric =
      barycentric.length === 3 && barycentric.some((weight) => Math.abs(weight) <= 1e-4);
    const isSurfacePoint =
      Number.isInteger(payload.point.faceIndex) &&
      triangleIndices.length === 3 &&
      new Set(triangleIndices).size >= 1 &&
      hasEdgeOrVertexBarycentric;
    if (!isSurfacePoint) {
      setError("Точка должна лежать на ребре или вершине фигуры.");
      return;
    }
    const maxPoints = getPointLimitForSolidObject(targetObject);
    setSelectedObjectId(targetObject.id);
    setSolid3dDraftPoints((current) => {
      const sameObject = current?.objectId === targetObject.id;
      const base = sameObject ? current.points : [];
      const isDuplicate = base.some(
        (entry) =>
          Math.hypot(entry.x - payload.point.x, entry.y - payload.point.y, entry.z - payload.point.z) <
          1e-4
      );
      if (isDuplicate) return current ?? { objectId: targetObject.id, points: base };
      if (base.length >= maxPoints) return current ?? { objectId: targetObject.id, points: base };
      const nextIndex = base.length;
      const nextPoints = [
        ...base,
        {
          ...payload.point,
          label: payload.point.label || getSectionPointLabel(nextIndex),
        },
      ];
      return {
        objectId: targetObject.id,
        points: ensureUniqueSectionPointLabels(nextPoints),
      };
    });
  };

  const clearSolid3dDraftPoints = () => {
    if (solid3dSectionPointCollecting) {
      setSolid3dDraftPoints({
        objectId: solid3dSectionPointCollecting,
        points: [],
      });
      return;
    }
    setSolid3dDraftPoints(null);
  };

  const buildSectionFromDraftPoints = async () => {
    if (!solid3dDraftPoints || solid3dDraftPoints.points.length < 3) {
      setError("Для построения сечения нужно минимум 3 точки на ребрах/вершинах.");
      return;
    }
    const targetObject = boardObjects.find((item) => item.id === solid3dDraftPoints.objectId);
    if (!targetObject || targetObject.type !== "solid3d") {
      setError("Не удалось найти выбранную 3D-фигуру.");
      return;
    }
    const presetId =
      typeof targetObject.meta?.presetId === "string" ? targetObject.meta.presetId : "cube";
    const mesh = getSolid3dMesh(
      presetId,
      Math.max(1, Math.abs(targetObject.width)),
      Math.max(1, Math.abs(targetObject.height))
    );
    if (!mesh) {
      setError("Не удалось построить сечение для выбранной фигуры.");
      return;
    }
    const currentState = readSolid3dState(targetObject.meta);
    const maxPoints = getSolidSectionPointLimit(presetId, mesh);
    const tempSection: Solid3dSectionState = {
      id: generateId(),
      name: `Сечение ${Math.max(1, currentState.sections.length + 1)}`,
      visible: true,
      mode: "through_points",
      pointIndices: [],
      points: ensureUniqueSectionPointLabels(
        solid3dDraftPoints.points.slice(0, maxPoints)
      ),
      offset: 0,
      tiltX: 0,
      tiltY: 0,
      keepSide: "both",
      color: "#ff8e3c",
      thickness: 2,
      fillEnabled: true,
      fillOpacity: 0.18,
      showMetrics: false,
    };
    const polygon = computeSectionPolygon(mesh, tempSection).polygon;
    if (polygon.length < 3) {
      setError("По выбранным точкам не удалось построить корректное сечение.");
      return;
    }
    const nextSection: Solid3dSectionState = {
      ...tempSection,
      points: ensureUniqueSectionPointLabels(
        solid3dDraftPoints.points.slice(0, maxPoints)
      ),
    };
    const nextState: Solid3dState = {
      ...currentState,
      sections: [...currentState.sections, nextSection],
    };
    await commitObjectUpdate(targetObject.id, {
      meta: writeSolid3dState(nextState, targetObject.meta),
    });
    setSelectedObjectId(targetObject.id);
    setActiveSolidSectionId(nextSection.id);
    setSolid3dSectionPointCollecting(null);
    setSolid3dSectionPointTarget(null);
    setSolid3dDraftPoints(null);
  };

  const updateSolid3dSection = async (
    sectionId: string,
    patch: Partial<Solid3dSectionState>,
    objectIdOverride?: string
  ) => {
    const normalizedPatch: Partial<Solid3dSectionState> = { ...patch };
    if (Array.isArray(patch.points)) {
      normalizedPatch.points = ensureUniqueSectionPointLabels(patch.points);
    }
    await updateSelectedSolid3dState((state) => ({
      ...state,
      sections: state.sections.map((section) =>
        section.id === sectionId ? { ...section, ...normalizedPatch } : section
      ),
    }), objectIdOverride);
  };

  const deleteSolid3dSection = async (sectionId: string, objectIdOverride?: string) => {
    await updateSelectedSolid3dState((state) => ({
      ...state,
      sections: state.sections.filter((section) => section.id !== sectionId),
    }), objectIdOverride);
    if (activeSolidSectionId === sectionId) {
      const fallback =
        selectedSolid3dState?.sections.find((section) => section.id !== sectionId)?.id ?? null;
      setActiveSolidSectionId(fallback);
    }
    setSolid3dSectionPointTarget((current) =>
      current?.sectionId === sectionId ? null : current
    );
  };

  const startSolid3dSectionPointCollection = () => {
    if (!selectedObject || selectedObject.type !== "solid3d") {
      setError("Сначала выберите 3D-фигуру.");
      return;
    }
    setSolid3dInspectorTab("section");
    setTool("select");
    setSolid3dSectionPointCollecting(selectedObject.id);
    setSolid3dSectionPointTarget(null);
    setSolid3dDraftPoints({
      objectId: selectedObject.id,
      points: [],
    });
  };

  const handleSolid3dSectionPointPick = async (payload: {
    objectId: string;
    point: Solid3dSectionPoint;
    replaceIndex?: number;
    selectOnly?: boolean;
  }) => {
    if (!selectedObject || selectedObject.type !== "solid3d") return;
    if (selectedObject.id !== payload.objectId) return;
    if (!selectedActiveSection || !selectedSolid3dState) return;
    const triangleIndices = payload.point.triangleVertexIndices ?? [];
    const barycentric = payload.point.barycentric ?? [];
    const hasEdgeOrVertexBarycentric =
      barycentric.length === 3 && barycentric.some((weight) => Math.abs(weight) <= 1e-4);
    if (
      !Number.isInteger(payload.point.faceIndex) ||
      triangleIndices.length !== 3 ||
      !hasEdgeOrVertexBarycentric
    ) {
      return;
    }
    if (payload.selectOnly) {
      if (!Number.isInteger(payload.replaceIndex)) {
        setSolid3dSectionPointTarget(null);
        return;
      }
      const replaceIndex = Number(payload.replaceIndex);
      if (replaceIndex < 0 || replaceIndex >= selectedActiveSection.points.length) {
        setSolid3dSectionPointTarget(null);
        return;
      }
      setSolid3dSectionPointTarget({
        sectionId: selectedActiveSection.id,
        pointIndex: replaceIndex,
      });
      return;
    }
    const replaceIndex = Number.isInteger(payload.replaceIndex)
      ? Number(payload.replaceIndex)
      : solid3dSectionPointTarget &&
          solid3dSectionPointTarget.sectionId === selectedActiveSection.id
        ? solid3dSectionPointTarget.pointIndex
        : -1;
    if (replaceIndex < 0 || replaceIndex >= selectedActiveSection.points.length) return;

    const nextPoints = selectedActiveSection.points.map((point, index) =>
      index === replaceIndex
        ? {
            ...payload.point,
            label: point.label || getSectionPointLabel(index),
          }
        : point
    );

    if (selectedSolidMesh && nextPoints.length >= 3) {
      const candidatePolygon = computeSectionPolygon(selectedSolidMesh, {
        ...selectedActiveSection,
        mode: "through_points",
        pointIndices: [],
        points: nextPoints,
      }).polygon;
      if (candidatePolygon.length < 3) {
        setError("Точку нельзя установить в эту позицию: сечение не пересекает фигуру корректно.");
        return;
      }
    }

    await updateSolid3dSection(selectedActiveSection.id, {
      mode: "through_points",
      pointIndices: [],
      points: ensureUniqueSectionPointLabels(nextPoints),
    });
    setSolid3dSectionPointTarget(null);
  };

  const renameSolid3dSectionPoint = async (
    sectionId: string,
    pointIndex: number,
    label: string
  ) => {
    const normalized = label.trim().slice(0, 16);
    await updateSelectedSolid3dState((state) => ({
      ...state,
      sections: state.sections.map((section) => {
        if (section.id !== sectionId) return section;
        const updatedPoints = section.points.map((point, index) =>
          index === pointIndex
            ? {
                ...point,
                label: normalized || getSectionPointLabel(index),
              }
            : point
        );
        return {
          ...section,
          points: ensureUniqueSectionPointLabels(updatedPoints),
        };
      }),
    }));
  };

  const renameSolid3dVertex = async (vertexIndex: number, label: string) => {
    const normalized = label.trim().slice(0, 16);
    await updateSelectedSolid3dState((state) => {
      const current = Array.isArray(state.vertexLabels) ? state.vertexLabels : [];
      const nextLength = Math.max(current.length, vertexIndex + 1);
      const nextLabels = Array.from({ length: nextLength }, (_, index) =>
        current[index] ?? getSolidVertexLabel(index)
      );
      nextLabels[vertexIndex] = normalized || getSolidVertexLabel(vertexIndex);
      return {
        ...state,
        vertexLabels: nextLabels,
      };
    });
  };

  const createMathPresetObject = async (
    type: "coordinate_grid" | "solid3d" | "section3d" | "net3d",
    options?: { presetId?: string; presetTitle?: string }
  ) => {
    if (!canDraw) return;
    const solidPresetId = resolveSolid3dPresetId(options?.presetId ?? "cube");
    const defaultSolidWidth = 220;
    const defaultSolidHeight = 180;
    const initialSolidMesh =
      type === "solid3d"
        ? getSolid3dMesh(solidPresetId, defaultSolidWidth, defaultSolidHeight)
        : null;
    const initialSolidState =
      type === "solid3d"
        ? {
            ...DEFAULT_SOLID3D_STATE,
            vertexLabels: ROUND_SOLID_PRESETS.has(solidPresetId)
              ? []
              : Array.from(
                  { length: initialSolidMesh?.vertices.length ?? 0 },
                  (_, index) => getSolidVertexLabel(index)
                ),
          }
        : null;
    const objectMeta =
      type === "coordinate_grid"
        ? { step: boardSettings.gridSize }
        : type === "solid3d"
          ? {
              presetId: solidPresetId,
              presetTitle: options?.presetTitle ?? null,
              ...writeSolid3dState(initialSolidState ?? DEFAULT_SOLID3D_STATE, undefined),
            }
          : options?.presetId || options?.presetTitle
            ? {
                presetId: options?.presetId ?? null,
                presetTitle: options?.presetTitle ?? null,
              }
            : undefined;
    const object: WorkbookBoardObject = {
      id: generateId(),
      type,
      layer: "board",
      x: 110 + boardObjects.length * 6,
      y: 90 + boardObjects.length * 6,
      width: type === "coordinate_grid" ? 360 : defaultSolidWidth,
      height: type === "coordinate_grid" ? 240 : defaultSolidHeight,
      color:
        type === "section3d"
          ? "#ff8e3c"
          : type === "net3d"
            ? "#2a9d8f"
            : "#4f63ff",
      fill:
        type === "section3d"
          ? "rgba(255, 142, 60, 0.2)"
          : type === "net3d"
            ? "rgba(88, 209, 146, 0.14)"
            : "transparent",
      strokeWidth: 2,
      opacity: 1,
      text: type === "solid3d" ? undefined : options?.presetTitle,
      meta: objectMeta,
      authorUserId: user?.id ?? "unknown",
      createdAt: new Date().toISOString(),
    };
    await commitObjectCreate(object);
    suppressAutoPanelSelectionRef.current = object.id;
    setSelectedObjectId(object.id);
    setTool("select");
  };

  const createFunctionGraphPlane = useCallback(async () => {
    if (!canDraw) return;
    const graphPlaneCount = boardObjects.filter((item) => item.type === "function_graph").length;
    const object: WorkbookBoardObject = {
      id: generateId(),
      type: "function_graph",
      layer: "board",
      x: canvasViewport.x + 90 + (graphPlaneCount % 3) * 28,
      y: canvasViewport.y + 70 + (graphPlaneCount % 3) * 22,
      width: 460,
      height: 290,
      color: "#6b78bd",
      fill: "transparent",
      strokeWidth: 1.8,
      opacity: 1,
      meta: {
        functions: [],
        axisColor: "#ff8e3c",
        planeColor: "#8ea7ff",
      },
      authorUserId: user?.id ?? "unknown",
      createdAt: new Date().toISOString(),
    };
    await commitObjectCreate(object);
    suppressAutoPanelSelectionRef.current = object.id;
    setSelectedConstraintId(null);
    setSelectedObjectId(object.id);
    setGraphWorkbenchTab("catalog");
    setTool("select");
    setGraphDraftError(null);
  }, [
    boardObjects,
    canDraw,
    canvasViewport.x,
    canvasViewport.y,
    commitObjectCreate,
    user?.id,
  ]);

  const handleLaserPoint = useCallback(
    async (point: WorkbookPoint) => {
      if (!canUseLaser) return;
      try {
        await appendEventsAndApply([
          {
            type: "focus.point",
            payload: {
              target: "board",
              point,
              mode: "pin",
            },
          },
        ]);
      } catch {
        setError("Не удалось передать фокус.");
      }
    },
    [appendEventsAndApply, canUseLaser]
  );

  const clearLaserPointer = useCallback(async (options?: { keepTool?: boolean }) => {
    if (!canUseLaser) return;
    if (laserClearInFlightRef.current) return;
    laserClearInFlightRef.current = true;
    try {
      await appendEventsAndApply([
        {
          type: "focus.point",
          payload: {
            target: "board",
            mode: "clear",
          },
        },
      ]);
      if (!options?.keepTool) {
        setTool("select");
      }
    } catch {
      setError("Не удалось убрать указку.");
    } finally {
      laserClearInFlightRef.current = false;
    }
  }, [appendEventsAndApply, canUseLaser]);

  useEffect(() => {
    if (tool === "laser" || !pointerPoint) return;
    void clearLaserPointer({ keepTool: true });
  }, [clearLaserPointer, pointerPoint, tool]);

  useEffect(() => {
    if (tool !== "laser" || !pointerPoint) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      void clearLaserPointer();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearLaserPointer, pointerPoint, tool]);

  const handleUndo = useCallback(async () => {
    if (!canUseUndo || undoStackRef.current.length === 0) return;
    const previousSnapshot = undoStackRef.current[undoStackRef.current.length - 1];
    if (!previousSnapshot) return;
    const currentSnapshot = captureSceneSnapshot();
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current, currentSnapshot].slice(-80);
    setUndoDepth(undoStackRef.current.length);
    setRedoDepth(redoStackRef.current.length);
    restoreSceneSnapshot(previousSnapshot);
    markDirty();
    try {
      await appendEventsAndApply([
        {
          type: "board.undo",
          payload: {
            scene: toScenePayload(previousSnapshot),
          },
        },
      ]);
    } catch {
      setError("Не удалось выполнить отмену действия.");
    }
  }, [appendEventsAndApply, canUseUndo, captureSceneSnapshot, markDirty, restoreSceneSnapshot, toScenePayload]);

  const handleRedo = useCallback(async () => {
    if (!canUseUndo || redoStackRef.current.length === 0) return;
    const nextSnapshot = redoStackRef.current[redoStackRef.current.length - 1];
    if (!nextSnapshot) return;
    const currentSnapshot = captureSceneSnapshot();
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current, currentSnapshot].slice(-80);
    setUndoDepth(undoStackRef.current.length);
    setRedoDepth(redoStackRef.current.length);
    restoreSceneSnapshot(nextSnapshot);
    markDirty();
    try {
      await appendEventsAndApply([
        {
          type: "board.redo",
          payload: {
            scene: toScenePayload(nextSnapshot),
          },
        },
      ]);
    } catch {
      setError("Не удалось повторить действие.");
    }
  }, [appendEventsAndApply, canUseUndo, captureSceneSnapshot, markDirty, restoreSceneSnapshot, toScenePayload]);

  useEffect(() => {
    const onHotkey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget = Boolean(
        target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)
      );
      if (isTypingTarget) return;
      const withModifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (
        tool === "area_select" &&
        areaSelection &&
        areaSelection.objectIds.length > 0 &&
        (event.key === "Delete" || event.key === "Backspace")
      ) {
        event.preventDefault();
        void deleteAreaSelectionObjects();
        return;
      }

      if (tool === "area_select" && withModifier && key === "c") {
        event.preventDefault();
        copyAreaSelectionObjects();
        return;
      }

      if (tool === "area_select" && withModifier && key === "x") {
        event.preventDefault();
        void cutAreaSelectionObjects();
        return;
      }

      if (tool === "area_select" && withModifier && key === "v") {
        event.preventDefault();
        void pasteAreaSelectionObjects();
        return;
      }

      if (!withModifier) return;
      if (key !== "z" && key !== "y") return;
      event.preventDefault();
      if (key === "z" && event.shiftKey) {
        void handleRedo();
        return;
      }
      if (key === "z") {
        void handleUndo();
        return;
      }
      if (key === "y") {
        void handleRedo();
      }
    };
    window.addEventListener("keydown", onHotkey);
    return () => window.removeEventListener("keydown", onHotkey);
  }, [
    areaSelection,
    copyAreaSelectionObjects,
    cutAreaSelectionObjects,
    deleteAreaSelectionObjects,
    handleRedo,
    handleUndo,
    pasteAreaSelectionObjects,
    tool,
  ]);

  const handleObjectContextMenu = (objectId: string, anchor: { x: number; y: number }) => {
    setShapeVertexContextMenu(null);
    setLineEndpointContextMenu(null);
    setSolid3dVertexContextMenu(null);
    setSolid3dPointContextMenu(null);
    setSolid3dSectionContextMenu(null);
    setSelectedObjectId(objectId);
    setObjectContextMenu({ objectId, x: anchor.x, y: anchor.y });
  };

  const handleShapeVertexContextMenu = (payload: {
    objectId: string;
    vertexIndex: number;
    label: string;
    anchor: { x: number; y: number };
  }) => {
    setObjectContextMenu(null);
    setLineEndpointContextMenu(null);
    setSolid3dVertexContextMenu(null);
    setSolid3dPointContextMenu(null);
    setSolid3dSectionContextMenu(null);
    setSelectedObjectId(payload.objectId);
    setShapeVertexContextMenu({
      objectId: payload.objectId,
      vertexIndex: payload.vertexIndex,
      x: payload.anchor.x,
      y: payload.anchor.y,
      label: payload.label,
    });
  };

  const handleLineEndpointContextMenu = (payload: {
    objectId: string;
    endpoint: "start" | "end";
    label: string;
    anchor: { x: number; y: number };
  }) => {
    setObjectContextMenu(null);
    setShapeVertexContextMenu(null);
    setSolid3dVertexContextMenu(null);
    setSolid3dPointContextMenu(null);
    setSolid3dSectionContextMenu(null);
    setSelectedObjectId(payload.objectId);
    setLineEndpointContextMenu({
      objectId: payload.objectId,
      endpoint: payload.endpoint,
      x: payload.anchor.x,
      y: payload.anchor.y,
      label: payload.label,
    });
  };

  const handleSolid3dVertexContextMenu = (payload: {
    objectId: string;
    vertexIndex: number;
    anchor: { x: number; y: number };
  }) => {
    const targetObject = boardObjects.find(
      (item) => item.id === payload.objectId && item.type === "solid3d"
    );
    if (!targetObject) return;
    const targetState = readSolid3dState(targetObject.meta);
    const label =
      targetState.vertexLabels[payload.vertexIndex] || getSolidVertexLabel(payload.vertexIndex);
    setObjectContextMenu(null);
    setShapeVertexContextMenu(null);
    setLineEndpointContextMenu(null);
    setSolid3dPointContextMenu(null);
    setSolid3dSectionContextMenu(null);
    setSelectedObjectId(payload.objectId);
    setSolid3dVertexContextMenu({
      objectId: payload.objectId,
      vertexIndex: payload.vertexIndex,
      x: payload.anchor.x,
      y: payload.anchor.y,
      label,
    });
  };

  const handleSolid3dPointContextMenu = (payload: {
    objectId: string;
    sectionId: string;
    pointIndex: number;
    anchor: { x: number; y: number };
  }) => {
    const targetObject = boardObjects.find(
      (item) => item.id === payload.objectId && item.type === "solid3d"
    );
    if (!targetObject) return;
    const targetState = readSolid3dState(targetObject.meta);
    const section = targetState.sections.find((item) => item.id === payload.sectionId);
    if (!section) return;
    const label =
      section.points[payload.pointIndex]?.label || getSectionPointLabel(payload.pointIndex);
    setObjectContextMenu(null);
    setShapeVertexContextMenu(null);
    setLineEndpointContextMenu(null);
    setSolid3dVertexContextMenu(null);
    setSolid3dSectionContextMenu(null);
    setSelectedObjectId(payload.objectId);
    setActiveSolidSectionId(payload.sectionId);
    setSolid3dPointContextMenu({
      objectId: payload.objectId,
      sectionId: payload.sectionId,
      pointIndex: payload.pointIndex,
      x: payload.anchor.x,
      y: payload.anchor.y,
      label,
    });
  };

  const handleSolid3dSectionContextMenu = (payload: {
    objectId: string;
    sectionId: string;
    anchor: { x: number; y: number };
  }) => {
    const targetObject = boardObjects.find(
      (item) => item.id === payload.objectId && item.type === "solid3d"
    );
    if (!targetObject) return;
    const targetState = readSolid3dState(targetObject.meta);
    const section = targetState.sections.find((item) => item.id === payload.sectionId);
    if (!section) return;
    setObjectContextMenu(null);
    setShapeVertexContextMenu(null);
    setLineEndpointContextMenu(null);
    setSolid3dVertexContextMenu(null);
    setSolid3dPointContextMenu(null);
    setSelectedObjectId(payload.objectId);
    setActiveSolidSectionId(payload.sectionId);
    setSolid3dSectionContextMenu({
      objectId: payload.objectId,
      sectionId: payload.sectionId,
      x: payload.anchor.x,
      y: payload.anchor.y,
    });
  };

  const handleOpenInviteDialog = async () => {
    if (!canInvite) return;
    setIsInviteDialogOpen(true);
    setInviteSearch("");
    setLoadingInviteCandidates(true);
    try {
      const threads = await getTeacherChatThreads();
      setInviteCandidates(threads);
    } catch {
      setInviteCandidates([]);
      setError("Не удалось загрузить список студентов для приглашения.");
    } finally {
      setLoadingInviteCandidates(false);
    }
  };

  const handleSendInviteToStudent = async (thread: TeacherChatThread) => {
    if (!sessionId) return;
    setSendingInviteThreadId(thread.id);
    try {
      const invite = await createWorkbookInvite(sessionId);
      await sendTeacherChatMessage({
        threadId: thread.id,
        text: `Подключайтесь к коллективному уроку: ${invite.inviteUrl}`,
      });
      setIsInviteDialogOpen(false);
      setError(null);
    } catch {
      setError("Не удалось отправить приглашение студенту.");
    } finally {
      setSendingInviteThreadId(null);
    }
  };

  const updateParticipantPermissions = useCallback(
    async (
      targetUserId: string,
      patch: Partial<WorkbookSessionParticipant["permissions"]>
    ) => {
      if (!canManageSession) return;
      try {
        await appendEventsAndApply([
          {
            type: "permissions.update",
            payload: {
              userId: targetUserId,
              permissions: patch,
            },
          },
        ]);
      } catch {
        setError("Не удалось обновить права участника.");
      }
    },
    [appendEventsAndApply, canManageSession]
  );

  const handleToggleParticipantBoardTools = useCallback(
    async (participant: WorkbookSessionParticipant, enabled: boolean) => {
      if (participant.roleInSession !== "student") return;
      await updateParticipantPermissions(participant.userId, {
        canDraw: enabled,
        canAnnotate: enabled,
        canSelect: enabled,
        canDelete: enabled,
        canInsertImage: enabled,
        canClear: enabled,
        canExport: enabled,
        canUseLaser: enabled,
      });
    },
    [updateParticipantPermissions]
  );

  const handleToggleParticipantChat = useCallback(
    async (participant: WorkbookSessionParticipant, enabled: boolean) => {
      if (participant.roleInSession !== "student") return;
      await updateParticipantPermissions(participant.userId, { canUseChat: enabled });
    },
    [updateParticipantPermissions]
  );

  const handleToggleParticipantMic = useCallback(
    async (participant: WorkbookSessionParticipant, enabled: boolean) => {
      if (participant.roleInSession !== "student") return;
      await updateParticipantPermissions(participant.userId, { canUseMedia: enabled });
    },
    [updateParticipantPermissions]
  );

  const handleSendSessionChatMessage = useCallback(async () => {
    if (!sessionId || !user?.id || !canSendSessionChat) return;
    const text = sessionChatDraft.trim();
    if (!text) return;
    const authorName =
      actorParticipant?.displayName ||
      `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
      "Участник";
    const message: WorkbookChatMessage = {
      id: generateId(),
      authorUserId: user.id,
      authorName,
      text: text.slice(0, 1000),
      createdAt: new Date().toISOString(),
    };
    setChatMessages((current) =>
      current.some((item) => item.id === message.id) ? current : [...current, message]
    );
    setSessionChatDraft("");
    setIsSessionChatEmojiOpen(false);
    setIsSessionChatAtBottom(true);
    scrollSessionChatToLatest("smooth");
    markSessionChatReadToLatest();
    try {
      await appendEventsAndApply([
        {
          type: "chat.message",
          payload: { message },
        },
      ]);
    } catch {
      setChatMessages((current) =>
        current.filter((item) => item.id !== message.id)
      );
      setSessionChatDraft(text);
      setError("Не удалось отправить сообщение в чат.");
    }
  }, [
    actorParticipant?.displayName,
    appendEventsAndApply,
    canSendSessionChat,
    markSessionChatReadToLatest,
    scrollSessionChatToLatest,
    sessionChatDraft,
    sessionId,
    user?.firstName,
    user?.id,
    user?.lastName,
  ]);

  const handleSessionChatDragStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (isSessionChatMinimized || isSessionChatMaximized) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button")) return;
      const panel = sessionChatRef.current;
      if (!panel) return;
      const offsetX = event.clientX - panel.getBoundingClientRect().left;
      const offsetY = event.clientY - panel.getBoundingClientRect().top;
      sessionChatDragStateRef.current = {
        pointerId: event.pointerId,
        offsetX,
        offsetY,
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [isSessionChatMaximized, isSessionChatMinimized]
  );

  const handleFinishSession = async () => {
    if (!sessionId || !canManageSession) return;
    try {
      const response = await endWorkbookSession(sessionId);
      setSession(response.session);
      setChatMessages([]);
      setIsSessionChatOpen(false);
      setIsSessionChatEmojiOpen(false);
      setSessionChatDraft("");
      persistSessionChatReadAt(null);
      setSessionChatReadAt(null);
      await Promise.all([
        saveWorkbookSnapshot({
          sessionId,
          layer: "board",
          version: latestSeq,
          payload: encodeScenePayload({
            strokes: boardStrokes,
            objects: boardObjects,
            constraints,
            chat: [],
            comments,
            timer: timerState,
            boardSettings,
            library: libraryState,
            document: documentState,
          }),
        }),
        saveWorkbookSnapshot({
          sessionId,
          layer: "annotations",
          version: latestSeq,
          payload: encodeScenePayload({
            strokes: annotationStrokes,
            chat: [],
          }),
        }),
      ]);
      dirtyRef.current = false;
      setSaveState("saved");
      setLastSavedAt(new Date().toISOString());
    } catch {
      setError("Не удалось завершить сессию.");
    }
  };

  const updateDocumentState = async (patch: Partial<WorkbookDocumentState>) => {
    try {
      await appendEventsAndApply([
        {
          type: "document.state.update",
          payload: patch,
        },
      ]);
    } catch {
      setError("Не удалось обновить окно документов.");
    }
  };

  const handleDocsUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !canInsertImage) return;
    event.target.value = "";
    try {
      setUploadingDoc(true);
      setUploadProgress(20);
      const url = await readFileAsDataUrl(file);
      let renderedPages: WorkbookDocumentAsset["renderedPages"] = undefined;
      const isPdf =
        file.type.includes("pdf") || file.name.toLowerCase().endsWith(".pdf");
      const isImage =
        file.type.includes("image") ||
        /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(file.name);
      if (!isPdf && !isImage) {
        setError("Можно загрузить только PDF или изображение.");
        return;
      }
      if (isPdf) {
        setUploadProgress(45);
        const rendered = await renderWorkbookPdfPages({
          fileName: file.name,
          dataUrl: url,
          dpi: 144,
          maxPages: 12,
        });
        renderedPages = rendered.pages;
      }
      setUploadProgress(100);
      const asset: WorkbookDocumentAsset = {
        id: generateId(),
        name: file.name,
        type: isPdf ? "pdf" : isImage ? "image" : "file",
        url,
        uploadedBy: user?.id ?? "unknown",
        uploadedAt: new Date().toISOString(),
        renderedPages,
      };
      await appendEventsAndApply([
        {
          type: "document.asset.add",
          payload: { asset },
        },
      ]);
      await upsertLibraryItem({
        id: generateId(),
        name: file.name,
        type: isPdf ? "pdf" : isImage ? "image" : "office",
        ownerUserId: user?.id ?? "unknown",
        sourceUrl: url,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        folderId: null,
      });
      await updateDocumentState({
        activeAssetId: asset.id,
        page: 1,
      });
      const insertOffset = boardObjects.length % 6;
      const renderedPage =
        asset.type === "pdf"
          ? asset.renderedPages?.find((page) => page.page === 1) ?? asset.renderedPages?.[0]
          : null;
      const object: WorkbookBoardObject = {
        id: generateId(),
        type: asset.type === "image" || renderedPage ? "image" : "text",
        layer: "board",
        x: canvasViewport.x + 96 + insertOffset * 20,
        y: canvasViewport.y + 92 + insertOffset * 16,
        width: asset.type === "image" || renderedPage ? 380 : 320,
        height: asset.type === "image" || renderedPage ? 260 : 120,
        color: "#16213e",
        fill: "transparent",
        strokeWidth: 2,
        opacity: 1,
        imageUrl:
          asset.type === "image"
            ? asset.url
            : renderedPage
              ? renderedPage.imageUrl
              : undefined,
        imageName: asset.name,
        text: renderedPage ? undefined : `PDF: ${asset.name}`,
        fontSize: renderedPage ? undefined : 18,
        authorUserId: user?.id ?? "unknown",
        createdAt: new Date().toISOString(),
      };
      await commitObjectCreate(object);
    } catch {
      setError("Не удалось загрузить документ.");
    } finally {
      setUploadingDoc(false);
      setUploadProgress(0);
    }
  };

  const handleDocumentSnapshotToBoard = async () => {
    const active = documentState.assets.find(
      (asset) => asset.id === documentState.activeAssetId
    );
    if (!active) return;
    const insertOffset = boardObjects.length % 6;
    const renderedPage =
      active.type === "pdf"
        ? active.renderedPages?.find((page) => page.page === documentState.page) ??
          active.renderedPages?.[0]
        : null;
    const object: WorkbookBoardObject = {
      id: generateId(),
      type: active.type === "image" || renderedPage ? "image" : "text",
      layer: "board",
      x: canvasViewport.x + 96 + insertOffset * 20,
      y: canvasViewport.y + 92 + insertOffset * 16,
      width: 320,
      height: 220,
      color: "#16213e",
      fill: "transparent",
      strokeWidth: 2,
      opacity: 1,
      imageUrl:
        active.type === "image"
          ? active.url
          : renderedPage
            ? renderedPage.imageUrl
            : undefined,
      imageName: active.name,
      text:
        active.type === "pdf"
          ? `PDF: ${active.name}`
          : active.type === "file"
            ? `Файл: ${active.name}`
            : undefined,
      fontSize: active.type === "pdf" || active.type === "file" ? 18 : undefined,
      authorUserId: user?.id ?? "unknown",
      createdAt: new Date().toISOString(),
    };
    await commitObjectCreate(object);
  };

  const handleAddDocumentAnnotation = async () => {
    if (!documentState.activeAssetId) return;
    try {
      await appendEventsAndApply([
        {
          type: "document.annotation.add",
          payload: {
            annotation: {
              id: generateId(),
              page: documentState.page,
              color: "#ff8e3c",
              width: 3,
              points: [
                { x: 24, y: 24 },
                { x: 190, y: 24 },
              ],
              authorUserId: user?.id ?? "unknown",
              createdAt: new Date().toISOString(),
            },
          },
        },
      ]);
    } catch {
      setError("Не удалось добавить пометку.");
    }
  };

  const handleClearDocumentAnnotations = async () => {
    try {
      await appendEventsAndApply([{ type: "document.annotation.clear", payload: {} }]);
    } catch {
      setError("Не удалось очистить пометки документа.");
    }
  };

  const renderBoardToCanvas = async (scale = 2) => {
    const svg = document.querySelector<SVGSVGElement>(".workbook-session__canvas-svg");
    if (!svg) return null;
    const serialized = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const next = new Image();
        next.onload = () => resolve(next);
        next.onerror = () => reject(new Error("image_load_failed"));
        next.src = url;
      });
      const width = Math.max(1, svg.viewBox.baseVal.width || 1600);
      const height = Math.max(1, svg.viewBox.baseVal.height || 900);
      const safeScale = Math.max(1, Math.min(4, scale));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * safeScale);
      canvas.height = Math.round(height * safeScale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.save();
      ctx.scale(safeScale, safeScale);
      ctx.fillStyle = boardSettings.backgroundColor || "#f5f7ff";
      ctx.fillRect(0, 0, width, height);
      if (boardSettings.showGrid) {
        const gridStep = Math.max(8, Math.min(96, Math.floor(boardSettings.gridSize || 22)));
        ctx.strokeStyle = boardSettings.gridColor || "rgba(92, 129, 192, 0.32)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= width; x += gridStep) {
          const crispX = Math.round(x) + 0.5;
          ctx.moveTo(crispX, 0);
          ctx.lineTo(crispX, height);
        }
        for (let y = 0; y <= height; y += gridStep) {
          const crispY = Math.round(y) + 0.5;
          ctx.moveTo(0, crispY);
          ctx.lineTo(width, crispY);
        }
        ctx.stroke();
      }
      ctx.drawImage(image, 0, 0, width, height);
      ctx.restore();
      return { canvas, width, height };
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const exportBoardAsPng = async () => {
    try {
      const rendered = await renderBoardToCanvas(2.2);
      if (!rendered) return;
      const png = rendered.canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = png;
      link.download = `workbook-${sessionId || "session"}.png`;
      link.click();
    } catch {
      setError("Не удалось экспортировать PNG.");
    }
  };

  const exportBoardAsPdf = async () => {
    if (exportingSections) return;
    setExportingSections(true);
    try {
      const rendered = await renderBoardToCanvas(2);
      if (!rendered) return;
      const width = Math.max(1, Math.round(rendered.width));
      const height = Math.max(1, Math.round(rendered.height));
      const pdf = new jsPDF({
        orientation: width >= height ? "landscape" : "portrait",
        unit: "px",
        format: [width, height],
      });
      const dataUrl = rendered.canvas.toDataURL("image/png");
      pdf.addImage(dataUrl, "PNG", 0, 0, width, height);
      pdf.save(`workbook-${sessionId || "session"}.pdf`);
    } catch {
      setError("Не удалось экспортировать PDF.");
    } finally {
      setExportingSections(false);
    }
  };

  const handleLoadBoardFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as unknown;
      const normalized = normalizeScenePayload(parsed);
      setBoardStrokes(normalized.strokes.filter((stroke) => stroke.layer === "board"));
      setBoardObjects(normalized.objects);
      setConstraints(normalized.constraints);
      setChatMessages(normalized.chat);
      setComments(normalized.comments);
      setTimerState(normalized.timer);
      setBoardSettings(() => {
        const normalizedLayers = normalizeSceneLayersForBoard(
          normalized.boardSettings.sceneLayers,
          normalized.boardSettings.activeSceneLayerId
        );
        return {
          ...DEFAULT_BOARD_SETTINGS,
          ...normalized.boardSettings,
          ...normalizedLayers,
        };
      });
      setLibraryState({
        ...DEFAULT_LIBRARY,
        ...normalized.library,
      });
      setDocumentState(normalized.document);
      await persistSnapshots();
    } catch {
      setError("Не удалось открыть файл рабочей тетради.");
    }
  };

  const toolButtons: Array<{ tool: WorkbookTool; label: string; icon: ReactNode }> = [
    { tool: "select", label: "Выбор", icon: <AdsClickRoundedIcon /> },
    { tool: "pan", label: "Рука", icon: <PanToolRoundedIcon /> },
    { tool: "pen", label: "Ручка", icon: <CreateRoundedIcon /> },
    { tool: "highlighter", label: "Маркер", icon: <BorderColorRoundedIcon /> },
    { tool: "line", label: "Линия", icon: <HorizontalRuleRoundedIcon /> },
    { tool: "function_graph", label: "График функции", icon: <ShowChartRoundedIcon /> },
    { tool: "point", label: "Точка", icon: <FiberManualRecordRoundedIcon /> },
    { tool: "area_select", label: "Ножницы", icon: <ContentCutRoundedIcon /> },
    { tool: "text", label: "Текст", icon: <TextFieldsRoundedIcon /> },
    { tool: "divider", label: "Разделитель", icon: <DragHandleRoundedIcon /> },
    { tool: "laser", label: "Указка (Esc/ПКМ убрать)", icon: <MyLocationRoundedIcon /> },
    { tool: "sticker", label: "Стикер", icon: <StickyNote2RoundedIcon /> },
    { tool: "sweep", label: "Метёлка", icon: <DeleteSweepRoundedIcon /> },
  ];
  const pointToolIndex = toolButtons.findIndex((item) => item.tool === "point");
  const toolButtonsBeforeCatalog =
    pointToolIndex >= 0 ? toolButtons.slice(0, pointToolIndex + 1) : toolButtons;
  const toolButtonsAfterCatalog =
    pointToolIndex >= 0 ? toolButtons.slice(pointToolIndex + 1) : [];
  const renderToolButton = (item: {
    tool: WorkbookTool;
    label: string;
    icon: ReactNode;
  }) => {
    const isActive = tool === item.tool;
    const isDisabled =
      (item.tool === "select" && !canSelect) ||
      (item.tool === "area_select" && !canSelect) ||
      (item.tool === "sweep" && !canDelete) ||
      (item.tool === "laser" && !canUseLaser) ||
      (!canDraw &&
        item.tool !== "select" &&
        item.tool !== "area_select" &&
        item.tool !== "pan" &&
        item.tool !== "laser" &&
        item.tool !== "sweep");
    return (
      <Tooltip key={item.tool} title={item.label} placement="left" arrow>
        <span>
          <button
            type="button"
            className={`workbook-session__tool-btn ${isActive ? "is-active" : ""}`}
            disabled={isDisabled}
            onClick={() => {
              if (item.tool === "function_graph") {
                void createFunctionGraphPlane();
                return;
              }
              if (
                (item.tool === "sweep" && tool === "sweep") ||
                (item.tool === "area_select" && tool === "area_select")
              ) {
                setTool("select");
                setStrokeWidth(getDefaultToolWidth("select"));
                return;
              }
              setTool(item.tool);
              setStrokeWidth(getDefaultToolWidth(item.tool));
            }}
            aria-label={item.label}
            title={item.label}
          >
            {item.icon}
          </button>
        </span>
      </Tooltip>
    );
  };

  const shapeCatalog: Array<{
    id: string;
    title: string;
    subtitle: string;
    icon: ReactNode;
    tool: WorkbookTool;
    apply: () => void;
  }> = [
    {
      id: "rectangle",
      title: "Прямоугольник",
      subtitle: "4 стороны",
      icon: <ShapeCatalogPreview variant="rectangle" />,
      tool: "rectangle",
      apply: () => setTool("rectangle"),
    },
    {
      id: "ellipse",
      title: "Эллипс",
      subtitle: "Окружность / овал",
      icon: <ShapeCatalogPreview variant="ellipse" />,
      tool: "ellipse",
      apply: () => setTool("ellipse"),
    },
    {
      id: "triangle",
      title: "Треугольник",
      subtitle: "3 стороны",
      icon: <ShapeCatalogPreview variant="polygon" sides={3} />,
      tool: "triangle",
      apply: () => setTool("triangle"),
    },
    {
      id: "trapezoid",
      title: "Трапеция",
      subtitle: "4 стороны",
      icon: <ShapeCatalogPreview variant="trapezoid" />,
      tool: "polygon",
      apply: () => {
        setPolygonMode("regular");
        setPolygonPreset("trapezoid");
        setPolygonSides(4);
        setTool("polygon");
      },
    },
    {
      id: "trapezoid-right",
      title: "Прямоугольная трапеция",
      subtitle: "Прямой угол",
      icon: <ShapeCatalogPreview variant="trapezoid_right" />,
      tool: "polygon",
      apply: () => {
        setPolygonMode("regular");
        setPolygonPreset("trapezoid_right");
        setPolygonSides(4);
        setTool("polygon");
      },
    },
    {
      id: "trapezoid-scalene",
      title: "Неравнобедренная трапеция",
      subtitle: "Разные боковые стороны",
      icon: <ShapeCatalogPreview variant="trapezoid_scalene" />,
      tool: "polygon",
      apply: () => {
        setPolygonMode("regular");
        setPolygonPreset("trapezoid_scalene");
        setPolygonSides(4);
        setTool("polygon");
      },
    },
    {
      id: "rhombus",
      title: "Ромб",
      subtitle: "Равные стороны",
      icon: <ShapeCatalogPreview variant="rhombus" />,
      tool: "polygon",
      apply: () => {
        setPolygonMode("regular");
        setPolygonPreset("rhombus");
        setPolygonSides(4);
        setTool("polygon");
      },
    },
    {
      id: "polygon-points",
      title: "Многоугольник по точкам",
      subtitle: "Произвольная форма",
      icon: <ShapeCatalogPreview variant="polyline" />,
      tool: "polygon",
      apply: () => {
        setPolygonMode("points");
        setPolygonPreset("regular");
        setTool("polygon");
      },
    },
    {
      id: "polygon-4",
      title: "Квадрат",
      subtitle: "Регулярный 4-угольник",
      icon: <ShapeCatalogPreview variant="polygon" sides={4} />,
      tool: "polygon",
      apply: () => {
        setPolygonMode("regular");
        setPolygonPreset("regular");
        setPolygonSides(4);
        setTool("polygon");
      },
    },
    {
      id: "polygon-5",
      title: "Пятиугольник",
      subtitle: "Регулярный 5-угольник",
      icon: <ShapeCatalogPreview variant="polygon" sides={5} />,
      tool: "polygon",
      apply: () => {
        setPolygonMode("regular");
        setPolygonPreset("regular");
        setPolygonSides(5);
        setTool("polygon");
      },
    },
    {
      id: "polygon-6",
      title: "Шестиугольник",
      subtitle: "Регулярный 6-угольник",
      icon: <ShapeCatalogPreview variant="polygon" sides={6} />,
      tool: "polygon",
      apply: () => {
        setPolygonMode("regular");
        setPolygonPreset("regular");
        setPolygonSides(6);
        setTool("polygon");
      },
    },
  ];

  const hotkeysTooltipContent = (
    <div className="workbook-session__hotkeys-tooltip">
      <strong>Горячие клавиши</strong>
      <ul>
        <li>`Ctrl/Cmd + Z` — отмена действия</li>
        <li>`Ctrl/Cmd + Shift + Z` — повтор действия</li>
        <li>`Del / Backspace` — удалить выбранный объект</li>
        <li>`Shift + Click` — мультивыбор</li>
        <li>`Ctrl/Cmd + C` — копировать выделенную область (Ножницы)</li>
        <li>`Ctrl/Cmd + V` — вставить выделенную область (Ножницы)</li>
        <li>`Ctrl/Cmd + X` — вырезать выделенную область (Ножницы)</li>
        <li>`Space` — временная рука (pan)</li>
        <li>`Esc` — убрать указку (в режиме указки)</li>
        <li>`Enter` — завершить многоугольник по точкам</li>
        <li>`Esc` — отменить многоугольник по точкам</li>
      </ul>
    </div>
  );

  const selectedObject = useMemo(
    () => boardObjects.find((item) => item.id === selectedObjectId) ?? null,
    [boardObjects, selectedObjectId]
  );
  const handleCanvasSelectedObjectChange = useCallback(
    (nextObjectId: string | null) => {
      const suppressedObjectId = suppressAutoPanelSelectionRef.current;
      setSelectedObjectId(nextObjectId);
      if (!nextObjectId) return;
      if (suppressedObjectId === nextObjectId) {
        suppressAutoPanelSelectionRef.current = null;
        return;
      }
      const target = boardObjects.find((item) => item.id === nextObjectId);
      openUtilityPanel(target?.type === "function_graph" ? "graph" : "transform", {
        toggle: false,
      });
    },
    [boardObjects, openUtilityPanel]
  );

  const handleCanvasObjectCreate = useCallback(
    (object: WorkbookBoardObject) => {
      suppressAutoPanelSelectionRef.current = object.id;
      void commitObjectCreate(object);
    },
    [commitObjectCreate]
  );

  useEffect(() => {
    if (tool === "area_select") return;
    setAreaSelection(null);
    setAreaSelectionContextMenu(null);
  }, [tool]);

  const selectedObjectLabel = useMemo(() => {
    if (!selectedObject) return "Объект не выбран";
    return getWorkbookObjectTypeLabel(selectedObject);
  }, [selectedObject]);
  const selectedObjectShowLabels = useMemo(
    () => (selectedObject ? selectedObject.meta?.showLabels !== false : true),
    [selectedObject]
  );
  const selectedObjectSceneLayerId = useMemo(
    () => (selectedObject ? getObjectSceneLayerId(selectedObject) : MAIN_SCENE_LAYER_ID),
    [getObjectSceneLayerId, selectedObject]
  );
  const selectedShape2dObject = useMemo(
    () => (is2dFigureObject(selectedObject) ? selectedObject : null),
    [selectedObject]
  );
  const selectedShape2dVertices = useMemo(
    () => (selectedShape2dObject ? resolve2dFigureVertices(selectedShape2dObject) : []),
    [selectedShape2dObject]
  );
  const selectedShape2dLabels = useMemo(() => {
    if (!selectedShape2dObject) return [] as string[];
    const raw = Array.isArray(selectedShape2dObject.meta?.vertexLabels)
      ? selectedShape2dObject.meta.vertexLabels
      : [];
    return selectedShape2dVertices.map((_, index) => {
      const value = typeof raw[index] === "string" ? raw[index].trim() : "";
      return value || getFigureVertexLabel(index);
    });
  }, [selectedShape2dObject, selectedShape2dVertices]);
  const selectedShape2dSegments = useMemo(() => {
    if (!selectedShape2dLabels.length) return [] as string[];
    if (!selectedShape2dObject) return [] as string[];
    const closed = is2dFigureClosed(selectedShape2dObject);
    const segmentCount = closed
      ? selectedShape2dLabels.length
      : Math.max(0, selectedShape2dLabels.length - 1);
    return Array.from({ length: segmentCount }, (_, index) => {
      const start = selectedShape2dLabels[index];
      const end = selectedShape2dLabels[(index + 1) % selectedShape2dLabels.length];
      return `${start}-${end}`;
    });
  }, [selectedShape2dLabels, selectedShape2dObject]);
  const selectedShape2dAngleNotes = useMemo(() => {
    if (!selectedShape2dObject) return [] as string[];
    const raw = Array.isArray(selectedShape2dObject.meta?.angleNotes)
      ? selectedShape2dObject.meta.angleNotes
      : [];
    return selectedShape2dLabels.map((_, index) =>
      typeof raw[index] === "string" ? raw[index] : ""
    );
  }, [selectedShape2dLabels, selectedShape2dObject]);
  const selectedShape2dSegmentNotes = useMemo(() => {
    if (!selectedShape2dObject) return [] as string[];
    const raw = Array.isArray(selectedShape2dObject.meta?.segmentNotes)
      ? selectedShape2dObject.meta.segmentNotes
      : [];
    return selectedShape2dSegments.map((_, index) =>
      typeof raw[index] === "string" ? raw[index] : ""
    );
  }, [selectedShape2dObject, selectedShape2dSegments]);
  const selectedShape2dShowAngles = useMemo(
    () => Boolean(selectedShape2dObject?.meta?.showAngles),
    [selectedShape2dObject]
  );
  const selectedShape2dHasAngles = useMemo(
    () =>
      Boolean(
        selectedShape2dObject &&
          is2dFigureClosed(selectedShape2dObject) &&
          selectedShape2dVertices.length >= 3
      ),
    [selectedShape2dObject, selectedShape2dVertices.length]
  );
  const selectedShape2dVertexColors = useMemo(() => {
    if (!selectedShape2dObject) return [] as string[];
    const raw = Array.isArray(selectedShape2dObject.meta?.vertexColors)
      ? selectedShape2dObject.meta.vertexColors
      : [];
    const fallback = selectedShape2dObject.color || "#4f63ff";
    return selectedShape2dLabels.map((_, index) =>
      typeof raw[index] === "string" && raw[index] ? raw[index] : fallback
    );
  }, [selectedShape2dLabels, selectedShape2dObject]);
  const selectedShape2dAngleColors = useMemo(() => {
    if (!selectedShape2dObject) return [] as string[];
    const raw = Array.isArray(selectedShape2dObject.meta?.angleColors)
      ? selectedShape2dObject.meta.angleColors
      : [];
    const fallback = selectedShape2dObject.color || "#4f63ff";
    return selectedShape2dLabels.map((_, index) =>
      typeof raw[index] === "string" && raw[index] ? raw[index] : fallback
    );
  }, [selectedShape2dLabels, selectedShape2dObject]);
  const selectedShape2dSegmentColors = useMemo(() => {
    if (!selectedShape2dObject) return [] as string[];
    const raw = Array.isArray(selectedShape2dObject.meta?.segmentColors)
      ? selectedShape2dObject.meta.segmentColors
      : [];
    const fallback = selectedShape2dObject.color || "#4f63ff";
    return selectedShape2dSegments.map((_, index) =>
      typeof raw[index] === "string" && raw[index] ? raw[index] : fallback
    );
  }, [selectedShape2dObject, selectedShape2dSegments]);
  const selectedLineObject = useMemo(
    () =>
      selectedObject &&
      (selectedObject.type === "line" || selectedObject.type === "arrow")
        ? selectedObject
        : null,
    [selectedObject]
  );
  const selectedFunctionGraphObject = useMemo(
    () => (selectedObject?.type === "function_graph" ? selectedObject : null),
    [selectedObject]
  );
  const selectedDividerObject = useMemo(
    () => (selectedObject?.type === "section_divider" ? selectedObject : null),
    [selectedObject]
  );
  const selectedPointObject = useMemo(
    () => (selectedObject?.type === "point" ? selectedObject : null),
    [selectedObject]
  );
  const selectedTextObject = useMemo(
    () => (selectedObject?.type === "text" ? selectedObject : null),
    [selectedObject]
  );
  const selectedLineStyle = useMemo(
    () =>
      selectedLineObject?.meta?.lineStyle === "dashed" ? "dashed" : "solid",
    [selectedLineObject?.meta?.lineStyle]
  );
  const selectedLineKind = useMemo(
    () =>
      selectedLineObject?.meta?.lineKind === "segment" ? "segment" : "line",
    [selectedLineObject?.meta?.lineKind]
  );
  const canToggleSelectedObjectLabels = useMemo(() => {
    if (!selectedObject) return false;
    if (
      (selectedObject.type === "line" || selectedObject.type === "arrow") &&
      selectedObject.meta?.lineKind !== "segment"
    ) {
      return false;
    }
    return true;
  }, [selectedObject]);
  const selectedLineColor = useMemo(
    () => selectedLineObject?.color || "#4f63ff",
    [selectedLineObject?.color]
  );
  const selectedLineStrokeWidth = useMemo(
    () => selectedLineObject?.strokeWidth ?? 3,
    [selectedLineObject?.strokeWidth]
  );
  const selectedDividerStyle = useMemo(
    () => (selectedDividerObject?.meta?.lineStyle === "solid" ? "solid" : "dashed"),
    [selectedDividerObject?.meta?.lineStyle]
  );
  const selectedDividerColor = useMemo(
    () => selectedDividerObject?.color || "#4f63ff",
    [selectedDividerObject?.color]
  );
  const selectedDividerStrokeWidth = useMemo(
    () => selectedDividerObject?.strokeWidth ?? 2,
    [selectedDividerObject?.strokeWidth]
  );
  const selectedLineStartLabel = useMemo(
    () =>
      typeof selectedLineObject?.meta?.startLabel === "string"
        ? selectedLineObject.meta.startLabel
        : "",
    [selectedLineObject]
  );
  const selectedLineEndLabel = useMemo(
    () =>
      typeof selectedLineObject?.meta?.endLabel === "string"
        ? selectedLineObject.meta.endLabel
        : "",
    [selectedLineObject]
  );
  const selectedFunctionGraphFunctions = useMemo(
    () =>
      selectedFunctionGraphObject
        ? resolveGraphFunctionsFromObject(selectedFunctionGraphObject)
        : ([] as GraphFunctionDraft[]),
    [selectedFunctionGraphObject]
  );
  const selectedFunctionGraphAxisColor = useMemo(() => {
    const raw = selectedFunctionGraphObject?.meta?.axisColor;
    return typeof raw === "string" && raw.startsWith("#") ? raw : "#ff8e3c";
  }, [selectedFunctionGraphObject]);
  const selectedFunctionGraphPlaneColor = useMemo(() => {
    const raw = selectedFunctionGraphObject?.meta?.planeColor;
    return typeof raw === "string" && raw.startsWith("#") ? raw : "#8ea7ff";
  }, [selectedFunctionGraphObject]);
  const selectedTextColor = useMemo(() => {
    if (!selectedTextObject) return "#172039";
    return typeof selectedTextObject.meta?.textColor === "string" &&
      selectedTextObject.meta.textColor
      ? selectedTextObject.meta.textColor
      : selectedTextObject.color || "#172039";
  }, [selectedTextObject]);
  const selectedTextBackground = useMemo(() => {
    if (!selectedTextObject) return "transparent";
    return typeof selectedTextObject.meta?.textBackground === "string"
      ? selectedTextObject.meta.textBackground
      : "transparent";
  }, [selectedTextObject]);
  const selectedTextFontFamily = useMemo(() => {
    if (!selectedTextObject) return TEXT_FONT_OPTIONS[0].value;
    return typeof selectedTextObject.meta?.textFontFamily === "string" &&
      selectedTextObject.meta.textFontFamily
      ? selectedTextObject.meta.textFontFamily
      : TEXT_FONT_OPTIONS[0].value;
  }, [selectedTextObject]);
  const selectedTextBold = useMemo(
    () => Boolean(selectedTextObject?.meta?.textBold),
    [selectedTextObject]
  );
  const selectedTextItalic = useMemo(
    () => Boolean(selectedTextObject?.meta?.textItalic),
    [selectedTextObject]
  );
  const selectedTextUnderline = useMemo(
    () => Boolean(selectedTextObject?.meta?.textUnderline),
    [selectedTextObject]
  );
  const selectedTextAlign = useMemo<"left" | "center" | "right">(() => {
    if (selectedTextObject?.meta?.textAlign === "center") return "center";
    if (selectedTextObject?.meta?.textAlign === "right") return "right";
    return "left";
  }, [selectedTextObject]);
  const graphTabUsesSelectedObject = Boolean(selectedFunctionGraphObject);
  const functionGraphPlanes = useMemo(
    () =>
      boardObjects
        .filter((item): item is WorkbookBoardObject => item.type === "function_graph")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [boardObjects]
  );
  const graphTabFunctions = graphTabUsesSelectedObject
    ? graphFunctionsDraft
    : graphDraftFunctions;
  useEffect(() => {
    if (!selectedLineObject) {
      lineDraftObjectIdRef.current = null;
      return;
    }
    if (lineDraftObjectIdRef.current === selectedLineObject.id) return;
    lineDraftObjectIdRef.current = selectedLineObject.id;
    setLineWidthDraft(Math.max(1, Math.round(selectedLineStrokeWidth)));
    setSelectedLineStartLabelDraft(selectedLineStartLabel);
    setSelectedLineEndLabelDraft(selectedLineEndLabel);
  }, [
    selectedLineEndLabel,
    selectedLineObject,
    selectedLineObject?.id,
    selectedLineStartLabel,
    selectedLineStrokeWidth,
  ]);

  useEffect(() => {
    if (!selectedTextObject) {
      setSelectedTextDraft("");
      return;
    }
    const nextText =
      typeof selectedTextObject.text === "string" ? selectedTextObject.text : "";
    setSelectedTextDraft((current) => (current === nextText ? current : nextText));
    const nextSize = Math.max(12, Math.round(selectedTextObject.fontSize ?? 18));
    setSelectedTextFontSizeDraft((current) => (current === nextSize ? current : nextSize));
  }, [selectedTextObject, selectedTextObject?.fontSize, selectedTextObject?.id, selectedTextObject?.text]);

  useEffect(() => {
    if (!selectedFunctionGraphObject) {
      graphDraftObjectIdRef.current = null;
      setGraphFunctionsDraft([]);
      return;
    }
    if (graphDraftObjectIdRef.current !== selectedFunctionGraphObject.id) {
      graphDraftObjectIdRef.current = selectedFunctionGraphObject.id;
    }
    setGraphFunctionsDraft((current) =>
      areGraphFunctionDraftListsEqual(current, selectedFunctionGraphFunctions)
        ? current
        : selectedFunctionGraphFunctions
    );
    setGraphDraftError(null);
  }, [
    selectedFunctionGraphFunctions,
    selectedFunctionGraphObject,
  ]);

  useEffect(() => {
    if (selectedFunctionGraphObject) {
      setGraphWorkbenchTab("work");
      return;
    }
    if (tool === "function_graph") {
      setGraphWorkbenchTab("catalog");
    }
  }, [selectedFunctionGraphObject, tool]);

  useEffect(() => {
    if (!selectedShape2dObject) {
      shapeDraftObjectIdRef.current = null;
      return;
    }
    if (shapeDraftObjectIdRef.current === selectedShape2dObject.id) return;
    shapeDraftObjectIdRef.current = selectedShape2dObject.id;
    setShapeVertexLabelDrafts(selectedShape2dLabels);
    setShapeAngleNoteDrafts(selectedShape2dAngleNotes);
    setShapeSegmentNoteDrafts(selectedShape2dSegmentNotes);
  }, [
    selectedShape2dAngleNotes,
    selectedShape2dLabels,
    selectedShape2dObject,
    selectedShape2dObject?.id,
    selectedShape2dSegmentNotes,
  ]);

  useEffect(() => {
    if (!selectedDividerObject) {
      dividerDraftObjectIdRef.current = null;
      return;
    }
    if (dividerDraftObjectIdRef.current === selectedDividerObject.id) return;
    dividerDraftObjectIdRef.current = selectedDividerObject.id;
    setDividerWidthDraft(Math.max(1, Math.round(selectedDividerStrokeWidth)));
  }, [selectedDividerObject, selectedDividerStrokeWidth, selectedDividerObject?.id]);

  const selectedSolid3dState = useMemo(
    () =>
      selectedObject?.type === "solid3d"
        ? readSolid3dState(selectedObject.meta)
        : null,
    [selectedObject]
  );
  const selectedSolidPresetId = useMemo(() => {
    if (selectedObject?.type !== "solid3d") return null;
    return typeof selectedObject.meta?.presetId === "string"
      ? selectedObject.meta.presetId
      : "cube";
  }, [selectedObject]);
  const selectedSolidMesh = useMemo(() => {
    if (!selectedObject || selectedObject.type !== "solid3d") return null;
    if (!selectedSolidPresetId) return null;
    return getSolid3dMesh(
      selectedSolidPresetId,
      Math.max(1, Math.abs(selectedObject.width)),
      Math.max(1, Math.abs(selectedObject.height))
    );
  }, [selectedObject, selectedSolidPresetId]);
  const selectedSolidVertexLabels = useMemo(
    () => selectedSolid3dState?.vertexLabels ?? [],
    [selectedSolid3dState?.vertexLabels]
  );
  const selectedSolidHiddenEdges = useMemo(
    () => Boolean(selectedSolid3dState?.hiddenFaceIds?.includes("hidden_edges")),
    [selectedSolid3dState?.hiddenFaceIds]
  );
  const selectedSolidFaceColors = useMemo(
    () => selectedSolid3dState?.faceColors ?? {},
    [selectedSolid3dState?.faceColors]
  );
  const selectedSolidAngleMarks = useMemo(
    () => selectedSolid3dState?.angleMarks ?? [],
    [selectedSolid3dState?.angleMarks]
  );
  const selectedActiveSection = useMemo(() => {
    if (!selectedSolid3dState?.sections.length) return null;
    if (activeSolidSectionId) {
      return (
        selectedSolid3dState.sections.find((section) => section.id === activeSolidSectionId) ??
        selectedSolid3dState.sections[0]
      );
    }
    return selectedSolid3dState.sections[0];
  }, [activeSolidSectionId, selectedSolid3dState]);
  const selectedSolidSectionPointLimit = useMemo(
    () => getSolidSectionPointLimit(selectedSolidPresetId, selectedSolidMesh),
    [selectedSolidPresetId, selectedSolidMesh]
  );
  const isSolid3dPointCollectionActive = Boolean(
    selectedObject?.type === "solid3d" &&
      solid3dSectionPointCollecting &&
      selectedObject.id === solid3dSectionPointCollecting
  );
  const solid3dDraftPointLimit = useMemo(() => {
    if (!solid3dDraftPoints) return selectedSolidSectionPointLimit;
    const targetObject = boardObjects.find((item) => item.id === solid3dDraftPoints.objectId);
    if (!targetObject || targetObject.type !== "solid3d") return selectedSolidSectionPointLimit;
    return getPointLimitForSolidObject(targetObject);
  }, [boardObjects, selectedSolidSectionPointLimit, solid3dDraftPoints]);

  useEffect(() => {
    if (selectedObject?.type !== "solid3d") {
      setActiveSolidSectionId(null);
      setSolid3dSectionPointCollecting(null);
      setSolid3dSectionPointTarget(null);
      setSolid3dInspectorTab("section");
      setSolid3dDraftPoints(null);
      setSolid3dVertexContextMenu(null);
      setSolid3dPointContextMenu(null);
      setSolid3dSectionContextMenu(null);
    }
  }, [selectedObject?.type]);

  useEffect(() => {
    if (!selectedSolid3dState) return;
    if (selectedSolid3dState.sections.length === 0) {
      setActiveSolidSectionId(null);
      return;
    }
    if (
      !activeSolidSectionId ||
      !selectedSolid3dState.sections.some((section) => section.id === activeSolidSectionId)
    ) {
      setActiveSolidSectionId(selectedSolid3dState.sections[0].id);
    }
  }, [activeSolidSectionId, selectedSolid3dState]);

  useEffect(() => {
    if (!selectedObject || selectedObject.type !== "solid3d") return;
    if (!selectedSolidMesh || !selectedSolid3dState) return;
    if (!canSelect) return;
    const selectedPresetRaw =
      typeof selectedObject.meta?.presetId === "string" ? selectedObject.meta.presetId : "cube";
    const selectedPresetId = resolveSolid3dPresetId(selectedPresetRaw);
    if (ROUND_SOLID_PRESETS.has(selectedPresetId)) return;
    const required = selectedSolidMesh.vertices.length;
    const current = selectedSolid3dState.vertexLabels ?? [];
    if (
      current.length >= required &&
      current.slice(0, required).every((label) => typeof label === "string" && label.trim())
    ) {
      return;
    }
    const nextLabels = Array.from({ length: required }, (_, index) => {
      const currentLabel = current[index];
      return typeof currentLabel === "string" && currentLabel.trim()
        ? currentLabel.trim()
        : `V${index + 1}`;
    });
    const nextState: Solid3dState = {
      ...selectedSolid3dState,
      vertexLabels: nextLabels,
    };
    void commitObjectUpdate(selectedObject.id, {
      meta: writeSolid3dState(nextState, selectedObject.meta),
    });
  }, [canSelect, commitObjectUpdate, selectedObject, selectedSolid3dState, selectedSolidMesh]);

  useEffect(() => {
    if (!selectedObject || selectedObject.type !== "solid3d") return;
    if (!selectedSolid3dState || !canSelect) return;
    const needsUpdate = selectedSolid3dState.sections.some((section) =>
      section.points.some((point) => !(point.label && point.label.trim()))
    );
    if (!needsUpdate) return;
    const nextState: Solid3dState = {
      ...selectedSolid3dState,
      sections: selectedSolid3dState.sections.map((section) => ({
        ...section,
        points: section.points.map((point, index) => ({
          ...point,
          label: point.label?.trim() || getSectionPointLabel(index),
        })),
      })),
    };
    void commitObjectUpdate(selectedObject.id, {
      meta: writeSolid3dState(nextState, selectedObject.meta),
    });
  }, [canSelect, commitObjectUpdate, selectedObject, selectedSolid3dState]);

  useEffect(() => {
    if (!solid3dDraftPoints) return;
    const targetObject = boardObjects.find((item) => item.id === solid3dDraftPoints.objectId);
    if (!targetObject || targetObject.type !== "solid3d") {
      setSolid3dDraftPoints(null);
      setSolid3dSectionPointCollecting(null);
    }
  }, [boardObjects, solid3dDraftPoints]);

  useEffect(() => {
    if (!solid3dSectionPointCollecting || !selectedObject) return;
    if (selectedObject.type !== "solid3d" || selectedObject.id !== solid3dSectionPointCollecting) {
      setSolid3dSectionPointCollecting(null);
      setSolid3dDraftPoints(null);
    }
  }, [selectedObject, solid3dSectionPointCollecting]);

  useEffect(() => {
    if (!solid3dSectionPointTarget || !selectedSolid3dState) return;
    const section = selectedSolid3dState.sections.find(
      (entry) => entry.id === solid3dSectionPointTarget.sectionId
    );
    if (!section || solid3dSectionPointTarget.pointIndex >= section.points.length) {
      setSolid3dSectionPointTarget(null);
    }
  }, [solid3dSectionPointTarget, selectedSolid3dState]);

  useEffect(() => {
    if (!selectedActiveSection || selectedActiveSection.visible) return;
    setSolid3dSectionPointTarget(null);
  }, [selectedActiveSection]);

  useEffect(() => {
    setCanvasViewport({ x: 0, y: 0 });
  }, [sessionId]);

  useEffect(() => {
    const isTypingElement = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      if (!element) return false;
      const tag = element.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        element.isContentEditable
      );
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      if (isTypingElement(event.target)) return;
      event.preventDefault();
      setSpacePanActive(true);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      setSpacePanActive(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleKeyUp as EventListener);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleKeyUp as EventListener);
    };
  }, []);

  const contextMenuObject = useMemo(
    () =>
      objectContextMenu
        ? boardObjects.find((item) => item.id === objectContextMenu.objectId) ?? null
        : null,
    [boardObjects, objectContextMenu]
  );
  const contextMenuShapeVertexObject = useMemo(() => {
    if (!shapeVertexContextMenu) return null;
    const object = boardObjects.find((item) => item.id === shapeVertexContextMenu.objectId) ?? null;
    if (!is2dFigureObject(object)) return null;
    return object;
  }, [boardObjects, shapeVertexContextMenu]);
  const contextMenuLineEndpointObject = useMemo(() => {
    if (!lineEndpointContextMenu) return null;
    const object = boardObjects.find((item) => item.id === lineEndpointContextMenu.objectId) ?? null;
    if (!object || (object.type !== "line" && object.type !== "arrow")) return null;
    if (object.meta?.lineKind !== "segment") return null;
    return object;
  }, [boardObjects, lineEndpointContextMenu]);
  const contextMenuSection = useMemo(() => {
    if (!solid3dSectionContextMenu || !selectedSolid3dState) return null;
    return (
      selectedSolid3dState.sections.find(
        (section) => section.id === solid3dSectionContextMenu.sectionId
      ) ?? null
    );
  }, [selectedSolid3dState, solid3dSectionContextMenu]);

  useEffect(() => {
    if (!contextMenuObject || contextMenuObject.type !== "point") {
      setPointLabelDraft("");
      return;
    }
    const label =
      typeof contextMenuObject.meta?.label === "string" ? contextMenuObject.meta.label : "";
    setPointLabelDraft(label);
  }, [contextMenuObject]);

  useEffect(() => {
    if (!shapeVertexContextMenu || !contextMenuShapeVertexObject) {
      setShapeVertexLabelDraft("");
      return;
    }
    const vertices = resolve2dFigureVertices(contextMenuShapeVertexObject);
    if (!vertices.length) {
      setShapeVertexLabelDraft("");
      return;
    }
    const labels = Array.isArray(contextMenuShapeVertexObject.meta?.vertexLabels)
      ? contextMenuShapeVertexObject.meta.vertexLabels
      : [];
    const current = labels[shapeVertexContextMenu.vertexIndex];
    const value =
      typeof current === "string" && current.trim()
        ? current.trim()
        : getFigureVertexLabel(shapeVertexContextMenu.vertexIndex);
    setShapeVertexLabelDraft(value);
  }, [contextMenuShapeVertexObject, shapeVertexContextMenu]);

  useEffect(() => {
    if (!lineEndpointContextMenu || !contextMenuLineEndpointObject) {
      setLineEndpointLabelDraft("");
      return;
    }
    const valueRaw =
      lineEndpointContextMenu.endpoint === "start"
        ? contextMenuLineEndpointObject.meta?.startLabel
        : contextMenuLineEndpointObject.meta?.endLabel;
    const fallback = lineEndpointContextMenu.endpoint === "start" ? "A" : "B";
    const value =
      typeof valueRaw === "string" && valueRaw.trim() ? valueRaw.trim() : fallback;
    setLineEndpointLabelDraft(value);
  }, [contextMenuLineEndpointObject, lineEndpointContextMenu]);

  const activeDocument = documentState.assets.find(
    (asset) => asset.id === documentState.activeAssetId
  );
  const activeDocumentPageCount =
    activeDocument?.type === "pdf"
      ? Math.max(1, activeDocument.renderedPages?.length ?? 1)
      : 1;

  const noteStickers = useMemo(
    () =>
      boardObjects
        .filter(
          (object) =>
            object.type === "sticker" &&
            (object.page ?? 1) === (boardSettings.currentPage || 1)
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [boardObjects, boardSettings.currentPage]
  );

  const activeFrameObject = useMemo(
    () =>
      boardObjects.find(
        (object) => object.id === boardSettings.activeFrameId && object.type === "frame"
      ) ?? null,
    [boardObjects, boardSettings.activeFrameId]
  );

  const visibleBoardObjects = useMemo(() => {
    const byPage = boardObjects.filter(
      (object) => (object.page ?? 1) === (boardSettings.currentPage || 1)
    );
    if (frameFocusMode !== "active" || !activeFrameObject) return byPage;
    const frameLeft = activeFrameObject.x;
    const frameTop = activeFrameObject.y;
    const frameRight = activeFrameObject.x + activeFrameObject.width;
    const frameBottom = activeFrameObject.y + activeFrameObject.height;
    return byPage.filter((object) => {
      if (object.id === activeFrameObject.id) return true;
      const centerX = object.x + object.width / 2;
      const centerY = object.y + object.height / 2;
      return (
        centerX >= frameLeft &&
        centerX <= frameRight &&
        centerY >= frameTop &&
        centerY <= frameBottom
      );
    });
  }, [
    activeFrameObject,
    boardObjects,
    boardSettings.currentPage,
    frameFocusMode,
  ]);

  useEffect(() => {
    if (!selectedObjectId) return;
    if (visibleBoardObjects.some((object) => object.id === selectedObjectId)) return;
    setSelectedObjectId(null);
  }, [selectedObjectId, visibleBoardObjects]);

  useEffect(() => {
    if (saveIndicatorTimerRef.current !== null) {
      window.clearTimeout(saveIndicatorTimerRef.current);
      saveIndicatorTimerRef.current = null;
    }
    if (saveState === "saved" && saveIndicatorState === "saving") {
      saveIndicatorTimerRef.current = window.setTimeout(() => {
        setSaveIndicatorState("saved");
        saveIndicatorTimerRef.current = null;
      }, 240);
      return;
    }
    setSaveIndicatorState(saveState);
  }, [saveIndicatorState, saveState]);

  useEffect(
    () => () => {
      if (saveIndicatorTimerRef.current !== null) {
        window.clearTimeout(saveIndicatorTimerRef.current);
        saveIndicatorTimerRef.current = null;
      }
    },
    []
  );

  const saveStatusLabel = useMemo(() => {
    if (saveIndicatorState === "saving") return "Сохранение";
    if (saveIndicatorState === "error") return "Ошибка сохранения";
    if (saveIndicatorState === "unsaved") return "Черновик не сохранен";
    if (!lastSavedAt) return "Сохранено";
    return `Сохранено ${new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(lastSavedAt))}`;
  }, [lastSavedAt, saveIndicatorState]);

  const handleBack = useCallback(async () => {
    if (dirtyRef.current) {
      const saved = await persistSnapshots({ force: true });
      if (!saved) {
        setError("Не удалось сохранить изменения перед выходом из тетради.");
        return;
      }
    }
    if (typeof window !== "undefined" && window.opener && !window.opener.closed) {
      try {
        const targetUrl = new URL(fromPath, window.location.origin).toString();
        window.opener.location.assign(targetUrl);
      } catch {
        // ignore opener navigation errors; fallback will still close/navigate current tab
      }
    }
    if (typeof window !== "undefined") {
      window.setTimeout(() => navigate(fromPath), 180);
      window.close();
      return;
    }
    navigate(fromPath);
  }, [fromPath, navigate, persistSnapshots]);

  if (loading) {
    return <PageLoader minHeight="30vh" />;
  }

  if (!session) {
    return (
      <section className="workbook-session workbook-session--error">
        <Alert severity="error">{error ?? "Сессия недоступна."}</Alert>
        <Button onClick={() => navigate(fallbackBackPath)}>К рабочим тетрадям</Button>
      </section>
    );
  }

  const overlayContainer = sessionRootRef.current ?? undefined;

  return (
    <section
      className={`workbook-session ${isFullscreen ? "is-fullscreen" : ""}`}
      ref={sessionRootRef}
    >
      <input
        ref={boardFileInputRef}
        type="file"
        accept=".json,.mwb"
        className="workbook-session__file-input"
        onChange={handleLoadBoardFile}
      />
      <input
        ref={docsInputRef}
        type="file"
        accept="application/pdf,image/*"
        className="workbook-session__file-input"
        onChange={handleDocsUpload}
      />

      <header className="workbook-session__head">
        <div className="workbook-session__head-main">
          <IconButton
            className="workbook-session__back"
            onClick={() => void handleBack()}
            aria-label="Назад"
          >
            <ArrowBackRoundedIcon />
          </IconButton>
          <div>
            <div className="workbook-session__head-meta">
              <Chip
                size="small"
                label={session.kind === "CLASS" ? "Коллективная сессия" : "Личная тетрадь"}
              />
              <Chip
                size="small"
                label={session.status === "ended" ? "Завершено" : "В процессе"}
                color={session.status === "ended" ? "default" : "primary"}
              />
              <Chip
                size="small"
                label={saveStatusLabel}
                icon={
                  saveIndicatorState === "saving" ? (
                    <CircularProgress size={12} thickness={5} color="inherit" />
                  ) : undefined
                }
                color={
                  saveIndicatorState === "error"
                    ? "error"
                    : saveIndicatorState === "saved"
                      ? "success"
                      : saveIndicatorState === "saving"
                        ? "info"
                        : "warning"
                }
                variant={saveIndicatorState === "saved" ? "outlined" : "filled"}
              />
            </div>
          </div>
        </div>
        <div className="workbook-session__head-actions">
          {canInvite && session.status !== "ended" ? (
            <Button
              variant="outlined"
              startIcon={<ContentCopyRoundedIcon />}
              onClick={() => void handleOpenInviteDialog()}
            >
              Пригласить участника
            </Button>
          ) : null}
          {canManageSession && session.status !== "ended" ? (
            <Button color="error" variant="outlined" onClick={() => void handleFinishSession()}>
              Завершить
            </Button>
          ) : null}
        </div>
      </header>

      {error ? (
        <Alert
          severity="error"
          onClose={() => setError(null)}
          className={`workbook-session__alert${
            isFullscreen ? " workbook-session__alert--floating" : ""
          }`}
        >
          {error}
        </Alert>
      ) : null}

      {pendingClearRequest &&
      pendingClearRequest.authorUserId !== user?.id &&
      session.status !== "ended" ? (
        <Alert
          severity="warning"
          action={
            <Button size="small" onClick={() => void handleConfirmClear()}>
              Подтвердить
            </Button>
          }
        >
          Учитель запросил очистку слоя. Подтвердите, чтобы выполнить действие.
        </Alert>
      ) : null}

      {awaitingClearRequest ? (
        <Alert severity="info">
          Ожидаем подтверждение второго участника на очистку слоя.
        </Alert>
      ) : null}

      <div
        className={`workbook-session__layout${
          showCollaborationPanels ? "" : " workbook-session__layout--workspace"
        }`}
      >
        <div
          className={`workbook-session__workspace${
            graphCatalogCursorActive ? " is-graph-catalog-cursor" : ""
          }`}
          ref={workspaceRef}
        >
          <div className="workbook-session__contextbar">
            <Menu
              container={overlayContainer}
              anchorEl={menuAnchor}
              open={Boolean(menuAnchor)}
              onClose={() => setMenuAnchor(null)}
            >
              <MenuItem
                onClick={() => {
                  void exportBoardAsPng();
                  setMenuAnchor(null);
                }}
              >
                Экспорт PNG
              </MenuItem>
              <MenuItem
                onClick={() => {
                  void exportBoardAsPdf();
                  setMenuAnchor(null);
                }}
                disabled={exportingSections}
              >
                Экспорт PDF
              </MenuItem>
            </Menu>

            <Tooltip title="Меню доски" placement="bottom" arrow>
              <span>
                <IconButton
                  size="small"
                  className="workbook-session__toolbar-icon"
                  onClick={(event) => setMenuAnchor(event.currentTarget)}
                >
                  <MenuRoundedIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Настройки" placement="bottom" arrow>
              <span>
                <IconButton
                  size="small"
                  className={`workbook-session__toolbar-icon ${
                    isUtilityPanelOpen && utilityTab === "settings" ? "is-active" : ""
                  }`}
                  onClick={() => openUtilityPanel("settings")}
                >
                  <TuneRoundedIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Заметки" placement="bottom" arrow>
              <span>
                <IconButton
                  size="small"
                  className={`workbook-session__toolbar-icon ${
                    isUtilityPanelOpen && utilityTab === "notes" ? "is-active" : ""
                  }`}
                  onClick={() => openUtilityPanel("notes")}
                >
                  <StickyNote2RoundedIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="График функции" placement="bottom" arrow>
              <span>
                <IconButton
                  size="small"
                  className={`workbook-session__toolbar-icon ${
                    isUtilityPanelOpen && utilityTab === "graph" ? "is-active" : ""
                  }`}
                  onClick={() => openUtilityPanel("graph")}
                >
                  <ShowChartRoundedIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Трансформации" placement="bottom" arrow>
              <span>
                <IconButton
                  size="small"
                  className={`workbook-session__toolbar-icon ${
                    isUtilityPanelOpen && utilityTab === "transform" ? "is-active" : ""
                  }`}
                  onClick={() => openUtilityPanel("transform")}
                >
                  <AutoFixHighRoundedIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Слои" placement="bottom" arrow>
              <span>
                <IconButton
                  size="small"
                  className={`workbook-session__toolbar-icon ${
                    isUtilityPanelOpen && utilityTab === "layers" ? "is-active" : ""
                  }`}
                  onClick={() => openUtilityPanel("layers")}
                >
                  <LayersRoundedIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Отменить" placement="bottom" arrow>
              <span>
                <IconButton
                  size="small"
                  className="workbook-session__toolbar-icon"
                  onClick={() => void handleUndo()}
                  disabled={!canUseUndo || undoDepth === 0}
                >
                  <UndoRoundedIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Повторить" placement="bottom" arrow>
              <span>
                <IconButton
                  size="small"
                  className="workbook-session__toolbar-icon"
                  onClick={() => void handleRedo()}
                  disabled={!canUseUndo || redoDepth === 0}
                >
                  <RedoRoundedIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Уменьшить масштаб" placement="bottom" arrow>
              <span>
                <IconButton
                  size="small"
                  className="workbook-session__toolbar-icon"
                  onClick={zoomOut}
                >
                  <ZoomOutRoundedIcon />
                </IconButton>
              </span>
            </Tooltip>
            <span className="workbook-session__zoom-badge">
              {Math.round(viewportZoom * 100)}%
            </span>
            <Tooltip title="Увеличить масштаб" placement="bottom" arrow>
              <span>
                <IconButton
                  size="small"
                  className="workbook-session__toolbar-icon"
                  onClick={zoomIn}
                >
                  <ZoomInRoundedIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Сбросить масштаб" placement="bottom" arrow>
              <span>
                <IconButton
                  size="small"
                  className="workbook-session__toolbar-icon"
                  onClick={resetZoom}
                >
                  <CenterFocusStrongRoundedIcon />
                </IconButton>
              </span>
            </Tooltip>

            {tool === "polygon" ? (
              <>
                <div className="workbook-session__contextbar-inline">
                  <label htmlFor="workbook-polygon-mode">Режим</label>
                  <Select
                    native
                    size="small"
                    inputProps={{ id: "workbook-polygon-mode" }}
                    value={polygonMode}
                    onChange={(event) =>
                      setPolygonMode(
                        event.target.value === "points" ? "points" : "regular"
                      )
                    }
                  >
                    <option value="regular">Регулярный</option>
                    <option value="points">По точкам</option>
                  </Select>
                </div>
                {polygonMode === "regular" && polygonPreset === "regular" ? (
                  <div className="workbook-session__contextbar-inline">
                    <label htmlFor="workbook-polygon-sides">N</label>
                    <input
                      id="workbook-polygon-sides"
                      type="number"
                      min={3}
                      max={12}
                      value={polygonSides}
                      onChange={(event) => setPolygonSides(Number(event.target.value))}
                    />
                  </div>
                ) : null}
              </>
            ) : null}

            {tool === "function_graph" ? (
              <div className="workbook-session__contextbar-inline">
                <span className="workbook-session__hint">
                  Конструктор графика доступен во вкладке «График функции».
                </span>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ShowChartRoundedIcon />}
                  onClick={() => openUtilityPanel("graph", { toggle: false })}
                >
                  Открыть модуль
                </Button>
              </div>
            ) : null}

            {tool === "text" ? (
              <div className="workbook-session__contextbar-inline">
                <span className="workbook-session__hint">
                  Добавьте текстовый блок на доску и введите текст напрямую в него.
                </span>
              </div>
            ) : null}

            {tool === "sticker" ? (
              <TextField
                size="small"
                value={noteDraftText}
                onChange={(event) => setNoteDraftText(event.target.value)}
                placeholder="Текст стикера"
              />
            ) : null}

            <Tooltip title="Загрузить документ" placement="bottom" arrow>
              <span>
                <IconButton
                  size="small"
                  className="workbook-session__toolbar-icon"
                  onClick={() => docsInputRef.current?.click()}
                  disabled={!canInsertImage}
                >
                  <UploadFileRoundedIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={hotkeysTooltipContent} placement="bottom-start" arrow>
              <span>
                <IconButton size="small" className="workbook-session__toolbar-icon">
                  <HelpOutlineRoundedIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip
              title={isFullscreen ? "Выйти из полного экрана" : "Полный экран"}
              placement="bottom"
              arrow
            >
              <span>
                <IconButton
                  size="small"
                  className="workbook-session__toolbar-icon"
                  onClick={() => void toggleFullscreen()}
                >
                  {isFullscreen ? <FullscreenExitRoundedIcon /> : <FullscreenRoundedIcon />}
                </IconButton>
              </span>
            </Tooltip>
          </div>

          <div className="workbook-session__board-shell">
            <WorkbookCanvas
              boardStrokes={boardStrokes}
              annotationStrokes={annotationStrokes}
              boardObjects={visibleBoardObjects}
              constraints={constraints}
              layer={layer}
              tool={tool}
              color={strokeColor}
              width={strokeWidth}
              authorUserId={user?.id ?? "unknown"}
              polygonSides={polygonSides}
              polygonMode={polygonMode}
              polygonPreset={polygonPreset}
              textPreset={textPreset}
              stickerText={noteDraftText}
              graphFunctions={sanitizeFunctionGraphDrafts(graphDraftFunctions, {
                ensureNonEmpty: false,
              })}
              lineStyle={lineStyle}
              snapToGrid={boardSettings.snapToGrid}
              gridSize={boardSettings.gridSize}
              viewportZoom={viewportZoom}
              showGrid={boardSettings.showGrid}
              gridColor={boardSettings.gridColor}
              backgroundColor={boardSettings.backgroundColor}
              showPageNumbers={boardSettings.showPageNumbers}
              currentPage={boardSettings.currentPage}
              disabled={!canEdit || boardLocked}
              selectedObjectId={selectedObjectId}
              selectedConstraintId={selectedConstraintId}
              focusPoint={focusPoint}
              pointerPoint={pointerPoint}
              viewportOffset={canvasViewport}
              onViewportOffsetChange={setCanvasViewport}
              forcePanMode={spacePanActive}
              autoDividersEnabled={boardSettings.autoSectionDividers}
              autoDividerStep={boardSettings.dividerStep}
              areaSelection={areaSelection}
              solid3dPointPick={
                selectedObject?.type === "solid3d" &&
                selectedActiveSection &&
                selectedActiveSection.visible
                  ? {
                      objectId: selectedObject.id,
                      sectionId: selectedActiveSection.id,
                      selectedPoints: selectedActiveSection.points,
                      replaceIndex:
                        solid3dSectionPointTarget?.sectionId === selectedActiveSection.id
                          ? solid3dSectionPointTarget.pointIndex
                          : null,
                    }
                  : null
              }
              solid3dDraftPointCollectionObjectId={solid3dSectionPointCollecting}
              solid3dSectionMarkers={
                isSolid3dPointCollectionActive && solid3dDraftPoints
                  ? {
                      objectId: solid3dDraftPoints.objectId,
                      sectionId: "draft",
                      selectedPoints: solid3dDraftPoints.points,
                    }
                  : selectedObject?.type === "solid3d" &&
                      selectedActiveSection &&
                      selectedActiveSection.visible
                  ? {
                      objectId: selectedObject.id,
                      sectionId: selectedActiveSection.id,
                      selectedPoints: selectedActiveSection.points,
                    }
                  : null
              }
              onSelectedObjectChange={handleCanvasSelectedObjectChange}
              onSelectedConstraintChange={setSelectedConstraintId}
              onStrokeCommit={(stroke) => void commitStroke(stroke)}
              onStrokeDelete={(strokeId, targetLayer) =>
                void commitStrokeDelete(strokeId, targetLayer)
              }
              onObjectCreate={handleCanvasObjectCreate}
              onObjectUpdate={(objectId, patch) => void commitObjectUpdate(objectId, patch)}
              onObjectDelete={(objectId) => void commitObjectDelete(objectId)}
              onObjectContextMenu={handleObjectContextMenu}
              onShapeVertexContextMenu={handleShapeVertexContextMenu}
              onLineEndpointContextMenu={handleLineEndpointContextMenu}
              onSolid3dVertexContextMenu={handleSolid3dVertexContextMenu}
              onSolid3dPointContextMenu={handleSolid3dPointContextMenu}
              onSolid3dSectionContextMenu={handleSolid3dSectionContextMenu}
              onSolid3dPointPick={(payload) => void handleSolid3dSectionPointPick(payload)}
              onSolid3dDraftPointAdd={addDraftPointToSolid}
              onAreaSelectionChange={(selection) => {
                setAreaSelection(selection);
                if (!selection || selection.objectIds.length === 0) {
                  setAreaSelectionContextMenu(null);
                }
              }}
              onAreaSelectionContextMenu={(payload) => {
                setAreaSelection({
                  objectIds: payload.objectIds,
                  rect: payload.rect,
                });
                setAreaSelectionContextMenu({
                  x: payload.anchor.x,
                  y: payload.anchor.y,
                });
              }}
              onInlineTextDraftChange={(objectId, value) => {
                if (selectedObjectId !== objectId) return;
                setSelectedTextDraft((current) => (current === value ? current : value));
              }}
              onRequestSelectTool={() => setTool("select")}
              onLaserPoint={(point) => void handleLaserPoint(point)}
              onLaserClear={() => void clearLaserPointer()}
            />
            <aside className="workbook-session__tools">
              {toolButtonsBeforeCatalog.map(renderToolButton)}
              <Tooltip title="Каталог 2D-фигур" placement="left" arrow>
                <span>
                  <button
                    type="button"
                    className="workbook-session__tool-btn workbook-session__tool-special"
                    disabled={!canDraw}
                    aria-label="Каталог 2D-фигур"
                    onClick={() => setIsShapesDialogOpen(true)}
                  >
                    <PentagonRoundedIcon />
                  </button>
                </span>
              </Tooltip>
              <Tooltip title="Стереометрия (3D-библиотека)" placement="left" arrow>
                <span>
                  <button
                    type="button"
                    className="workbook-session__tool-btn workbook-session__tool-special"
                    disabled={!canDraw}
                    aria-label="Стереометрия"
                    onClick={() => setIsStereoDialogOpen(true)}
                  >
                    <ViewInArRoundedIcon />
                  </button>
                </span>
              </Tooltip>
              {toolButtonsAfterCatalog.map(renderToolButton)}
            </aside>
          </div>

          {docsWindow.open ? (
            <div
              className={`workbook-session__docs-window ${
                docsWindow.maximized ? "is-maximized" : ""
              } ${docsWindow.pinned ? "is-pinned" : ""}`}
            >
              <header>
                <strong>Окно документов</strong>
                <div>
                  <IconButton
                    size="small"
                    onClick={() =>
                      setDocsWindow((current) => ({ ...current, pinned: !current.pinned }))
                    }
                    aria-label="Закрепить окно"
                  >
                    {docsWindow.pinned ? <LockRoundedIcon /> : <LockOpenRoundedIcon />}
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() =>
                      setDocsWindow((current) => ({
                        ...current,
                        maximized: !current.maximized,
                      }))
                    }
                    aria-label="Изменить размер"
                  >
                    <FilterCenterFocusRoundedIcon />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => setDocsWindow((current) => ({ ...current, open: false }))}
                    aria-label="Закрыть"
                  >
                    <CloseRoundedIcon />
                  </IconButton>
                </div>
              </header>

              <div className="workbook-session__docs-actions">
                <Button
                  size="small"
                  startIcon={<UploadFileRoundedIcon />}
                  onClick={() => docsInputRef.current?.click()}
                  disabled={!canInsertImage}
                >
                  Загрузить
                </Button>
                <Button
                  size="small"
                  startIcon={<PhotoCameraRoundedIcon />}
                  onClick={() => void handleDocumentSnapshotToBoard()}
                  disabled={!activeDocument}
                >
                  Снимок на доску
                </Button>
                <Button
                  size="small"
                  startIcon={<AutoFixHighRoundedIcon />}
                  onClick={() => void handleAddDocumentAnnotation()}
                  disabled={!activeDocument}
                >
                  Пометка
                </Button>
                <Button
                  size="small"
                  startIcon={<DeleteSweepRoundedIcon />}
                  onClick={() => void handleClearDocumentAnnotations()}
                  disabled={documentState.annotations.length === 0}
                >
                  Стереть
                </Button>
              </div>

              {uploadingDoc ? (
                <p className="workbook-session__docs-progress">
                  Передача файла: {uploadProgress}%
                </p>
              ) : null}

              <div className="workbook-session__docs-files">
                {documentState.assets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    className={asset.id === documentState.activeAssetId ? "is-active" : ""}
                    onClick={() => void updateDocumentState({ activeAssetId: asset.id })}
                  >
                    {asset.name}
                  </button>
                ))}
              </div>

              <div className="workbook-session__docs-view">
                {activeDocument ? (
                  activeDocument.type === "pdf" ? (
                    activeDocument.renderedPages && activeDocument.renderedPages.length > 0 ? (
                      <img
                        src={
                          activeDocument.renderedPages.find(
                            (page) => page.page === documentState.page
                          )?.imageUrl ?? activeDocument.renderedPages[0].imageUrl
                        }
                        alt={`${activeDocument.name} • стр ${documentState.page}`}
                      />
                    ) : (
                      <div className="workbook-session__docs-pdf-fallback">
                        <p>Серверный рендер PDF недоступен. Откройте файл в отдельной вкладке.</p>
                        <a
                          href={activeDocument.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Открыть PDF
                        </a>
                      </div>
                    )
                  ) : activeDocument.type === "file" ? (
                    <div className="workbook-session__docs-pdf-fallback">
                      <p>Предпросмотр этого формата недоступен в доске.</p>
                      <a href={activeDocument.url} target="_blank" rel="noreferrer">
                        Открыть файл
                      </a>
                    </div>
                  ) : (
                    <img src={activeDocument.url} alt={activeDocument.name} />
                  )
                ) : (
                  <p>Откройте документ или изображение для аннотаций.</p>
                )}
              </div>

              <footer className="workbook-session__docs-footer">
                <div className="workbook-session__contextbar-inline">
                  <label htmlFor="workbook-doc-page">Страница</label>
                  <input
                    id="workbook-doc-page"
                    type="number"
                    min={1}
                    max={activeDocumentPageCount}
                    value={documentState.page}
                    onChange={(event) =>
                      void updateDocumentState({
                        page: Math.min(
                          activeDocumentPageCount,
                          Math.max(1, Number(event.target.value) || 1)
                        ),
                      })
                    }
                  />
                </div>
                <div className="workbook-session__contextbar-inline">
                  <label htmlFor="workbook-doc-zoom">Масштаб</label>
                  <input
                    id="workbook-doc-zoom"
                    type="range"
                    min={0.2}
                    max={4}
                    step={0.1}
                    value={documentState.zoom}
                    onChange={(event) =>
                      void updateDocumentState({
                        zoom: Number(event.target.value),
                      })
                    }
                  />
                </div>
              </footer>
            </div>
          ) : null}

        </div>

        <aside className="workbook-session__sidebar">
          {showCollaborationPanels ? (
            <div className="workbook-session__card">
              <div className="workbook-session__participants-head">
                <h3>
                  <GroupRoundedIcon fontSize="small" />
                  Участники
                </h3>
                <Tooltip title="Открыть чат сессии" placement="left" arrow>
                  <span className="workbook-session__participants-chat-button">
                    <IconButton
                      size="small"
                      className={isSessionChatOpen ? "is-active" : ""}
                      disabled={!canUseSessionChat && !canManageSession}
                      onClick={() => {
                        if (isSessionChatOpen) {
                          setIsSessionChatOpen(false);
                          setIsSessionChatEmojiOpen(false);
                          return;
                        }
                        sessionChatShouldScrollToUnreadRef.current = true;
                        setIsSessionChatAtBottom(false);
                        setIsSessionChatOpen(true);
                        setIsSessionChatMinimized(false);
                      }}
                    >
                      <ForumRoundedIcon fontSize="small" />
                    </IconButton>
                    {sessionChatUnreadCount > 0 ? (
                      <span
                        className="workbook-session__participants-chat-unread"
                        aria-label={`Непрочитанных сообщений: ${sessionChatUnreadCount}`}
                      >
                        {sessionChatUnreadCount > 9 ? "9+" : sessionChatUnreadCount}
                      </span>
                    ) : null}
                  </span>
                </Tooltip>
              </div>
              <div className="workbook-session__participants-scroll">
                {participantCards.map((participant) => {
                  const isSelfParticipant = participant.userId === user?.id;
                  const boardToolsEnabled = isParticipantBoardToolsEnabled(participant);
                  return (
                    <article key={participant.userId} className="workbook-session__participant-card">
                      <div className="workbook-session__participant-card-top">
                        <div className="workbook-session__participant-main">
                          <Avatar src={participant.photo} alt={participant.displayName}>
                            {participant.displayName.slice(0, 1)}
                          </Avatar>
                          <div className="workbook-session__participant-main-meta">
                            <strong>{participant.displayName}</strong>
                            <span>
                              {participant.roleInSession === "teacher" ? "Преподаватель" : "Студент"}
                              {isSelfParticipant && user?.role !== "teacher" ? " • Вы" : ""}
                            </span>
                          </div>
                        </div>
                        <Tooltip
                          title={participant.isOnline ? "Онлайн" : "Офлайн"}
                          placement="top"
                          arrow
                        >
                          <span
                            className={`workbook-session__presence-dot ${
                              participant.isOnline ? "is-online" : "is-offline"
                            }`}
                            aria-label={participant.isOnline ? "Онлайн" : "Офлайн"}
                          >
                            <FiberManualRecordRoundedIcon fontSize="inherit" />
                          </span>
                        </Tooltip>
                      </div>

                      <div className="workbook-session__participant-controls">
                        {isSelfParticipant ? (
                          <Tooltip
                            title={mediaState.micEnabled ? "Выключить микрофон" : "Включить микрофон"}
                            arrow
                          >
                            <span>
                              <IconButton
                                size="small"
                                className={`workbook-session__participant-control ${
                                  mediaState.micEnabled ? "is-enabled" : "is-disabled"
                                }`}
                                onClick={() =>
                                  setMediaState((current) => ({
                                    ...current,
                                    micEnabled: !current.micEnabled,
                                  }))
                                }
                                disabled={!canUseMedia || isEnded}
                              >
                                {mediaState.micEnabled ? (
                                  <MicRoundedIcon fontSize="small" />
                                ) : (
                                  <MicOffRoundedIcon fontSize="small" />
                                )}
                              </IconButton>
                            </span>
                          </Tooltip>
                        ) : null}

                        {canManageSession && participant.roleInSession === "student" ? (
                          <>
                            <Tooltip
                              title={
                                boardToolsEnabled
                                  ? "Отключить инструменты доски"
                                  : "Включить инструменты доски"
                              }
                              arrow
                            >
                              <span>
                                <IconButton
                                  size="small"
                                  className={`workbook-session__participant-control ${
                                    boardToolsEnabled ? "is-enabled" : "is-disabled"
                                  }`}
                                  onClick={() =>
                                    void handleToggleParticipantBoardTools(
                                      participant,
                                      !boardToolsEnabled
                                    )
                                  }
                                  disabled={session.status === "ended"}
                                >
                                  {boardToolsEnabled ? (
                                    <LockOpenRoundedIcon fontSize="small" />
                                  ) : (
                                    <LockRoundedIcon fontSize="small" />
                                  )}
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip
                              title={
                                participant.permissions.canUseChat
                                  ? "Отключить чат"
                                  : "Включить чат"
                              }
                              arrow
                            >
                              <span>
                                <IconButton
                                  size="small"
                                  className={`workbook-session__participant-control ${
                                    participant.permissions.canUseChat ? "is-enabled" : "is-disabled"
                                  }`}
                                  onClick={() =>
                                    void handleToggleParticipantChat(
                                      participant,
                                      !participant.permissions.canUseChat
                                    )
                                  }
                                  disabled={session.status === "ended"}
                                >
                                  <ForumRoundedIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip
                              title={
                                participant.permissions.canUseMedia
                                  ? "Отключить микрофон"
                                  : "Включить микрофон"
                              }
                              arrow
                            >
                              <span>
                                <IconButton
                                  size="small"
                                  className={`workbook-session__participant-control ${
                                    participant.permissions.canUseMedia
                                      ? "is-enabled"
                                      : "is-disabled"
                                  }`}
                                  onClick={() =>
                                    void handleToggleParticipantMic(
                                      participant,
                                      !participant.permissions.canUseMedia
                                    )
                                  }
                                  disabled={session.status === "ended"}
                                >
                                  {participant.permissions.canUseMedia ? (
                                    <MicRoundedIcon fontSize="small" />
                                  ) : (
                                    <MicOffRoundedIcon fontSize="small" />
                                  )}
                                </IconButton>
                              </span>
                            </Tooltip>
                          </>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}

          {isUtilityPanelOpen ? (
          <div
            className="workbook-session__utility-float"
            style={{ left: utilityPanelPosition.x, top: utilityPanelPosition.y }}
            onPointerDown={handleUtilityPanelDragStart}
          >
            <div
              className="workbook-session__utility-float-head"
            >
              <h3>
                <TuneRoundedIcon fontSize="small" />
                {utilityPanelTitle}
              </h3>
              <div className="workbook-session__utility-float-actions">
                <IconButton
                  size="small"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsUtilityPanelCollapsed((current) => !current);
                  }}
                  title={isUtilityPanelCollapsed ? "Развернуть" : "Свернуть"}
                >
                  {isUtilityPanelCollapsed ? (
                    <UnfoldMoreRoundedIcon fontSize="small" />
                  ) : (
                    <UnfoldLessRoundedIcon fontSize="small" />
                  )}
                </IconButton>
                <IconButton
                  size="small"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsUtilityPanelOpen(false);
                  }}
                  title="Закрыть"
                >
                  <CloseRoundedIcon fontSize="small" />
                </IconButton>
              </div>
            </div>
            {!isUtilityPanelCollapsed ? (
            <>
          {utilityTab === "settings" ? (
          <div className="workbook-session__card workbook-session__board-settings">
            <div className="workbook-session__board-settings-head">
              <h3>Системные настройки доски</h3>
              <p>Настройте распознавание, разметку поля и структуру страниц.</p>
            </div>
            <div className="workbook-session__board-settings-grid">
              <section className="workbook-session__board-settings-card">
                <div className="workbook-session__board-settings-card-head">
                  <h4>
                    <AutoFixHighRoundedIcon fontSize="small" />
                    Smart Ink
                  </h4>
                  <p>Автообработка рукописи, фигур и формул в реальном времени.</p>
                </div>
                <div className="workbook-session__board-settings-field">
                  <div className="workbook-session__board-settings-field-main">
                    <strong>Режим распознавания</strong>
                    <small>Off / Basic / Full</small>
                  </div>
                  <Select
                    native
                    size="small"
                    className="workbook-session__board-settings-select"
                    value={smartInkOptions.mode}
                    onChange={(event) =>
                      setSmartInkOptions((current) =>
                        normalizeSmartInkOptions({
                          ...current,
                          mode:
                            event.target.value === "off" ||
                            event.target.value === "basic" ||
                            event.target.value === "full"
                              ? event.target.value
                              : current.mode,
                        })
                      )
                    }
                  >
                    <option value="off">Выкл.</option>
                    <option value="basic">Basic</option>
                    <option value="full">Full</option>
                  </Select>
                </div>
                <div className="workbook-session__board-settings-field">
                  <div className="workbook-session__board-settings-field-main">
                    <strong>Порог уверенности</strong>
                    <small>Чем выше, тем меньше ложных замен.</small>
                  </div>
                  <div className="workbook-session__board-settings-range">
                    <input
                      type="range"
                      min={0.35}
                      max={0.98}
                      step={0.01}
                      value={smartInkOptions.confidenceThreshold}
                      onChange={(event) =>
                        setSmartInkOptions((current) =>
                          normalizeSmartInkOptions({
                            ...current,
                            confidenceThreshold: Number(event.target.value),
                          })
                        )
                      }
                    />
                    <span className="workbook-session__board-settings-range-value">
                      {Math.round(smartInkOptions.confidenceThreshold * 100)}%
                    </span>
                  </div>
                </div>
                <div className="workbook-session__board-settings-field">
                  <div className="workbook-session__board-settings-field-main">
                    <strong>SmartShapes</strong>
                    <small>Выравнивание рукописных фигур.</small>
                  </div>
                  <Switch
                    size="small"
                    className="workbook-session__board-settings-switch"
                    checked={smartInkOptions.smartShapes}
                    disabled={smartInkOptions.mode === "off"}
                    onChange={(event) =>
                      setSmartInkOptions((current) =>
                        normalizeSmartInkOptions({
                          ...current,
                          smartShapes: event.target.checked,
                        })
                      )
                    }
                  />
                </div>
                <div className="workbook-session__board-settings-field">
                  <div className="workbook-session__board-settings-field-main">
                    <strong>OCR + LaTeX</strong>
                    <small>Распознавание текста и математических формул.</small>
                  </div>
                  <Switch
                    size="small"
                    className="workbook-session__board-settings-switch"
                    checked={smartInkOptions.smartTextOcr || smartInkOptions.smartMathOcr}
                    disabled={smartInkOptions.mode !== "full"}
                    onChange={(event) =>
                      setSmartInkOptions((current) =>
                        normalizeSmartInkOptions({
                          ...current,
                          smartTextOcr: event.target.checked,
                          smartMathOcr: event.target.checked,
                        })
                      )
                    }
                  />
                </div>
              </section>

              <section className="workbook-session__board-settings-card">
                <div className="workbook-session__board-settings-card-head">
                  <h4>
                    <CropFreeRoundedIcon fontSize="small" />
                    Поле и сетка
                  </h4>
                  <p>Визуальные параметры доски и точность позиционирования объектов.</p>
                </div>
                <TextField
                  size="small"
                  label="Название доски"
                  className="workbook-session__board-settings-text"
                  value={boardSettings.title}
                  onChange={(event) =>
                    setBoardSettings((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
                <div className="workbook-session__board-settings-field">
                  <div className="workbook-session__board-settings-field-main">
                    <strong>Показывать сетку</strong>
                    <small>Фоновая разметка для построений.</small>
                  </div>
                  <Switch
                    checked={boardSettings.showGrid}
                    className="workbook-session__board-settings-switch"
                    onChange={(event) =>
                      setBoardSettings((current) => ({
                        ...current,
                        showGrid: event.target.checked,
                      }))
                    }
                  />
                </div>
                <div className="workbook-session__board-settings-field">
                  <div className="workbook-session__board-settings-field-main">
                    <strong>Привязка к сетке</strong>
                    <small>Снап для фигур и точек.</small>
                  </div>
                  <Switch
                    checked={boardSettings.snapToGrid}
                    className="workbook-session__board-settings-switch"
                    onChange={(event) =>
                      setBoardSettings((current) => ({
                        ...current,
                        snapToGrid: event.target.checked,
                      }))
                    }
                  />
                </div>
                <div className="workbook-session__board-settings-field">
                  <div className="workbook-session__board-settings-field-main">
                    <strong>Размер сетки</strong>
                    <small>Плотность рабочей разметки.</small>
                  </div>
                  <div className="workbook-session__board-settings-range">
                    <input
                      type="range"
                      min={8}
                      max={96}
                      value={boardSettings.gridSize}
                      onChange={(event) =>
                        setBoardSettings((current) => ({
                          ...current,
                          gridSize: Number(event.target.value),
                        }))
                      }
                    />
                    <span className="workbook-session__board-settings-range-value">
                      {Math.round(boardSettings.gridSize)}
                    </span>
                  </div>
                </div>
                <div className="workbook-session__board-settings-color-grid">
                  <div className="workbook-session__board-settings-color-field">
                    <span>Фон доски</span>
                    <label>
                      <input
                        type="color"
                        value={boardSettings.backgroundColor}
                        onChange={(event) =>
                          setBoardSettings((current) => ({
                            ...current,
                            backgroundColor: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="workbook-session__board-settings-color-field">
                    <span>Цвет сетки</span>
                    <label>
                      <input
                        type="color"
                        value={
                          boardSettings.gridColor.startsWith("#")
                            ? boardSettings.gridColor
                            : "#8893be"
                        }
                        onChange={(event) =>
                          setBoardSettings((current) => ({
                            ...current,
                            gridColor: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                </div>
              </section>

              <section className="workbook-session__board-settings-card">
                <div className="workbook-session__board-settings-card-head">
                  <h4>
                    <MenuRoundedIcon fontSize="small" />
                    Страницы и секции
                  </h4>
                  <p>Управление страницами и автоматическими разделителями тетради.</p>
                </div>
                <div className="workbook-session__board-settings-field">
                  <div className="workbook-session__board-settings-field-main">
                    <strong>Нумерация страниц</strong>
                    <small>Показывать текущий номер страницы на полотне.</small>
                  </div>
                  <Switch
                    checked={boardSettings.showPageNumbers}
                    className="workbook-session__board-settings-switch"
                    onChange={(event) =>
                      setBoardSettings((current) => ({
                        ...current,
                        showPageNumbers: event.target.checked,
                      }))
                    }
                  />
                </div>
                <div className="workbook-session__board-settings-two-cols">
                  <label className="workbook-session__board-settings-number-field">
                    <span>Страница</span>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(1, boardSettings.pagesCount)}
                      value={boardSettings.currentPage}
                      onChange={(event) =>
                        setBoardSettings((current) => ({
                          ...current,
                          currentPage: Math.max(1, Number(event.target.value) || 1),
                        }))
                      }
                    />
                  </label>
                  <label className="workbook-session__board-settings-number-field">
                    <span>Всего страниц</span>
                    <input
                      type="number"
                      min={1}
                      value={boardSettings.pagesCount}
                      onChange={(event) =>
                        setBoardSettings((current) => ({
                          ...current,
                          pagesCount: Math.max(1, Number(event.target.value) || 1),
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="workbook-session__board-settings-field">
                  <div className="workbook-session__board-settings-field-main">
                    <strong>Авторазделители</strong>
                    <small>Автоматическое деление длинного полотна на секции.</small>
                  </div>
                  <Switch
                    checked={boardSettings.autoSectionDividers}
                    className="workbook-session__board-settings-switch"
                    onChange={(event) =>
                      setBoardSettings((current) => ({
                        ...current,
                        autoSectionDividers: event.target.checked,
                      }))
                    }
                  />
                </div>
                <label className="workbook-session__board-settings-number-field">
                  <span>Шаг разделителей</span>
                  <input
                    type="number"
                    min={320}
                    max={2400}
                    value={boardSettings.dividerStep}
                    onChange={(event) =>
                      setBoardSettings((current) => ({
                        ...current,
                        dividerStep: Math.max(320, Number(event.target.value) || 320),
                      }))
                    }
                  />
                </label>
              </section>
            </div>
            <div className="workbook-session__board-settings-footer">
              <Button
                variant="contained"
                onClick={() => void commitBoardSettings(boardSettings)}
                startIcon={<SaveAltRoundedIcon />}
                disabled={session.kind === "CLASS" && !canManageSession}
              >
                Сохранить настройки
              </Button>
            </div>
          </div>
          ) : null}

          {utilityTab === "notes" ? (
          <div className="workbook-session__card">
            <h3>Заметки</h3>
            <div className="workbook-session__settings">
              <div className="workbook-session__contextbar-inline workbook-session__contextbar-inline--column">
                <TextField
                  size="small"
                  value={noteDraftText}
                  onChange={(event) => setNoteDraftText(event.target.value)}
                  placeholder="Текст заметки"
                />
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => void handleCreateNoteSticker()}
                  disabled={!noteDraftText.trim()}
                >
                  Добавить заметку
                </Button>
              </div>
              <div className="workbook-session__geometry-constraints">
                {noteStickers.slice(0, 8).map((note) => (
                  <div key={note.id}>
                    <span>{note.text || "Заметка"}</span>
                    <div className="workbook-session__geometry-constraint-actions">
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => {
                          setSelectedObjectId(note.id);
                          setTool("select");
                        }}
                      >
                        К заметке
                      </Button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteNoteSticker(note.id)}
                        aria-label="Удалить заметку"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          ) : null}

          {utilityTab === "graph" ? (
          <div className="workbook-session__card">
            <h3>График функции</h3>
            <div className="workbook-session__settings workbook-session__graph-tab">
              {!graphTabUsesSelectedObject ? (
                <div className="workbook-session__graph-plane-select">
                  <Alert severity="info">
                    Для работы с графиками выберите существующую плоскость или создайте новую на доске.
                  </Alert>
                  <div className="workbook-session__graph-plane-select-actions">
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => void createFunctionGraphPlane()}
                      disabled={!canDraw}
                    >
                      Создать плоскость
                    </Button>
                  </div>
                  {functionGraphPlanes.length > 0 ? (
                    <div className="workbook-session__graph-plane-list">
                      {functionGraphPlanes.map((plane, index) => {
                        const planeFunctions = resolveGraphFunctionsFromObject(plane);
                        return (
                          <button
                            key={plane.id}
                            type="button"
                            className="workbook-session__graph-plane-item"
                            onClick={() => {
                              setSelectedObjectId(plane.id);
                              setTool("select");
                            }}
                          >
                            <strong>{`Плоскость ${index + 1}`}</strong>
                            <span>{`Графиков: ${planeFunctions.length}`}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="workbook-session__hint">Координатные плоскости пока не созданы.</p>
                  )}
                </div>
              ) : (
                <>
                  <p className="workbook-session__hint">
                    Редактируется выбранная координатная плоскость.
                  </p>

                  <div className="workbook-session__graph-appearance">
                    <label>
                      <span>Цвет осей</span>
                      <input
                        type="color"
                        value={selectedFunctionGraphAxisColor}
                        onChange={(event) =>
                          updateSelectedFunctionGraphAppearance({
                            axisColor: event.target.value || "#ff8e3c",
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>Цвет плоскости</span>
                      <input
                        type="color"
                        value={selectedFunctionGraphPlaneColor}
                        onChange={(event) =>
                          updateSelectedFunctionGraphAppearance({
                            planeColor: event.target.value || "#8ea7ff",
                          })
                        }
                      />
                    </label>
                  </div>

                  <div className="workbook-session__graph-mode-tabs">
                    <button
                      type="button"
                      className={graphWorkbenchTab === "catalog" ? "is-active" : ""}
                      onClick={() => setGraphWorkbenchTab("catalog")}
                    >
                      Каталог
                    </button>
                    <button
                      type="button"
                      className={graphWorkbenchTab === "work" ? "is-active" : ""}
                      onClick={() => setGraphWorkbenchTab("work")}
                    >
                      Работа с чертежом
                    </button>
                  </div>

                  {graphWorkbenchTab === "catalog" ? (
                    <>
                      <div className="workbook-session__graph-builder-row">
                        <TextField
                          size="small"
                          value={graphExpressionDraft}
                          error={Boolean(graphDraftError)}
                          helperText={
                            graphDraftError ??
                            "Примеры: y = x^2 - 3*x + 2, sin(x), 1/x, abs(x)"
                          }
                          onChange={(event) => {
                            setGraphExpressionDraft(event.target.value);
                            setSelectedGraphPresetId(null);
                            if (graphDraftError) setGraphDraftError(null);
                          }}
                          placeholder="Формула y = ..."
                        />
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            setSelectedGraphPresetId(null);
                            appendSelectedGraphFunction();
                          }}
                        >
                          Добавить
                        </Button>
                      </div>
                      <div className="workbook-session__graph-presets">
                        {FUNCTION_GRAPH_PRESETS.map((preset) => (
                          <button
                            type="button"
                            key={preset.id}
                            className={`workbook-session__graph-preset ${
                              selectedGraphPresetId === preset.id ? "is-selected" : ""
                            }`}
                            onClick={() => {
                              setSelectedGraphPresetId(preset.id);
                              activateGraphCatalogCursor();
                              appendSelectedGraphFunction(preset.expression);
                            }}
                            aria-pressed={selectedGraphPresetId === preset.id}
                          >
                            <strong>{preset.title}</strong>
                            <span>{preset.expression}</span>
                            <small>{preset.description}</small>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      {graphTabFunctions.length === 0 ? (
                        <Alert
                          severity="info"
                          action={
                            <Button size="small" onClick={() => setGraphWorkbenchTab("catalog")}>
                              Каталог
                            </Button>
                          }
                        >
                          На плоскости пока нет функций. Добавьте формулу или выберите шаблон.
                        </Alert>
                      ) : (
                        <div className="workbook-session__graph-builder-list">
                          {graphTabFunctions.map((item) => (
                            <div
                              key={`graph-builder-${item.id}`}
                              className="workbook-session__graph-builder-item workbook-session__graph-builder-item--work"
                            >
                              <div className="workbook-session__graph-builder-item-main">
                                <input
                                  type="color"
                                  value={item.color}
                                  onChange={(event) => {
                                    const nextColor = event.target.value || item.color;
                                    updateSelectedGraphFunction(item.id, { color: nextColor });
                                  }}
                                />
                                <TextField
                                  size="small"
                                  value={item.expression}
                                  error={!isFunctionExpressionValid(item.expression)}
                                  placeholder="f(x)"
                                  onChange={(event) =>
                                    normalizeGraphExpressionDraft(item.id, event.target.value, true)
                                  }
                                  onBlur={() => {
                                    commitSelectedGraphExpressions();
                                  }}
                                />
                                <Switch
                                  size="small"
                                  checked={item.visible !== false}
                                  onChange={(event) => {
                                    const visible = event.target.checked;
                                    updateSelectedGraphFunction(item.id, { visible });
                                  }}
                                />
                                <IconButton
                                  size="small"
                                  onClick={() => {
                                    removeSelectedGraphFunction(item.id);
                                  }}
                                  disabled={graphTabFunctions.length <= 1}
                                >
                                  <CloseRoundedIcon fontSize="small" />
                                </IconButton>
                              </div>
                              <div className="workbook-session__graph-transform-row">
                                <TextField
                                  size="small"
                                  type="number"
                                  label="Δx"
                                  value={item.offsetX ?? 0}
                                  onChange={(event) => {
                                    const next = Number(event.target.value);
                                    const safe = Number.isFinite(next)
                                      ? clampGraphOffset(next)
                                      : clampGraphOffset(item.offsetX ?? 0);
                                    updateSelectedGraphFunction(item.id, { offsetX: safe });
                                  }}
                                />
                                <TextField
                                  size="small"
                                  type="number"
                                  label="Δy"
                                  value={item.offsetY ?? 0}
                                  onChange={(event) => {
                                    const next = Number(event.target.value);
                                    const safe = Number.isFinite(next)
                                      ? clampGraphOffset(next)
                                      : clampGraphOffset(item.offsetY ?? 0);
                                    updateSelectedGraphFunction(item.id, { offsetY: safe });
                                  }}
                                />
                                <TextField
                                  size="small"
                                  type="number"
                                  label="Kx"
                                  value={item.scaleX ?? 1}
                                  inputProps={{ step: 0.1, min: -12, max: 12 }}
                                  onChange={(event) => {
                                    const next = Number(event.target.value);
                                    const safe = Number.isFinite(next)
                                      ? normalizeGraphScale(next, item.scaleX ?? 1)
                                      : normalizeGraphScale(item.scaleX ?? 1, 1);
                                    updateSelectedGraphFunction(item.id, { scaleX: safe });
                                  }}
                                />
                                <TextField
                                  size="small"
                                  type="number"
                                  label="Ky"
                                  value={item.scaleY ?? 1}
                                  inputProps={{ step: 0.1, min: -12, max: 12 }}
                                  onChange={(event) => {
                                    const next = Number(event.target.value);
                                    const safe = Number.isFinite(next)
                                      ? normalizeGraphScale(next, item.scaleY ?? 1)
                                      : normalizeGraphScale(item.scaleY ?? 1, 1);
                                    updateSelectedGraphFunction(item.id, { scaleY: safe });
                                  }}
                                />
                              </div>
                              <div className="workbook-session__graph-transform-actions">
                                <Tooltip title="Отразить график по оси X" arrow>
                                  <IconButton
                                    size="small"
                                    onClick={() => reflectGraphFunctionByAxis(item.id, "x")}
                                    aria-label="Отразить график по оси X"
                                  >
                                    <SwapVertRoundedIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Отразить график по оси Y" arrow>
                                  <IconButton
                                    size="small"
                                    onClick={() => reflectGraphFunctionByAxis(item.id, "y")}
                                    aria-label="Отразить график по оси Y"
                                  >
                                    <SwapHorizRoundedIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="workbook-session__hint">
                        Координатная сетка и оси отображаются прямо на доске в границах плоскости.
                      </p>
                    </>
                  )}
                </>
              )}

              {graphDraftError ? <Alert severity="error">{graphDraftError}</Alert> : null}
            </div>
          </div>
          ) : null}

          {utilityTab === "layers" ? (
          <div className="workbook-session__card">
            <h3>Слои</h3>
            <div className="workbook-session__settings">
              <div className="workbook-session__solid-card-list workbook-session__solid-card-list--figure">
                {compositionLayers.length ? (
                  compositionLayers.map((layerItem) => {
                    const layerObjects = compositionObjectsByLayer.get(layerItem.id) ?? [];
                    return (
                      <article key={layerItem.id} className="workbook-session__solid-card">
                        <div className="workbook-session__solid-card-head">
                          <span className="workbook-session__solid-card-title">
                            {layerItem.name}
                          </span>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => void dissolveCompositionLayer(layerItem.id)}
                          >
                            Расформировать
                          </Button>
                        </div>
                        <div className="workbook-session__layer-subcards">
                          {layerObjects.map((object) => (
                            <div
                              key={`${layerItem.id}-${object.id}`}
                              className="workbook-session__layer-subcard"
                            >
                              <div className="workbook-session__layer-subcard-main">
                                <strong>{getWorkbookObjectTypeLabel(object)}</strong>
                                <span>
                                  {`#${object.id.slice(0, 6)} · ${Math.max(
                                    1,
                                    Math.round(Math.abs(object.width))
                                  )}×${Math.max(1, Math.round(Math.abs(object.height)))}`}
                                </span>
                              </div>
                              <div className="workbook-session__solid-card-controls">
                                <Tooltip title="Подсветить на доске" arrow>
                                  <span>
                                    <IconButton
                                      size="small"
                                      onClick={() => focusObjectInWorkspace(object.id)}
                                    >
                                      <FilterCenterFocusRoundedIcon fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                                <Tooltip title="Убрать из композиции" arrow>
                                  <span>
                                    <IconButton
                                      size="small"
                                      onClick={() =>
                                        void removeObjectFromComposition(object.id, layerItem.id)
                                      }
                                    >
                                      <CloseRoundedIcon fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                                <Tooltip title="Удалить с доски" arrow>
                                  <span>
                                    <IconButton
                                      size="small"
                                      color="error"
                                      onClick={() => void commitObjectDelete(object.id)}
                                    >
                                      <DeleteOutlineRoundedIcon fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                              </div>
                            </div>
                          ))}
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <p className="workbook-session__hint">
                    Композиций пока нет. Выделите область и выберите «Объединить в композицию».
                  </p>
                )}
              </div>
            </div>
          </div>
          ) : null}

          {utilityTab === "transform" ? (
          <div className="workbook-session__card">
            <h3>Трансформации</h3>
            <div className="workbook-session__geometry">
              {!selectedObject ? (
                <p className="workbook-session__hint">Выберите объект для настройки.</p>
              ) : null}
              {selectedObject &&
              selectedObject.type !== "function_graph" &&
              selectedObject.type !== "text" ? (
                <div className="workbook-session__geometry-actions">
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => void mirrorSelectedObject("horizontal")}
                  >
                    Отразить по X
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => void mirrorSelectedObject("vertical")}
                  >
                    Отразить по Y
                  </Button>
                </div>
              ) : null}
              {selectedObject && canToggleSelectedObjectLabels ? (
                <div className="workbook-session__settings-row">
                  <span>Показывать названия вершин/точек</span>
                  <Switch
                    size="small"
                    checked={selectedObjectShowLabels}
                    onChange={(event) =>
                      void updateSelectedObjectMeta({
                        showLabels: event.target.checked,
                      })
                    }
                  />
                </div>
              ) : null}
              {selectedObject &&
              selectedObjectSceneLayerId !== MAIN_SCENE_LAYER_ID ? (
                <div className="workbook-session__settings-row">
                  <span>Композиция</span>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => void dissolveCompositionLayer(selectedObjectSceneLayerId)}
                  >
                    Расформировать
                  </Button>
                </div>
              ) : null}

              {selectedObject?.type === "solid3d" ? (
                <div className="workbook-session__solid-inspector">
                  <div className="workbook-session__solid-tabs">
                    <Button
                      size="small"
                      className="workbook-session__solid-tab-btn"
                      startIcon={<ViewInArRoundedIcon />}
                      variant={solid3dInspectorTab === "figure" ? "contained" : "outlined"}
                      onClick={() => setSolid3dInspectorTab("figure")}
                    >
                      Фигура
                    </Button>
                    <Button
                      size="small"
                      className="workbook-session__solid-tab-btn"
                      startIcon={<PolylineRoundedIcon />}
                      variant={solid3dInspectorTab === "section" ? "contained" : "outlined"}
                      onClick={() => setSolid3dInspectorTab("section")}
                    >
                      Сечения
                    </Button>
                  </div>

                  {solid3dInspectorTab === "figure" ? (
                    selectedSolidMesh ? (
                      <div className="workbook-session__solid-card-list workbook-session__solid-card-list--figure">
                        <article className="workbook-session__solid-card">
                          <div className="workbook-session__solid-card-row">
                            <span>Скрыть пунктирные линии</span>
                            <Switch
                              size="small"
                              checked={selectedSolidHiddenEdges}
                              onChange={(event) =>
                                void setSolid3dHiddenEdges(event.target.checked)
                              }
                            />
                          </div>
                        </article>

                        <article className="workbook-session__solid-card">
                          <div className="workbook-session__solid-card-head">
                            <span className="workbook-session__solid-card-title">
                              Окрашивание граней
                            </span>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => void resetSolid3dFaceColors()}
                            >
                              Сбросить
                            </Button>
                          </div>
                          <div className="workbook-session__solid-face-grid">
                            {selectedSolidMesh.faces.slice(0, 24).map((_, faceIndex) => (
                              <div
                                key={`solid-face-color-${faceIndex}`}
                                className="workbook-session__solid-face-row"
                              >
                                <span>
                                  {`Грань ${
                                    selectedSolidMesh.faces[faceIndex]
                                      .map(
                                        (vertexIndex) =>
                                          selectedSolidVertexLabels[vertexIndex] ||
                                          getSolidVertexLabel(vertexIndex)
                                      )
                                      .join("-") || faceIndex + 1
                                  }`}
                                </span>
                                <input
                                  type="color"
                                  className="workbook-session__solid-color"
                                  value={
                                    selectedSolidFaceColors[String(faceIndex)] ||
                                    "#5f6aa0"
                                  }
                                  onChange={(event) =>
                                    void setSolid3dFaceColor(
                                      faceIndex,
                                      event.target.value || "#5f6aa0"
                                    )
                                  }
                                />
                              </div>
                            ))}
                          </div>
                          {selectedSolidMesh.faces.length > 24 ? (
                            <p className="workbook-session__hint">
                              Для этой фигуры доступно много граней. Показаны первые 24.
                            </p>
                          ) : null}
                        </article>

                        <article className="workbook-session__solid-card">
                          <div className="workbook-session__solid-card-head">
                            <span className="workbook-session__solid-card-title">
                              Пометки углов
                            </span>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => void addSolid3dAngleMark()}
                            >
                              Добавить
                            </Button>
                          </div>
                          {selectedSolidAngleMarks.length ? (
                            <div className="workbook-session__solid-angle-list">
                              {selectedSolidAngleMarks.map((mark) => (
                                <div
                                  key={mark.id}
                                  className="workbook-session__solid-angle-row"
                                >
                                  <Select
                                    native
                                    size="small"
                                    value={String(mark.vertexIndex)}
                                    onChange={(event) =>
                                      void updateSolid3dAngleMark(mark.id, {
                                        vertexIndex: Number(event.target.value),
                                      })
                                    }
                                  >
                                    {selectedSolidMesh.vertices.map((_, index) => (
                                      <option key={`vertex-opt-${index}`} value={index}>
                                        {selectedSolidVertexLabels[index] ||
                                          getSolidVertexLabel(index)}
                                      </option>
                                    ))}
                                  </Select>
                                  <TextField
                                    size="small"
                                    className="workbook-session__solid-input"
                                    placeholder="Значение/комментарий угла"
                                    value={mark.label}
                                    onChange={(event) =>
                                      void updateSolid3dAngleMark(mark.id, {
                                        label: event.target.value,
                                      })
                                    }
                                  />
                                  <input
                                    type="color"
                                    className="workbook-session__solid-color"
                                    value={mark.color || "#ff8e3c"}
                                    onChange={(event) =>
                                      void updateSolid3dAngleMark(mark.id, {
                                        color: event.target.value || "#ff8e3c",
                                      })
                                    }
                                  />
                                  <Switch
                                    size="small"
                                    checked={mark.visible !== false}
                                    onChange={(event) =>
                                      void updateSolid3dAngleMark(mark.id, {
                                        visible: event.target.checked,
                                      })
                                    }
                                  />
                                  <IconButton
                                    size="small"
                                    onClick={() => void deleteSolid3dAngleMark(mark.id)}
                                  >
                                    <CloseRoundedIcon />
                                  </IconButton>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="workbook-session__hint">
                              Добавьте пометку угла и задайте комментарий вручную.
                            </p>
                          )}
                        </article>
                      </div>
                    ) : (
                      <p className="workbook-session__hint">
                        Выберите 3D-фигуру для настройки отображения.
                      </p>
                    )
                  ) : (
                    <>
                      <div className="workbook-session__solid-section-actions">
                        <Button
                          size="small"
                          variant={isSolid3dPointCollectionActive ? "contained" : "outlined"}
                          onClick={startSolid3dSectionPointCollection}
                          disabled={!canSelect}
                        >
                          Добавить точки сечения
                        </Button>
                        {isSolid3dPointCollectionActive ? (
                          <>
                            <Button
                              size="small"
                              variant="contained"
                              onClick={() => void buildSectionFromDraftPoints()}
                              disabled={
                                !solid3dDraftPoints || solid3dDraftPoints.points.length < 3
                              }
                            >
                              Построить сечение
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={clearSolid3dDraftPoints}
                              disabled={
                                !solid3dDraftPoints || solid3dDraftPoints.points.length === 0
                              }
                            >
                              Очистить точки
                            </Button>
                          </>
                        ) : null}
                      </div>

                      {isSolid3dPointCollectionActive ? (
                        <Alert severity="info">
                          Кликните по ребру или вершине 3D-фигуры, чтобы добавить точку сечения.
                          {solid3dDraftPoints
                            ? ` Точки: ${solid3dDraftPoints.points.length}/${solid3dDraftPointLimit}.`
                            : null}
                        </Alert>
                      ) : solid3dSectionPointTarget ? (
                        <Alert severity="info">
                          Выбрана вершина{" "}
                          {selectedActiveSection?.points[solid3dSectionPointTarget.pointIndex]?.label ??
                            getSectionPointLabel(solid3dSectionPointTarget.pointIndex)}
                          . Кликните по ребру или вершине фигуры, чтобы перенести её.
                        </Alert>
                      ) : null}

                      {selectedSolid3dState?.sections.length ? (
                        <div className="workbook-session__solid-card-list">
                          {selectedSolid3dState.sections.map((section) => (
                            <article
                              key={section.id}
                              className={`workbook-session__solid-card ${
                                activeSolidSectionId === section.id ? "is-selected" : ""
                              }`}
                              onClick={() => setActiveSolidSectionId(section.id)}
                            >
                              <div className="workbook-session__solid-card-head">
                                <span className="workbook-session__solid-card-title">{section.name}</span>
                                <div className="workbook-session__solid-card-controls">
                                  <input
                                    type="color"
                                    className="workbook-session__solid-color"
                                    value={section.color}
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={(event) =>
                                      void updateSolid3dSection(section.id, {
                                        color: event.target.value || "#ff8e3c",
                                      })
                                    }
                                  />
                                  <Switch
                                    size="small"
                                    checked={section.visible}
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={(event) => {
                                      const nextVisible = event.target.checked;
                                      if (!nextVisible) {
                                        setSolid3dSectionPointTarget((current) =>
                                          current?.sectionId === section.id ? null : current
                                        );
                                      }
                                      void updateSolid3dSection(section.id, {
                                        visible: nextVisible,
                                      });
                                    }}
                                  />
                                  <IconButton
                                    size="small"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void deleteSolid3dSection(section.id);
                                    }}
                                  >
                                    <CloseRoundedIcon />
                                  </IconButton>
                                </div>
                              </div>

                              {section.points.length ? (
                                <div className="workbook-session__solid-points">
                                  {section.points.map((point, index) => (
                                    <div
                                      key={`${section.id}-point-${index}`}
                                      className="workbook-session__solid-point-row"
                                    >
                                      <Chip
                                        size="small"
                                        clickable
                                        label={point.label || getSectionPointLabel(index)}
                                        color={
                                          solid3dSectionPointTarget?.sectionId === section.id &&
                                          solid3dSectionPointTarget.pointIndex === index
                                            ? "primary"
                                            : "default"
                                        }
                                        variant={
                                          solid3dSectionPointTarget?.sectionId === section.id &&
                                          solid3dSectionPointTarget.pointIndex === index
                                            ? "filled"
                                            : "outlined"
                                        }
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          setActiveSolidSectionId(section.id);
                                          setSolid3dSectionPointTarget({
                                            sectionId: section.id,
                                            pointIndex: index,
                                          });
                                        }}
                                      />
                                      <TextField
                                        size="small"
                                        className="workbook-session__solid-input"
                                        value={point.label || getSectionPointLabel(index)}
                                        InputProps={{
                                          readOnly: true,
                                        }}
                                        onClick={(event) => event.stopPropagation()}
                                      />
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="workbook-session__hint">
                                  Точки не заданы для этого сечения.
                                </p>
                              )}
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className="workbook-session__hint">
                          Добавьте сечение, затем укажите точки на ребрах или вершинах фигуры.
                        </p>
                      )}
                    </>
                  )}
                </div>
              ) : selectedFunctionGraphObject || tool === "function_graph" ? (
                <div className="workbook-session__settings">
                  <p className="workbook-session__hint">
                    Настройки графиков перенесены во вкладку «График функции».
                  </p>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<ShowChartRoundedIcon />}
                    onClick={() => openUtilityPanel("graph", { toggle: false })}
                  >
                    Открыть вкладку
                  </Button>
                </div>
              ) : selectedTextObject || tool === "text" ? (
                <div className="workbook-session__settings">
                  <p className="workbook-session__hint">
                    {selectedTextObject
                      ? "Редактируйте текст прямо на доске или через параметры ниже."
                      : "Выберите текстовый блок на доске, чтобы включить параметры форматирования."}
                  </p>
                  <TextField
                    size="small"
                    multiline
                    minRows={2}
                    maxRows={5}
                    label="Текст"
                    value={selectedTextObject ? selectedTextDraft : ""}
                    disabled={!selectedTextObject}
                    onChange={(event) => {
                      if (!selectedTextObject) return;
                      const nextValue = event.target.value;
                      setSelectedTextDraft(nextValue);
                      void updateSelectedTextFormatting({ text: nextValue });
                    }}
                  />
                  <div className="workbook-session__settings-row">
                    <span>Шрифт</span>
                    <Select
                      native
                      size="small"
                      value={selectedTextFontFamily}
                      disabled={!selectedTextObject}
                      onChange={(event) =>
                        void updateSelectedTextFormatting(
                          {},
                          { textFontFamily: String(event.target.value) }
                        )
                      }
                    >
                      {TEXT_FONT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="workbook-session__settings-row">
                    <span>Размер</span>
                    <div className="workbook-session__line-range">
                      <input
                        type="range"
                        min={12}
                        max={72}
                        step={1}
                        value={selectedTextFontSizeDraft}
                        disabled={!selectedTextObject}
                        onChange={(event) => {
                          if (!selectedTextObject) return;
                          const nextSize = Math.max(
                            12,
                            Math.min(72, Number(event.target.value) || 18)
                          );
                          setSelectedTextFontSizeDraft(nextSize);
                          void updateSelectedTextFormatting({ fontSize: nextSize });
                        }}
                      />
                    </div>
                  </div>
                  <div className="workbook-session__text-controls-grid">
                    <div className="workbook-session__text-icon-row">
                      <Tooltip title="Жирный" arrow>
                        <span>
                          <IconButton
                            size="small"
                            className={selectedTextBold ? "is-active" : ""}
                            disabled={!selectedTextObject}
                            onClick={() =>
                              void updateSelectedTextFormatting(
                                {},
                                { textBold: !selectedTextBold }
                              )
                            }
                          >
                            <FormatBoldRoundedIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Курсив" arrow>
                        <span>
                          <IconButton
                            size="small"
                            className={selectedTextItalic ? "is-active" : ""}
                            disabled={!selectedTextObject}
                            onClick={() =>
                              void updateSelectedTextFormatting(
                                {},
                                { textItalic: !selectedTextItalic }
                              )
                            }
                          >
                            <FormatItalicRoundedIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Подчеркнуть" arrow>
                        <span>
                          <IconButton
                            size="small"
                            className={selectedTextUnderline ? "is-active" : ""}
                            disabled={!selectedTextObject}
                            onClick={() =>
                              void updateSelectedTextFormatting(
                                {},
                                { textUnderline: !selectedTextUnderline }
                              )
                            }
                          >
                            <FormatUnderlinedRoundedIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </div>
                    <div className="workbook-session__text-icon-row">
                      <Tooltip title="Слева" arrow>
                        <span>
                          <IconButton
                            size="small"
                            className={selectedTextAlign === "left" ? "is-active" : ""}
                            disabled={!selectedTextObject}
                            onClick={() =>
                              void updateSelectedTextFormatting({}, { textAlign: "left" })
                            }
                          >
                            <FormatAlignLeftRoundedIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="По центру" arrow>
                        <span>
                          <IconButton
                            size="small"
                            className={selectedTextAlign === "center" ? "is-active" : ""}
                            disabled={!selectedTextObject}
                            onClick={() =>
                              void updateSelectedTextFormatting({}, { textAlign: "center" })
                            }
                          >
                            <FormatAlignCenterRoundedIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Справа" arrow>
                        <span>
                          <IconButton
                            size="small"
                            className={selectedTextAlign === "right" ? "is-active" : ""}
                            disabled={!selectedTextObject}
                            onClick={() =>
                              void updateSelectedTextFormatting({}, { textAlign: "right" })
                            }
                          >
                            <FormatAlignRightRoundedIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </div>
                    <div className="workbook-session__text-color-row">
                      <Tooltip title="Цвет текста" arrow>
                        <span className="workbook-session__text-color-control">
                          <FormatColorTextRoundedIcon fontSize="small" />
                          <input
                            type="color"
                            value={selectedTextColor}
                            disabled={!selectedTextObject}
                            onChange={(event) =>
                              void updateSelectedTextFormatting(
                                { color: event.target.value || "#172039" },
                                { textColor: event.target.value || "#172039" }
                              )
                            }
                          />
                        </span>
                      </Tooltip>
                      <Tooltip title="Фон текста" arrow>
                        <span className="workbook-session__text-color-control">
                          <FormatColorFillRoundedIcon fontSize="small" />
                          <input
                            type="color"
                            value={
                              selectedTextBackground === "transparent"
                                ? "#ffffff"
                                : selectedTextBackground
                            }
                            disabled={!selectedTextObject}
                            onChange={(event) =>
                              void updateSelectedTextFormatting(
                                {},
                                { textBackground: event.target.value || "transparent" }
                              )
                            }
                          />
                        </span>
                      </Tooltip>
                      <Tooltip title="Убрать фон текста" arrow>
                        <span>
                          <IconButton
                            size="small"
                            disabled={!selectedTextObject}
                            onClick={() =>
                              void updateSelectedTextFormatting(
                                {},
                                { textBackground: "transparent" }
                              )
                            }
                          >
                            <CloseRoundedIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              ) : selectedDividerObject || tool === "divider" ? (
                <div className="workbook-session__settings">
                  <p className="workbook-session__hint">
                    Объект: {selectedDividerObject ? "Разделитель" : "Новый разделитель"}
                  </p>
                  <div className="workbook-session__settings-row">
                    <span>Стиль разделителя</span>
                    <div className="workbook-session__toggle-group">
                      <button
                        type="button"
                        className={
                          (selectedDividerObject ? selectedDividerStyle : "dashed") === "solid"
                            ? "is-active"
                            : ""
                        }
                        onClick={() => {
                          if (selectedDividerObject) {
                            void updateSelectedDividerMeta({ lineStyle: "solid" });
                          }
                        }}
                        disabled={!selectedDividerObject}
                      >
                        Сплошной
                      </button>
                      <button
                        type="button"
                        className={
                          (selectedDividerObject ? selectedDividerStyle : "dashed") === "dashed"
                            ? "is-active"
                            : ""
                        }
                        onClick={() => {
                          if (selectedDividerObject) {
                            void updateSelectedDividerMeta({ lineStyle: "dashed" });
                          }
                        }}
                        disabled={!selectedDividerObject}
                      >
                        Пунктирный
                      </button>
                    </div>
                  </div>
                  <div className="workbook-session__settings-row">
                    <span>Цвет</span>
                    <input
                      type="color"
                      value={selectedDividerColor}
                      disabled={!selectedDividerObject}
                      onChange={(event) =>
                        void updateSelectedDividerObject({
                          color: event.target.value || "#4f63ff",
                        })
                      }
                    />
                  </div>
                  <div className="workbook-session__settings-row">
                    <span>Толщина</span>
                    <div className="workbook-session__line-range">
                      <input
                        type="range"
                        min={1}
                        max={18}
                        step={1}
                        value={dividerWidthDraft}
                        disabled={!selectedDividerObject}
                        onChange={(event) => {
                          const nextWidth = Math.max(1, Math.min(18, Number(event.target.value) || 1));
                          setDividerWidthDraft(nextWidth);
                          if (selectedDividerObject) {
                            void updateSelectedDividerObject({ strokeWidth: nextWidth });
                          }
                        }}
                        onMouseUp={() => void commitSelectedDividerWidth()}
                        onTouchEnd={() => void commitSelectedDividerWidth()}
                        onBlur={() => void commitSelectedDividerWidth()}
                      />
                    </div>
                  </div>
                </div>
              ) : selectedLineObject || tool === "line" ? (
                <div className="workbook-session__settings">
                  <p className="workbook-session__hint">
                    Объект: {selectedLineObject ? selectedObjectLabel : "Новая линия"}
                  </p>
                  <div className="workbook-session__settings-row">
                    <span>Тип линии</span>
                    <div className="workbook-session__toggle-group">
                      <button
                        type="button"
                        className={
                          (!selectedLineObject || selectedLineKind === "line")
                            ? "is-active"
                            : ""
                        }
                        onClick={() => {
                          if (selectedLineObject) {
                            void updateSelectedLineMeta({ lineKind: "line" });
                          }
                        }}
                      >
                        Линия
                      </button>
                      <button
                        type="button"
                        className={
                          selectedLineObject && selectedLineKind === "segment"
                            ? "is-active"
                            : ""
                        }
                        onClick={() => {
                          if (selectedLineObject) {
                            void updateSelectedLineMeta({ lineKind: "segment" });
                          }
                        }}
                        disabled={!selectedLineObject}
                      >
                        Отрезок
                      </button>
                    </div>
                  </div>
                  <div className="workbook-session__settings-row">
                    <span>Стиль линии</span>
                    <div className="workbook-session__toggle-group">
                      <button
                        type="button"
                        className={
                          (selectedLineObject ? selectedLineStyle : lineStyle) === "solid"
                            ? "is-active"
                            : ""
                        }
                        onClick={() => {
                          setLineStyle("solid");
                          if (selectedLineObject) {
                            void updateSelectedLineMeta({ lineStyle: "solid" });
                          }
                        }}
                      >
                        Сплошная
                      </button>
                      <button
                        type="button"
                        className={
                          (selectedLineObject ? selectedLineStyle : lineStyle) === "dashed"
                            ? "is-active"
                            : ""
                        }
                        onClick={() => {
                          setLineStyle("dashed");
                          if (selectedLineObject) {
                            void updateSelectedLineMeta({ lineStyle: "dashed" });
                          }
                        }}
                      >
                        Пунктирная
                      </button>
                    </div>
                  </div>
                  <div className="workbook-session__settings-row">
                    <span>Цвет линии</span>
                    <input
                      type="color"
                      value={selectedLineColor}
                      disabled={!selectedLineObject}
                      onChange={(event) =>
                        void updateSelectedLineObject({
                          color: event.target.value || "#4f63ff",
                        })
                      }
                    />
                  </div>
                  <div className="workbook-session__settings-row">
                    <span>Толщина линии</span>
                    <div className="workbook-session__line-range">
                      <input
                        type="range"
                        min={1}
                        max={18}
                        step={1}
                        value={lineWidthDraft}
                        disabled={!selectedLineObject}
                        onChange={(event) => {
                          const nextWidth = Math.max(1, Math.min(18, Number(event.target.value) || 1));
                          setLineWidthDraft(nextWidth);
                          if (selectedLineObject) {
                            void updateSelectedLineObject({ strokeWidth: nextWidth });
                          }
                        }}
                        onMouseUp={() => void commitSelectedLineWidth()}
                        onTouchEnd={() => void commitSelectedLineWidth()}
                        onBlur={() => void commitSelectedLineWidth()}
                      />
                    </div>
                  </div>
                  {selectedLineObject && selectedLineKind === "segment" ? (
                    <div className="workbook-session__line-endpoints-row">
                      <TextField
                        size="small"
                        label="A"
                        value={selectedLineStartLabelDraft}
                        onChange={(event) => {
                          const nextValue = event.target.value.slice(0, 12);
                          setSelectedLineStartLabelDraft(nextValue);
                          void commitSelectedLineEndpointLabel("start", nextValue);
                        }}
                        onBlur={() => void commitSelectedLineEndpointLabel("start")}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return;
                          event.currentTarget.blur();
                        }}
                      />
                      <TextField
                        size="small"
                        label="B"
                        value={selectedLineEndLabelDraft}
                        onChange={(event) => {
                          const nextValue = event.target.value.slice(0, 12);
                          setSelectedLineEndLabelDraft(nextValue);
                          void commitSelectedLineEndpointLabel("end", nextValue);
                        }}
                        onBlur={() => void commitSelectedLineEndpointLabel("end")}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return;
                          event.currentTarget.blur();
                        }}
                      />
                    </div>
                  ) : selectedLineObject ? (
                    <p className="workbook-session__hint">
                      Чтобы подписывать концы, переключите объект в режим «Отрезок».
                    </p>
                  ) : null}
                </div>
              ) : selectedPointObject || tool === "point" ? (
                <div className="workbook-session__settings">
                  <p className="workbook-session__hint">
                    {selectedPointObject
                      ? "Точка выбрана. Переименование доступно по правому клику."
                      : "Инструмент «Точка»: ставьте точки кликом по доске."}
                  </p>
                  <div className="workbook-session__geometry-actions">
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={boardObjects.filter((item) => item.type === "point").length < 2}
                      onClick={() => void connectPointObjectsChronologically()}
                    >
                      Объединить точки
                    </Button>
                  </div>
                </div>
              ) : selectedShape2dObject ? (
                <div className="workbook-session__solid-inspector">
                  <div className="workbook-session__solid-card-list workbook-session__solid-card-list--figure">
                    <article className="workbook-session__solid-card">
                      <div className="workbook-session__solid-card-head">
                        <span className="workbook-session__solid-card-title">Фигура</span>
                        <Chip size="small" label={selectedObjectLabel} />
                      </div>
                      {selectedShape2dHasAngles ? (
                        <div className="workbook-session__solid-card-row">
                          <span>Показывать углы</span>
                          <Switch
                            size="small"
                            checked={selectedShape2dShowAngles}
                            onChange={(event) =>
                              void updateSelectedShape2dMeta({
                                showAngles: event.target.checked,
                              })
                            }
                          />
                        </div>
                      ) : (
                        <p className="workbook-session__hint">У выбранного объекта нет углов.</p>
                      )}
                    </article>
                    <article className="workbook-session__solid-card">
                      <div className="workbook-session__solid-card-head">
                        <span className="workbook-session__solid-card-title">Вершины</span>
                      </div>
                      <div className="workbook-session__solid-points">
                        {selectedShape2dLabels.map((label, index) => (
                          <div
                            key={`shape-vertex-${selectedShape2dObject.id}-${index}`}
                            className="workbook-session__solid-point-row"
                          >
                            <Chip size="small" label={label} />
                            <TextField
                              size="small"
                              className="workbook-session__solid-input workbook-session__solid-input--compact"
                              label={`Вершина ${index + 1}`}
                              value={shapeVertexLabelDrafts[index] ?? ""}
                              onChange={(event) => {
                                const nextValue = event.target.value.slice(0, 12);
                                setShapeVertexLabelDrafts((current) => {
                                  const next = [...current];
                                  next[index] = nextValue;
                                  return next;
                                });
                                void renameSelectedShape2dVertex(index, nextValue);
                              }}
                              onBlur={() =>
                                void renameSelectedShape2dVertex(
                                  index,
                                  shapeVertexLabelDrafts[index] ?? ""
                                )
                              }
                              onKeyDown={(event) => {
                                if (event.key !== "Enter") return;
                                event.currentTarget.blur();
                              }}
                            />
                            <input
                              type="color"
                              className="workbook-session__solid-color"
                              value={selectedShape2dVertexColors[index] ?? "#4f63ff"}
                              onChange={(event) =>
                                void updateSelectedShape2dVertexColor(index, event.target.value)
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </article>
                    {selectedShape2dHasAngles ? (
                      <article className="workbook-session__solid-card">
                        <div className="workbook-session__solid-card-head">
                          <span className="workbook-session__solid-card-title">Углы</span>
                        </div>
                        <div className="workbook-session__solid-points">
                          {selectedShape2dLabels.map((label, index) => (
                            <div
                              key={`shape-angle-note-${selectedShape2dObject.id}-${index}`}
                              className="workbook-session__solid-point-row"
                            >
                              <Chip size="small" label={`∠${label}`} />
                              <TextField
                                size="small"
                                className="workbook-session__solid-input workbook-session__solid-input--compact"
                                label="Значение"
                                placeholder="Например: 45"
                                value={shapeAngleNoteDrafts[index] ?? ""}
                                onChange={(event) => {
                                  const nextValue = event.target.value.slice(0, 24);
                                  setShapeAngleNoteDrafts((current) => {
                                    const next = [...current];
                                    next[index] = nextValue;
                                    return next;
                                  });
                                  void updateSelectedShape2dAngleNote(index, nextValue);
                                }}
                                onBlur={() =>
                                  void updateSelectedShape2dAngleNote(
                                    index,
                                    shapeAngleNoteDrafts[index] ?? ""
                                  )
                                }
                                onKeyDown={(event) => {
                                  if (event.key !== "Enter") return;
                                  event.currentTarget.blur();
                                }}
                              />
                              <input
                                type="color"
                                className="workbook-session__solid-color"
                                value={selectedShape2dAngleColors[index] ?? "#4f63ff"}
                                onChange={(event) =>
                                  void updateSelectedShape2dAngleColor(index, event.target.value)
                                }
                              />
                            </div>
                          ))}
                        </div>
                      </article>
                    ) : null}
                    <article className="workbook-session__solid-card">
                      <div className="workbook-session__solid-card-head">
                        <span className="workbook-session__solid-card-title">Отрезки</span>
                      </div>
                      <div className="workbook-session__solid-points">
                        {selectedShape2dSegments.map((segment, index) => (
                          <div
                            key={`shape-segment-note-${selectedShape2dObject.id}-${index}`}
                            className="workbook-session__solid-point-row"
                          >
                            <Chip size="small" label={segment} />
                            <TextField
                              size="small"
                              className="workbook-session__solid-input workbook-session__solid-input--compact"
                              label="Пометка"
                              placeholder="Например: 5"
                              value={shapeSegmentNoteDrafts[index] ?? ""}
                              onChange={(event) => {
                                const nextValue = event.target.value.slice(0, 24);
                                setShapeSegmentNoteDrafts((current) => {
                                  const next = [...current];
                                  next[index] = nextValue;
                                  return next;
                                });
                                void updateSelectedShape2dSegmentNote(index, nextValue);
                              }}
                              onBlur={() =>
                                void updateSelectedShape2dSegmentNote(
                                  index,
                                  shapeSegmentNoteDrafts[index] ?? ""
                                )
                              }
                              onKeyDown={(event) => {
                                if (event.key !== "Enter") return;
                                event.currentTarget.blur();
                              }}
                            />
                            <input
                              type="color"
                              className="workbook-session__solid-color"
                              value={selectedShape2dSegmentColors[index] ?? "#4f63ff"}
                              onChange={(event) =>
                                void updateSelectedShape2dSegmentColor(index, event.target.value)
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </article>
                  </div>
                </div>
              ) : (
                <p className="workbook-session__hint">Объект: {selectedObjectLabel}.</p>
              )}
            </div>
          </div>
          ) : null}

          </>
          ) : null}

          </div>
          ) : null}

          {showCollaborationPanels && isSessionChatOpen ? (
            <div
              ref={sessionChatRef}
              className={`workbook-session__session-chat${
                isSessionChatMinimized ? " is-minimized" : ""
              }${isSessionChatMaximized ? " is-maximized" : ""}`}
              style={
                isSessionChatMaximized
                  ? undefined
                  : { left: sessionChatPosition.x, top: sessionChatPosition.y }
              }
            >
              <div
                className="workbook-session__session-chat-head"
                onPointerDown={handleSessionChatDragStart}
              >
                <h4>
                  <ForumRoundedIcon fontSize="small" />
                  Чат сессии
                </h4>
                <div className="workbook-session__session-chat-head-actions">
                  <IconButton
                    size="small"
                    aria-label={isSessionChatMinimized ? "Развернуть чат" : "Свернуть чат"}
                    onClick={() => setIsSessionChatMinimized((current) => !current)}
                  >
                    {isSessionChatMinimized ? (
                      <UnfoldMoreRoundedIcon fontSize="small" />
                    ) : (
                      <UnfoldLessRoundedIcon fontSize="small" />
                    )}
                  </IconButton>
                  <IconButton
                    size="small"
                    aria-label={
                      isSessionChatMaximized ? "Обычный размер чата" : "Развернуть чат на максимум"
                    }
                    onClick={() => setIsSessionChatMaximized((current) => !current)}
                    disabled={isSessionChatMinimized}
                  >
                    {isSessionChatMaximized ? (
                      <FullscreenExitRoundedIcon fontSize="small" />
                    ) : (
                      <FullscreenRoundedIcon fontSize="small" />
                    )}
                  </IconButton>
                  <IconButton
                    size="small"
                    aria-label="Закрыть чат"
                    onClick={() => {
                      setIsSessionChatOpen(false);
                      setIsSessionChatEmojiOpen(false);
                    }}
                  >
                    <CloseRoundedIcon fontSize="small" />
                  </IconButton>
                </div>
              </div>

              {!isSessionChatMinimized ? (
                <>
                  <div className="workbook-session__session-chat-meta">
                    <div className="workbook-session__session-chat-avatars">
                      {participantCards.slice(0, 10).map((participant) => (
                        <Tooltip
                          key={`chat-avatar-${participant.userId}`}
                          title={participant.displayName}
                          arrow
                        >
                          <Avatar
                            src={participant.photo}
                            alt={participant.displayName}
                            className={`workbook-session__session-chat-avatar ${
                              participant.isOnline ? "is-online" : "is-offline"
                            }`}
                          >
                            {participant.displayName.slice(0, 1)}
                          </Avatar>
                        </Tooltip>
                      ))}
                    </div>
                    <div className="workbook-session__session-chat-meta-right">
                      <span>{onlineParticipantsCount} онлайн</span>
                      {sessionChatUnreadCount > 0 || !isSessionChatAtBottom ? (
                        <Tooltip title="Перемотать к последнему сообщению" arrow>
                          <IconButton
                            size="small"
                            onClick={() => {
                              scrollSessionChatToLatest("smooth");
                              markSessionChatReadToLatest();
                            }}
                            aria-label="К последнему сообщению"
                          >
                            <KeyboardDoubleArrowDownRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : null}
                    </div>
                  </div>
                  <div className="workbook-session__chat-list" ref={sessionChatListRef}>
                    {chatMessages.length === 0 ? (
                      <p className="workbook-session__hint">
                        Сообщений пока нет. Используйте чат для быстрых текстовых подсказок.
                      </p>
                    ) : (
                      chatMessages.map((message) => (
                        <div key={message.id}>
                          {firstUnreadSessionChatMessageId === message.id ? (
                            <div className="workbook-session__chat-unread-divider">
                              Непрочитанные
                            </div>
                          ) : null}
                          <article
                            data-session-chat-message-id={message.id}
                            className={`workbook-session__chat-message${
                              message.authorUserId === user?.id ? " is-own" : ""
                            }`}
                          >
                            <strong>{message.authorName}</strong>
                            <p>{message.text}</p>
                            <time>
                              {new Date(message.createdAt).toLocaleTimeString("ru-RU", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </time>
                          </article>
                        </div>
                      ))
                    )}
                  </div>
                  {canSendSessionChat ? (
                    <div className="workbook-session__session-chat-input-wrap">
                      <div className="workbook-session__session-chat-input">
                        <IconButton
                          size="small"
                          aria-label="Эмодзи"
                          onClick={() =>
                            setIsSessionChatEmojiOpen((current) => !current)
                          }
                        >
                          <SentimentSatisfiedRoundedIcon fontSize="small" />
                        </IconButton>
                        <TextField
                          size="small"
                          fullWidth
                          placeholder="Введите сообщение..."
                          value={sessionChatDraft}
                          onChange={(event) => setSessionChatDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" || event.shiftKey) return;
                            event.preventDefault();
                            void handleSendSessionChatMessage();
                          }}
                        />
                        <IconButton
                          size="small"
                          color="primary"
                          aria-label="Отправить"
                          onClick={() => void handleSendSessionChatMessage()}
                          disabled={!sessionChatDraft.trim()}
                        >
                          <SendRoundedIcon fontSize="small" />
                        </IconButton>
                      </div>
                      {isSessionChatEmojiOpen ? (
                        <div className="workbook-session__session-chat-emoji">
                          {WORKBOOK_CHAT_EMOJIS.map((emoji) => (
                            <button
                              key={`session-chat-emoji-${emoji}`}
                              type="button"
                              onClick={() =>
                                setSessionChatDraft((current) => `${current}${emoji}`)
                              }
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="workbook-session__hint">
                      Отправка сообщений недоступна: доступ к чату отключён.
                    </p>
                  )}
                </>
              ) : null}
            </div>
          ) : null}

          <Menu
            container={overlayContainer}
            open={Boolean(solid3dVertexContextMenu)}
            onClose={() => setSolid3dVertexContextMenu(null)}
            anchorReference="anchorPosition"
            anchorPosition={
              solid3dVertexContextMenu
                ? { top: solid3dVertexContextMenu.y, left: solid3dVertexContextMenu.x }
                : undefined
            }
          >
            <div className="workbook-session__solid-menu">
              <TextField
                size="small"
                label="Название вершины"
                value={solid3dVertexContextMenu?.label ?? ""}
                onChange={(event) =>
                  setSolid3dVertexContextMenu((current) =>
                    current ? { ...current, label: event.target.value } : current
                  )
                }
              />
              <div className="workbook-session__solid-menu-actions workbook-session__solid-menu-actions--icons">
                <IconButton
                  size="small"
                  aria-label="Сбросить название вершины"
                  onClick={() => {
                    if (!solid3dVertexContextMenu) return;
                    void renameSolid3dVertex(
                      solid3dVertexContextMenu.vertexIndex,
                      getSolidVertexLabel(solid3dVertexContextMenu.vertexIndex)
                    );
                    setSolid3dVertexContextMenu(null);
                  }}
                >
                  <DeleteOutlineRoundedIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  color="primary"
                  aria-label="Сохранить название вершины"
                  onClick={() => {
                    if (!solid3dVertexContextMenu) return;
                    void renameSolid3dVertex(
                      solid3dVertexContextMenu.vertexIndex,
                      solid3dVertexContextMenu.label
                    );
                    setSolid3dVertexContextMenu(null);
                  }}
                >
                  <SaveRoundedIcon fontSize="small" />
                </IconButton>
              </div>
            </div>
          </Menu>

          <Menu
            container={overlayContainer}
            open={Boolean(solid3dPointContextMenu)}
            onClose={() => setSolid3dPointContextMenu(null)}
            anchorReference="anchorPosition"
            anchorPosition={
              solid3dPointContextMenu
                ? { top: solid3dPointContextMenu.y, left: solid3dPointContextMenu.x }
                : undefined
            }
          >
            <div className="workbook-session__solid-menu">
              <TextField
                size="small"
                label="Название угла сечения"
                value={solid3dPointContextMenu?.label ?? ""}
                onChange={(event) =>
                  setSolid3dPointContextMenu((current) =>
                    current ? { ...current, label: event.target.value } : current
                  )
                }
              />
              <div className="workbook-session__solid-menu-actions workbook-session__solid-menu-actions--icons">
                <IconButton
                  size="small"
                  aria-label="Сбросить название точки сечения"
                  onClick={() => {
                    if (!solid3dPointContextMenu) return;
                    void renameSolid3dSectionPoint(
                      solid3dPointContextMenu.sectionId,
                      solid3dPointContextMenu.pointIndex,
                      getSectionPointLabel(solid3dPointContextMenu.pointIndex)
                    );
                    setSolid3dPointContextMenu(null);
                  }}
                >
                  <DeleteOutlineRoundedIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  color="primary"
                  aria-label="Сохранить название точки сечения"
                  onClick={() => {
                    if (!solid3dPointContextMenu) return;
                    void renameSolid3dSectionPoint(
                      solid3dPointContextMenu.sectionId,
                      solid3dPointContextMenu.pointIndex,
                      solid3dPointContextMenu.label
                    );
                    setSolid3dPointContextMenu(null);
                  }}
                >
                  <SaveRoundedIcon fontSize="small" />
                </IconButton>
              </div>
            </div>
          </Menu>

          <Menu
            container={overlayContainer}
            open={Boolean(solid3dSectionContextMenu && contextMenuSection)}
            onClose={() => setSolid3dSectionContextMenu(null)}
            anchorReference="anchorPosition"
            anchorPosition={
              solid3dSectionContextMenu
                ? { top: solid3dSectionContextMenu.y, left: solid3dSectionContextMenu.x }
                : undefined
            }
          >
            {contextMenuSection ? (
              <div className="workbook-session__solid-menu">
                <div className="workbook-session__solid-menu-row">
                  <span>Цвет сечения</span>
                  <input
                    type="color"
                    className="workbook-session__solid-color"
                    value={contextMenuSection.color}
                    onChange={(event) =>
                      void updateSolid3dSection(contextMenuSection.id, {
                        color: event.target.value || "#ff8e3c",
                      }, solid3dSectionContextMenu?.objectId)
                    }
                  />
                </div>
                <div className="workbook-session__solid-menu-row">
                  <span>Показать сечение</span>
                  <Switch
                    size="small"
                    checked={contextMenuSection.visible}
                    onChange={(event) =>
                      void updateSolid3dSection(contextMenuSection.id, {
                        visible: event.target.checked,
                      }, solid3dSectionContextMenu?.objectId)
                    }
                  />
                </div>
                <div className="workbook-session__solid-menu-row">
                  <span>Заливка</span>
                  <Switch
                    size="small"
                    checked={contextMenuSection.fillEnabled}
                    onChange={(event) =>
                      void updateSolid3dSection(contextMenuSection.id, {
                        fillEnabled: event.target.checked,
                      }, solid3dSectionContextMenu?.objectId)
                    }
                  />
                </div>
                <div className="workbook-session__solid-menu-row">
                  <span>Метки параметров</span>
                  <Switch
                    size="small"
                    checked={contextMenuSection.showMetrics}
                    onChange={(event) =>
                      void updateSolid3dSection(contextMenuSection.id, {
                        showMetrics: event.target.checked,
                      }, solid3dSectionContextMenu?.objectId)
                    }
                  />
                </div>
                <div className="workbook-session__solid-menu-actions">
                  <Button
                    size="small"
                    color="error"
                    onClick={() => {
                      void deleteSolid3dSection(
                        contextMenuSection.id,
                        solid3dSectionContextMenu?.objectId
                      );
                      setSolid3dSectionContextMenu(null);
                    }}
                  >
                    Удалить сечение
                  </Button>
                </div>
              </div>
            ) : null}
          </Menu>

          <Menu
            container={overlayContainer}
            open={Boolean(shapeVertexContextMenu && contextMenuShapeVertexObject)}
            onClose={() => setShapeVertexContextMenu(null)}
            anchorReference="anchorPosition"
            anchorPosition={
              shapeVertexContextMenu
                ? { top: shapeVertexContextMenu.y, left: shapeVertexContextMenu.x }
                : undefined
            }
          >
            {shapeVertexContextMenu && contextMenuShapeVertexObject ? (
              <div className="workbook-session__solid-menu">
                <TextField
                  size="small"
                  label="Название вершины"
                  value={shapeVertexLabelDraft}
                  onChange={(event) =>
                    setShapeVertexLabelDraft(event.target.value.slice(0, 12))
                  }
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key !== "Enter") return;
                    void renameShape2dVertexByObjectId(
                      shapeVertexContextMenu.objectId,
                      shapeVertexContextMenu.vertexIndex,
                      shapeVertexLabelDraft
                    );
                    setShapeVertexContextMenu(null);
                  }}
                  autoFocus
                />
                <div className="workbook-session__solid-menu-actions workbook-session__solid-menu-actions--icons">
                  <IconButton
                    size="small"
                    aria-label="Сбросить подпись вершины"
                    onClick={() => {
                      void renameShape2dVertexByObjectId(
                        shapeVertexContextMenu.objectId,
                        shapeVertexContextMenu.vertexIndex,
                        ""
                      );
                      setShapeVertexContextMenu(null);
                    }}
                  >
                    <DeleteOutlineRoundedIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    color="primary"
                    aria-label="Сохранить подпись вершины"
                    onClick={() => {
                      void renameShape2dVertexByObjectId(
                        shapeVertexContextMenu.objectId,
                        shapeVertexContextMenu.vertexIndex,
                        shapeVertexLabelDraft
                      );
                      setShapeVertexContextMenu(null);
                    }}
                  >
                    <SaveRoundedIcon fontSize="small" />
                  </IconButton>
                </div>
              </div>
            ) : null}
          </Menu>

          <Menu
            container={overlayContainer}
            open={Boolean(lineEndpointContextMenu && contextMenuLineEndpointObject)}
            onClose={() => setLineEndpointContextMenu(null)}
            anchorReference="anchorPosition"
            anchorPosition={
              lineEndpointContextMenu
                ? { top: lineEndpointContextMenu.y, left: lineEndpointContextMenu.x }
                : undefined
            }
          >
            {lineEndpointContextMenu && contextMenuLineEndpointObject ? (
              <div className="workbook-session__solid-menu">
                <TextField
                  size="small"
                  label={
                    lineEndpointContextMenu.endpoint === "start"
                      ? "Название конца A"
                      : "Название конца B"
                  }
                  value={lineEndpointLabelDraft}
                  onChange={(event) =>
                    setLineEndpointLabelDraft(event.target.value.slice(0, 12))
                  }
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key !== "Enter") return;
                    void renameLineEndpointByObjectId(
                      lineEndpointContextMenu.objectId,
                      lineEndpointContextMenu.endpoint,
                      lineEndpointLabelDraft
                    );
                    setLineEndpointContextMenu(null);
                  }}
                  autoFocus
                />
                <div className="workbook-session__solid-menu-actions workbook-session__solid-menu-actions--icons">
                  <IconButton
                    size="small"
                    aria-label="Сбросить подпись конца отрезка"
                    onClick={() => {
                      void renameLineEndpointByObjectId(
                        lineEndpointContextMenu.objectId,
                        lineEndpointContextMenu.endpoint,
                        ""
                      );
                      setLineEndpointContextMenu(null);
                    }}
                  >
                    <DeleteOutlineRoundedIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    color="primary"
                    aria-label="Сохранить подпись конца отрезка"
                    onClick={() => {
                      void renameLineEndpointByObjectId(
                        lineEndpointContextMenu.objectId,
                        lineEndpointContextMenu.endpoint,
                        lineEndpointLabelDraft
                      );
                      setLineEndpointContextMenu(null);
                    }}
                  >
                    <SaveRoundedIcon fontSize="small" />
                  </IconButton>
                </div>
              </div>
            ) : null}
          </Menu>

          <Menu
            container={overlayContainer}
            open={Boolean(objectContextMenu)}
            onClose={() => setObjectContextMenu(null)}
            anchorReference="anchorPosition"
            anchorPosition={
              objectContextMenu
                ? { top: objectContextMenu.y, left: objectContextMenu.x }
                : undefined
            }
          >
            {contextMenuObject?.type === "point" ? (
              <div className="workbook-session__solid-menu">
                <TextField
                  size="small"
                  label="Название точки"
                  value={pointLabelDraft}
                  onChange={(event) => setPointLabelDraft(event.target.value.slice(0, 12))}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Enter") {
                      void renamePointObject(contextMenuObject.id, pointLabelDraft);
                      setObjectContextMenu(null);
                    }
                  }}
                  autoFocus
                />
                <div className="workbook-session__solid-menu-actions workbook-session__solid-menu-actions--icons">
                  <IconButton
                    size="small"
                    color="error"
                    aria-label="Удалить точку"
                    onClick={() => {
                      if (!canDelete) return;
                      void commitObjectDelete(contextMenuObject.id);
                      setObjectContextMenu(null);
                    }}
                  >
                    <DeleteOutlineRoundedIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    color="primary"
                    aria-label="Сохранить название точки"
                    onClick={() => {
                      void renamePointObject(contextMenuObject.id, pointLabelDraft);
                      setObjectContextMenu(null);
                    }}
                  >
                    <SaveRoundedIcon fontSize="small" />
                  </IconButton>
                </div>
              </div>
            ) : null}
            {contextMenuObject && contextMenuObject.type !== "point" ? (
              <>
                <MenuItem
                  onClick={() => {
                    void commitObjectPin(contextMenuObject.id, !contextMenuObject.pinned);
                    setObjectContextMenu(null);
                  }}
                >
                  {contextMenuObject?.pinned ? "Открепить объект" : "Закрепить объект"}
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    void scaleObject(1.1, contextMenuObject.id);
                    setObjectContextMenu(null);
                  }}
                >
                  Увеличить на 10%
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    void scaleObject(0.9, contextMenuObject.id);
                    setObjectContextMenu(null);
                  }}
                >
                  Уменьшить на 10%
                </MenuItem>
              </>
            ) : null}
            {contextMenuObject &&
            contextMenuObject.type !== "point" &&
            canDelete &&
            !contextMenuObject.pinned ? (
              <MenuItem
                onClick={() => {
                  void commitObjectDelete(contextMenuObject.id);
                  setObjectContextMenu(null);
                }}
              >
                Удалить
              </MenuItem>
            ) : null}
          </Menu>

          <Menu
            container={overlayContainer}
            open={Boolean(areaSelectionContextMenu && areaSelection?.objectIds.length)}
            onClose={() => setAreaSelectionContextMenu(null)}
            anchorReference="anchorPosition"
            anchorPosition={
              areaSelectionContextMenu
                ? { top: areaSelectionContextMenu.y, left: areaSelectionContextMenu.x }
                : undefined
            }
          >
            <MenuItem
              onClick={() => void copyAreaSelectionObjects()}
              disabled={!canSelect || !areaSelection || areaSelection.objectIds.length === 0}
            >
              Скопировать область
            </MenuItem>
            <MenuItem
              onClick={() => void cutAreaSelectionObjects()}
              disabled={!canDelete || !areaSelection || areaSelection.objectIds.length === 0}
            >
              Вырезать область
            </MenuItem>
            <MenuItem
              onClick={() => void createCompositionFromAreaSelection()}
              disabled={!canSelect || !areaSelection || areaSelection.objectIds.length < 2}
            >
              Объединить в композицию
            </MenuItem>
            <MenuItem
              onClick={() => void deleteAreaSelectionObjects()}
              disabled={!canDelete}
            >
              Удалить выделенное
            </MenuItem>
          </Menu>

          <Dialog
            container={overlayContainer}
            open={isInviteDialogOpen}
            onClose={() => {
              if (sendingInviteThreadId) return;
              setIsInviteDialogOpen(false);
            }}
            fullWidth
            maxWidth="sm"
          >
            <DialogTitle>Пригласить участника</DialogTitle>
            <DialogContent dividers>
              {loadingInviteCandidates ? (
                <div className="workbook-session__invite-loading">
                  <CircularProgress size={18} />
                  <span>Загружаем студентов...</span>
                </div>
              ) : inviteCandidates.length === 0 ? (
                <p className="workbook-session__hint">
                  Нет доступных студентов для отправки приглашения.
                </p>
              ) : (
                <>
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="Поиск по имени или фамилии"
                    value={inviteSearch}
                    onChange={(event) => setInviteSearch(event.target.value)}
                  />
                  {filteredInviteCandidates.length === 0 ? (
                    <p className="workbook-session__hint">
                      По вашему запросу студенты не найдены.
                    </p>
                  ) : (
                    <div className="workbook-session__invite-list">
                      {filteredInviteCandidates.map((thread) => {
                        const alreadyConnected = connectedStudentIds.has(thread.studentId);
                        const isSending = sendingInviteThreadId === thread.id;
                        return (
                          <article key={thread.id} className="workbook-session__invite-student-card">
                            <div className="workbook-session__invite-student-main">
                              <Avatar src={thread.studentPhoto} alt={thread.studentName}>
                                {thread.studentName.slice(0, 1)}
                              </Avatar>
                              <div>
                                <strong>{thread.studentName}</strong>
                                <small>{thread.studentEmail}</small>
                              </div>
                            </div>
                            <Button
                              size="small"
                              variant={alreadyConnected ? "outlined" : "contained"}
                              disabled={alreadyConnected || isSending}
                              onClick={() => void handleSendInviteToStudent(thread)}
                            >
                              {alreadyConnected
                                ? "Уже в сессии"
                                : isSending
                                  ? "Отправка..."
                                  : "Отправить ссылку"}
                            </Button>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => setIsInviteDialogOpen(false)}
                disabled={Boolean(sendingInviteThreadId)}
              >
                Закрыть
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog
            container={overlayContainer}
            open={isStereoDialogOpen}
            onClose={() => setIsStereoDialogOpen(false)}
            fullWidth
            maxWidth="md"
            className="workbook-session__stereo-dialog"
          >
            <DialogTitle>Стереометрические фигуры</DialogTitle>
            <DialogContent dividers>
              <div className="workbook-session__stereo-grid">
                {SOLID3D_PRESETS.map((preset) => (
                  <button
                    key={`stereo-preset-${preset.id}`}
                    type="button"
                    className="workbook-session__stereo-card"
                    onClick={() => {
                      void createMathPresetObject("solid3d", {
                        presetId: preset.id,
                        presetTitle: preset.title,
                      });
                      setIsStereoDialogOpen(false);
                    }}
                  >
                    <SolidPresetPreview presetId={preset.id} />
                    <span>{preset.title}</span>
                  </button>
                ))}
              </div>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setIsStereoDialogOpen(false)}>Закрыть</Button>
            </DialogActions>
          </Dialog>

          <Dialog
            container={overlayContainer}
            open={isShapesDialogOpen}
            onClose={() => setIsShapesDialogOpen(false)}
            fullWidth
            maxWidth="md"
            className="workbook-session__stereo-dialog"
          >
            <DialogTitle>Каталог 2D-фигур</DialogTitle>
            <DialogContent dividers>
              <div className="workbook-session__stereo-grid">
                {shapeCatalog.map((shape) => (
                  <button
                    key={`shape-preset-${shape.id}`}
                    type="button"
                    className="workbook-session__stereo-card"
                    onClick={() => {
                      shape.apply();
                      setStrokeWidth(getDefaultToolWidth(shape.tool));
                      setIsShapesDialogOpen(false);
                    }}
                  >
                    <div className="workbook-session__shape-icon">{shape.icon}</div>
                    <span>{shape.title}</span>
                    <small>{shape.subtitle}</small>
                  </button>
                ))}
              </div>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setIsShapesDialogOpen(false)}>Закрыть</Button>
            </DialogActions>
          </Dialog>
        </aside>
      </div>
    </section>
  );
}
