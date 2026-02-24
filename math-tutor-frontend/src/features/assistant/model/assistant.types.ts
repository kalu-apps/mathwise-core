import type {
  AssistantAction,
  AssistantMode,
  AssistantRespondResponse,
  AssistantRole,
  AssistantSessionMessage,
  AssistantUiState,
} from "@/shared/api/assistant-contracts";

export type AssistantPlacement = "cover" | "floating";

export type AssistantVariant = "student" | "teacher" | "inline";

export type AssistantViewTab = "tips" | "history" | "actions";

export type AssistantRequestPayload = {
  message?: string;
  actionIntent?: AssistantAction["id"];
};

export type AssistantControllerState = {
  role: AssistantRole;
  mode: AssistantMode;
  uiState: AssistantUiState;
  tab: AssistantViewTab;
  isLauncherOpen: boolean;
  isPanelOpen: boolean;
  isDockExpanded: boolean;
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  sessionId: string | null;
  latest: AssistantRespondResponse | null;
  history: AssistantSessionMessage[];
  pendingMessage: string;
};

export type AssistantController = {
  state: AssistantControllerState;
  setTab: (tab: AssistantViewTab) => void;
  setPendingMessage: (value: string) => void;
  open: () => Promise<void>;
  close: () => void;
  toggleDock: () => void;
  send: (payload: AssistantRequestPayload) => Promise<void>;
  retry: () => Promise<void>;
  clearError: () => void;
};
