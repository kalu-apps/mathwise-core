import type { MockDb } from "../../../db";
import type {
  AssistantAction,
  AssistantInsight,
  AssistantKpiCard,
} from "../../../../shared/api/assistant-contracts";

type TeacherInsightsResult = {
  kpi: AssistantKpiCard[];
  insights: AssistantInsight[];
  actions: AssistantAction[];
};

const percent = (numerator: number, denominator: number): number => {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
};

const getTrendTone = (value: number): "neutral" | "success" | "warning" | "error" => {
  if (value >= 75) return "success";
  if (value >= 50) return "neutral";
  if (value >= 30) return "warning";
  return "error";
};

const teacherQuickActions: AssistantAction[] = [
  { id: "teacher.kpi", label: "Сводка по курсам" },
  { id: "teacher.dropoff", label: "Где просадка" },
  { id: "teacher.improve", label: "Предложить улучшения урока" },
  { id: "teacher.lesson-template", label: "Создать шаблон урока" },
  { id: "teacher.test-blueprint", label: "Сгенерировать план теста" },
];

export const buildTeacherInsights = (
  db: MockDb,
  teacherId: string
): TeacherInsightsResult => {
  const teacherCourses = db.courses.filter((course) => course.teacherId === teacherId);
  const teacherCourseIds = new Set(teacherCourses.map((course) => course.id));
  const teacherLessons = db.lessons.filter((lesson) => teacherCourseIds.has(lesson.courseId));
  const coursePurchases = db.purchases.filter((purchase) =>
    teacherCourseIds.has(purchase.courseId)
  );

  const purchasedStudentsByCourse = new Map<string, Set<string>>();
  coursePurchases.forEach((purchase) => {
    const set = purchasedStudentsByCourse.get(purchase.courseId) ?? new Set<string>();
    set.add(purchase.userId);
    purchasedStudentsByCourse.set(purchase.courseId, set);
  });

  let expectedLessonCompletions = 0;
  teacherCourseIds.forEach((courseId) => {
    const lessonCount = teacherLessons.filter((lesson) => lesson.courseId === courseId).length;
    const studentCount = purchasedStudentsByCourse.get(courseId)?.size ?? 0;
    expectedLessonCompletions += lessonCount * studentCount;
  });

  const completedLessons = db.progress.filter(
    (item) => teacherCourseIds.has(item.courseId) && item.completed
  ).length;
  const completionRate = percent(completedLessons, expectedLessonCompletions);

  const testAttempts = db.assessments.attempts.filter((attempt) =>
    teacherCourseIds.has(attempt.courseId)
  );
  const passedAttempts = testAttempts.filter((attempt) => attempt.score.percent >= 70).length;
  const passRate = percent(passedAttempts, testAttempts.length);

  const attemptCounter = new Map<string, number>();
  testAttempts.forEach((attempt) => {
    const key = `${attempt.studentId}:${attempt.testItemId}`;
    attemptCounter.set(key, (attemptCounter.get(key) ?? 0) + 1);
  });
  const averageAttempts = attemptCounter.size
    ? Number(
        (
          Array.from(attemptCounter.values()).reduce((acc, item) => acc + item, 0) /
          attemptCounter.size
        ).toFixed(1)
      )
    : 0;

  const activeStudentIds = new Set<string>();
  db.progress.forEach((item) => {
    if (teacherCourseIds.has(item.courseId)) activeStudentIds.add(item.userId);
  });
  testAttempts.forEach((attempt) => {
    activeStudentIds.add(attempt.studentId);
  });
  const engagementRate = percent(activeStudentIds.size, Math.max(1, coursePurchases.length));

  const kpi: AssistantKpiCard[] = [
    {
      id: "kpi-completion",
      label: "Завершение уроков",
      value: `${completionRate}%`,
      trend: `${completedLessons}/${Math.max(expectedLessonCompletions, completedLessons)}`,
      tone: getTrendTone(completionRate),
    },
    {
      id: "kpi-pass-rate",
      label: "Успешность тестов",
      value: `${passRate}%`,
      trend: `${passedAttempts}/${Math.max(testAttempts.length, passedAttempts)}`,
      tone: getTrendTone(passRate),
    },
    {
      id: "kpi-attempts",
      label: "Среднее попыток",
      value: `${averageAttempts}`,
      trend: "на тест",
      tone: averageAttempts > 2.4 ? "warning" : "neutral",
    },
    {
      id: "kpi-engagement",
      label: "Вовлеченность",
      value: `${engagementRate}%`,
      trend: `${activeStudentIds.size} активных`,
      tone: getTrendTone(engagementRate),
    },
  ];

  const insights: AssistantInsight[] = [];
  if (completionRate < 55) {
    insights.push({
      id: "insight-completion",
      problem: "Низкая завершаемость уроков",
      evidence: `Текущий показатель: ${completionRate}%.`,
      action:
        "Сократите объем уроков до 12-15 минут и добавьте один практический checkpoint в середине.",
      priority: 1,
    });
  }
  if (passRate < 60) {
    insights.push({
      id: "insight-pass",
      problem: "Просадка по результатам тестов",
      evidence: `Проходной уровень достигнут только в ${passRate}% попыток.`,
      action:
        "Добавьте разбор типичных ошибок перед тестом и 2 тренировочных задания на каждую слабую тему.",
      priority: 1,
    });
  }
  if (averageAttempts > 2.4) {
    insights.push({
      id: "insight-attempts",
      problem: "Слишком много повторных попыток",
      evidence: `Среднее число попыток: ${averageAttempts}.`,
      action:
        "Пересоберите структуру вопросов: простые в начале, сложные в конце, добавьте подсказки после первой ошибки.",
      priority: 2,
    });
  }
  if (insights.length === 0) {
    insights.push({
      id: "insight-healthy",
      problem: "Ключевые метрики стабильны",
      evidence: "Критических провалов не обнаружено.",
      action:
        "Можно ускорить рост за счет новых модулей и A/B-проверки формата домашних заданий.",
      priority: 3,
    });
  }

  return {
    kpi,
    insights,
    actions: teacherQuickActions,
  };
};
