export type AssistantRole = "student" | "teacher";

export type AssistantMode =
  | "study-cabinet"
  | "course"
  | "lesson"
  | "whiteboard"
  | "teacher-dashboard"
  | "test-library";

export type AssistantEntityRef = {
  courseId?: string;
  lessonId?: string;
  testId?: string;
};

export type AssistantUiState =
  | "idle"
  | "hover"
  | "active"
  | "thinking"
  | "streaming"
  | "success"
  | "warning"
  | "error"
  | "disabled";

export type AssistantActionId =
  | "student.review"
  | "student.plan"
  | "student.buy"
  | "student.hint"
  | "student.check"
  | "teacher.kpi"
  | "teacher.dropoff"
  | "teacher.improve"
  | "teacher.lesson-template"
  | "teacher.test-blueprint"
  | "assistant.retry";

export type AssistantAction = {
  id: AssistantActionId;
  label: string;
  icon?: string;
  payload?: Record<string, string>;
};

export type AssistantRecommendationType = "review" | "purchase" | "study_plan";

export type AssistantRecommendation = {
  id: string;
  type: AssistantRecommendationType;
  title: string;
  reason: string;
  priority: 1 | 2 | 3;
  entity?: AssistantEntityRef;
  cta: {
    type: "open_lesson" | "open_course" | "open_catalog" | "continue_lesson";
    label: string;
  };
};

export type AssistantKpiCard = {
  id: string;
  label: string;
  value: string;
  trend?: string;
  tone?: "neutral" | "success" | "warning" | "error";
};

export type AssistantInsight = {
  id: string;
  problem: string;
  evidence: string;
  action: string;
  priority: 1 | 2 | 3;
};

export type AssistantChecklistItem = {
  id: string;
  label: string;
  checked: boolean;
  severity?: "info" | "warning" | "error";
};

export type AssistantEntityLink = {
  id: string;
  label: string;
  entity: AssistantEntityRef;
};

export type AssistantResponseBlock =
  | {
      id: string;
      type: "text";
      title?: string;
      text: string;
      tone?: "default" | "success" | "warning" | "error";
    }
  | {
      id: string;
      type: "recommendation_list";
      title?: string;
      items: AssistantRecommendation[];
    }
  | {
      id: string;
      type: "kpi_cards";
      title?: string;
      items: AssistantKpiCard[];
    }
  | {
      id: string;
      type: "insight_list";
      title?: string;
      items: AssistantInsight[];
    }
  | {
      id: string;
      type: "checklist";
      title?: string;
      items: AssistantChecklistItem[];
    }
  | {
      id: string;
      type: "quick_actions";
      title?: string;
      actions: AssistantAction[];
    }
  | {
      id: string;
      type: "entity_links";
      title?: string;
      links: AssistantEntityLink[];
    }
  | {
      id: string;
      type: "warning_banner";
      title?: string;
      message: string;
    };

export type AssistantContextSnapshot = {
  role: AssistantRole;
  mode: AssistantMode;
  activeCourseId?: string;
  activeLessonId?: string;
  activeTestId?: string;
  purchasedCourseIds: string[];
  weakTopics: string[];
  recentActivityMinutes: number;
  lastSeenAt: string;
};

export type AssistantRespondRequest = {
  userId: string;
  role: AssistantRole;
  mode: AssistantMode;
  message?: string;
  actionIntent?: AssistantActionId;
  sessionId?: string;
  active?: AssistantEntityRef;
};

export type AssistantRespondResponse = {
  sessionId: string;
  state: Exclude<AssistantUiState, "hover" | "disabled">;
  blocks: AssistantResponseBlock[];
  quickActions: AssistantAction[];
  context: AssistantContextSnapshot;
  timestamp: string;
};

export type AssistantSessionCreateRequest = {
  userId: string;
  role: AssistantRole;
  mode: AssistantMode;
  title?: string;
};

export type AssistantSessionSummary = {
  id: string;
  userId: string;
  role: AssistantRole;
  title: string;
  mode: AssistantMode;
  createdAt: string;
  updatedAt: string;
};

export type AssistantSessionMessage = {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  text: string;
  blocks?: AssistantResponseBlock[];
  createdAt: string;
};

export type AssistantSessionResponse = {
  session: AssistantSessionSummary;
  messages: AssistantSessionMessage[];
};

export type StudentRecommendationsResponse = {
  studentId: string;
  generatedAt: string;
  recommendations: AssistantRecommendation[];
};

export type TeacherInsightsResponse = {
  teacherId: string;
  generatedAt: string;
  kpi: AssistantKpiCard[];
  insights: AssistantInsight[];
  actions: AssistantAction[];
};

export type AuthoringCourseOutlineRequest = {
  teacherId: string;
  topic: string;
  level: string;
  durationWeeks: number;
};

export type AuthoringLessonDraftRequest = {
  teacherId: string;
  courseId?: string;
  lessonTopic: string;
  audienceLevel: string;
};

export type AuthoringResponse = {
  generatedAt: string;
  blocks: AssistantResponseBlock[];
};

export type AssistantPlatformEventType =
  | "course_purchased"
  | "lesson_opened"
  | "lesson_completed"
  | "test_submitted"
  | "whiteboard_session_started"
  | "assistant_action_clicked";

export type AssistantPlatformEventRequest = {
  userId: string;
  type: AssistantPlatformEventType;
  payload: Record<string, string | number | boolean | null>;
  createdAt?: string;
};

export type AssistantPlatformEventResponse = {
  ok: true;
  eventId: string;
};
