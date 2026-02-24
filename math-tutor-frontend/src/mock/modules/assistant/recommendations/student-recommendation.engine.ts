import type { Course } from "../../../../entities/course/model/types";
import type { Lesson } from "../../../../entities/lesson/model/types";
import type { MockDb } from "../../../db";
import type {
  AssistantRecommendation,
} from "../../../../shared/api/assistant-contracts";
import type { AssistantAssembledContext } from "../assistant.types";

type RecommendationBuckets = {
  review: AssistantRecommendation[];
  purchase: AssistantRecommendation[];
  studyPlan: AssistantRecommendation[];
};

const normalize = (value: string) => value.trim().toLowerCase();

const parseCourseLevelRank = (value: string): number => {
  const source = normalize(value);
  if (source.includes("баз") || source.includes("begin")) return 1;
  if (source.includes("сред") || source.includes("inter")) return 2;
  if (source.includes("про") || source.includes("adv")) return 3;
  const rawNumber = Number(source.replace(/[^\d]/g, ""));
  if (Number.isFinite(rawNumber) && rawNumber > 0) {
    return Math.max(1, Math.min(3, Math.round(rawNumber)));
  }
  return 2;
};

const formatTopicLabel = (topicId: string) => {
  if (!topicId.trim()) return "неуточненная тема";
  return topicId.replace(/[_-]+/g, " ");
};

const pickLessonForCourse = (
  db: MockDb,
  userId: string,
  courseId: string
): Lesson | null => {
  const progressMap = new Set(
    db.progress
      .filter((item) => item.userId === userId && item.courseId === courseId && item.completed)
      .map((item) => item.lessonId)
  );
  const lessons = db.lessons
    .filter((lesson) => lesson.courseId === courseId)
    .sort((a, b) => a.order - b.order);
  const pending = lessons.find((lesson) => !progressMap.has(lesson.id));
  return pending ?? lessons[0] ?? null;
};

const buildReviewRecommendations = (
  db: MockDb,
  context: AssistantAssembledContext
): AssistantRecommendation[] => {
  const recommendations: AssistantRecommendation[] = [];
  const usedCourseIds = new Set<string>();

  context.recentFailedAttempts.forEach((attempt, index) => {
    if (usedCourseIds.has(attempt.courseId)) return;
    const lesson = pickLessonForCourse(db, context.userId, attempt.courseId);
    const topicLabel =
      attempt.topicIds.length > 0 ? formatTopicLabel(attempt.topicIds[0]) : "базовая тема";
    recommendations.push({
      id: `review-attempt-${index + 1}`,
      type: "review",
      title: `Повторить тему: ${topicLabel}`,
      reason: `Последние попытки в тесте ниже 70% (попыток: ${attempt.attempts}).`,
      priority: 1,
      entity: lesson
        ? {
            courseId: attempt.courseId,
            lessonId: lesson.id,
            testId: attempt.testItemId,
          }
        : { courseId: attempt.courseId, testId: attempt.testItemId },
      cta: {
        type: lesson ? "open_lesson" : "open_course",
        label: lesson ? "Открыть урок" : "Открыть курс",
      },
    });
    usedCourseIds.add(attempt.courseId);
  });

  context.weakTopicsDetailed.slice(0, 2).forEach((topic, index) => {
    if (recommendations.length >= 3) return;
    const courseId = context.purchasedCourseIds.find((id) => !usedCourseIds.has(id));
    if (!courseId) return;
    const lesson = pickLessonForCourse(db, context.userId, courseId);
    recommendations.push({
      id: `review-topic-${index + 1}`,
      type: "review",
      title: `Укрепить: ${formatTopicLabel(topic.topicId)}`,
      reason: `Средний результат по теме: ${topic.avgPercent}%.`,
      priority: topic.avgPercent < 50 ? 1 : 2,
      entity: lesson
        ? { courseId, lessonId: lesson.id }
        : { courseId },
      cta: {
        type: lesson ? "continue_lesson" : "open_course",
        label: lesson ? "Продолжить урок" : "Открыть курс",
      },
    });
    usedCourseIds.add(courseId);
  });

  return recommendations.slice(0, 4);
};

const buildPurchaseRecommendations = (
  db: MockDb,
  context: AssistantAssembledContext
): AssistantRecommendation[] => {
  const purchasedSet = new Set(context.purchasedCourseIds);
  const weakTopicText = context.weakTopics.map((topic) => normalize(topic));
  const targetRank = parseCourseLevelRank(context.studentLevelHint ?? "2");

  const candidates = db.courses
    .filter((course) => course.status === "published" && !purchasedSet.has(course.id))
    .map((course) => {
      const titleText = normalize(`${course.title} ${course.description}`);
      const weakMatchScore = weakTopicText.reduce((acc, topic) => {
        return acc + (topic && titleText.includes(topic) ? 1 : 0);
      }, 0);
      const levelDistance = Math.abs(parseCourseLevelRank(course.level) - targetRank);
      const score = weakMatchScore * 10 - levelDistance * 2;
      return { course, score, weakMatchScore, levelDistance };
    })
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.course.title.localeCompare(b.course.title, "ru");
    })
    .slice(0, 3);

  return candidates.map((candidate, index) => ({
    id: `purchase-${index + 1}`,
    type: "purchase",
    title: `Рекомендуемый курс: ${candidate.course.title}`,
    reason:
      candidate.weakMatchScore > 0
        ? "Закрывает текущие слабые темы и подходит по уровню."
        : "Подходит по уровню сложности и дополняет текущий трек.",
    priority: index === 0 ? 1 : 2,
    entity: { courseId: candidate.course.id },
    cta: {
      type: "open_catalog",
      label: "Перейти в каталог",
    },
  }));
};

const buildStudyPlanRecommendations = (
  db: MockDb,
  context: AssistantAssembledContext
): AssistantRecommendation[] => {
  const daysInactive = Math.floor(
    (Date.now() - Date.parse(context.lastSeenAt)) / (24 * 60 * 60 * 1000)
  );
  const recommendations: AssistantRecommendation[] = [];
  const purchasedCourses = context.purchasedCourseIds
    .map((courseId) => db.courses.find((course) => course.id === courseId))
    .filter((course): course is Course => Boolean(course));

  const topCourse = purchasedCourses[0];
  if (topCourse) {
    const lesson = pickLessonForCourse(db, context.userId, topCourse.id);
    recommendations.push({
      id: "study-core",
      type: "study_plan",
      title: "Шаг 1: закрепить основу",
      reason: `Продолжить курс «${topCourse.title}» и закрыть ближайший пробел.`,
      priority: 1,
      entity: lesson ? { courseId: topCourse.id, lessonId: lesson.id } : { courseId: topCourse.id },
      cta: {
        type: lesson ? "continue_lesson" : "open_course",
        label: lesson ? "Продолжить" : "Открыть курс",
      },
    });
  }

  if (context.weakTopicsDetailed[0]) {
    const weak = context.weakTopicsDetailed[0];
    recommendations.push({
      id: "study-focus-topic",
      type: "study_plan",
      title: "Шаг 2: прицельная практика",
      reason: `Сконцентрируйтесь на теме «${formatTopicLabel(weak.topicId)}».`,
      priority: 1,
      cta: {
        type: "open_course",
        label: "Открыть материалы",
      },
    });
  }

  if (daysInactive >= 3) {
    recommendations.push({
      id: "study-restart",
      type: "study_plan",
      title: "Шаг 3: мягкий рестарт",
      reason: `Пауза в обучении ${daysInactive} дн. Рекомендуем 20-30 минут повторения сегодня.`,
      priority: 2,
      cta: {
        type: "open_course",
        label: "Запустить сессию",
      },
    });
  }

  return recommendations.slice(0, 4);
};

export const buildStudentRecommendationBuckets = (
  db: MockDb,
  context: AssistantAssembledContext
): RecommendationBuckets => {
  return {
    review: buildReviewRecommendations(db, context),
    purchase: buildPurchaseRecommendations(db, context),
    studyPlan: buildStudyPlanRecommendations(db, context),
  };
};

export const buildStudentRecommendations = (
  db: MockDb,
  context: AssistantAssembledContext
): AssistantRecommendation[] => {
  const buckets = buildStudentRecommendationBuckets(db, context);
  return [...buckets.review, ...buckets.studyPlan, ...buckets.purchase].slice(0, 8);
};
