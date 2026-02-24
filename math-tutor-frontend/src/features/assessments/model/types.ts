export type AssessmentLinkRef = {
  courseId?: string;
  lessonId?: string;
  itemId?: string;
};

export type AssessmentAttachment = {
  id: string;
  name: string;
  url: string;
  type: "image" | "pdf" | "doc" | "link";
};

export type RecommendationLink = {
  text: string;
  link?: AssessmentLinkRef;
};

export type AssessmentRecommendationMapItem = {
  topicId: string;
  label: string;
  link?: AssessmentLinkRef;
};

export type AssessmentAnswerSpec = {
  type: "number" | "text" | "expression";
  expected: string | string[];
  tolerance?: {
    kind: "abs" | "rel";
    value: number;
  };
  formatRules?: {
    allowCommaDecimal?: boolean;
    trimSpaces?: boolean;
  };
};

export type AssessmentQuestion = {
  id: string;
  prompt: {
    text: string;
    attachments?: AssessmentAttachment[];
  };
  topicId?: string;
  answerSpec: AssessmentAnswerSpec;
  feedback: {
    explanation: string;
    recommendations?: RecommendationLink[];
  };
};

export type TestTemplate = {
  id: string;
  title: string;
  description?: string;
  durationMinutes: number;
  createdByTeacherId: string;
  createdAt: string;
  updatedAt: string;
  questions: AssessmentQuestion[];
  recommendationMap?: AssessmentRecommendationMapItem[];
  status: "draft" | "published";
  deletedAt?: string;
};

export type TestTemplateSnapshot = {
  title: string;
  description?: string;
  durationMinutes: number;
  questions: AssessmentQuestion[];
  recommendationMap?: AssessmentRecommendationMapItem[];
};

export type CourseContentLessonItem = {
  id: string;
  courseId: string;
  blockId: string;
  type: "lesson";
  lessonId: string;
  createdAt: string;
  order: number;
};

export type CourseContentTestItem = {
  id: string;
  courseId: string;
  blockId: string;
  type: "test";
  templateId: string;
  titleSnapshot: string;
  templateSnapshot?: TestTemplateSnapshot;
  createdAt: string;
  order: number;
};

export type CourseContentItem = CourseContentLessonItem | CourseContentTestItem;

export type CourseMaterialBlock = {
  id: string;
  courseId: string;
  title: string;
  description: string;
  order: number;
};

export type AssessmentAttemptAnswer = {
  questionId: string;
  raw: string;
  normalized: string;
  isCorrect: boolean;
};

export type AssessmentTopicBreakdown = {
  topicId: string;
  correct: number;
  total: number;
};

export type AssessmentAttempt = {
  id: string;
  studentId: string;
  courseId: string;
  testItemId: string;
  templateId: string;
  startedAt: string;
  submittedAt?: string;
  timeSpentSeconds: number;
  answers: AssessmentAttemptAnswer[];
  score: {
    correct: number;
    total: number;
    percent: number;
  };
  topicBreakdown?: AssessmentTopicBreakdown[];
  recommendationsComputed?: RecommendationLink[];
};

export type AssessmentQuestionCheckResult = {
  normalized: string;
  isCorrect: boolean;
  reason: "correct" | "incorrect" | "invalid_format";
  explanation: string;
  recommendations: RecommendationLink[];
};

export type AssessmentCourseProgress = {
  totalTests: number;
  completedTests: number;
  averageLatestPercent: number;
};

export type AssessmentKnowledgeProgress = {
  totalTests: number;
  completedTests: number;
  averageBestPercent: number;
};

export type AssessmentSession = {
  key: string;
  studentId: string;
  courseId: string;
  testItemId: string;
  templateId: string;
  startedAt: string;
  updatedAt: string;
  remainingSeconds: number;
  currentQuestionIndex: number;
  answers: Record<string, string>;
};

export type AssessmentStorageState = {
  templates: TestTemplate[];
  courseContent: Record<string, CourseContentItem[]>;
  courseBlocks: Record<string, CourseMaterialBlock[]>;
  attempts: AssessmentAttempt[];
};

export const ASSESSMENTS_STORAGE_KEY = "ASSESSMENTS_STORAGE_V1";

export const createEmptyAssessmentsState = (): AssessmentStorageState => ({
  templates: [],
  courseContent: {},
  courseBlocks: {},
  attempts: [],
});
