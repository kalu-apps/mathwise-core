import type {
  AssistantAction,
  AssistantContextSnapshot,
  AssistantMode,
  AssistantRole,
  AssistantUiState,
} from "../../../shared/api/assistant-contracts";

export type AssistantAssembledContext = AssistantContextSnapshot & {
  userId: string;
  actionIntent?: string;
  requestMessage?: string;
  activeCourseId?: string;
  activeLessonId?: string;
  activeTestId?: string;
  purchasedCourseIds: string[];
  recentFailedAttempts: Array<{
    courseId: string;
    testItemId: string;
    templateId: string;
    attempts: number;
    latestPercent: number;
    topicIds: string[];
  }>;
  weakTopicsDetailed: Array<{
    topicId: string;
    avgPercent: number;
    attempts: number;
  }>;
  studentLevelHint?: string;
  teacherOwnedCourseIds: string[];
};

export type AssistantEngineInput = {
  userId: string;
  role: AssistantRole;
  mode: AssistantMode;
  sessionId: string;
  message?: string;
  actionIntent?: string;
  activeCourseId?: string;
  activeLessonId?: string;
  activeTestId?: string;
};

export type AssistantEngineOutput = {
  state: Exclude<AssistantUiState, "hover" | "disabled">;
  blocks: import("../../../shared/api/assistant-contracts").AssistantResponseBlock[];
  quickActions: AssistantAction[];
};
