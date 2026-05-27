import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
} from "@mui/material";
import AutoGraphRoundedIcon from "@mui/icons-material/AutoGraphRounded";
import AutoStoriesRoundedIcon from "@mui/icons-material/AutoStoriesRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import ForumRoundedIcon from "@mui/icons-material/ForumRounded";
import PlayCircleRoundedIcon from "@mui/icons-material/PlayCircleRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import TipsAndUpdatesRoundedIcon from "@mui/icons-material/TipsAndUpdatesRounded";
import WorkspacePremiumRoundedIcon from "@mui/icons-material/WorkspacePremiumRounded";
import { getCourseReleaseContent } from "@/entities/course/model/storage";
import { getLessonsByCourse } from "@/entities/lesson/model/storage";
import type { Lesson } from "@/entities/lesson/model/types";
import { getViewedLessonIds } from "@/entities/progress/model/storage";
import type {
  AssessmentAttempt,
  CourseContentItem,
  CourseMaterialBlock,
} from "@/features/assessments/model/types";
import {
  getBestAssessmentAttemptsMap,
} from "@/features/assessments/model/storage";
import { buildPublishedCourseContentProjection } from "@/features/assessments/model/releaseContent";
import type { StudentStudyCabinetPanelProps } from "@/features/study-cabinet/student/model/types";
import { readStorage, writeStorage } from "@/shared/lib/localDb";
import { lessonDurationToSeconds } from "@/shared/lib/duration";

const SELECTED_COURSE_STORAGE_PREFIX = "student-cabinet:selected-course:";
const RECOMMENDATION_HISTORY_STORAGE_PREFIX = "student-cabinet:last-rec-types:";
let jsPdfModulePromise: Promise<typeof import("jspdf")> | null = null;

const loadJsPdfModule = () => {
  if (!jsPdfModulePromise) {
    jsPdfModulePromise = import("jspdf");
  }
  return jsPdfModulePromise;
};

type ActiveCourseData = {
  courseId: string;
  lessons: Lesson[];
  queue: CourseContentItem[];
  blocks: CourseMaterialBlock[];
  viewedLessonIds: string[];
  bestAttempts: Map<string, AssessmentAttempt>;
};

type NextStepKind = "lesson" | "test" | "review" | "booking";

type NextStepCard = {
  id: string;
  kind: NextStepKind;
  title: string;
  subtitle: string;
  estimateSeconds: number | null;
  courseId?: string;
  blockId?: string;
  onContinue: () => void;
};

type FocusItem = {
  id: string;
  kind: "lesson" | "test" | "course";
  title: string;
  accent: "lesson" | "test" | "course";
  summary?: string;
  meta: string[];
  durationSeconds?: number | null;
  progressPercent?: number | null;
  actionLabel?: string;
  onOpen?: () => void;
};

type QualityInsight = {
  id: string;
  title: string;
  label: string;
  estimateSeconds: number | null;
  onReview?: () => void;
};

type QuickChoiceItem = {
  id: string;
  title: string;
  subtitle: string;
  actionLabel: string;
  onSelect: () => void;
};

type BookingCta = {
  title: string;
  subtitle: string;
  actionLabel: string;
  onAction?: () => void;
};

const clampPercent = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
};

const formatDuration = (seconds: number) => {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ч`);
  if (minutes > 0) parts.push(`${minutes} мин`);
  if (secs > 0) parts.push(`${secs} сек`);
  if (!parts.length) return "0 сек";
  return parts.join(" ");
};

const formatCompactDuration = (seconds: number) => {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}ч`);
  if (minutes > 0) parts.push(`${minutes}м`);
  if (secs > 0 && hours === 0) parts.push(`${secs}с`);
  if (!parts.length) return "0с";
  return parts.join(" ");
};

const formatEstimate = (seconds?: number | null) => {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return null;
  return formatDuration(seconds);
};

const getLessonEstimateSeconds = (duration?: number | string | null) => {
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) return null;
  const seconds = lessonDurationToSeconds(duration);
  return seconds > 0 ? seconds : null;
};

const getTestEstimateSeconds = (durationMinutes?: number | null) => {
  if (!durationMinutes || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
  return Math.round(durationMinutes * 60);
};

const formatShortDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Скоро";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatFullWeekday = (dateKey: string, fallback: string) => {
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toLocaleDateString("ru-RU", { weekday: "long" });
};

const getProgressTone = (percent: number) => {
  const safe = Math.max(0, Math.min(100, percent));
  const hue = 6 + safe * 1.18;
  return `hsl(${hue}, 86%, 52%)`;
};

const toRgb = (value: [number, number, number]) =>
  `rgb(${value[0]}, ${value[1]}, ${value[2]})`;

const lerp = (from: number, to: number, ratio: number) => from + (to - from) * ratio;

const mixRgb = (
  start: [number, number, number],
  end: [number, number, number],
  ratio: number
): [number, number, number] => {
  const safeRatio = Math.max(0, Math.min(1, ratio));
  return [
    Math.round(lerp(start[0], end[0], safeRatio)),
    Math.round(lerp(start[1], end[1], safeRatio)),
    Math.round(lerp(start[2], end[2], safeRatio)),
  ];
};

const getRhythmTonePalette = (percent: number) => {
  const safe = Math.max(0, Math.min(100, percent));
  const low: [number, number, number] = [87, 110, 227];
  const medium: [number, number, number] = [26, 151, 196];
  const high: [number, number, number] = [35, 176, 136];
  const white: [number, number, number] = [241, 248, 255];
  const deep: [number, number, number] = [16, 30, 62];
  const base =
    safe <= 50 ? mixRgb(low, medium, safe / 50) : mixRgb(medium, high, (safe - 50) / 50);
  return {
    top: toRgb(mixRgb(base, white, 0.34)),
    mid: toRgb(mixRgb(base, white, 0.12)),
    bottom: toRgb(mixRgb(base, deep, 0.32)),
  };
};

const getBookingStart = (bookingDate: string, time: string) => {
  const parsed = new Date(`${bookingDate}T${time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getBookingEnd = (bookingDate: string, time: string) => {
  const parsed = new Date(`${bookingDate}T${time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const readRecommendationHistory = (userId: string) =>
  readStorage<NextStepKind[]>(
    `${RECOMMENDATION_HISTORY_STORAGE_PREFIX}${userId}`,
    []
  ).filter((entry): entry is NextStepKind =>
    entry === "lesson" ||
    entry === "test" ||
    entry === "review" ||
    entry === "booking"
  );

const rememberRecommendationType = (userId: string, type: NextStepKind) => {
  const current = readRecommendationHistory(userId);
  const next = [type, ...current].slice(0, 3);
  writeStorage(`${RECOMMENDATION_HISTORY_STORAGE_PREFIX}${userId}`, next);
};

const scoreCandidate = (
  candidate: Omit<NextStepCard, "onContinue">,
  history: NextStepKind[]
) => {
  let score = 0;
  if (candidate.estimateSeconds && candidate.estimateSeconds <= 15 * 60) score += 12;
  if (candidate.kind === "lesson") score += 10;
  if (candidate.kind === "test") score += 8;
  if (candidate.kind === "review") score += 6;
  if (candidate.kind === "booking") score += 4;
  if (history.length >= 2 && history[0] === candidate.kind && history[1] === candidate.kind) {
    score -= 14;
  }
  if (candidate.kind === "review") score += 4;
  return score;
};

const countStreak = (days: StudentStudyCabinetPanelProps["activityDays"]) => {
  let streak = 0;
  for (let index = days.length - 1; index >= 0; index -= 1) {
    if (days[index]?.minutes > 0) {
      streak += 1;
      continue;
    }
    break;
  }
  return streak;
};

export function StudentStudyCabinetPanel({
  userId,
  courses,
  bookings,
  activityDays,
  onWorkbookClick,
  onChatClick,
  onBrowseCourses,
  onOpenBooking,
  onOpenCourse,
  onOpenLesson,
  onOpenTest,
  chatDisabled,
  chatLocked,
}: StudentStudyCabinetPanelProps) {
  const [chooseAnotherOpen, setChooseAnotherOpen] = useState(false);
  const [activeRhythmDayKey, setActiveRhythmDayKey] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string>(() =>
    readStorage<string>(`${SELECTED_COURSE_STORAGE_PREFIX}${userId}`, "")
  );
  const [activeCourseData, setActiveCourseData] = useState<ActiveCourseData | null>(null);
  const [courseDetailsLoading, setCourseDetailsLoading] = useState(false);
  const [courseDetailsError, setCourseDetailsError] = useState<string | null>(null);
  const [reportExporting, setReportExporting] = useState(false);
  const [reportExportError, setReportExportError] = useState<string | null>(null);

  useEffect(() => {
    if (!courses.length) {
      setSelectedCourseId("");
      return;
    }
    const persisted = readStorage<string>(
      `${SELECTED_COURSE_STORAGE_PREFIX}${userId}`,
      ""
    );
    const hasPersisted = courses.some((item) => item.course.id === persisted);
    const fallback =
      courses.find((item) => item.progress < 100)?.course.id ?? courses[0]?.course.id ?? "";
    const nextCourseId = hasPersisted ? persisted : fallback;
    if (selectedCourseId !== nextCourseId) {
      setSelectedCourseId(nextCourseId);
    }
  }, [courses, selectedCourseId, userId]);

  useEffect(() => {
    writeStorage(`${SELECTED_COURSE_STORAGE_PREFIX}${userId}`, selectedCourseId);
  }, [selectedCourseId, userId]);

  useEffect(() => {
    if (!selectedCourseId || !userId) {
      setActiveCourseData(null);
      setCourseDetailsError(null);
      setCourseDetailsLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setCourseDetailsLoading(true);
      setCourseDetailsError(null);
      try {
        const [lessons, releaseContent, viewedLessonIds, bestAttempts] = await Promise.all([
          getLessonsByCourse(selectedCourseId, { forceFresh: true }),
          getCourseReleaseContent(selectedCourseId, { forceFresh: true }),
          getViewedLessonIds(userId, selectedCourseId, { forceFresh: true }),
          getBestAssessmentAttemptsMap({ studentId: userId, courseId: selectedCourseId }),
        ]);
        const projection = buildPublishedCourseContentProjection({
          courseId: selectedCourseId,
          lessons,
          snapshot: releaseContent,
        });
        const queue = projection.queue;
        const blocks = projection.blocks;
        if (cancelled) return;
        setActiveCourseData({
          courseId: selectedCourseId,
          lessons,
          queue,
          blocks,
          viewedLessonIds,
          bestAttempts,
        });
      } catch {
        if (cancelled) return;
        setActiveCourseData(null);
        setCourseDetailsError("Не удалось собрать план обучения. Попробуйте обновить кабинет.");
      } finally {
        if (!cancelled) {
          setCourseDetailsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [selectedCourseId, userId]);

  const activeCourseSummary = useMemo(
    () => courses.find((item) => item.course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId]
  );

  const courseProgress = useMemo(() => {
    const completedVideos = courses.reduce((sum, item) => sum + item.viewedCount, 0);
    const totalVideos = courses.reduce((sum, item) => sum + item.totalLessons, 0);
    const completedTests = courses.reduce((sum, item) => sum + item.completedTests, 0);
    const totalTests = courses.reduce((sum, item) => sum + item.totalTests, 0);
    const totalUnits = totalVideos + totalTests;
    const doneUnits = completedVideos + completedTests;
    return {
      completedVideos,
      totalVideos,
      completedTests,
      totalTests,
      percent: totalUnits === 0 ? 0 : clampPercent((doneUnits / totalUnits) * 100),
    };
  }, [courses]);

  const momentum = useMemo(() => {
    const weeklyMinutes = activityDays.reduce((sum, day) => sum + day.minutes, 0);
    const learningDays = activityDays.filter((day) => day.minutes > 0).length;
    const sessions = activityDays.reduce((sum, day) => {
      if (day.minutes <= 0) return sum;
      return sum + Math.max(1, Math.round(day.minutes / 25));
    }, 0);
    return {
      weeklyMinutes,
      learningDays,
      sessions,
      streak: countStreak(activityDays),
    };
  }, [activityDays]);

  const rhythmSummary = useMemo(() => {
    const bestDay =
      activityDays.reduce<(typeof activityDays)[number] | null>((top, day) => {
        if (day.minutes <= 0) return top;
        if (!top || day.minutes > top.minutes) return day;
        return top;
      }, null) ?? null;

    return {
      totalMinutes: activityDays.reduce((sum, day) => sum + day.minutes, 0),
      activeDays: activityDays.filter((day) => day.minutes > 0).length,
      bestDay,
    };
  }, [activityDays]);

  const cabinetTimeSeconds = useMemo(
    () => rhythmSummary.totalMinutes * 60,
    [rhythmSummary.totalMinutes]
  );

  const viewedVideoSeconds = useMemo(
    () => courses.reduce((sum, item) => sum + item.viewedLessonSeconds, 0),
    [courses]
  );

  const averageRhythmDaySeconds = useMemo(
    () => (rhythmSummary.activeDays > 0 ? Math.round(cabinetTimeSeconds / rhythmSummary.activeDays) : 0),
    [cabinetTimeSeconds, rhythmSummary.activeDays]
  );

  const bestRhythmDayLabel = useMemo(
    () =>
      rhythmSummary.bestDay
        ? formatFullWeekday(rhythmSummary.bestDay.key, rhythmSummary.bestDay.label)
        : null,
    [rhythmSummary.bestDay]
  );

  const maxRhythmMinutes = useMemo(
    () => Math.max(1, ...activityDays.map((day) => day.minutes)),
    [activityDays]
  );

  const sortedBookings = useMemo(() => {
    const now = Date.now();
    const upcoming = bookings
      .filter((booking) => {
        const end = getBookingEnd(booking.date, booking.endTime);
        return end ? end.getTime() >= now : false;
      })
      .sort((a, b) => {
        const aStart = getBookingStart(a.date, a.startTime)?.getTime() ?? 0;
        const bStart = getBookingStart(b.date, b.startTime)?.getTime() ?? 0;
        return aStart - bStart;
      });
    const completed = bookings
      .filter((booking) => {
        const end = getBookingEnd(booking.date, booking.endTime);
        return end ? end.getTime() < now : false;
      })
      .sort((a, b) => {
        const aEnd = getBookingEnd(a.date, a.endTime)?.getTime() ?? 0;
        const bEnd = getBookingEnd(b.date, b.endTime)?.getTime() ?? 0;
        return bEnd - aEnd;
      });
    return { upcoming, completed };
  }, [bookings]);

  const candidateSteps = useMemo(() => {
    if (!activeCourseData || !activeCourseSummary) return [];
    const lessonsById = new Map(activeCourseData.lessons.map((lesson) => [lesson.id, lesson] as const));
    const viewedSet = new Set(activeCourseData.viewedLessonIds);
    const baseCandidates: Array<Omit<NextStepCard, "onContinue">> = [];

    activeCourseData.queue
      .slice()
      .sort((a, b) => a.order - b.order)
      .forEach((item) => {
        if (item.type === "lesson") {
          const lesson = lessonsById.get(item.lessonId);
          if (!lesson || viewedSet.has(lesson.id)) return;
          const durationSeconds = getLessonEstimateSeconds(lesson.duration);
          baseCandidates.push({
            id: `lesson-${item.lessonId}`,
            kind: "lesson",
            title: lesson.title,
            subtitle: "Следующий видеоурок",
            estimateSeconds: durationSeconds,
            courseId: activeCourseSummary.course.id,
            blockId: item.blockId,
          });
          return;
        }
        const bestAttempt = activeCourseData.bestAttempts.get(item.id) ?? null;
        if (!bestAttempt) {
          const durationSeconds = getTestEstimateSeconds(item.templateSnapshot?.durationMinutes);
          baseCandidates.push({
            id: `test-${item.id}`,
            kind: "test",
            title: item.titleSnapshot,
            subtitle: "Тест без попыток",
            estimateSeconds: durationSeconds,
            courseId: activeCourseSummary.course.id,
            blockId: item.blockId,
          });
          return;
        }
        if (bestAttempt.score.percent < 70) {
          baseCandidates.push({
            id: `review-${item.id}`,
            kind: "review",
            title: item.titleSnapshot,
            subtitle: `Нужно повторить тему • лучший результат ${bestAttempt.score.percent}%`,
            estimateSeconds: getTestEstimateSeconds(item.templateSnapshot?.durationMinutes),
            courseId: activeCourseSummary.course.id,
            blockId: item.blockId,
          });
        }
      });

    return baseCandidates;
  }, [activeCourseData, activeCourseSummary]);

  const nextStep = useMemo<NextStepCard | null>(() => {
    const history = readRecommendationHistory(userId);
    const sorted = candidateSteps
      .slice()
      .sort((a, b) => scoreCandidate(b, history) - scoreCandidate(a, history));
    const top = sorted[0] ?? null;

    if (top && activeCourseSummary) {
      const onContinue = () => {
        rememberRecommendationType(userId, top.kind);
        if (top.kind === "lesson") {
          const lessonId = top.id.replace("lesson-", "");
          onOpenLesson?.(lessonId, {
            courseId: activeCourseSummary.course.id,
            source: "next-step",
          });
          return;
        }
        if (top.kind === "test" || top.kind === "review") {
          const testItemId = top.id.replace(/^test-|^review-/, "");
          onOpenTest?.(activeCourseSummary.course.id, testItemId, {
            source: "next-step",
          });
          return;
        }
      };
      return {
        ...top,
        onContinue,
      };
    }

    if (sortedBookings.upcoming.length > 0) {
      const booking = sortedBookings.upcoming[0];
      const start = getBookingStart(booking.date, booking.startTime);
      return {
        id: `booking-${booking.id}`,
        kind: "booking",
        title:
          booking.lessonKind === "trial"
            ? "Подготовьтесь к пробному занятию"
            : "Ближайшее индивидуальное занятие",
        subtitle: `С преподавателем ${booking.teacherName} • ${start ? formatShortDateTime(start.toISOString()) : "скоро"}`,
        estimateSeconds: 45 * 60,
        onContinue: () => {
          rememberRecommendationType(userId, "booking");
          onOpenBooking?.();
        },
      };
    }

    return null;
  }, [activeCourseSummary, candidateSteps, onOpenBooking, onOpenLesson, onOpenTest, sortedBookings.upcoming, userId]);

  const focusItems = useMemo<FocusItem[]>(() => {
    const items: FocusItem[] = [];

    if (activeCourseData && activeCourseSummary) {
      const lessonsById = new Map(
        activeCourseData.lessons.map((lesson) => [lesson.id, lesson] as const)
      );
      const viewedSet = new Set(activeCourseData.viewedLessonIds);

      activeCourseData.queue
        .slice()
        .sort((a, b) => a.order - b.order)
        .forEach((item) => {
          if (items.length >= 4) return;
          if (item.type === "lesson") {
            const lesson = lessonsById.get(item.lessonId);
            if (!lesson || viewedSet.has(lesson.id)) return;
            items.push({
              id: `focus-lesson-${lesson.id}`,
              kind: "lesson",
              accent: "lesson",
              title: lesson.title,
              summary: "Осталось досмотреть урок",
              meta:
                lesson.materials?.length
                  ? [`Материалов: ${lesson.materials.length}`]
                  : [],
              durationSeconds: getLessonEstimateSeconds(lesson.duration),
              actionLabel: "Смотреть",
              onOpen: () =>
                onOpenLesson?.(lesson.id, {
                  courseId: activeCourseSummary.course.id,
                  source: "block-map",
                }),
            });
            return;
          }
          const bestAttempt = activeCourseData.bestAttempts.get(item.id);
          if (bestAttempt && bestAttempt.score.percent > 0) return;
          const testKindLabel =
            item.templateSnapshot?.assessmentKind === "exam"
              ? "Экзамен"
              : item.templateSnapshot?.assessmentKind === "credit"
                ? "Зачёт"
                : "Тест";
          items.push({
            id: `focus-test-${item.id}`,
            kind: "test",
            accent: "test",
            title: item.titleSnapshot,
            summary: `Осталось пройти ${testKindLabel.toLowerCase()}`,
            meta: [testKindLabel],
            durationSeconds: getTestEstimateSeconds(item.templateSnapshot?.durationMinutes),
            actionLabel: "Пройти",
            onOpen: () =>
              onOpenTest?.(activeCourseData.courseId, item.id, {
                source: "block-map",
              }),
          });
        });
    }

    courses
      .filter(
        (item) =>
          item.progress < 100 &&
          (item.course.id !== selectedCourseId || items.length === 0)
      )
      .forEach((item) => {
        if (items.length >= 4) return;
        const summaryParts: string[] = [];
        if (item.remainingLessons > 0) {
          summaryParts.push(`Осталось уроков: ${item.remainingLessons}`);
        }
        if (item.remainingTests > 0) {
          summaryParts.push(`Осталось тестов: ${item.remainingTests}`);
        }
        items.push({
          id: `focus-course-${item.course.id}`,
          kind: "course",
          accent: "course",
          title: item.course.title,
          summary: summaryParts.length ? undefined : "Курс ещё не завершён",
          meta: summaryParts,
          durationSeconds: item.remainingSeconds > 0 ? item.remainingSeconds : null,
          progressPercent: item.progress,
          actionLabel: "Открыть курс",
          onOpen: () =>
            onOpenCourse?.(item.course.id, {
              source: "block-map",
            }),
        });
      });

    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [activeCourseData, activeCourseSummary, courses, onOpenCourse, onOpenLesson, onOpenTest, selectedCourseId]);

  const qualitySummary = useMemo(() => {
    const bestScores = courses
      .map((item) => item.testsKnowledgePercent)
      .filter((value) => Number.isFinite(value) && value > 0);
    const bestRecent = bestScores.length ? Math.max(...bestScores) : 0;
    const itemsToReview: QualityInsight[] = [];

    if (activeCourseData) {
      activeCourseData.queue.forEach((item) => {
        if (item.type !== "test") return;
        const attempt = activeCourseData.bestAttempts.get(item.id);
        if (!attempt || attempt.score.percent >= 70) return;
        if (itemsToReview.length >= 2) return;
        itemsToReview.push({
          id: item.id,
          title: item.titleSnapshot,
          label: `Лучший результат ${attempt.score.percent}%`,
          estimateSeconds:
            getTestEstimateSeconds(item.templateSnapshot?.durationMinutes),
          onReview: () => onOpenTest?.(activeCourseData.courseId, item.id, { source: "reminder" }),
        });
      });
    }

    if (!itemsToReview.length) {
      const fallback = courses
        .filter((item) => item.totalTests > 0 && item.completedTests < item.totalTests)
        .slice(0, 2);
      fallback.forEach((item) => {
        itemsToReview.push({
          id: item.course.id,
          title: item.course.title,
          label: `Есть тесты без результата`,
          estimateSeconds: item.remainingTestSeconds > 0 ? item.remainingTestSeconds : null,
          onReview: () => onOpenCourse?.(item.course.id, { source: "reminder" }),
        });
      });
    }

    return {
      bestRecent: clampPercent(bestRecent),
      itemsToReview,
    };
  }, [activeCourseData, courses, onOpenCourse, onOpenTest]);

  const bookingCta = useMemo<BookingCta | null>(() => {
    if (sortedBookings.upcoming.length > 0) {
      const booking = sortedBookings.upcoming[0];
      const start = getBookingStart(booking.date, booking.startTime);
      return {
        title: booking.lessonKind === "trial" ? "Пробное занятие запланировано" : "Следующее занятие назначено",
        subtitle: `${booking.teacherName} • ${start ? formatShortDateTime(start.toISOString()) : "скоро"}`,
        actionLabel: "Открыть занятия",
        onAction: onOpenBooking,
      };
    }
    if (!bookings.length) {
      return {
        title: "Доступно пробное занятие",
        subtitle: "Первое индивидуальное занятие проходит бесплатно. Можно быстро познакомиться с форматом и получить план действий.",
        actionLabel: "Записаться на пробное",
        onAction: onOpenBooking,
      };
    }
    return {
      title: "Готовы к следующему шагу",
      subtitle: "Пробное уже использовано — можно записаться на платное индивидуальное занятие с преподавателем.",
      actionLabel: "Записаться на занятие",
      onAction: onOpenBooking,
    };
  }, [bookings.length, onOpenBooking, sortedBookings.upcoming]);

  const nearestBooking = sortedBookings.upcoming[0] ?? null;
  const reviewLead = qualitySummary.itemsToReview[0] ?? null;

  const quickChoices = useMemo<QuickChoiceItem[]>(() => {
    const choices: QuickChoiceItem[] = [];
    if (activeCourseSummary) {
      choices.push({
        id: `course-${activeCourseSummary.course.id}`,
        title: activeCourseSummary.course.title,
        subtitle: `Открыть курс и выбрать любой урок, материал или тест`,
        actionLabel: "Открыть курс",
        onSelect: () => onOpenCourse?.(activeCourseSummary.course.id, { source: "cabinet" }),
      });
    }

    candidateSteps.slice(0, 5).forEach((candidate) => {
      if (candidate.kind === "lesson") {
        const lessonId = candidate.id.replace("lesson-", "");
        choices.push({
          id: candidate.id,
          title: candidate.title,
          subtitle: candidate.subtitle,
          actionLabel: "Открыть урок",
          onSelect: () => onOpenLesson?.(lessonId, { courseId: candidate.courseId, source: "cabinet" }),
        });
        return;
      }
      const testItemId = candidate.id.replace(/^test-|^review-/, "");
      choices.push({
        id: candidate.id,
        title: candidate.title,
        subtitle: candidate.subtitle,
        actionLabel: candidate.kind === "test" ? "Открыть тест" : "Повторить",
        onSelect: () => {
          if (candidate.courseId) {
            onOpenTest?.(candidate.courseId, testItemId, { source: "cabinet" });
          }
        },
      });
    });

    return choices;
  }, [activeCourseSummary, candidateSteps, onOpenCourse, onOpenLesson, onOpenTest]);

  const downloadReport = async () => {
    if (reportExporting) return;
    setReportExporting(true);
    setReportExportError(null);
    try {
      const { jsPDF } = await loadJsPdfModule();
      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      let y = 56;
      pdf.setFontSize(18);
      pdf.text("Отчёт по обучению", 48, y);
      y += 26;
      pdf.setFontSize(11);
      pdf.text(`Сформировано: ${new Date().toLocaleDateString("ru-RU")}`, 48, y);
      y += 30;

      const reportLines = [
        `Официальный прогресс: ${courseProgress.percent}%`,
        `Завершено видео: ${courseProgress.completedVideos}/${courseProgress.totalVideos}`,
        `Завершено тестов: ${courseProgress.completedTests}/${courseProgress.totalTests}`,
        `Учебных дней за неделю: ${momentum.learningDays}`,
        `Учебных сессий за неделю: ${momentum.sessions}`,
        `Лучший недавний результат: ${qualitySummary.bestRecent}%`,
      ];

      reportLines.forEach((line) => {
        pdf.text(line, 48, y);
        y += 18;
      });

      y += 10;
      pdf.setFontSize(13);
      pdf.text("Следующие шаги", 48, y);
      y += 20;
      pdf.setFontSize(11);
      const focusLines = [
        nextStep
          ? `Продолжить: ${nextStep.title}`
          : "Можно открыть любой урок или тест из активного курса.",
        qualitySummary.itemsToReview[0]
          ? `Повторить: ${qualitySummary.itemsToReview[0].title}`
          : "Сохраните текущий ритм и начните с одного короткого шага.",
        bookingCta
          ? bookingCta.title
          : "Если нужна поддержка, можно записаться на индивидуальное занятие.",
      ];
      focusLines.forEach((line) => {
        pdf.text(line, 48, y);
        y += 18;
      });

      pdf.save("otchet-obucheniya.pdf");
    } catch {
      setReportExportError("Не удалось сформировать PDF-отчёт. Повторите попытку.");
    } finally {
      setReportExporting(false);
    }
  };

  const completedCourseUnits = courseProgress.completedVideos + courseProgress.completedTests;
  const totalCourseUnits = courseProgress.totalVideos + courseProgress.totalTests;
  const selectedCourseTitle = activeCourseSummary?.course.title ?? "Маршрут обучения";
  const progressCardStyle = {
    "--student-course-progress": `${courseProgress.percent}%`,
  } as CSSProperties;
  const rhythmHeadline =
    rhythmSummary.activeDays > 0
      ? `${rhythmSummary.activeDays} из 7 учебных дней`
      : "Неделя ещё без активности";
  const routeChartBars = useMemo(() => {
    const progress = Math.max(0, Math.min(100, courseProgress.percent));
    const targets = [14, 23, 35, 49, 64, 80, 96];
    const colors = ["#4f63e6", "#3f75dc", "#2e87cd", "#1896bd", "#16a6a2", "#1daf8d", "#29b578"];

    return targets.map((target, index) => {
      const progressWeight = 0.18 + index * 0.1;
      const height = Math.max(12, Math.min(100, Math.round(target * 0.48 + progress * progressWeight)));

      return {
        "--student-route-bar-height": `${height}%`,
        "--student-route-bar-color": colors[index],
        "--student-route-bar-delay": `${index * 80}ms`,
      } as CSSProperties;
    });
  }, [courseProgress.percent]);

  if (!courses.length) {
    return (
      <section className="study-cabinet-panel study-cabinet-panel--student-redesign">
        <div className="study-cabinet-panel__cover">
          <div className="study-cabinet-panel__cover-content">
            <div className="study-cabinet-panel__hero">
              <div className="study-cabinet-panel__hero-bar">
                <span className="study-cabinet-panel__kicker">Маршрут обучения</span>
              </div>
              <h2>Здесь появится ваш маршрут обучения</h2>
              <p>После покупки курса здесь появятся следующие шаги и задачи.</p>
                <div className="study-cabinet-panel__hero-nav">
                  {onBrowseCourses ? (
                    <Button
                      className="study-cabinet-panel__hero-btn"
                      variant="contained"
                      onClick={onBrowseCourses}
                      startIcon={<AutoStoriesRoundedIcon fontSize="small" />}
                    >
                      Выбрать курс
                    </Button>
                  ) : null}
                  {onWorkbookClick ? (
                    <Button
                      className="study-cabinet-panel__hero-btn study-cabinet-panel__hero-btn--chat"
                      variant="outlined"
                      onClick={onWorkbookClick}
                      startIcon={<AutoStoriesRoundedIcon fontSize="small" />}
                    >
                      Рабочая тетрадь
                    </Button>
                  ) : null}
                  {onChatClick ? (
                    <Button
                      className="study-cabinet-panel__hero-btn"
                      variant="outlined"
                      onClick={onChatClick}
                      disabled={chatDisabled || chatLocked}
                      startIcon={<ForumRoundedIcon fontSize="small" />}
                    >
                      Чат
                    </Button>
                  ) : null}
                </div>
            </div>
          </div>
        </div>
        <div className="study-cabinet-panel__empty">Активных курсов пока нет. После покупки здесь появятся подсказки, задачи и персональный маршрут.</div>
      </section>
    );
  }

  return (
    <section className="study-cabinet-panel study-cabinet-panel--student-redesign">
      <div className="study-cabinet-panel__cover">
        <div className="study-cabinet-panel__cover-content">
          <div className="study-cabinet-panel__student-command">
            <div className="study-cabinet-panel__student-command-copy">
              <span className="study-cabinet-panel__kicker">Курс в работе</span>
              <h2>{selectedCourseTitle}</h2>
              <p>Личный маршрут: следующий шаг, прогресс, занятия и учебный ритм.</p>
            </div>
            <div className="study-cabinet-panel__student-command-side">
                <div className="study-cabinet-panel__hero-nav study-cabinet-panel__student-hero-nav">
                  {onWorkbookClick ? (
                    <Button
                      className="study-cabinet-panel__hero-btn study-cabinet-panel__hero-btn--chat"
                      variant="contained"
                      onClick={onWorkbookClick}
                      startIcon={<AutoStoriesRoundedIcon fontSize="small" />}
                    >
                      Рабочая тетрадь
                    </Button>
                  ) : null}
                  {onChatClick ? (
                    <Button
                      className="study-cabinet-panel__hero-btn"
                      variant="outlined"
                      onClick={onChatClick}
                      disabled={chatDisabled || chatLocked}
                      startIcon={<ForumRoundedIcon fontSize="small" />}
                    >
                      Чат{chatLocked ? " (закрыт)" : ""}
                    </Button>
                  ) : null}
                  {onBrowseCourses ? (
                    <Button
                      className="study-cabinet-panel__hero-btn"
                      variant="outlined"
                      onClick={onBrowseCourses}
                      startIcon={<AutoStoriesRoundedIcon fontSize="small" />}
                    >
                      Каталог курсов
                    </Button>
                  ) : null}
                <Tooltip title="Скачать краткий PDF-отчёт">
                  <IconButton
                    className="study-cabinet-panel__student-icon-action"
                    onClick={() => {
                      void downloadReport();
                    }}
                    aria-label="Скачать PDF-отчёт"
                    disabled={reportExporting}
                  >
                    {reportExporting ? (
                      <CircularProgress size={16} thickness={5} />
                    ) : (
                      <DownloadRoundedIcon fontSize="small" />
                    )}
                  </IconButton>
                </Tooltip>
              </div>
            </div>
          </div>
          {reportExportError ? (
            <div className="study-cabinet-panel__student-inline-error">{reportExportError}</div>
          ) : null}
          <div className="study-cabinet-panel__student-main-grid">
            <section className="study-cabinet-panel__student-next-card">
              {courseDetailsLoading ? (
                <div className="study-cabinet-panel__student-loading-inline">
                  <CircularProgress size={18} />
                  <span>Собираем следующий шаг...</span>
                </div>
              ) : courseDetailsError ? (
                <div className="study-cabinet-panel__student-inline-error">{courseDetailsError}</div>
              ) : nextStep ? (
                <>
                  {formatEstimate(nextStep.estimateSeconds) ? (
                    <div className="study-cabinet-panel__student-next-topline">
                      <span className="study-cabinet-panel__student-next-time">
                        <ScheduleRoundedIcon fontSize="inherit" /> {formatEstimate(nextStep.estimateSeconds)}
                      </span>
                    </div>
                  ) : null}
                  <strong>{nextStep.title}</strong>
                  <p>{nextStep.subtitle}</p>
                  <div className="study-cabinet-panel__student-next-actions">
                    <Button
                      variant="contained"
                      onClick={nextStep.onContinue}
                      startIcon={<TipsAndUpdatesRoundedIcon fontSize="small" />}
                    >
                      Продолжить
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => setChooseAnotherOpen(true)}
                      startIcon={<AutoStoriesRoundedIcon fontSize="small" />}
                    >
                      Выбрать другое
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <strong>Выберите комфортный шаг</strong>
                  <p>Откройте урок, тест или занятие в удобный момент.</p>
                  <div className="study-cabinet-panel__student-next-actions">
                    <Button
                      variant="contained"
                      onClick={() => setChooseAnotherOpen(true)}
                      startIcon={<TipsAndUpdatesRoundedIcon fontSize="small" />}
                    >
                      Выбрать действие
                    </Button>
                  </div>
                </>
              )}
              <div className="study-cabinet-panel__student-assist-strip">
                {onChatClick ? (
                  <button type="button" onClick={onChatClick} disabled={chatDisabled || chatLocked}>
                    <ForumRoundedIcon fontSize="inherit" />
                    <span>Написать преподавателю</span>
                  </button>
                ) : null}
              </div>
            </section>

            <article
              className="study-cabinet-panel__student-insight-card study-cabinet-panel__student-insight-card--progress"
              style={progressCardStyle}
              aria-label="Диаграмма маршрута обучения"
            >
              <div className="study-cabinet-panel__student-route-head">
                <span className="study-cabinet-panel__student-insight-label">
                  <AutoGraphRoundedIcon fontSize="inherit" />
                  Модель прогресса
                </span>
                <div className="study-cabinet-panel__student-route-metrics">
                  <span className="study-cabinet-panel__student-route-count">
                    {courseProgress.percent}%
                  </span>
                  <span className="study-cabinet-panel__student-route-count">
                    {completedCourseUnits}/{totalCourseUnits || 0} шагов
                  </span>
                </div>
              </div>
              <div className="study-cabinet-panel__student-route-visual" aria-hidden="true">
                <div className="study-cabinet-panel__student-route-chart">
                  <svg className="study-cabinet-panel__student-route-curve" viewBox="0 0 260 132" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="student-route-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#4f63e6" />
                        <stop offset="48%" stopColor="#168ec7" />
                        <stop offset="100%" stopColor="#22a676" />
                      </linearGradient>
                    </defs>
                    <path
                      className="study-cabinet-panel__student-route-curve-glow"
                      d="M6 118 C48 114 68 98 99 82 C130 66 151 54 178 38 C203 24 226 15 254 10"
                    />
                    <path
                      className="study-cabinet-panel__student-route-curve-line"
                      d="M6 118 C48 114 68 98 99 82 C130 66 151 54 178 38 C203 24 226 15 254 10"
                    />
                  </svg>
                  <div className="study-cabinet-panel__student-route-bars">
                    {routeChartBars.map((barStyle, index) => (
                      <span
                        key={`route-bar-${index}`}
                        className="study-cabinet-panel__student-route-bar"
                        style={barStyle}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="study-cabinet-panel__student-route-footer">
                <span className="study-cabinet-panel__student-route-chip">Текущий курс</span>
                <span>{courseProgress.percent < 100 ? "Основано на завершённых уроках и тестах" : "Курс полностью освоен"}</span>
              </div>
              <span className="study-cabinet-panel__student-insight-track">
                <i style={{ width: `${courseProgress.percent}%` }} />
              </span>
            </article>

            <aside className="study-cabinet-panel__student-insights-panel" aria-label="Сводка обучения">
              <article className="study-cabinet-panel__student-insight-card study-cabinet-panel__student-insight-card--practice">
                <span className="study-cabinet-panel__student-insight-label">
                  <WorkspacePremiumRoundedIcon fontSize="inherit" />
                  Практика
                </span>
                <strong>{reviewLead ? "Повторить" : "В норме"}</strong>
                <small>
                  {reviewLead
                    ? `${reviewLead.title} · ${reviewLead.label}`
                    : qualitySummary.bestRecent > 0
                      ? "Повторение сейчас не требуется"
                      : "Тесты появятся в маршруте"}
                </small>
                  {reviewLead ? (
                    <button type="button" onClick={reviewLead.onReview}>
                      <WorkspacePremiumRoundedIcon fontSize="inherit" />
                      Повторить
                    </button>
                  ) : null}
              </article>
              <article className="study-cabinet-panel__student-insight-card study-cabinet-panel__student-insight-card--booking">
                <span className="study-cabinet-panel__student-insight-label">
                  <EventAvailableRoundedIcon fontSize="inherit" />
                  Поддержка
                </span>
                <strong>
                  {nearestBooking
                    ? formatShortDateTime(
                        getBookingStart(nearestBooking.date, nearestBooking.startTime)?.toISOString() ??
                          `${nearestBooking.date}T${nearestBooking.startTime}`
                      )
                    : "Нет записи"}
                </strong>
                <small>
                  {nearestBooking
                    ? nearestBooking.teacherName
                    : bookingCta?.title ?? "Индивидуальный слот можно выбрать позже"}
                </small>
                  {bookingCta ? (
                    <button type="button" onClick={bookingCta.onAction}>
                      <EventAvailableRoundedIcon fontSize="inherit" />
                      {bookingCta.actionLabel}
                    </button>
                  ) : null}
              </article>
            </aside>
          </div>
        </div>
      </div>

      <div className="study-cabinet-panel__student-content-grid">
        <section className="study-cabinet-panel__smart-card study-cabinet-panel__student-smart-card">
          <div className="study-cabinet-panel__student-focus-head">
            <div>
              <span className="study-cabinet-panel__kicker">Следующие шаги</span>
              </div>
              {activeCourseSummary ? (
                <Button
                  size="small"
                  onClick={() => onOpenCourse?.(activeCourseSummary.course.id, { source: "block-map" })}
                  startIcon={<AutoStoriesRoundedIcon fontSize="small" />}
                >
                  Открыть курс
                </Button>
              ) : null}
          </div>
          {courseDetailsLoading ? (
            <div className="study-cabinet-panel__student-loading-inline">
              <CircularProgress size={18} />
              <span>Загружаем структуру курса...</span>
            </div>
          ) : courseDetailsError ? (
            <div className="study-cabinet-panel__student-inline-error">{courseDetailsError}</div>
          ) : focusItems.length > 0 ? (
            <div className="study-cabinet-panel__student-focus-list">
              {focusItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`study-cabinet-panel__student-focus-item study-cabinet-panel__student-focus-item--${item.accent}`}
                  onClick={() => item.onOpen?.()}
                >
                  <div className="study-cabinet-panel__student-focus-main">
                    <div className="study-cabinet-panel__student-focus-topline">
                      <span className="study-cabinet-panel__student-focus-badge">
                        {item.kind === "lesson" ? (
                          <>
                            <AutoStoriesRoundedIcon fontSize="inherit" />
                            Урок
                          </>
                        ) : item.kind === "test" ? (
                          <>
                            <WorkspacePremiumRoundedIcon fontSize="inherit" />
                            Тест
                          </>
                        ) : (
                          <>
                            <TipsAndUpdatesRoundedIcon fontSize="inherit" />
                            Курс
                          </>
                        )}
                      </span>
                      {formatEstimate(item.durationSeconds) ? (
                        <span className="study-cabinet-panel__student-focus-time">
                          <ScheduleRoundedIcon fontSize="inherit" />
                          {formatEstimate(item.durationSeconds)}
                        </span>
                      ) : null}
                    </div>
                    <div className="study-cabinet-panel__student-focus-bodyline">
                      <strong>{item.title}</strong>
                      {item.summary ? (
                        <p className="study-cabinet-panel__student-focus-summary">{item.summary}</p>
                      ) : null}
                    </div>
                    {item.kind === "course" && typeof item.progressPercent === "number" ? (
                      <div className="study-cabinet-panel__student-focus-xp">
                        <div className="study-cabinet-panel__student-focus-xp-topline">
                          <span>Прогресс курса</span>
                          <strong>{item.progressPercent}%</strong>
                        </div>
                        <div className="study-cabinet-panel__student-focus-xp-track">
                          <i
                            style={{
                              width: `${Math.max(6, Math.min(100, item.progressPercent))}%`,
                              background: `linear-gradient(90deg, ${getProgressTone(Math.max(0, item.progressPercent - 16))}, ${getProgressTone(item.progressPercent)})`,
                            }}
                          />
                        </div>
                      </div>
                    ) : null}
                    <div className="study-cabinet-panel__student-focus-footer">
                      {item.meta.length ? (
                        <div className="study-cabinet-panel__student-focus-meta">
                          {item.meta.map((metaItem) => (
                            <span key={metaItem} className="study-cabinet-panel__student-focus-chip">
                              {metaItem}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span />
                      )}
                      {item.actionLabel ? (
                        <span className="study-cabinet-panel__student-focus-cta">
                          {item.kind === "lesson" ? (
                            <PlayCircleRoundedIcon fontSize="inherit" />
                          ) : item.kind === "test" ? (
                              <WorkspacePremiumRoundedIcon fontSize="inherit" />
                            ) : (
                              <TipsAndUpdatesRoundedIcon fontSize="inherit" />
                            )}
                            {item.actionLabel}
                          </span>
                        ) : null}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="study-cabinet-panel__empty">Активных незавершённых шагов сейчас нет.</div>
          )}
        </section>

        <section className="study-cabinet-panel__smart-card study-cabinet-panel__student-smart-card study-cabinet-panel__student-rhythm-card">
          <div className="study-cabinet-panel__student-rhythm-head">
            <div className="study-cabinet-panel__student-rhythm-title">
              <span className="study-cabinet-panel__kicker">Учебный ритм</span>
            </div>
            <div className="study-cabinet-panel__student-rhythm-stats">
              <span>{rhythmHeadline}</span>
              {bestRhythmDayLabel ? <span>Пик: {bestRhythmDayLabel}</span> : null}
            </div>
          </div>
          <div className="study-cabinet-panel__student-rhythm-stage">
            <div className="study-cabinet-panel__student-rhythm-overview" role="list" aria-label="Итоги недели">
              <div className="study-cabinet-panel__student-rhythm-overview-card" role="listitem">
                <small>Всего</small>
                <strong>{cabinetTimeSeconds > 0 ? formatCompactDuration(cabinetTimeSeconds) : "0с"}</strong>
              </div>
              <div className="study-cabinet-panel__student-rhythm-overview-card" role="listitem">
                <small>Среднее</small>
                <strong>{averageRhythmDaySeconds > 0 ? formatCompactDuration(averageRhythmDaySeconds) : "Нет данных"}</strong>
              </div>
              <div className="study-cabinet-panel__student-rhythm-overview-card" role="listitem">
                <small>Видеоуроки</small>
                <strong>{viewedVideoSeconds > 0 ? formatCompactDuration(viewedVideoSeconds) : "Нет данных"}</strong>
              </div>
            </div>
            <div className="study-cabinet-panel__student-activity-strip" role="list" aria-label="Активность по дням недели">
              {activityDays.map((day) => {
                const heightRatio =
                  day.minutes > 0
                    ? Math.min(100, (day.minutes / maxRhythmMinutes) * 100)
                    : 0;
                const palette = getRhythmTonePalette(heightRatio);
                const barStyle = {
                  "--bar-height": `${heightRatio.toFixed(2)}%`,
                  "--bar-top": palette.top,
                  "--bar-mid": palette.mid,
                  "--bar-bottom": palette.bottom,
                } as CSSProperties;
                return (
                  <button
                    key={day.key}
                    type="button"
                    role="listitem"
                    aria-label={`${day.label}: ${day.minutes > 0 ? formatDuration(day.minutes * 60) : "0 сек"}`}
                    className={`study-cabinet-panel__student-activity-day ${day.minutes > 0 ? "is-active" : ""} ${
                      activeRhythmDayKey === day.key ? "is-hovered" : ""
                    }`}
                    onMouseEnter={() => setActiveRhythmDayKey(day.key)}
                    onMouseLeave={() => setActiveRhythmDayKey(null)}
                    onFocus={() => setActiveRhythmDayKey(day.key)}
                    onBlur={() => setActiveRhythmDayKey(null)}
                    onClick={() =>
                      setActiveRhythmDayKey((current) => (current === day.key ? null : day.key))
                    }
                  >
                    <span className="study-cabinet-panel__student-activity-value">
                      {day.minutes > 0 ? formatCompactDuration(day.minutes * 60) : "—"}
                    </span>
                    <span className="study-cabinet-panel__student-activity-capsule">
                      <i style={barStyle} />
                    </span>
                    <span className="study-cabinet-panel__student-activity-label">{day.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <Dialog
        open={chooseAnotherOpen}
        onClose={() => setChooseAnotherOpen(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{ className: "study-cabinet-panel__student-dialog" }}
      >
        <DialogTitle>Выберите другой следующий шаг</DialogTitle>
        <DialogContent>
          <div className="study-cabinet-panel__student-dialog-list">
            {courses.map((item) => (
              <button
                key={item.course.id}
                type="button"
                className={`study-cabinet-panel__student-course-option ${item.course.id === selectedCourseId ? "is-active" : ""}`}
                onClick={() => setSelectedCourseId(item.course.id)}
              >
                <strong>{item.course.title}</strong>
                <span>{item.progress}% официального прогресса</span>
              </button>
            ))}
          </div>
          <div className="study-cabinet-panel__student-dialog-list study-cabinet-panel__student-dialog-list--choices">
            {quickChoices.length > 0 ? (
              quickChoices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  className="study-cabinet-panel__student-choice"
                  onClick={() => {
                    setChooseAnotherOpen(false);
                    choice.onSelect();
                  }}
                >
                  <div>
                    <strong>{choice.title}</strong>
                    <span>{choice.subtitle}</span>
                  </div>
                  <em>{choice.actionLabel}</em>
                </button>
              ))
            ) : (
              <div className="study-cabinet-panel__empty">Для этого курса пока нет дополнительных быстрых шагов. Можно открыть курс целиком.</div>
            )}
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChooseAnotherOpen(false)}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </section>
  );
}
