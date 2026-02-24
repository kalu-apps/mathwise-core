import crypto from "crypto";
import type {
  AssistantAction,
  AssistantPlatformEventRequest,
  AssistantPlatformEventResponse,
  AssistantRespondRequest,
  AssistantRespondResponse,
  AssistantResponseBlock,
  AssistantSessionCreateRequest,
  AssistantSessionMessage,
  AssistantSessionResponse,
  AssistantSessionSummary,
  AuthoringCourseOutlineRequest,
  AuthoringLessonDraftRequest,
  AuthoringResponse,
  StudentRecommendationsResponse,
  TeacherInsightsResponse,
} from "../../../shared/api/assistant-contracts";
import type { MockDb } from "../../db";
import { assembleAssistantContext } from "./context.assembler";
import {
  buildStudentRecommendationBuckets,
  buildStudentRecommendations,
} from "./recommendations/student-recommendation.engine";
import { buildTeacherInsights } from "./analytics/teacher-insights.engine";
import {
  generateCourseOutlineBlocks,
  generateLessonDraftBlocks,
  generateTestBlueprintBlocks,
} from "./authoring/authoring-coach.engine";
import { getAssistantProviderRegistry } from "./provider.registry";
import type { AssistantEngineInput } from "./assistant.types";

const nowIso = () => new Date().toISOString();

const ensureId = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `assistant_${Math.random().toString(36).slice(2, 11)}`;

const getQuickActions = (role: "student" | "teacher"): AssistantAction[] => {
  if (role === "teacher") {
    return [
      { id: "teacher.kpi", label: "Сводка по курсам" },
      { id: "teacher.dropoff", label: "Где проседают ученики" },
      { id: "teacher.improve", label: "Предложить улучшения урока" },
      { id: "teacher.lesson-template", label: "Создать шаблон урока" },
      { id: "teacher.test-blueprint", label: "Сгенерировать план теста" },
    ];
  }
  return [
    { id: "student.review", label: "Что повторить" },
    { id: "student.plan", label: "План на неделю" },
    { id: "student.buy", label: "Что купить дополнительно" },
    { id: "student.hint", label: "Подсказка" },
    { id: "student.check", label: "Проверить решение" },
  ];
};

const parseBlocks = (raw: string | null | undefined): AssistantResponseBlock[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as AssistantResponseBlock[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const toSessionSummary = (
  session: MockDb["assistantSessions"][number]
): AssistantSessionSummary => ({
  id: session.id,
  userId: session.userId,
  role: session.role,
  title: session.title,
  mode: session.mode,
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
});

const toSessionMessage = (
  message: MockDb["assistantMessages"][number]
): AssistantSessionMessage => ({
  id: message.id,
  sessionId: message.sessionId,
  role: message.role,
  text: message.text,
  blocks: parseBlocks(message.blocks),
  createdAt: message.createdAt,
});

const getSessionMessages = (db: MockDb, sessionId: string) =>
  db.assistantMessages
    .filter((message) => message.sessionId === sessionId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(toSessionMessage);

const createSessionRecord = (
  db: MockDb,
  payload: AssistantSessionCreateRequest
): MockDb["assistantSessions"][number] => {
  const createdAt = nowIso();
  const session = {
    id: ensureId(),
    userId: payload.userId,
    role: payload.role,
    mode: payload.mode,
    title:
      payload.title?.trim() ||
      `Аксиом · ${payload.role === "teacher" ? "Преподаватель" : "Студент"}`,
    createdAt,
    updatedAt: createdAt,
  } as const;
  db.assistantSessions.push(session);
  return session;
};

export const createAssistantSessionBundle = (
  db: MockDb,
  payload: AssistantSessionCreateRequest
): AssistantSessionResponse => {
  const session = createSessionRecord(db, payload);
  return {
    session: toSessionSummary(session),
    messages: [],
  };
};

export const getAssistantSessionBundle = (
  db: MockDb,
  sessionId: string
): AssistantSessionResponse | null => {
  const session = db.assistantSessions.find((item) => item.id === sessionId);
  if (!session) return null;
  return {
    session: toSessionSummary(session),
    messages: getSessionMessages(db, sessionId),
  };
};

const appendAssistantMessage = (
  db: MockDb,
  payload: {
    sessionId: string;
    role: "user" | "assistant";
    text: string;
    blocks?: AssistantResponseBlock[];
  }
) => {
  db.assistantMessages.push({
    id: ensureId(),
    sessionId: payload.sessionId,
    role: payload.role,
    text: payload.text,
    blocks: payload.blocks ? JSON.stringify(payload.blocks) : null,
    createdAt: nowIso(),
  });
};

const updateSessionTimestamp = (db: MockDb, sessionId: string) => {
  db.assistantSessions = db.assistantSessions.map((session) =>
    session.id === sessionId
      ? {
          ...session,
          updatedAt: nowIso(),
        }
      : session
  );
};

const withHeader = (title: string, text: string): AssistantResponseBlock => ({
  id: ensureId(),
  type: "text",
  title,
  text,
  tone: "default",
});

const buildStudentBlocks = (
  db: MockDb,
  request: AssistantRespondRequest,
  context: ReturnType<typeof assembleAssistantContext>
): AssistantResponseBlock[] => {
  const buckets = buildStudentRecommendationBuckets(db, context);

  switch (request.actionIntent) {
    case "student.review":
      return [
        withHeader(
          "Фокус на повторении",
          "Собрал уроки и материалы, которые дадут максимальный прирост по текущим слабым темам."
        ),
        {
          id: ensureId(),
          type: "recommendation_list",
          title: "Что повторить в первую очередь",
          items: buckets.review,
        },
      ];
    case "student.plan":
      return [
        withHeader(
          "План на 3–7 дней",
          "План построен по текущему прогрессу и недавним попыткам в тестах."
        ),
        {
          id: ensureId(),
          type: "recommendation_list",
          title: "Пошаговый маршрут",
          items: buckets.studyPlan,
        },
      ];
    case "student.buy":
      return [
        withHeader(
          "Дополнительные курсы",
          "Подобрал курсы, которые усиливают ваши слабые зоны и не дублируют купленные материалы."
        ),
        {
          id: ensureId(),
          type: "recommendation_list",
          title: "Что изучить дальше",
          items: buckets.purchase,
        },
      ];
    case "student.hint":
      return [
        withHeader(
          "Подсказка по задаче",
          request.message?.trim()
            ? `Шаг 1: выделите известные величины.\nШаг 2: проверьте, к какой теме относится задача.\nШаг 3: сравните с последним решенным примером.\n\nЗапрос: ${request.message.trim()}`
            : "Опишите условие задачи, и я выдам пошаговый разбор."
        ),
      ];
    case "student.check":
      return [
        withHeader(
          "Проверка решения",
          request.message?.trim()
            ? "Проверьте единицы измерения, знаки и условие применимости формулы."
            : "Отправьте шаги решения текстом — проверю структуру и типичные ошибки."
        ),
        {
          id: ensureId(),
          type: "checklist",
          title: "Чек-лист перед отправкой",
          items: [
            { id: ensureId(), label: "Все данные из условия использованы", checked: false },
            { id: ensureId(), label: "Промежуточные вычисления проверены", checked: false },
            { id: ensureId(), label: "Ответ записан в нужном формате", checked: false },
          ],
        },
      ];
    default:
      return [
        withHeader(
          "Персональные рекомендации",
          "Собрал краткую сводку по текущему состоянию: повторение, план и следующий курс."
        ),
        {
          id: ensureId(),
          type: "recommendation_list",
          title: "Приоритетные шаги",
          items: [...buckets.review, ...buckets.studyPlan, ...buckets.purchase].slice(0, 5),
        },
      ];
  }
};

const buildTeacherBlocks = (
  db: MockDb,
  request: AssistantRespondRequest,
  teacherId: string
): AssistantResponseBlock[] => {
  const insights = buildTeacherInsights(db, teacherId);

  if (request.actionIntent === "teacher.lesson-template") {
    return generateLessonDraftBlocks({
      lessonTopic: request.message ?? "Новый урок",
      audienceLevel: "Смешанный",
    });
  }

  if (request.actionIntent === "teacher.test-blueprint") {
    return generateTestBlueprintBlocks(request.message ?? "Текущий модуль");
  }

  if (request.actionIntent === "teacher.improve") {
    return [
      withHeader(
        "Рекомендации по улучшению",
        "Ниже действия с максимальным влиянием на завершение курса и результаты тестов."
      ),
      {
        id: ensureId(),
        type: "insight_list",
        title: "Точки роста",
        items: insights.insights,
      },
      {
        id: ensureId(),
        type: "quick_actions",
        title: "Действия",
        actions: insights.actions,
      },
    ];
  }

  if (request.actionIntent === "teacher.dropoff") {
    return [
      withHeader(
        "Зоны просадки",
        "Показываю, где теряется вовлеченность и что поменять в структуре курса."
      ),
      {
        id: ensureId(),
        type: "insight_list",
        title: "Проблемы и действия",
        items: insights.insights,
      },
    ];
  }

  if (request.actionIntent === "teacher.kpi") {
    return [
      withHeader(
        "Сводка метрик",
        "Метрики считаются по вашим курсам, урокам и попыткам тестов."
      ),
      {
        id: ensureId(),
        type: "kpi_cards",
        title: "KPI",
        items: insights.kpi,
      },
      {
        id: ensureId(),
        type: "insight_list",
        title: "Ключевые выводы",
        items: insights.insights,
      },
    ];
  }

  return [
    withHeader(
      "Панель преподавателя",
      "Подготовил обзор: KPI, риски и готовые действия для улучшения материала."
    ),
    {
      id: ensureId(),
      type: "kpi_cards",
      title: "Сводка по курсам",
      items: insights.kpi,
    },
    {
      id: ensureId(),
      type: "quick_actions",
      title: "Быстрые действия",
      actions: insights.actions,
    },
  ];
};

const sanitizeBlocksByModeration = async (
  input: AssistantRespondRequest,
  blocks: AssistantResponseBlock[]
): Promise<AssistantResponseBlock[]> => {
  const registry = getAssistantProviderRegistry();
  if (!input.message?.trim()) return blocks;
  const moderation = await registry.moderation.moderate({ text: input.message });
  if (moderation.allowed) return blocks;
  const warningBlock: AssistantResponseBlock = {
    id: ensureId(),
    type: "warning_banner",
    title: "Ограничение запроса",
    message: moderation.reason ?? "Запрос отклонен политикой модерации.",
  };
  return [warningBlock];
};

const buildAssistantTextFromBlocks = (blocks: AssistantResponseBlock[]) => {
  const primary = blocks[0];
  if (!primary) return "Готово.";
  if (primary.type === "text") return primary.text;
  if (primary.type === "warning_banner") return primary.message;
  return primary.title ?? "Готово.";
};

export const respondWithAssistant = async (
  db: MockDb,
  request: AssistantRespondRequest
): Promise<AssistantRespondResponse> => {
  const sessionId = request.sessionId?.trim() || ensureId();
  const session =
    db.assistantSessions.find((item) => item.id === sessionId) ??
    createSessionRecord(db, {
      userId: request.userId,
      role: request.role,
      mode: request.mode,
      title: `Аксиом · ${request.role === "teacher" ? "Преподаватель" : "Студент"}`,
    });
  const input: AssistantEngineInput = {
    userId: request.userId,
    role: request.role,
    mode: request.mode,
    sessionId: session.id,
    message: request.message,
    actionIntent: request.actionIntent,
    activeCourseId: request.active?.courseId,
    activeLessonId: request.active?.lessonId,
    activeTestId: request.active?.testId,
  };
  const context = assembleAssistantContext(db, input);

  if (request.message?.trim()) {
    appendAssistantMessage(db, {
      sessionId: session.id,
      role: "user",
      text: request.message.trim(),
    });
  }

  const engineBlocks =
    request.role === "student"
      ? buildStudentBlocks(db, request, context)
      : buildTeacherBlocks(db, request, request.userId);
  const moderatedBlocks = await sanitizeBlocksByModeration(request, engineBlocks);
  const llm = getAssistantProviderRegistry().llm;
  const rendered = await llm.renderStructuredResponse({
    role: request.role,
    mode: request.mode,
    message: request.message,
    blocks: moderatedBlocks,
  });

  appendAssistantMessage(db, {
    sessionId: session.id,
    role: "assistant",
    text: buildAssistantTextFromBlocks(rendered.blocks),
    blocks: rendered.blocks,
  });
  updateSessionTimestamp(db, session.id);

  return {
    sessionId: session.id,
    state: rendered.blocks.some((block) => block.type === "warning_banner")
      ? "warning"
      : "success",
    blocks: rendered.blocks,
    quickActions: getQuickActions(request.role),
    context,
    timestamp: nowIso(),
  };
};

export const getStudentRecommendationPayload = (
  db: MockDb,
  studentId: string
): StudentRecommendationsResponse => {
  const context = assembleAssistantContext(db, {
    userId: studentId,
    role: "student",
    mode: "study-cabinet",
    sessionId: "virtual",
  });
  return {
    studentId,
    generatedAt: nowIso(),
    recommendations: buildStudentRecommendations(db, context),
  };
};

export const getTeacherInsightsPayload = (
  db: MockDb,
  teacherId: string
): TeacherInsightsResponse => {
  const payload = buildTeacherInsights(db, teacherId);
  return {
    teacherId,
    generatedAt: nowIso(),
    kpi: payload.kpi,
    insights: payload.insights,
    actions: payload.actions,
  };
};

export const buildCourseOutlinePayload = (
  payload: AuthoringCourseOutlineRequest
): AuthoringResponse => {
  return {
    generatedAt: nowIso(),
    blocks: generateCourseOutlineBlocks({
      topic: payload.topic,
      level: payload.level,
      durationWeeks: payload.durationWeeks,
    }),
  };
};

export const buildLessonDraftPayload = (
  payload: AuthoringLessonDraftRequest
): AuthoringResponse => {
  return {
    generatedAt: nowIso(),
    blocks: generateLessonDraftBlocks({
      lessonTopic: payload.lessonTopic,
      audienceLevel: payload.audienceLevel,
    }),
  };
};

export const trackAssistantEvent = (
  db: MockDb,
  payload: AssistantPlatformEventRequest
): AssistantPlatformEventResponse => {
  const eventId = ensureId();
  db.assistantEvents.push({
    id: eventId,
    userId: payload.userId,
    type: payload.type,
    payload: JSON.stringify(payload.payload),
    createdAt: payload.createdAt ?? nowIso(),
  });
  return { ok: true, eventId };
};
