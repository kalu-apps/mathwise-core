import { api } from "@/shared/api/client";
import { readStorage, removeStorage } from "@/shared/lib/localDb";
import { generateId } from "@/shared/lib/id";
import type { Lesson } from "@/entities/lesson/model/types";
import { getPurchases } from "@/entities/purchase/model/storage";
import {
  ASSESSMENTS_STORAGE_KEY,
  createEmptyAssessmentsState,
  type AssessmentAttempt,
  type AssessmentCourseProgress,
  type AssessmentKnowledgeProgress,
  type CourseMaterialBlock,
  type AssessmentSession,
  type CourseContentItem,
  type CourseContentTestItem,
  type TestTemplateSnapshot,
  type TestTemplate,
} from "@/features/assessments/model/types";
import { evaluateAssessmentAnswers } from "@/features/assessments/model/evaluator";

export const ASSESSMENT_SESSION_STORAGE_KEY = "ASSESSMENT_SESSIONS_V1";
const ASSESSMENT_SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const ASSESSMENTS_STATE_ENDPOINT = "/assessments/state";
const ASSESSMENTS_SESSIONS_ENDPOINT = "/assessments/sessions";

const normalizeState = (
  state: ReturnType<typeof createEmptyAssessmentsState>
): ReturnType<typeof createEmptyAssessmentsState> => ({
  templates: Array.isArray(state.templates)
    ? state.templates.map((template) => ({
        ...template,
        durationMinutes:
          typeof template.durationMinutes === "number" &&
          Number.isFinite(template.durationMinutes)
            ? Math.max(0, Math.floor(template.durationMinutes))
            : 0,
        assessmentKind:
          template.assessmentKind === "exam" ? "exam" : "credit",
      }))
    : [],
  courseContent: state.courseContent ?? {},
  courseBlocks: state.courseBlocks ?? {},
  attempts: Array.isArray(state.attempts)
    ? state.attempts.map((attempt) => ({
        ...attempt,
        timeSpentSeconds:
          typeof attempt.timeSpentSeconds === "number" &&
          Number.isFinite(attempt.timeSpentSeconds)
            ? Math.max(0, Math.floor(attempt.timeSpentSeconds))
            : 0,
      }))
    : [],
});

const normalizeSessionsMap = (map: Record<string, AssessmentSession>) => {
  const now = Date.now();
  return Object.fromEntries(
    Object.entries(map).filter(([, session]) => {
      const updatedAtMs = Date.parse(session.updatedAt);
      if (!Number.isFinite(updatedAtMs)) return false;
      return now - updatedAtMs <= ASSESSMENT_SESSION_TTL_MS;
    })
  );
};

const isStateEmpty = (state: ReturnType<typeof createEmptyAssessmentsState>) =>
  state.templates.length === 0 &&
  state.attempts.length === 0 &&
  Object.keys(state.courseContent).length === 0 &&
  Object.keys(state.courseBlocks).length === 0;

let assessmentsLegacyMigrationChecked = false;
let sessionsLegacyMigrationChecked = false;

const migrateLegacyAssessmentsStateIfNeeded = async (
  currentState: ReturnType<typeof createEmptyAssessmentsState>
) => {
  if (assessmentsLegacyMigrationChecked) return currentState;
  assessmentsLegacyMigrationChecked = true;
  const legacyState = normalizeState(
    readStorage(ASSESSMENTS_STORAGE_KEY, createEmptyAssessmentsState())
  );
  if (isStateEmpty(currentState) && !isStateEmpty(legacyState)) {
    await api.put(ASSESSMENTS_STATE_ENDPOINT, legacyState, {
      notifyDataUpdate: true,
    });
    removeStorage(ASSESSMENTS_STORAGE_KEY);
    return legacyState;
  }
  return currentState;
};

const migrateLegacySessionsIfNeeded = async (
  currentMap: Record<string, AssessmentSession>
) => {
  if (sessionsLegacyMigrationChecked) return currentMap;
  sessionsLegacyMigrationChecked = true;
  const legacyMap = normalizeSessionsMap(
    readStorage<Record<string, AssessmentSession>>(ASSESSMENT_SESSION_STORAGE_KEY, {})
  );
  if (Object.keys(currentMap).length === 0 && Object.keys(legacyMap).length > 0) {
    await api.put(ASSESSMENTS_SESSIONS_ENDPOINT, legacyMap, {
      notifyDataUpdate: false,
    });
    removeStorage(ASSESSMENT_SESSION_STORAGE_KEY);
    return legacyMap;
  }
  return currentMap;
};

const readState = async () => {
  const state = normalizeState(
    await api.get<ReturnType<typeof createEmptyAssessmentsState>>(
      ASSESSMENTS_STATE_ENDPOINT,
      {
        cacheTtlMs: 0,
        dedupe: false,
      }
    )
  );
  return migrateLegacyAssessmentsStateIfNeeded(state);
};

const writeState = async (
  state: ReturnType<typeof createEmptyAssessmentsState>,
  reason: string
) => {
  void reason;
  await api.put(ASSESSMENTS_STATE_ENDPOINT, normalizeState(state), {
    notifyDataUpdate: true,
  });
};

const toTimestamp = () => new Date().toISOString();

const makeSessionKey = (studentId: string, courseId: string, testItemId: string) =>
  `${studentId}:${courseId}:${testItemId}`;

const getDefaultBlockId = (courseId: string) => `course-block-default-${courseId}`;

const createDefaultBlock = (courseId: string): CourseMaterialBlock => ({
  id: getDefaultBlockId(courseId),
  courseId,
  title: "Материалы курса",
  description: "",
  order: 1,
});

const normalizeBlocks = (
  courseId: string,
  blocks: CourseMaterialBlock[]
): CourseMaterialBlock[] => {
  const safeBlocks = Array.isArray(blocks) ? blocks : [];
  if (safeBlocks.length === 0) {
    return [createDefaultBlock(courseId)];
  }
  const normalized = safeBlocks
    .filter(
      (block) => Boolean(block?.id) && Boolean(block?.title?.trim())
    )
    .sort((a, b) => a.order - b.order)
    .map((block, index) => ({
      id: block.id,
      courseId,
      title: block.title.trim(),
      description: block.description?.trim() ?? "",
      order: index + 1,
    }));
  return normalized.length > 0 ? normalized : [createDefaultBlock(courseId)];
};

const normalizeQueue = (items: CourseContentItem[]): CourseContentItem[] =>
  [...items]
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({ ...item, order: index + 1 }));

const toTemplateSnapshot = (template: TestTemplate): TestTemplateSnapshot => ({
  title: template.title,
  description: template.description ?? "",
  durationMinutes:
    typeof template.durationMinutes === "number" &&
    Number.isFinite(template.durationMinutes)
      ? Math.max(0, Math.floor(template.durationMinutes))
      : 0,
  assessmentKind: template.assessmentKind === "exam" ? "exam" : "credit",
  questions: template.questions.map((question) => ({
    ...question,
    prompt: {
      ...question.prompt,
      attachments: question.prompt.attachments
        ? question.prompt.attachments.map((attachment) => ({ ...attachment }))
        : undefined,
    },
    answerSpec: {
      ...question.answerSpec,
      expected: Array.isArray(question.answerSpec.expected)
        ? [...question.answerSpec.expected]
        : question.answerSpec.expected,
      tolerance: question.answerSpec.tolerance
        ? { ...question.answerSpec.tolerance }
        : undefined,
      formatRules: question.answerSpec.formatRules
        ? { ...question.answerSpec.formatRules }
        : undefined,
    },
    feedback: {
      ...question.feedback,
      recommendations: question.feedback.recommendations
        ? question.feedback.recommendations.map((recommendation) => ({
            ...recommendation,
            link: recommendation.link ? { ...recommendation.link } : undefined,
          }))
        : undefined,
    },
  })),
  recommendationMap: template.recommendationMap
    ? template.recommendationMap.map((item) => ({
        ...item,
        link: item.link ? { ...item.link } : undefined,
      }))
    : undefined,
});

const resolveTemplateForTestItem = (
  templates: TestTemplate[],
  item: CourseContentTestItem
): TestTemplate | null => {
  if (item.templateSnapshot) {
    return {
      id: item.templateId,
      title: item.templateSnapshot.title,
      description: item.templateSnapshot.description ?? "",
      durationMinutes: item.templateSnapshot.durationMinutes,
      createdByTeacherId: "",
      createdAt: item.createdAt,
      updatedAt: item.createdAt,
      assessmentKind:
        item.templateSnapshot.assessmentKind === "exam" ? "exam" : "credit",
      questions: item.templateSnapshot.questions,
      recommendationMap: item.templateSnapshot.recommendationMap,
      status: "published",
    };
  }
  return templates.find((template) => template.id === item.templateId) ?? null;
};

const normalizeQueueWithBlocks = (params: {
  courseId: string;
  items: CourseContentItem[];
  blocks: CourseMaterialBlock[];
}) => {
  const normalizedBlocks = normalizeBlocks(params.courseId, params.blocks);
  const firstBlockId = normalizedBlocks[0].id;
  const blockIds = new Set(normalizedBlocks.map((block) => block.id));

  const normalizedQueue = normalizeQueue(params.items).map((item) => ({
    ...item,
    blockId: blockIds.has(item.blockId) ? item.blockId : firstBlockId,
  }));

  return {
    blocks: normalizedBlocks,
    queue: normalizedQueue,
  };
};

const buildLessonOnlyQueue = (courseId: string, lessons: Lesson[]): CourseContentItem[] =>
  [...lessons]
    .sort((a, b) => a.order - b.order)
    .map((lesson, index) => ({
      id: `lesson-item-${lesson.id}`,
      courseId,
      blockId: getDefaultBlockId(courseId),
      type: "lesson" as const,
      lessonId: lesson.id,
      createdAt: toTimestamp(),
      order: index + 1,
    }));

const syncQueueWithLessons = (
  courseId: string,
  inputItems: CourseContentItem[],
  lessons: Lesson[],
  blocks: CourseMaterialBlock[]
): CourseContentItem[] => {
  const { queue: baseQueue } = normalizeQueueWithBlocks({
    courseId,
    items: inputItems,
    blocks,
  });
  const defaultBlockId = normalizeBlocks(courseId, blocks)[0].id;
  const lessonIds = new Set(lessons.map((lesson) => lesson.id));
  const queue = baseQueue.filter((item) => {
    if (item.type !== "lesson") return true;
    return lessonIds.has(item.lessonId);
  });

  const existingLessonIds = new Set(
    queue.filter((item) => item.type === "lesson").map((item) => item.lessonId)
  );

  const missingLessonItems = [...lessons]
    .sort((a, b) => a.order - b.order)
    .filter((lesson) => !existingLessonIds.has(lesson.id))
    .map((lesson) => ({
      id: `lesson-item-${lesson.id}`,
      courseId,
      blockId: defaultBlockId,
      type: "lesson" as const,
      lessonId: lesson.id,
      createdAt: toTimestamp(),
      order: queue.length + 1,
    }));

  return normalizeQueue([...queue, ...missingLessonItems]);
};

export const getAssessmentTemplatesByTeacher = async (teacherId: string) => {
  const state = await readState();
  return state.templates
    .filter(
      (template) =>
        template.createdByTeacherId === teacherId && !template.deletedAt
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

export const getAssessmentTemplateById = async (templateId: string) => {
  const state = await readState();
  return state.templates.find((template) => template.id === templateId) ?? null;
};

export const saveAssessmentTemplate = async (
  input: Omit<TestTemplate, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
  }
) => {
  const state = await readState();
  const timestamp = toTimestamp();
  const existing = input.id
    ? state.templates.find((template) => template.id === input.id)
    : null;

  const nextTemplate: TestTemplate = {
    id: existing?.id ?? input.id ?? generateId(),
    title: input.title.trim(),
    description: input.description?.trim() ?? "",
    durationMinutes:
      typeof input.durationMinutes === "number" &&
      Number.isFinite(input.durationMinutes)
        ? Math.max(0, Math.floor(input.durationMinutes))
        : 0,
    assessmentKind: input.assessmentKind === "exam" ? "exam" : "credit",
    createdByTeacherId: input.createdByTeacherId,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    questions: input.questions,
    recommendationMap: input.recommendationMap,
    status: input.status,
    deletedAt: undefined,
  };

  const nextTemplates = existing
    ? state.templates.map((template) =>
        template.id === existing.id ? nextTemplate : template
      )
    : [...state.templates, nextTemplate];

  const frozenCourseContent = existing
    ? Object.fromEntries(
        Object.entries(state.courseContent).map(([courseId, items]) => [
          courseId,
          items.map((item) => {
            if (item.type !== "test") return item;
            if (item.templateId !== existing.id) return item;
            if (item.templateSnapshot) return item;
            return {
              ...item,
              templateSnapshot: toTemplateSnapshot(existing),
              titleSnapshot: item.titleSnapshot || existing.title,
            };
          }),
        ])
      )
    : state.courseContent;

  await writeState(
    { ...state, templates: nextTemplates, courseContent: frozenCourseContent },
    "assessment-template-save"
  );
  return nextTemplate;
};

export const deleteAssessmentTemplate = async (
  templateId: string,
  teacherId: string
) => {
  const state = await readState();
  const template = state.templates.find((item) => item.id === templateId);
  if (!template) return;
  if (template.createdByTeacherId !== teacherId) {
    throw new Error("Нельзя удалить шаблон другого преподавателя.");
  }

  const linkedCourseIds = Object.entries(state.courseContent)
    .filter(([, items]) =>
      items.some((item) => item.type === "test" && item.templateId === templateId)
    )
    .map(([courseId]) => courseId);

  if (linkedCourseIds.length > 0) {
    const purchases = await getPurchases();
    const hasPurchasedCourses = purchases.some((purchase) =>
      linkedCourseIds.includes(purchase.courseId)
    );
    if (hasPurchasedCourses) {
      throw new Error(
        "Тест уже используется в купленных курсах. Его можно скрыть из базы, но удалить нельзя."
      );
    }
  }

  const nextTemplates = state.templates.map((item) =>
    item.id === templateId
      ? {
          ...item,
          deletedAt: toTimestamp(),
          updatedAt: toTimestamp(),
        }
      : item
  );
  const frozenCourseContent = Object.fromEntries(
    Object.entries(state.courseContent).map(([courseId, items]) => [
      courseId,
      items.map((item) => {
        if (item.type !== "test") return item;
        if (item.templateId !== template.id || item.templateSnapshot) return item;
        return {
          ...item,
          templateSnapshot: toTemplateSnapshot(template),
          titleSnapshot: item.titleSnapshot || template.title,
        };
      }),
    ])
  );

  await writeState(
    {
        ...state,
        templates: nextTemplates,
        courseContent: frozenCourseContent,
        courseBlocks: state.courseBlocks,
      },
      "assessment-template-delete"
  );
};

export const duplicateAssessmentTemplate = async (
  templateId: string,
  teacherId: string
) => {
  const template = await getAssessmentTemplateById(templateId);
  if (!template) {
    throw new Error("Шаблон не найден.");
  }
  return saveAssessmentTemplate({
    ...template,
    id: undefined,
    createdByTeacherId: teacherId,
    title: `${template.title} (копия)`,
  });
};

export const publishAssessmentTemplate = async (
  templateId: string,
  teacherId: string
) => {
  const state = await readState();
  const template = state.templates.find((item) => item.id === templateId);
  if (!template) {
    throw new Error("Шаблон не найден.");
  }
  if (template.createdByTeacherId !== teacherId) {
    throw new Error("Нельзя публиковать шаблон другого преподавателя.");
  }

  const updated: TestTemplate = {
    ...template,
    status: "published",
    updatedAt: toTimestamp(),
  };

  const nextTemplates = state.templates.map((item) =>
    item.id === templateId ? updated : item
  );

  await writeState(
    { ...state, templates: nextTemplates },
    "assessment-template-publish"
  );
  return updated;
};

export const getCourseContentItems = async (
  courseId: string,
  lessons: Lesson[]
): Promise<CourseContentItem[]> => {
  const state = await readState();
  const blocks = normalizeBlocks(courseId, state.courseBlocks[courseId] ?? []);
  const currentQueue = state.courseContent[courseId] ?? [];
  const nextQueue = currentQueue.length
    ? syncQueueWithLessons(courseId, currentQueue, lessons, blocks)
    : buildLessonOnlyQueue(courseId, lessons);

  const normalized = normalizeQueueWithBlocks({
    courseId,
    items: nextQueue,
    blocks,
  });
  const templatesById = new Map(
    state.templates.map((template) => [template.id, template] as const)
  );
  const queueWithSnapshots = normalized.queue.map((item) => {
    if (item.type !== "test") return item;
    if (item.templateSnapshot) return item;
    const template = templatesById.get(item.templateId);
    if (!template) return item;
    return {
      ...item,
      templateSnapshot: toTemplateSnapshot(template),
      titleSnapshot: item.titleSnapshot || template.title,
    };
  });

  const hasChanged =
    JSON.stringify(currentQueue) !== JSON.stringify(queueWithSnapshots) ||
    JSON.stringify(state.courseBlocks[courseId] ?? []) !==
      JSON.stringify(normalized.blocks);
  if (hasChanged) {
    await writeState({
      ...state,
      courseContent: {
        ...state.courseContent,
        [courseId]: queueWithSnapshots,
      },
      courseBlocks: {
        ...state.courseBlocks,
        [courseId]: normalized.blocks,
      },
    }, "assessment-course-content-sync");
  }

  return queueWithSnapshots;
};

export const saveCourseContentItems = async (
  courseId: string,
  items: CourseContentItem[]
) => {
  const state = await readState();
  const templatesById = new Map(
    state.templates.map((template) => [template.id, template] as const)
  );
  const normalized = normalizeQueueWithBlocks({
    courseId,
    items: items.map((item) => ({
      ...item,
      courseId,
    })),
    blocks: state.courseBlocks[courseId] ?? [],
  });
  const queueWithSnapshots = normalized.queue.map((item) => {
    if (item.type !== "test") return item;
    if (item.templateSnapshot) return item;
    const template = templatesById.get(item.templateId);
    if (!template) return item;
    return {
      ...item,
      templateSnapshot: toTemplateSnapshot(template),
      titleSnapshot: item.titleSnapshot || template.title,
    };
  });

  await writeState(
    {
      ...state,
      courseContent: {
        ...state.courseContent,
        [courseId]: queueWithSnapshots,
      },
      courseBlocks: {
        ...state.courseBlocks,
        [courseId]: normalized.blocks,
      },
    },
    "assessment-course-content-save"
  );

  return queueWithSnapshots;
};

export const getCourseMaterialBlocks = async (courseId: string) => {
  const state = await readState();
  const blocks = normalizeBlocks(courseId, state.courseBlocks[courseId] ?? []);
  if (JSON.stringify(state.courseBlocks[courseId] ?? []) !== JSON.stringify(blocks)) {
    await writeState({
      ...state,
      courseBlocks: {
        ...state.courseBlocks,
        [courseId]: blocks,
      },
    }, "assessment-course-blocks-sync");
  }
  return blocks;
};

export const saveCourseMaterialBlocks = async (
  courseId: string,
  blocks: CourseMaterialBlock[]
) => {
  const state = await readState();
  const normalizedBlocks = normalizeBlocks(courseId, blocks);
  const queue = normalizeQueueWithBlocks({
    courseId,
    items: state.courseContent[courseId] ?? [],
    blocks: normalizedBlocks,
  });
  await writeState(
    {
      ...state,
      courseContent: {
        ...state.courseContent,
        [courseId]: queue.queue,
      },
      courseBlocks: {
        ...state.courseBlocks,
        [courseId]: queue.blocks,
      },
    },
    "assessment-course-blocks-save"
  );
  return queue.blocks;
};

export const deleteCourseContentItems = async (courseId: string) => {
  const state = await readState();
  if (!state.courseContent[courseId]) return;
  const rest = { ...state.courseContent };
  const restBlocks = { ...state.courseBlocks };
  delete rest[courseId];
  delete restBlocks[courseId];
  const sessions = await readSessionsMap();
  const filteredSessions = Object.fromEntries(
    Object.entries(sessions).filter(([, session]) => session.courseId !== courseId)
  );
  await writeState(
    {
      ...state,
      courseContent: rest,
      courseBlocks: restBlocks,
      attempts: state.attempts.filter((attempt) => attempt.courseId !== courseId),
    },
    "assessment-course-content-delete"
  );
  await writeSessionsMap(filteredSessions);
};

export const addTestItemToCourseContent = async (
  courseId: string,
  template: TestTemplate,
  items: CourseContentItem[],
  blockId?: string
): Promise<CourseContentItem[]> => {
  const blocks = await getCourseMaterialBlocks(courseId);
  const testItem: CourseContentTestItem = {
    id: generateId(),
    courseId,
    blockId: blockId && blocks.some((block) => block.id === blockId) ? blockId : blocks[0].id,
    type: "test",
    templateId: template.id,
    titleSnapshot: template.title,
    templateSnapshot: toTemplateSnapshot(template),
    createdAt: toTimestamp(),
    order: items.length + 1,
  };
  return saveCourseContentItems(courseId, [...items, testItem]);
};

export const submitAssessmentAttempt = async (params: {
  studentId: string;
  courseId: string;
  testItemId: string;
  templateId: string;
  answers: Record<string, string>;
  startedAt?: string;
  timeSpentSeconds?: number;
}) => {
  const state = await readState();
  const queue = state.courseContent[params.courseId] ?? [];
  const testItem = queue.find(
    (item): item is CourseContentTestItem =>
      item.type === "test" && item.id === params.testItemId
  );
  const template =
    (testItem ? resolveTemplateForTestItem(state.templates, testItem) : null) ??
    state.templates.find((item) => item.id === params.templateId) ??
    null;

  if (!template) {
    throw new Error("Шаблон теста не найден.");
  }

  const evaluated = evaluateAssessmentAnswers(template, params.answers);
  const submittedAt = toTimestamp();

  const attempt: AssessmentAttempt = {
    id: generateId(),
    studentId: params.studentId,
    courseId: params.courseId,
    testItemId: params.testItemId,
    templateId: template.id,
    startedAt: params.startedAt ?? submittedAt,
    submittedAt,
    timeSpentSeconds: Math.max(0, Math.floor(params.timeSpentSeconds ?? 0)),
    answers: evaluated.checked.map((item) => ({
      questionId: item.question.id,
      raw: item.raw,
      normalized: item.normalized,
      isCorrect: item.isCorrect,
    })),
    score: evaluated.score,
    topicBreakdown: evaluated.topicBreakdown,
    recommendationsComputed: evaluated.recommendations,
  };

  await writeState(
    {
      ...state,
      attempts: [...state.attempts, attempt],
    },
    "assessment-attempt-submit"
  );

  return {
    attempt,
    checked: evaluated.checked,
  };
};

export const getAssessmentAttempts = async (params: {
  studentId: string;
  courseId: string;
  testItemId?: string;
}) => {
  const state = await readState();
  return state.attempts
    .filter((attempt) => {
      if (attempt.studentId !== params.studentId) return false;
      if (attempt.courseId !== params.courseId) return false;
      if (params.testItemId && attempt.testItemId !== params.testItemId) {
        return false;
      }
      return true;
    })
    .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""));
};

export const getLatestAssessmentAttemptsMap = async (params: {
  studentId: string;
  courseId: string;
}) => {
  const attempts = await getAssessmentAttempts(params);
  const map = new Map<string, AssessmentAttempt>();
  attempts.forEach((attempt) => {
    if (!map.has(attempt.testItemId)) {
      map.set(attempt.testItemId, attempt);
    }
  });
  return map;
};

export const getBestAssessmentAttemptsMap = async (params: {
  studentId: string;
  courseId: string;
}) => {
  const attempts = await getAssessmentAttempts(params);
  const map = new Map<string, AssessmentAttempt>();
  attempts.forEach((attempt) => {
    const current = map.get(attempt.testItemId);
    if (!current || attempt.score.percent > current.score.percent) {
      map.set(attempt.testItemId, attempt);
    }
  });
  return map;
};

export const getAssessmentCourseProgress = async (params: {
  studentId: string;
  courseId: string;
  testItemIds: string[];
}): Promise<AssessmentCourseProgress> => {
  const latestMap = await getLatestAssessmentAttemptsMap({
    studentId: params.studentId,
    courseId: params.courseId,
  });

  const relevantAttempts = params.testItemIds
    .map((testItemId) => latestMap.get(testItemId) ?? null)
    .filter((attempt): attempt is AssessmentAttempt => Boolean(attempt));

  const totalTests = params.testItemIds.length;
  const completedTests = relevantAttempts.length;
  const averageLatestPercent =
    completedTests === 0
      ? 0
      : Math.round(
          relevantAttempts.reduce((sum, attempt) => sum + attempt.score.percent, 0) /
            completedTests
        );

  return {
    totalTests,
    completedTests,
    averageLatestPercent,
  };
};

export const getAssessmentKnowledgeProgress = async (params: {
  studentId: string;
  courseId: string;
  testItemIds: string[];
}): Promise<AssessmentKnowledgeProgress> => {
  const bestMap = await getBestAssessmentAttemptsMap({
    studentId: params.studentId,
    courseId: params.courseId,
  });

  const relevantBestAttempts = params.testItemIds
    .map((testItemId) => bestMap.get(testItemId) ?? null)
    .filter((attempt): attempt is AssessmentAttempt => Boolean(attempt));

  const totalTests = params.testItemIds.length;
  const completedTests = relevantBestAttempts.length;
  const averageBestPercent =
    completedTests === 0
      ? 0
      : Math.round(
          relevantBestAttempts.reduce(
            (sum, attempt) => sum + attempt.score.percent,
            0
          ) / completedTests
        );

  return {
    totalTests,
    completedTests,
    averageBestPercent,
  };
};

const readSessionsMap = async () => {
  const serverMap = normalizeSessionsMap(
    await api.get<Record<string, AssessmentSession>>(ASSESSMENTS_SESSIONS_ENDPOINT, {
      cacheTtlMs: 0,
      dedupe: false,
    })
  );
  return migrateLegacySessionsIfNeeded(serverMap);
};

const writeSessionsMap = async (map: Record<string, AssessmentSession>) => {
  await api.put(ASSESSMENTS_SESSIONS_ENDPOINT, normalizeSessionsMap(map), {
    notifyDataUpdate: false,
  });
};

export const saveAssessmentSession = async (
  session: Omit<AssessmentSession, "key" | "updatedAt">
) => {
  const map = await readSessionsMap();
  const key = makeSessionKey(session.studentId, session.courseId, session.testItemId);
  map[key] = {
    ...session,
    key,
    updatedAt: toTimestamp(),
  };
  await writeSessionsMap(map);
  return map[key];
};

export const getAssessmentSession = async (params: {
  studentId: string;
  courseId: string;
  testItemId: string;
}) => {
  const map = await readSessionsMap();
  const key = makeSessionKey(params.studentId, params.courseId, params.testItemId);
  return map[key] ?? null;
};

export const clearAssessmentSession = async (params: {
  studentId: string;
  courseId: string;
  testItemId: string;
}) => {
  const map = await readSessionsMap();
  const key = makeSessionKey(params.studentId, params.courseId, params.testItemId);
  if (!map[key]) return;
  delete map[key];
  await writeSessionsMap(map);
};
