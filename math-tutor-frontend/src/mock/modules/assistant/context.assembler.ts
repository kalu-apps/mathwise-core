import type { MockDb } from "../../db";
import type { AssistantEngineInput, AssistantAssembledContext } from "./assistant.types";

const MINUTE_WEIGHTS: Record<string, number> = {
  course_purchased: 3,
  lesson_opened: 8,
  lesson_completed: 16,
  test_submitted: 12,
  whiteboard_session_started: 18,
  assistant_action_clicked: 4,
};

const toMs = (value: string | null | undefined): number => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const average = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((acc, item) => acc + item, 0) / values.length;
};

const sortByAvgAscending = (
  values: Array<{ topicId: string; avgPercent: number; attempts: number }>
) => {
  return values.sort((a, b) => {
    if (a.avgPercent !== b.avgPercent) return a.avgPercent - b.avgPercent;
    if (a.attempts !== b.attempts) return b.attempts - a.attempts;
    return a.topicId.localeCompare(b.topicId);
  });
};

export const assembleAssistantContext = (
  db: MockDb,
  input: AssistantEngineInput
): AssistantAssembledContext => {
  const nowIso = new Date().toISOString();
  const userPurchases = db.purchases.filter((purchase) => purchase.userId === input.userId);
  const purchasedCourseIds = Array.from(
    new Set(userPurchases.map((purchase) => purchase.courseId))
  );
  const purchasedSet = new Set(purchasedCourseIds);

  const relatedAttempts = db.assessments.attempts.filter((attempt) =>
    input.role === "teacher"
      ? db.courses.some(
          (course) =>
            course.id === attempt.courseId &&
            course.teacherId === input.userId
        )
      : attempt.studentId === input.userId
  );

  const topicStats = new Map<string, { values: number[]; attempts: number }>();
  relatedAttempts.forEach((attempt) => {
    (attempt.topicBreakdown ?? []).forEach((topic) => {
      if (topic.total <= 0) return;
      const entry = topicStats.get(topic.topicId) ?? { values: [], attempts: 0 };
      entry.values.push((topic.correct / topic.total) * 100);
      entry.attempts += 1;
      topicStats.set(topic.topicId, entry);
    });
  });

  const weakTopicsDetailed = sortByAvgAscending(
    Array.from(topicStats.entries()).map(([topicId, data]) => ({
      topicId,
      avgPercent: Math.round(average(data.values)),
      attempts: data.attempts,
    }))
  ).filter((topic) => topic.avgPercent < 70);

  const groupedFailedAttempts = new Map<
    string,
    {
      courseId: string;
      testItemId: string;
      templateId: string;
      attempts: number;
      latestPercent: number;
      topicIds: Set<string>;
    }
  >();
  relatedAttempts.forEach((attempt) => {
    if (attempt.score.percent >= 70) return;
    const key = `${attempt.courseId}:${attempt.testItemId}:${attempt.templateId}`;
    const entry = groupedFailedAttempts.get(key) ?? {
      courseId: attempt.courseId,
      testItemId: attempt.testItemId,
      templateId: attempt.templateId,
      attempts: 0,
      latestPercent: attempt.score.percent,
      topicIds: new Set<string>(),
    };
    entry.attempts += 1;
    entry.latestPercent = attempt.score.percent;
    (attempt.topicBreakdown ?? []).forEach((topic) => {
      if (topic.total > 0) entry.topicIds.add(topic.topicId);
    });
    groupedFailedAttempts.set(key, entry);
  });

  const recentFailedAttempts = Array.from(groupedFailedAttempts.values())
    .filter((item) => item.attempts >= 2)
    .map((item) => ({
      courseId: item.courseId,
      testItemId: item.testItemId,
      templateId: item.templateId,
      attempts: item.attempts,
      latestPercent: item.latestPercent,
      topicIds: Array.from(item.topicIds),
    }))
    .sort((a, b) => b.attempts - a.attempts);

  const teacherOwnedCourseIds = db.courses
    .filter((course) => course.teacherId === input.userId)
    .map((course) => course.id);

  const eventActivityMinutes = db.assistantEvents
    .filter((event) => event.userId === input.userId)
    .reduce((acc, event) => acc + (MINUTE_WEIGHTS[event.type] ?? 5), 0);

  const lessonCompletedCount = db.progress.filter(
    (item) => item.userId === input.userId && item.completed
  ).length;
  const derivedLearningMinutes = lessonCompletedCount * 10;
  const recentActivityMinutes = eventActivityMinutes + derivedLearningMinutes;

  const courseLevelHints = db.courses
    .filter((course) => purchasedSet.has(course.id))
    .map((course) => course.level.trim())
    .filter(Boolean);
  const studentLevelHint = courseLevelHints[0];

  const candidateLastSeen = Math.max(
    ...[
      ...db.assistantEvents
        .filter((event) => event.userId === input.userId)
        .map((event) => toMs(event.createdAt)),
      ...userPurchases.map((purchase) => toMs(purchase.purchasedAt)),
      ...db.progress
        .filter((item) => item.userId === input.userId)
        .map(() => Date.now()),
    ]
  );
  const lastSeenAt =
    Number.isFinite(candidateLastSeen) && candidateLastSeen > 0
      ? new Date(candidateLastSeen).toISOString()
      : nowIso;

  return {
    userId: input.userId,
    role: input.role,
    mode: input.mode,
    actionIntent: input.actionIntent,
    requestMessage: input.message,
    activeCourseId: input.activeCourseId,
    activeLessonId: input.activeLessonId,
    activeTestId: input.activeTestId,
    purchasedCourseIds,
    weakTopics: weakTopicsDetailed.map((topic) => topic.topicId),
    weakTopicsDetailed,
    recentFailedAttempts,
    recentActivityMinutes,
    lastSeenAt,
    teacherOwnedCourseIds,
    studentLevelHint,
  };
};
