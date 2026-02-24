import { useCallback, useMemo, useReducer } from "react";
import type {
  AssistantRespondResponse,
  AssistantRole,
  AssistantSessionMessage,
} from "@/shared/api/assistant-contracts";
import {
  createAssistantSession,
  getAssistantSession,
  requestAssistantResponse,
} from "@/features/assistant/api/assistant.api";
import type {
  AssistantController,
  AssistantControllerState,
  AssistantRequestPayload,
  AssistantViewTab,
} from "@/features/assistant/model/assistant.types";
import { getDefaultActionsByRole } from "@/features/assistant/model/assistant.constants";
import { getAssistantSessionTitle } from "@/features/assistant/lib/assistantContext";

type AssistantActionType =
  | { type: "open" }
  | { type: "close" }
  | { type: "set-tab"; tab: AssistantViewTab }
  | { type: "set-message"; value: string }
  | { type: "request" }
  | { type: "failure"; error: string }
  | { type: "success"; payload: AssistantRespondResponse }
  | { type: "set-session"; sessionId: string; history: AssistantSessionMessage[] }
  | { type: "toggle-dock" }
  | { type: "clear-error" };

const reduceState = (
  state: AssistantControllerState,
  action: AssistantActionType
): AssistantControllerState => {
  switch (action.type) {
    case "open":
      return {
        ...state,
        isLauncherOpen: true,
        isPanelOpen: true,
        isDockExpanded: true,
        uiState: "active",
        error: null,
      };
    case "close":
      return {
        ...state,
        isLauncherOpen: false,
        isPanelOpen: false,
        isDockExpanded: false,
        uiState: "idle",
      };
    case "set-tab":
      return { ...state, tab: action.tab };
    case "set-message":
      return { ...state, pendingMessage: action.value };
    case "request":
      return {
        ...state,
        isLoading: true,
        isStreaming: true,
        uiState: "thinking",
        error: null,
      };
    case "success": {
      const latestMessage = action.payload.blocks
        .map((block) => {
          if (block.type === "text") return block.text;
          if (block.type === "warning_banner") return block.message;
          return block.title ?? block.type;
        })
        .filter(Boolean)
        .join("\n");

      const assistantEntry: AssistantSessionMessage = {
        id: `assistant-${action.payload.timestamp}`,
        sessionId: action.payload.sessionId,
        role: "assistant",
        text: latestMessage || "Результат подготовлен.",
        blocks: action.payload.blocks,
        createdAt: action.payload.timestamp,
      };
      const nextHistory: AssistantSessionMessage[] = [...state.history, assistantEntry];

      return {
        ...state,
        isLoading: false,
        isStreaming: false,
        uiState: action.payload.blocks.some((block) => block.type === "warning_banner")
          ? "warning"
          : "success",
        latest: action.payload,
        sessionId: action.payload.sessionId,
        history: nextHistory,
      };
    }
    case "failure":
      return {
        ...state,
        isLoading: false,
        isStreaming: false,
        uiState: "error",
        error: action.error,
      };
    case "set-session":
      return {
        ...state,
        sessionId: action.sessionId,
        history: action.history,
      };
    case "toggle-dock":
      return {
        ...state,
        isDockExpanded: !state.isDockExpanded,
      };
    case "clear-error":
      return {
        ...state,
        error: null,
        uiState: state.isPanelOpen ? "active" : "idle",
      };
    default:
      return state;
  }
};

const initialState = (role: AssistantRole, mode: AssistantControllerState["mode"]): AssistantControllerState => ({
  role,
  mode,
  uiState: "idle",
  tab: "tips",
  isLauncherOpen: false,
  isPanelOpen: false,
  isDockExpanded: false,
  isLoading: false,
  isStreaming: false,
  error: null,
  sessionId: null,
  latest: null,
  history: [],
  pendingMessage: "",
});

type UseAssistantControllerParams = {
  userId: string;
  role: AssistantRole;
  mode: AssistantControllerState["mode"];
};

export const useAssistantController = ({
  userId,
  role,
  mode,
}: UseAssistantControllerParams): AssistantController => {
  const [state, dispatch] = useReducer(reduceState, initialState(role, mode));

  const ensureSession = useCallback(async () => {
    if (state.sessionId) return state.sessionId;
    const session = await createAssistantSession({
      userId,
      role,
      mode,
      title: getAssistantSessionTitle(mode),
    });
    dispatch({ type: "set-session", sessionId: session.session.id, history: session.messages });
    return session.session.id;
  }, [mode, role, state.sessionId, userId]);

  const open = useCallback(async () => {
    dispatch({ type: "open" });
    try {
      const sessionId = await ensureSession();
      const history = await getAssistantSession(sessionId);
      dispatch({ type: "set-session", sessionId, history: history.messages });
    } catch {
      dispatch({ type: "failure", error: "Не удалось открыть ассистента." });
    }
  }, [ensureSession]);

  const close = useCallback(() => {
    dispatch({ type: "close" });
  }, []);

  const send = useCallback(
    async ({ message, actionIntent }: AssistantRequestPayload) => {
      dispatch({ type: "request" });
      try {
        const sessionId = await ensureSession();
        const cleanMessage = (message ?? state.pendingMessage).trim();
        const userHistoryEntry: AssistantSessionMessage | null = cleanMessage
          ? {
              id: `user-${Date.now()}`,
              sessionId,
              role: "user",
              text: cleanMessage,
              createdAt: new Date().toISOString(),
            }
          : null;

        if (userHistoryEntry) {
          dispatch({ type: "set-session", sessionId, history: [...state.history, userHistoryEntry] });
        }

        const response = await requestAssistantResponse({
          userId,
          role,
          mode,
          sessionId,
          message: cleanMessage || undefined,
          actionIntent,
        });
        dispatch({ type: "set-message", value: "" });
        dispatch({ type: "success", payload: response });
      } catch {
        dispatch({ type: "failure", error: "Аксиом временно недоступен. Повторите запрос." });
      }
    },
    [ensureSession, mode, role, state.history, state.pendingMessage, userId]
  );

  const retry = useCallback(async () => {
    const fallbackAction = getDefaultActionsByRole(role)[0]?.id;
    await send({ actionIntent: fallbackAction });
  }, [role, send]);

  const setTab = useCallback((tab: AssistantViewTab) => {
    dispatch({ type: "set-tab", tab });
  }, []);

  const toggleDock = useCallback(() => {
    dispatch({ type: "toggle-dock" });
  }, []);

  const setPendingMessage = useCallback((value: string) => {
    dispatch({ type: "set-message", value });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: "clear-error" });
  }, []);

  return useMemo(
    () => ({
      state,
      setTab,
      setPendingMessage,
      open,
      close,
      toggleDock,
      send,
      retry,
      clearError,
    }),
    [clearError, close, open, retry, send, setPendingMessage, setTab, state, toggleDock]
  );
};
