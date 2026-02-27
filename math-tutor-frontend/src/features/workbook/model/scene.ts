import type {
  WorkbookBoardSettings,
  WorkbookBoardObject,
  WorkbookChatMessage,
  WorkbookComment,
  WorkbookCommentReply,
  WorkbookConstraint,
  WorkbookConstraintType,
  WorkbookDocumentAnnotation,
  WorkbookDocumentAsset,
  WorkbookDocumentState,
  WorkbookFormulaLibraryEntry,
  WorkbookLayer,
  WorkbookLibraryFolder,
  WorkbookLibraryItem,
  WorkbookLibraryState,
  WorkbookPoint,
  WorkbookSavedTemplate,
  WorkbookSceneLayer,
  WorkbookSessionAction,
  WorkbookSessionState,
  WorkbookStroke,
  WorkbookTimerState,
} from "./types";

const toFiniteNumber = (value: unknown, fallback = 0) => {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const toSafeInt = (value: unknown, fallback = 0) =>
  Math.max(0, Math.floor(toFiniteNumber(value, fallback)));

const toColor = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim().length > 0 ? value : fallback;

const MAIN_SCENE_LAYER_ID = "main";
const MAIN_SCENE_LAYER_NAME = "Основной слой";

const normalizeSceneLayers = (
  rawLayers: unknown,
  activeLayerIdRaw: unknown
): {
  sceneLayers: WorkbookSceneLayer[];
  activeSceneLayerId: string;
} => {
  const now = new Date().toISOString();
  const parsed = Array.isArray(rawLayers)
    ? rawLayers
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const source = entry as Partial<WorkbookSceneLayer>;
          if (typeof source.id !== "string" || !source.id.trim()) return null;
          const id = source.id.trim();
          const name =
            typeof source.name === "string" && source.name.trim()
              ? source.name.trim()
              : "Слой";
          const createdAt =
            typeof source.createdAt === "string" && source.createdAt.trim()
              ? source.createdAt
              : now;
          return {
            id,
            name,
            createdAt,
          } satisfies WorkbookSceneLayer;
        })
        .filter((layer): layer is WorkbookSceneLayer => Boolean(layer))
    : [];

  const unique = parsed.reduce<WorkbookSceneLayer[]>((acc, layer) => {
    if (acc.some((entry) => entry.id === layer.id)) return acc;
    return [...acc, layer];
  }, []);

  if (!unique.some((layer) => layer.id === MAIN_SCENE_LAYER_ID)) {
    unique.unshift({
      id: MAIN_SCENE_LAYER_ID,
      name: MAIN_SCENE_LAYER_NAME,
      createdAt: now,
    });
  }

  const activeSceneLayerId =
    typeof activeLayerIdRaw === "string" &&
    unique.some((layer) => layer.id === activeLayerIdRaw)
      ? activeLayerIdRaw
      : MAIN_SCENE_LAYER_ID;

  return {
    sceneLayers: unique,
    activeSceneLayerId,
  };
};

const isLayer = (value: unknown): value is WorkbookLayer =>
  value === "board" || value === "annotations";

const normalizePoint = (raw: unknown): WorkbookPoint | null => {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as { x?: unknown; y?: unknown };
  const x = toFiniteNumber(source.x, Number.NaN);
  const y = toFiniteNumber(source.y, Number.NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
};

const normalizeStroke = (raw: unknown): WorkbookStroke | null => {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as {
    id?: unknown;
    layer?: unknown;
    color?: unknown;
    width?: unknown;
    tool?: unknown;
    points?: unknown;
    authorUserId?: unknown;
    createdAt?: unknown;
  };
  const id = typeof source.id === "string" ? source.id : "";
  const layer = isLayer(source.layer) ? source.layer : null;
  const color = typeof source.color === "string" ? source.color : "#5f71ff";
  const width = Math.max(1, Math.min(40, Math.round(toFiniteNumber(source.width, 3))));
  const tool =
    source.tool === "highlighter" || source.tool === "eraser" ? source.tool : "pen";
  const authorUserId =
    typeof source.authorUserId === "string" ? source.authorUserId : "";
  const createdAt =
    typeof source.createdAt === "string"
      ? source.createdAt
      : new Date().toISOString();
  const points = Array.isArray(source.points)
    ? source.points
        .map(normalizePoint)
        .filter((point): point is WorkbookPoint => Boolean(point))
    : [];
  if (!id || !layer || !authorUserId || points.length === 0) return null;
  return {
    id,
    layer,
    color,
    width,
    tool,
    points,
    authorUserId,
    createdAt,
  };
};

const normalizeBoardObject = (raw: unknown): WorkbookBoardObject | null => {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Partial<WorkbookBoardObject>;
  const id = typeof source.id === "string" ? source.id : "";
  const type =
    source.type &&
    [
      "point",
      "line",
      "arrow",
      "rectangle",
      "ellipse",
      "triangle",
      "polygon",
      "text",
      "formula",
      "function_graph",
      "frame",
      "section_divider",
      "sticker",
      "comment",
      "image",
      "coordinate_grid",
      "measurement_length",
      "measurement_angle",
      "solid3d",
      "section3d",
      "net3d",
    ].includes(source.type)
      ? source.type
      : null;
  const layer = isLayer(source.layer) ? source.layer : "board";
  const authorUserId =
    typeof source.authorUserId === "string" ? source.authorUserId : "";
  if (!id || !type || !authorUserId) return null;
  return {
    id,
    type,
    layer,
    x: toFiniteNumber(source.x, 0),
    y: toFiniteNumber(source.y, 0),
    width: toFiniteNumber(source.width, 0),
    height: toFiniteNumber(source.height, 0),
    rotation: toFiniteNumber(source.rotation, 0),
    color: typeof source.color === "string" ? source.color : "#5468ff",
    fill: typeof source.fill === "string" ? source.fill : "transparent",
    strokeWidth: Math.max(1, Math.min(24, toFiniteNumber(source.strokeWidth, 2))),
    opacity: Math.max(0.1, Math.min(1, toFiniteNumber(source.opacity, 1))),
    points: Array.isArray(source.points)
      ? source.points
          .map(normalizePoint)
          .filter((point): point is WorkbookPoint => Boolean(point))
      : undefined,
    text: typeof source.text === "string" ? source.text : undefined,
    fontSize: Math.max(10, Math.min(72, toFiniteNumber(source.fontSize, 18))),
    imageUrl: typeof source.imageUrl === "string" ? source.imageUrl : undefined,
    imageName: typeof source.imageName === "string" ? source.imageName : undefined,
    meta:
      source.meta && typeof source.meta === "object"
        ? (source.meta as Record<string, unknown>)
        : undefined,
    sides: Math.max(3, Math.min(12, toSafeInt(source.sides, 5))),
    page: Math.max(1, toSafeInt(source.page, 1)),
    pinned: Boolean(source.pinned),
    locked: Boolean(source.locked),
    authorUserId,
    createdAt:
      typeof source.createdAt === "string"
        ? source.createdAt
        : new Date().toISOString(),
  };
};

const normalizeChatMessage = (raw: unknown): WorkbookChatMessage | null => {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as {
    id?: unknown;
    authorUserId?: unknown;
    authorName?: unknown;
    text?: unknown;
    createdAt?: unknown;
  };
  const id = typeof source.id === "string" ? source.id : "";
  const authorUserId =
    typeof source.authorUserId === "string" ? source.authorUserId : "";
  const authorName =
    typeof source.authorName === "string" ? source.authorName : "Участник";
  const text = typeof source.text === "string" ? source.text.trim() : "";
  if (!id || !authorUserId || !text) return null;
  return {
    id,
    authorUserId,
    authorName,
    text,
    createdAt:
      typeof source.createdAt === "string"
        ? source.createdAt
        : new Date().toISOString(),
  };
};

const normalizeDocumentAsset = (raw: unknown): WorkbookDocumentAsset | null => {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Partial<WorkbookDocumentAsset>;
  const id = typeof source.id === "string" ? source.id : "";
  const name = typeof source.name === "string" ? source.name : "";
  const url = typeof source.url === "string" ? source.url : "";
  const uploadedBy =
    typeof source.uploadedBy === "string" ? source.uploadedBy : "";
  if (!id || !name || !url || !uploadedBy) return null;
  const renderedPages = Array.isArray(source.renderedPages)
    ? source.renderedPages.reduce<
        NonNullable<WorkbookDocumentAsset["renderedPages"]>
      >((accumulator, page) => {
        if (!page || typeof page !== "object") return accumulator;
        const typed = page as {
          id?: unknown;
          page?: unknown;
          imageUrl?: unknown;
          width?: unknown;
          height?: unknown;
        };
        if (
          typeof typed.id !== "string" ||
          typeof typed.page !== "number" ||
          typeof typed.imageUrl !== "string"
        ) {
          return accumulator;
        }
        accumulator.push({
          id: typed.id,
          page: Math.max(1, Math.floor(typed.page)),
          imageUrl: typed.imageUrl,
          width:
            typeof typed.width === "number" && Number.isFinite(typed.width)
              ? typed.width
              : undefined,
          height:
            typeof typed.height === "number" && Number.isFinite(typed.height)
              ? typed.height
              : undefined,
        });
        return accumulator;
      }, [])
    : undefined;

  return {
    id,
    name,
    url,
    uploadedBy,
    type:
      source.type === "pdf"
        ? "pdf"
        : source.type === "file"
          ? "file"
          : "image",
    uploadedAt:
      typeof source.uploadedAt === "string"
        ? source.uploadedAt
        : new Date().toISOString(),
    renderedPages,
  };
};

const normalizeDocumentAnnotation = (
  raw: unknown
): WorkbookDocumentAnnotation | null => {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Partial<WorkbookDocumentAnnotation>;
  const id = typeof source.id === "string" ? source.id : "";
  const authorUserId =
    typeof source.authorUserId === "string" ? source.authorUserId : "";
  const points = Array.isArray(source.points)
    ? source.points
        .map(normalizePoint)
        .filter((point): point is WorkbookPoint => Boolean(point))
    : [];
  if (!id || !authorUserId || points.length === 0) return null;
  return {
    id,
    page: Math.max(1, toSafeInt(source.page, 1)),
    color: typeof source.color === "string" ? source.color : "#ff8e3c",
    width: Math.max(1, Math.min(24, toFiniteNumber(source.width, 2))),
    points,
    authorUserId,
    createdAt:
      typeof source.createdAt === "string"
        ? source.createdAt
        : new Date().toISOString(),
  };
};

const normalizeDocumentState = (raw: unknown): WorkbookDocumentState => {
  if (!raw || typeof raw !== "object") {
    return {
      assets: [],
      activeAssetId: null,
      page: 1,
      zoom: 1,
      annotations: [],
    };
  }
  const source = raw as Partial<WorkbookDocumentState>;
  const assets = Array.isArray(source.assets)
    ? source.assets
        .map(normalizeDocumentAsset)
        .filter((asset): asset is WorkbookDocumentAsset => Boolean(asset))
    : [];
  const activeAssetId =
    typeof source.activeAssetId === "string" ? source.activeAssetId : null;
  return {
    assets,
    activeAssetId:
      activeAssetId && assets.some((asset) => asset.id === activeAssetId)
        ? activeAssetId
        : assets[0]?.id ?? null,
    page: Math.max(1, toSafeInt(source.page, 1)),
    zoom: Math.max(0.2, Math.min(4, toFiniteNumber(source.zoom, 1))),
    annotations: Array.isArray(source.annotations)
      ? source.annotations
          .map(normalizeDocumentAnnotation)
          .filter(
            (annotation): annotation is WorkbookDocumentAnnotation =>
              Boolean(annotation)
          )
      : [],
  };
};

const normalizeAction = (raw: unknown): WorkbookSessionAction | null => {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Partial<WorkbookSessionAction>;
  if (
    typeof source.id !== "string" ||
    typeof source.targetId !== "string" ||
    typeof source.authorUserId !== "string"
  ) {
    return null;
  }
  if (source.kind !== "stroke" && source.kind !== "object") return null;
  return {
    id: source.id,
    kind: source.kind,
    targetId: source.targetId,
    authorUserId: source.authorUserId,
    at:
      typeof source.at === "string"
        ? source.at
        : new Date().toISOString(),
  };
};

const isConstraintType = (value: unknown): value is WorkbookConstraintType =>
  value === "parallel" ||
  value === "perpendicular" ||
  value === "equal_length" ||
  value === "equal_angle" ||
  value === "point_on_line" ||
  value === "point_on_circle";

const normalizeConstraint = (raw: unknown): WorkbookConstraint | null => {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Partial<WorkbookConstraint>;
  if (
    typeof source.id !== "string" ||
    !isConstraintType(source.type) ||
    typeof source.sourceObjectId !== "string" ||
    typeof source.targetObjectId !== "string" ||
    typeof source.createdBy !== "string"
  ) {
    return null;
  }
  return {
    id: source.id,
    type: source.type,
    sourceObjectId: source.sourceObjectId,
    targetObjectId: source.targetObjectId,
    enabled: source.enabled !== false,
    createdAt:
      typeof source.createdAt === "string"
        ? source.createdAt
        : new Date().toISOString(),
    createdBy: source.createdBy,
  };
};

const normalizeBoardSettings = (raw: unknown): WorkbookBoardSettings => {
  const fallbackLayers = normalizeSceneLayers(null, null);
  if (!raw || typeof raw !== "object") {
    return {
      title: "Рабочая тетрадь",
      showGrid: true,
      gridSize: 22,
      gridColor: "rgba(92, 129, 192, 0.32)",
      backgroundColor: "#ffffff",
      snapToGrid: false,
      showPageNumbers: false,
      currentPage: 1,
      pagesCount: 1,
      activeFrameId: null,
      autoSectionDividers: false,
      dividerStep: 960,
      sceneLayers: fallbackLayers.sceneLayers,
      activeSceneLayerId: fallbackLayers.activeSceneLayerId,
    };
  }
  const source = raw as Partial<WorkbookBoardSettings>;
  const sceneLayers = normalizeSceneLayers(
    (source as Partial<Record<"sceneLayers", unknown>>).sceneLayers,
    (source as Partial<Record<"activeSceneLayerId", unknown>>).activeSceneLayerId
  );
  return {
    title:
      typeof source.title === "string" && source.title.trim().length > 0
        ? source.title.trim()
        : "Рабочая тетрадь",
    showGrid: source.showGrid !== false,
    gridSize: Math.max(8, Math.min(96, toSafeInt(source.gridSize, 22))),
    gridColor: toColor(source.gridColor, "rgba(92, 129, 192, 0.32)"),
    backgroundColor: toColor(source.backgroundColor, "#ffffff"),
    snapToGrid: Boolean(source.snapToGrid),
    showPageNumbers: Boolean(source.showPageNumbers),
    currentPage: Math.max(1, toSafeInt(source.currentPage, 1)),
    pagesCount: Math.max(1, toSafeInt(source.pagesCount, 1)),
    activeFrameId:
      typeof source.activeFrameId === "string" ? source.activeFrameId : null,
    autoSectionDividers: Boolean(source.autoSectionDividers),
    dividerStep: Math.max(320, Math.min(2400, toSafeInt(source.dividerStep, 960))),
    sceneLayers: sceneLayers.sceneLayers,
    activeSceneLayerId: sceneLayers.activeSceneLayerId,
  };
};

const normalizeLibraryFolder = (raw: unknown): WorkbookLibraryFolder | null => {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Partial<WorkbookLibraryFolder>;
  if (
    typeof source.id !== "string" ||
    typeof source.name !== "string" ||
    typeof source.ownerUserId !== "string"
  ) {
    return null;
  }
  return {
    id: source.id,
    name: source.name.trim() || "Папка",
    parentId: typeof source.parentId === "string" ? source.parentId : null,
    ownerUserId: source.ownerUserId,
    createdAt:
      typeof source.createdAt === "string"
        ? source.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof source.updatedAt === "string"
        ? source.updatedAt
        : new Date().toISOString(),
  };
};

const normalizeLibraryItem = (raw: unknown): WorkbookLibraryItem | null => {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Partial<WorkbookLibraryItem>;
  if (
    typeof source.id !== "string" ||
    typeof source.name !== "string" ||
    typeof source.ownerUserId !== "string"
  ) {
    return null;
  }
  const supportedTypes = new Set([
    "pdf",
    "image",
    "office",
    "formula",
    "template",
    "board_object",
  ]);
  const type =
    typeof source.type === "string" && supportedTypes.has(source.type)
      ? source.type
      : "board_object";
  return {
    id: source.id,
    name: source.name.trim() || "Материал",
    type,
    folderId: typeof source.folderId === "string" ? source.folderId : null,
    sourceUrl: typeof source.sourceUrl === "string" ? source.sourceUrl : undefined,
    data:
      source.data && typeof source.data === "object"
        ? (source.data as Record<string, unknown>)
        : undefined,
    ownerUserId: source.ownerUserId,
    createdAt:
      typeof source.createdAt === "string"
        ? source.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof source.updatedAt === "string"
        ? source.updatedAt
        : new Date().toISOString(),
  };
};

const normalizeFormulaLibraryEntry = (
  raw: unknown
): WorkbookFormulaLibraryEntry | null => {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Partial<WorkbookFormulaLibraryEntry>;
  if (
    typeof source.id !== "string" ||
    typeof source.label !== "string" ||
    typeof source.ownerUserId !== "string"
  ) {
    return null;
  }
  return {
    id: source.id,
    label: source.label.trim() || "Формула",
    latex: typeof source.latex === "string" ? source.latex : undefined,
    mathml: typeof source.mathml === "string" ? source.mathml : undefined,
    ownerUserId: source.ownerUserId,
    createdAt:
      typeof source.createdAt === "string"
        ? source.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof source.updatedAt === "string"
        ? source.updatedAt
        : new Date().toISOString(),
  };
};

const normalizeSavedTemplate = (raw: unknown): WorkbookSavedTemplate | null => {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Partial<WorkbookSavedTemplate>;
  if (
    typeof source.id !== "string" ||
    typeof source.name !== "string" ||
    typeof source.ownerUserId !== "string"
  ) {
    return null;
  }
  const objectIds = Array.isArray(source.objectIds)
    ? source.objectIds.filter((value): value is string => typeof value === "string")
    : [];
  const objects = Array.isArray(source.objects)
    ? source.objects
        .map(normalizeBoardObject)
        .filter((item): item is WorkbookBoardObject => Boolean(item))
    : [];
  return {
    id: source.id,
    name: source.name.trim() || "Шаблон",
    ownerUserId: source.ownerUserId,
    objectIds,
    objects,
    createdAt:
      typeof source.createdAt === "string"
        ? source.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof source.updatedAt === "string"
        ? source.updatedAt
        : new Date().toISOString(),
  };
};

const normalizeLibraryState = (raw: unknown): WorkbookLibraryState => {
  if (!raw || typeof raw !== "object") {
    return {
      folders: [],
      items: [],
      formulas: [],
      templates: [],
    };
  }
  const source = raw as Partial<WorkbookLibraryState>;
  return {
    folders: Array.isArray(source.folders)
      ? source.folders
          .map(normalizeLibraryFolder)
          .filter((item): item is WorkbookLibraryFolder => Boolean(item))
      : [],
    items: Array.isArray(source.items)
      ? source.items
          .map(normalizeLibraryItem)
          .filter((item): item is WorkbookLibraryItem => Boolean(item))
      : [],
    formulas: Array.isArray(source.formulas)
      ? source.formulas
          .map(normalizeFormulaLibraryEntry)
          .filter((item): item is WorkbookFormulaLibraryEntry => Boolean(item))
      : [],
    templates: Array.isArray(source.templates)
      ? source.templates
          .map(normalizeSavedTemplate)
          .filter((item): item is WorkbookSavedTemplate => Boolean(item))
      : [],
  };
};

const normalizeCommentReply = (raw: unknown): WorkbookCommentReply | null => {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Partial<WorkbookCommentReply>;
  if (
    typeof source.id !== "string" ||
    typeof source.authorUserId !== "string" ||
    typeof source.text !== "string"
  ) {
    return null;
  }
  const text = source.text.trim();
  if (!text) return null;
  return {
    id: source.id,
    authorUserId: source.authorUserId,
    text,
    createdAt:
      typeof source.createdAt === "string"
        ? source.createdAt
        : new Date().toISOString(),
  };
};

const normalizeComment = (raw: unknown): WorkbookComment | null => {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Partial<WorkbookComment>;
  if (
    typeof source.id !== "string" ||
    typeof source.authorUserId !== "string" ||
    typeof source.text !== "string"
  ) {
    return null;
  }
  const text = source.text.trim();
  if (!text) return null;
  return {
    id: source.id,
    authorUserId: source.authorUserId,
    text,
    targetObjectId:
      typeof source.targetObjectId === "string" ? source.targetObjectId : undefined,
    targetFrameId:
      typeof source.targetFrameId === "string" ? source.targetFrameId : undefined,
    replies: Array.isArray(source.replies)
      ? source.replies
          .map(normalizeCommentReply)
          .filter((item): item is WorkbookCommentReply => Boolean(item))
      : [],
    createdAt:
      typeof source.createdAt === "string"
        ? source.createdAt
        : new Date().toISOString(),
  };
};

const normalizeTimerState = (raw: unknown): WorkbookTimerState | null => {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Partial<WorkbookTimerState>;
  if (typeof source.id !== "string") return null;
  const status =
    source.status === "running" ||
    source.status === "paused" ||
    source.status === "done"
      ? source.status
      : "idle";
  return {
    id: source.id,
    label:
      typeof source.label === "string" && source.label.trim().length > 0
        ? source.label.trim()
        : "Таймер",
    durationSec: Math.max(5, toSafeInt(source.durationSec, 300)),
    remainingSec: Math.max(0, toSafeInt(source.remainingSec, 300)),
    status,
    startedAt: typeof source.startedAt === "string" ? source.startedAt : null,
    updatedAt:
      typeof source.updatedAt === "string"
        ? source.updatedAt
        : new Date().toISOString(),
  };
};

export const createEmptySessionState = (): WorkbookSessionState => ({
  strokes: [],
  objects: [],
  constraints: [],
  chat: [],
  comments: [],
  timer: null,
  boardSettings: normalizeBoardSettings(null),
  library: normalizeLibraryState(null),
  document: {
    assets: [],
    activeAssetId: null,
    page: 1,
    zoom: 1,
    annotations: [],
  },
  actions: [],
});

export const normalizeSessionState = (payload: unknown): WorkbookSessionState => {
  if (!payload || typeof payload !== "object") {
    return createEmptySessionState();
  }
  const source = payload as Partial<WorkbookSessionState>;
  const strokes = Array.isArray(source.strokes)
    ? source.strokes
        .map(normalizeStroke)
        .filter((stroke): stroke is WorkbookStroke => Boolean(stroke))
    : [];
  const objects = Array.isArray(source.objects)
    ? source.objects
        .map(normalizeBoardObject)
        .filter((item): item is WorkbookBoardObject => Boolean(item))
    : [];
  const chat = Array.isArray(source.chat)
    ? source.chat
        .map(normalizeChatMessage)
        .filter((item): item is WorkbookChatMessage => Boolean(item))
    : [];
  const actions = Array.isArray(source.actions)
    ? source.actions
        .map(normalizeAction)
        .filter((item): item is WorkbookSessionAction => Boolean(item))
    : [];
  const constraints = Array.isArray(source.constraints)
    ? source.constraints
        .map(normalizeConstraint)
        .filter((item): item is WorkbookConstraint => Boolean(item))
    : [];
  const comments = Array.isArray(source.comments)
    ? source.comments
        .map(normalizeComment)
        .filter((item): item is WorkbookComment => Boolean(item))
    : [];
  return {
    strokes,
    objects,
    constraints,
    chat,
    comments,
    timer: normalizeTimerState(source.timer),
    boardSettings: normalizeBoardSettings(source.boardSettings),
    library: normalizeLibraryState(source.library),
    document: normalizeDocumentState(source.document),
    actions,
  };
};

export const normalizeStrokePayload = (raw: unknown) => normalizeStroke(raw);
export const normalizeObjectPayload = (raw: unknown) => normalizeBoardObject(raw);
export const normalizeChatMessagePayload = (raw: unknown) => normalizeChatMessage(raw);
export const normalizeDocumentAssetPayload = (raw: unknown) =>
  normalizeDocumentAsset(raw);
export const normalizeDocumentAnnotationPayload = (raw: unknown) =>
  normalizeDocumentAnnotation(raw);

export const encodeSessionState = (state: WorkbookSessionState) => ({
  strokes: state.strokes,
  objects: state.objects,
  constraints: state.constraints,
  chat: state.chat,
  comments: state.comments,
  timer: state.timer,
  boardSettings: state.boardSettings,
  library: state.library,
  document: state.document,
  actions: state.actions,
});

// Backward-compatible aliases for existing session page imports.
export const createEmptyScene = createEmptySessionState;
export const normalizeScenePayload = normalizeSessionState;
export const encodeScenePayload = (
  payload: Partial<WorkbookSessionState>
) =>
  encodeSessionState({
    ...createEmptySessionState(),
    ...payload,
    boardSettings: payload.boardSettings
      ? normalizeBoardSettings(payload.boardSettings)
      : createEmptySessionState().boardSettings,
    library: payload.library
      ? normalizeLibraryState(payload.library)
      : createEmptySessionState().library,
    timer: normalizeTimerState(payload.timer),
    comments: Array.isArray(payload.comments)
      ? payload.comments
          .map(normalizeComment)
          .filter((item): item is WorkbookComment => Boolean(item))
      : createEmptySessionState().comments,
    document: payload.document
      ? normalizeDocumentState(payload.document)
      : createEmptySessionState().document,
  });
