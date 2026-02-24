import { api } from "@/shared/api/client";
import type {
  AssistantPlatformEventRequest,
  AssistantPlatformEventResponse,
  AssistantRespondRequest,
  AssistantRespondResponse,
  AssistantSessionCreateRequest,
  AssistantSessionResponse,
  AuthoringCourseOutlineRequest,
  AuthoringLessonDraftRequest,
  AuthoringResponse,
  StudentRecommendationsResponse,
  TeacherInsightsResponse,
} from "@/shared/api/assistant-contracts";

export const createAssistantSession = async (
  payload: AssistantSessionCreateRequest
): Promise<AssistantSessionResponse> => {
  return api.post<AssistantSessionResponse>("/assistant/session", payload, {
    notifyDataUpdate: false,
  });
};

export const getAssistantSession = async (
  sessionId: string
): Promise<AssistantSessionResponse> => {
  return api.get<AssistantSessionResponse>(`/assistant/session/${encodeURIComponent(sessionId)}`, {
    cacheTtlMs: 1_500,
  });
};

export const requestAssistantResponse = async (
  payload: AssistantRespondRequest
): Promise<AssistantRespondResponse> => {
  return api.post<AssistantRespondResponse>("/assistant/respond", payload, {
    notifyDataUpdate: false,
  });
};

export const getTeacherInsights = async (
  teacherId: string
): Promise<TeacherInsightsResponse> => {
  return api.get<TeacherInsightsResponse>(`/teacher/insights/${encodeURIComponent(teacherId)}`, {
    cacheTtlMs: 2_000,
  });
};

export const getStudentRecommendations = async (
  studentId: string
): Promise<StudentRecommendationsResponse> => {
  return api.get<StudentRecommendationsResponse>(
    `/student/recommendations/${encodeURIComponent(studentId)}`,
    {
      cacheTtlMs: 2_000,
    }
  );
};

export const requestCourseOutline = async (
  payload: AuthoringCourseOutlineRequest
): Promise<AuthoringResponse> => {
  return api.post<AuthoringResponse>("/authoring/course-outline", payload, {
    notifyDataUpdate: false,
  });
};

export const requestLessonDraft = async (
  payload: AuthoringLessonDraftRequest
): Promise<AuthoringResponse> => {
  return api.post<AuthoringResponse>("/authoring/lesson-draft", payload, {
    notifyDataUpdate: false,
  });
};

export const trackAssistantEvent = async (
  payload: AssistantPlatformEventRequest
): Promise<AssistantPlatformEventResponse> => {
  return api.post<AssistantPlatformEventResponse>("/assistant/events", payload, {
    notifyDataUpdate: false,
  });
};
