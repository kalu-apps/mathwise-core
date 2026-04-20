import { useCallback, useEffect } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Booking } from "@/entities/booking/model/types";
import { getViewedLessonIds } from "@/entities/progress/model/storage";
import type { AvailabilitySlot } from "@/features/teacher-availability/model/types";
import type { User } from "@/entities/user/model/types";
import type { StudentStudyCabinetCourseItem } from "@/features/study-cabinet/student/model/types";
import {
  getAssessmentCourseProgress,
  getAssessmentKnowledgeProgress,
  getBestAssessmentAttemptsMap,
  getCourseContentItems,
} from "@/features/assessments/model/storage";
import { getCourseReleaseContent } from "@/entities/course/model/storage";
import { buildPublishedCourseContentProjection } from "@/features/assessments/model/releaseContent";
import {
  getTeacherChatEligibility,
  getTeacherChatThreads,
} from "@/features/chat/model/api";
import type { TeacherChatEligibility } from "@/features/chat/model/types";
import {
  normalizeTeacherAvailabilityMap,
  pickTeacherWithAvailability,
} from "@/features/booking/lib/teacherSelection";
import {
  getStudyCabinetNotes,
  recordStudyCabinetActivity,
  type StudyCabinetNote,
} from "@/shared/lib/studyCabinet";
import { lessonDurationToSeconds } from "@/shared/lib/duration";
import { subscribeAppDataUpdates } from "@/shared/lib/subscribeAppDataUpdates";
import { getStudentProfileContext } from "@/entities/profile/model/storage";
import { getMyCapabilities } from "@/features/capabilities/model/api";

type TabName =
  | "profile"
  | "courses"
  | "lessons"
  | "study"
  | "workbook"
  | "chat";

type UseStudentProfileDataParams = {
  user: User | null;
  userId?: string;
  tab: number;
  WORKBOOK_TAB_INDEX: number;
  CHAT_TAB_INDEX: number;
  chatAccessAvailable: boolean;
  location: {
    pathname: string;
    search: string;
  };
  navigate: (to: string, options?: { replace?: boolean }) => void;
  setTab: Dispatch<SetStateAction<number>>;
  setProfileDraft: Dispatch<
    SetStateAction<{
      firstName: string;
      lastName: string;
      phone: string;
      photo: string;
    }>
  >;
  setProfileEditing: Dispatch<SetStateAction<boolean>>;
  hasCoursesLoadedRef: MutableRefObject<boolean>;
  hasBookingsLoadedRef: MutableRefObject<boolean>;
  hasScheduleLoadedRef: MutableRefObject<boolean>;
  setItems: Dispatch<SetStateAction<StudentStudyCabinetCourseItem[]>>;
  setCoursesLoading: Dispatch<SetStateAction<boolean>>;
  setCoursesError: Dispatch<SetStateAction<string | null>>;
  setBookings: Dispatch<SetStateAction<Booking[]>>;
  setBookingsLoading: Dispatch<SetStateAction<boolean>>;
  setBookingsError: Dispatch<SetStateAction<string | null>>;
  setTeacher: Dispatch<SetStateAction<User | null>>;
  setAvailability: Dispatch<SetStateAction<AvailabilitySlot[]>>;
  setScheduleLoading: Dispatch<SetStateAction<boolean>>;
  setScheduleError: Dispatch<SetStateAction<string | null>>;
  setChatEligibility: Dispatch<SetStateAction<TeacherChatEligibility | null>>;
  setChatUnreadCount: Dispatch<SetStateAction<number>>;
  setStudyNotes: Dispatch<SetStateAction<StudyCabinetNote[]>>;
  setStudyActivityVersion: Dispatch<SetStateAction<number>>;
};

export const useStudentProfileData = ({
  user,
  userId,
  tab,
  WORKBOOK_TAB_INDEX,
  CHAT_TAB_INDEX,
  chatAccessAvailable,
  location,
  navigate,
  setTab,
  setProfileDraft,
  setProfileEditing,
  hasCoursesLoadedRef,
  hasBookingsLoadedRef,
  hasScheduleLoadedRef,
  setItems,
  setCoursesLoading,
  setCoursesError,
  setBookings,
  setBookingsLoading,
  setBookingsError,
  setTeacher,
  setAvailability,
  setScheduleLoading,
  setScheduleError,
  setChatEligibility,
  setChatUnreadCount,
  setStudyNotes,
  setStudyActivityVersion,
}: UseStudentProfileDataParams) => {
  const resolveTabParam = useCallback(
    (tabIndex: number): TabName => {
      if (tabIndex === 1) return "courses";
      if (tabIndex === 2) return "lessons";
      if (tabIndex === 3) return "study";
      if (tabIndex === WORKBOOK_TAB_INDEX) return "workbook";
      if (tabIndex === CHAT_TAB_INDEX) return "chat";
      return "profile";
    },
    [WORKBOOK_TAB_INDEX, CHAT_TAB_INDEX]
  );

  const setTabWithQuery = useCallback(
    (nextTab: number, options?: { replace?: boolean }) => {
      const nextTabParam = resolveTabParam(nextTab);
      const params = new URLSearchParams(location.search);
      params.set("tab", nextTabParam);
      const nextSearch = params.toString();
      const nextUrl = `${location.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
      const currentUrl = `${location.pathname}${location.search}`;
      if (nextUrl !== currentUrl) {
        navigate(nextUrl, { replace: options?.replace ?? true });
        return;
      }
      setTab((prev) => (prev === nextTab ? prev : nextTab));
    },
    [
      location.pathname,
      location.search,
      navigate,
      resolveTabParam,
      setTab,
    ]
  );

  useEffect(() => {
    const tabParam = new URLSearchParams(location.search).get("tab");
    let nextTab = tab;
    if (tabParam === "courses") nextTab = 1;
    else if (tabParam === "lessons") nextTab = 2;
    else if (tabParam === "study") nextTab = 3;
    else if (tabParam === "workbook") nextTab = WORKBOOK_TAB_INDEX;
    else if (tabParam === "chat") nextTab = CHAT_TAB_INDEX;
    else if (tabParam === "profile" || tabParam === null) nextTab = 0;

    if (nextTab !== tab) {
      setTab(nextTab);
    }
  }, [location.search, tab, WORKBOOK_TAB_INDEX, CHAT_TAB_INDEX, setTab]);

  useEffect(() => {
    if (!user) return;
    setProfileDraft({
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      phone: user.phone ?? "",
      photo: user.photo ?? "",
    });
    setProfileEditing(false);
  }, [user, setProfileDraft, setProfileEditing]);

  const loadStudentCourses = useCallback(async () => {
    if (!userId) {
      setItems([]);
      hasCoursesLoadedRef.current = true;
      setCoursesLoading(false);
      return;
    }
    try {
      if (!hasCoursesLoadedRef.current) {
        setCoursesLoading(true);
      }
      setCoursesError(null);
      const [context, capabilities] = await Promise.all([
        getStudentProfileContext(),
        getMyCapabilities({ forceFresh: true }),
      ]);
      const userPurchases = context.purchases;
      const premiumCourseIds = new Set(capabilities.premiumCourseIds ?? []);

      const resolved = await Promise.all(
        userPurchases.map(async (purchase) => {
          const liveCourse =
            context.courses.find((candidate) => candidate.id === purchase.courseId) ??
            null;
          const usePublishedCourse = liveCourse?.status === "published";
          const course =
            (usePublishedCourse ? liveCourse : purchase.courseSnapshot ?? liveCourse) ??
            null;
          if (!course) return null;
          const lessons = usePublishedCourse
            ? context.lessons.filter((lesson) => lesson.courseId === course.id)
            : Array.isArray(purchase.lessonsSnapshot)
            ? purchase.lessonsSnapshot
            : context.lessons.filter((lesson) => lesson.courseId === course.id);
          const queue = usePublishedCourse
            ? buildPublishedCourseContentProjection({
                courseId: course.id,
                lessons,
                snapshot: await getCourseReleaseContent(course.id, {
                  forceFresh: true,
                }),
              }).queue
            : await getCourseContentItems(course.id, lessons);
          const purchasedTestItemIdSet = new Set(
            Array.isArray(purchase.purchasedTestItemIds)
              ? purchase.purchasedTestItemIds
              : []
          );
          const effectiveQueue = usePublishedCourse
            ? queue
            : queue.filter((item) => {
                if (item.type === "lesson") return true;
                if (purchasedTestItemIdSet.size > 0) {
                  return purchasedTestItemIdSet.has(item.id);
                }
                if (!purchase.purchasedAt) return true;
                return item.createdAt <= purchase.purchasedAt;
              });
          const testItems = effectiveQueue.filter((item) => item.type === "test");
          const viewed = await getViewedLessonIds(userId, course.id, {
            forceFresh: true,
          });
          const progress =
            lessons.length === 0
              ? 0
              : Math.round((viewed.length / lessons.length) * 100);
          const [testsProgress, testsKnowledgeProgress, bestAttempts] = await Promise.all([
            getAssessmentCourseProgress({
              studentId: userId,
              courseId: course.id,
              testItemIds: testItems.map((item) => item.id),
            }),
            getAssessmentKnowledgeProgress({
              studentId: userId,
              courseId: course.id,
              testItemIds: testItems.map((item) => item.id),
            }),
            getBestAssessmentAttemptsMap({
              studentId: userId,
              courseId: course.id,
            }),
          ]);
          const viewedSet = new Set(viewed);
          const remainingLessons = lessons.reduce(
            (sum, lesson) => sum + (viewedSet.has(lesson.id) ? 0 : 1),
            0
          );
          const viewedLessonSeconds = lessons.reduce((sum, lesson) => {
            if (!viewedSet.has(lesson.id)) return sum;
            const duration = Number.isFinite(lesson.duration)
              ? lessonDurationToSeconds(lesson.duration)
              : 0;
            return sum + duration;
          }, 0);
          const remainingLessonSeconds = lessons.reduce((sum, lesson) => {
            if (viewedSet.has(lesson.id)) return sum;
            const duration = Number.isFinite(lesson.duration)
              ? lessonDurationToSeconds(lesson.duration)
              : 0;
            return sum + duration;
          }, 0);
          const remainingTests = testItems.reduce((sum, item) => {
            const bestAttempt = bestAttempts.get(item.id);
            return sum + (bestAttempt && bestAttempt.score.percent > 0 ? 0 : 1);
          }, 0);
          const remainingTestSeconds = testItems.reduce((sum, item) => {
            const bestAttempt = bestAttempts.get(item.id);
            if (bestAttempt && bestAttempt.score.percent > 0) return sum;
            const durationMinutes =
              item.templateSnapshot?.durationMinutes &&
              Number.isFinite(item.templateSnapshot.durationMinutes)
                ? Math.max(0, Math.round(item.templateSnapshot.durationMinutes))
                : 0;
            return sum + durationMinutes * 60;
          }, 0);
          return {
            course,
            purchase,
            progress,
            viewedCount: viewed.length,
            viewedLessonSeconds,
            totalLessons: lessons.length,
            remainingLessons,
            remainingLessonSeconds,
            totalTests: testsProgress.totalTests,
            completedTests: testsProgress.completedTests,
            remainingTests,
            remainingTestSeconds,
            remainingSeconds: remainingLessonSeconds + remainingTestSeconds,
            testsAveragePercent: testsProgress.averageLatestPercent,
            testsKnowledgePercent: testsKnowledgeProgress.averageBestPercent,
            isPremium:
              premiumCourseIds.has(course.id) || purchase.tariff === "premium",
            purchasedAt: purchase.purchasedAt,
          };
        })
      );

      setItems(
        (resolved.filter(Boolean) as StudentStudyCabinetCourseItem[]).sort((a, b) => {
          if (a.progress !== b.progress) return a.progress - b.progress;
          return b.purchasedAt.localeCompare(a.purchasedAt);
        })
      );
    } catch {
      setCoursesError("Не удалось загрузить ваши курсы.");
    } finally {
      hasCoursesLoadedRef.current = true;
      setCoursesLoading(false);
    }
  }, [userId, hasCoursesLoadedRef, setItems, setCoursesLoading, setCoursesError]);

  useEffect(() => {
    void loadStudentCourses();
    const unsubscribe = subscribeAppDataUpdates(() => {
      void loadStudentCourses();
    });
    return () => {
      unsubscribe();
    };
  }, [loadStudentCourses]);

  useEffect(() => {
    if (tab !== 1) return;
    void loadStudentCourses();
  }, [tab, loadStudentCourses]);

  const loadStudentBookings = useCallback(async () => {
    if (!userId) {
      setBookings([]);
      hasBookingsLoadedRef.current = true;
      setBookingsLoading(false);
      return;
    }
    try {
      if (!hasBookingsLoadedRef.current) {
        setBookingsLoading(true);
      }
      setBookingsError(null);
      const context = await getStudentProfileContext();
      const data = context.bookings;
      setBookings(
        data.map((booking) => ({
          ...booking,
          lessonKind: booking.lessonKind === "trial" ? "trial" : "regular",
          status:
            booking.status === "rescheduled" ||
            booking.status === "canceled" ||
            booking.status === "completed" ||
            booking.status === "no_show"
              ? booking.status
              : "scheduled",
          paymentStatus: booking.paymentStatus === "paid" ? "paid" : "unpaid",
        }))
      );
    } catch {
      setBookingsError("Не удалось загрузить записи на занятия.");
    } finally {
      hasBookingsLoadedRef.current = true;
      setBookingsLoading(false);
    }
  }, [
    userId,
    hasBookingsLoadedRef,
    setBookings,
    setBookingsLoading,
    setBookingsError,
  ]);

  const loadSchedulingContext = useCallback(async () => {
    if (!userId) {
      setTeacher(null);
      setAvailability([]);
      hasScheduleLoadedRef.current = true;
      setScheduleLoading(false);
      return;
    }
    try {
      if (!hasScheduleLoadedRef.current) {
        setScheduleLoading(true);
      }
      setScheduleError(null);
      const context = await getStudentProfileContext();
      const teachers = context.teachers;
      const normalizedAvailabilityByTeacherId = normalizeTeacherAvailabilityMap(
        teachers,
        context.teacherAvailabilityByTeacherId
      );
      const currentTeacher = pickTeacherWithAvailability(
        teachers,
        normalizedAvailabilityByTeacherId
      );
      if (!currentTeacher) {
        setTeacher(null);
        setAvailability([]);
        return;
      }
      setTeacher(currentTeacher);
      setAvailability(normalizedAvailabilityByTeacherId[currentTeacher.id] ?? []);
    } catch {
      setScheduleError("Не удалось загрузить свободные слоты преподавателя.");
      setTeacher(null);
      setAvailability([]);
    } finally {
      hasScheduleLoadedRef.current = true;
      setScheduleLoading(false);
    }
  }, [
    userId,
    hasScheduleLoadedRef,
    setTeacher,
    setAvailability,
    setScheduleLoading,
    setScheduleError,
  ]);

  useEffect(() => {
    hasCoursesLoadedRef.current = false;
    hasBookingsLoadedRef.current = false;
    hasScheduleLoadedRef.current = false;
  }, [userId, hasCoursesLoadedRef, hasBookingsLoadedRef, hasScheduleLoadedRef]);

  useEffect(() => {
    void loadStudentBookings();
    const unsubscribe = subscribeAppDataUpdates(() => {
      void loadStudentBookings();
    });
    return () => {
      unsubscribe();
    };
  }, [loadStudentBookings]);

  useEffect(() => {
    void loadSchedulingContext();
    const unsubscribe = subscribeAppDataUpdates(() => {
      void loadSchedulingContext();
    });
    return () => {
      unsubscribe();
    };
  }, [loadSchedulingContext]);

  const loadChatEligibility = useCallback(async () => {
    if (!userId) {
      setChatEligibility(null);
      return;
    }
    try {
      const eligibility = await getTeacherChatEligibility();
      setChatEligibility(eligibility);
    } catch {
      setChatEligibility(null);
    }
  }, [userId, setChatEligibility]);

  const loadChatUnread = useCallback(async () => {
    if (!userId) {
      setChatUnreadCount(0);
      return;
    }
    try {
      const threads = await getTeacherChatThreads();
      const unread = threads.reduce(
        (sum, thread) => sum + Math.max(0, thread.unreadCount),
        0
      );
      setChatUnreadCount(unread);
    } catch {
      setChatUnreadCount(0);
    }
  }, [userId, setChatUnreadCount]);

  const syncStudyNotes = useCallback(() => {
    if (!userId) {
      setStudyNotes([]);
      return;
    }
    setStudyNotes(getStudyCabinetNotes("student", userId));
  }, [userId, setStudyNotes]);

  useEffect(() => {
    void loadChatEligibility();
    const unsubscribe = subscribeAppDataUpdates(() => {
      void loadChatEligibility();
    });
    return () => {
      unsubscribe();
    };
  }, [loadChatEligibility]);

  useEffect(() => {
    if (!chatAccessAvailable) {
      setChatUnreadCount(0);
      return;
    }
    void loadChatUnread();
    const pollId = window.setInterval(() => {
      void loadChatUnread();
    }, 8_000);
    const unsubscribe = subscribeAppDataUpdates(() => {
      void loadChatUnread();
    });
    return () => {
      window.clearInterval(pollId);
      unsubscribe();
    };
  }, [chatAccessAvailable, loadChatUnread, setChatUnreadCount]);

  useEffect(() => {
    if (tab !== 3) return;
    syncStudyNotes();
    const unsubscribe = subscribeAppDataUpdates(() => {
      syncStudyNotes();
    });
    return () => {
      unsubscribe();
    };
  }, [tab, syncStudyNotes]);

  useEffect(() => {
    if (tab !== 3 || !userId) return;
    let lastMarkAt = Date.now();
    const intervalId = window.setInterval(() => {
      const now = Date.now();
      const elapsedMinutes = Math.floor((now - lastMarkAt) / 60_000);
      if (elapsedMinutes > 0) {
        recordStudyCabinetActivity({
          role: "student",
          userId,
          minutes: elapsedMinutes,
        });
        lastMarkAt = now;
        setStudyActivityVersion((prev) => prev + 1);
      }
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
      const now = Date.now();
      const elapsedMinutes = Math.max(1, Math.floor((now - lastMarkAt) / 60_000));
      recordStudyCabinetActivity({
        role: "student",
        userId,
        minutes: elapsedMinutes,
      });
      setStudyActivityVersion((prev) => prev + 1);
    };
  }, [tab, userId, setStudyActivityVersion]);

  return {
    setTabWithQuery,
    loadStudentCourses,
    loadStudentBookings,
    loadSchedulingContext,
  };
};
