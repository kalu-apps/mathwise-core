export type WorkbookSessionKind = "PERSONAL" | "CLASS";

export type WorkbookSessionStatus = "draft" | "in_progress" | "ended";

export type WorkbookRoleInSession = "teacher" | "student";

export type WorkbookLayer = "board" | "annotations";

export type WorkbookSceneLayer = {
  id: string;
  name: string;
  createdAt: string;
};

export type WorkbookTool =
  | "select"
  | "area_select"
  | "pan"
  | "pen"
  | "highlighter"
  | "compass"
  | "point"
  | "line"
  | "arrow"
  | "rectangle"
  | "ellipse"
  | "triangle"
  | "polygon"
  | "text"
  | "formula"
  | "function_graph"
  | "frame"
  | "divider"
  | "sticker"
  | "comment"
  | "eraser"
  | "sweep"
  | "laser";

export type WorkbookUndoPolicy =
  | "everyone"
  | "teacher_only"
  | "own_only";

export type WorkbookPoint = {
  x: number;
  y: number;
};

export type WorkbookStroke = {
  id: string;
  layer: WorkbookLayer;
  color: string;
  width: number;
  tool: WorkbookTool;
  points: WorkbookPoint[];
  authorUserId: string;
  createdAt: string;
};

export type WorkbookBoardObjectType =
  | "point"
  | "line"
  | "arrow"
  | "rectangle"
  | "ellipse"
  | "triangle"
  | "polygon"
  | "text"
  | "formula"
  | "function_graph"
  | "frame"
  | "section_divider"
  | "sticker"
  | "comment"
  | "image"
  | "coordinate_grid"
  | "measurement_length"
  | "measurement_angle"
  | "solid3d"
  | "section3d"
  | "net3d";

export type WorkbookBoardObject = {
  id: string;
  type: WorkbookBoardObjectType;
  layer: WorkbookLayer;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  color?: string;
  fill?: string;
  strokeWidth?: number;
  opacity?: number;
  points?: WorkbookPoint[];
  text?: string;
  fontSize?: number;
  imageUrl?: string;
  imageName?: string;
  sides?: number;
  page?: number;
  meta?: Record<string, unknown>;
  pinned?: boolean;
  locked?: boolean;
  authorUserId: string;
  createdAt: string;
};

export type WorkbookFormulaLibraryEntry = {
  id: string;
  label: string;
  latex?: string;
  mathml?: string;
  createdAt: string;
  updatedAt: string;
  ownerUserId: string;
};

export type WorkbookLibraryFolder = {
  id: string;
  name: string;
  parentId?: string | null;
  createdAt: string;
  updatedAt: string;
  ownerUserId: string;
};

export type WorkbookLibraryItemType =
  | "pdf"
  | "image"
  | "office"
  | "formula"
  | "template"
  | "board_object";

export type WorkbookLibraryItem = {
  id: string;
  name: string;
  folderId?: string | null;
  type: WorkbookLibraryItemType;
  sourceUrl?: string;
  data?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  ownerUserId: string;
};

export type WorkbookSavedTemplate = {
  id: string;
  name: string;
  objectIds: string[];
  objects: WorkbookBoardObject[];
  createdAt: string;
  updatedAt: string;
  ownerUserId: string;
};

export type WorkbookCommentReply = {
  id: string;
  authorUserId: string;
  text: string;
  createdAt: string;
};

export type WorkbookComment = {
  id: string;
  targetObjectId?: string;
  targetFrameId?: string;
  authorUserId: string;
  text: string;
  createdAt: string;
  replies: WorkbookCommentReply[];
};

export type WorkbookTimerStatus = "idle" | "running" | "paused" | "done";

export type WorkbookTimerState = {
  id: string;
  label: string;
  durationSec: number;
  remainingSec: number;
  status: WorkbookTimerStatus;
  startedAt?: string | null;
  updatedAt: string;
};

export type WorkbookBoardSettings = {
  title: string;
  showGrid: boolean;
  gridSize: number;
  gridColor: string;
  backgroundColor: string;
  snapToGrid: boolean;
  smartInk?: {
    mode: "off" | "basic" | "full";
    confidenceThreshold: number;
    smartShapes: boolean;
    smartTextOcr: boolean;
    smartMathOcr: boolean;
  };
  showPageNumbers: boolean;
  currentPage: number;
  pagesCount: number;
  activeFrameId: string | null;
  autoSectionDividers: boolean;
  dividerStep: number;
  sceneLayers: WorkbookSceneLayer[];
  activeSceneLayerId: string;
};

export type WorkbookLibraryState = {
  folders: WorkbookLibraryFolder[];
  items: WorkbookLibraryItem[];
  formulas: WorkbookFormulaLibraryEntry[];
  templates: WorkbookSavedTemplate[];
};

export type WorkbookChatMessage = {
  id: string;
  authorUserId: string;
  authorName: string;
  text: string;
  createdAt: string;
};

export type WorkbookDocumentAssetType = "pdf" | "image" | "file";

export type WorkbookDocumentAsset = {
  id: string;
  name: string;
  type: WorkbookDocumentAssetType;
  url: string;
  uploadedBy: string;
  uploadedAt: string;
  renderedPages?: Array<{
    id: string;
    page: number;
    imageUrl: string;
    width?: number;
    height?: number;
  }>;
};

export type WorkbookDocumentAnnotation = {
  id: string;
  page: number;
  color: string;
  width: number;
  points: WorkbookPoint[];
  authorUserId: string;
  createdAt: string;
};

export type WorkbookDocumentState = {
  assets: WorkbookDocumentAsset[];
  activeAssetId: string | null;
  page: number;
  zoom: number;
  annotations: WorkbookDocumentAnnotation[];
};

export type WorkbookSessionSettings = {
  undoPolicy: WorkbookUndoPolicy;
  strictGeometry: boolean;
  smartInk?: {
    mode: "off" | "basic" | "full";
    confidenceThreshold: number;
    smartShapes: boolean;
    smartTextOcr: boolean;
    smartMathOcr: boolean;
  };
  studentControls: {
    canDraw: boolean;
    canSelect: boolean;
    canDelete: boolean;
    canInsertImage: boolean;
    canClear: boolean;
    canExport: boolean;
    canUseLaser: boolean;
  };
};

export type WorkbookConstraintType =
  | "parallel"
  | "perpendicular"
  | "equal_length"
  | "equal_angle"
  | "point_on_line"
  | "point_on_circle";

export type WorkbookConstraint = {
  id: string;
  type: WorkbookConstraintType;
  sourceObjectId: string;
  targetObjectId: string;
  enabled: boolean;
  createdAt: string;
  createdBy: string;
};

export type WorkbookSessionAction = {
  id: string;
  kind: "stroke" | "object";
  targetId: string;
  authorUserId: string;
  at: string;
};

export type WorkbookSessionState = {
  strokes: WorkbookStroke[];
  objects: WorkbookBoardObject[];
  constraints: WorkbookConstraint[];
  chat: WorkbookChatMessage[];
  document: WorkbookDocumentState;
  actions: WorkbookSessionAction[];
  comments: WorkbookComment[];
  timer: WorkbookTimerState | null;
  boardSettings: WorkbookBoardSettings;
  library: WorkbookLibraryState;
};

export type WorkbookSessionParticipant = {
  userId: string;
  roleInSession: WorkbookRoleInSession;
  displayName: string;
  photo?: string;
  isActive: boolean;
  isOnline: boolean;
  lastSeenAt?: string | null;
  permissions: {
    canDraw: boolean;
    canAnnotate: boolean;
    canUseMedia: boolean;
    canUseChat: boolean;
    canInvite: boolean;
    canManageSession: boolean;
    canSelect: boolean;
    canDelete: boolean;
    canInsertImage: boolean;
    canClear: boolean;
    canExport: boolean;
    canUseLaser: boolean;
  };
};

export type WorkbookSession = {
  id: string;
  kind: WorkbookSessionKind;
  status: WorkbookSessionStatus;
  title: string;
  createdBy: string;
  createdAt: string;
  startedAt?: string | null;
  endedAt?: string | null;
  lastActivityAt: string;
  canInvite: boolean;
  canEdit: boolean;
  roleInSession: WorkbookRoleInSession;
  participants: WorkbookSessionParticipant[];
  settings: WorkbookSessionSettings;
};

export type WorkbookDraftCard = {
  draftId: string;
  sessionId: string;
  redirectSessionId?: string | null;
  title: string;
  kind: WorkbookSessionKind;
  statusForCard: WorkbookSessionStatus;
  updatedAt: string;
  createdAt: string;
  startedAt?: string | null;
  endedAt?: string | null;
  durationMinutes?: number | null;
  canEdit: boolean;
  canInvite: boolean;
  canDelete: boolean;
  participantsCount: number;
  isOwner: boolean;
  participants?: Array<{
    userId: string;
    displayName: string;
    photo?: string;
    roleInSession: WorkbookRoleInSession;
  }>;
};

export type WorkbookInviteInfo = {
  inviteId: string;
  sessionId: string;
  token: string;
  inviteUrl: string;
  expiresAt?: string | null;
  maxUses?: number | null;
  useCount: number;
};

export type WorkbookEventType =
  | "board.stroke"
  | "board.stroke.delete"
  | "board.object.create"
  | "board.object.update"
  | "board.object.delete"
  | "board.object.pin"
  | "board.clear"
  | "board.clear.request"
  | "board.clear.confirm"
  | "board.undo"
  | "board.redo"
  | "annotations.stroke"
  | "annotations.stroke.delete"
  | "annotations.clear"
  | "document.asset.add"
  | "document.state.update"
  | "document.annotation.add"
  | "document.annotation.clear"
  | "geometry.constraint.add"
  | "geometry.constraint.remove"
  | "library.folder.upsert"
  | "library.folder.remove"
  | "library.item.upsert"
  | "library.item.remove"
  | "library.formula.upsert"
  | "library.template.upsert"
  | "library.template.remove"
  | "comments.upsert"
  | "comments.remove"
  | "timer.update"
  | "board.settings.update"
  | "focus.point"
  | "media.signal"
  | "media.state"
  | "permissions.update"
  | "settings.update"
  | "chat.message"
  | "session.status";

export type WorkbookEvent = {
  id: string;
  sessionId: string;
  seq: number;
  type: WorkbookEventType;
  authorUserId: string;
  payload: unknown;
  createdAt: string;
};

export type WorkbookSnapshot = {
  layer: WorkbookLayer;
  version: number;
  payload: WorkbookSessionState | unknown;
  createdAt: string;
};

export type WorkbookEventsResponse = {
  sessionId: string;
  events: WorkbookEvent[];
  latestSeq: number;
};
