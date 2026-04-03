import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ApiError } from "@/shared/api/client";
import type { Course } from "@/entities/course/model/types";
import type { Booking } from "@/entities/booking/model/types";
import type { AvailabilitySlot } from "@/features/teacher-availability/model/types";
import { getCourseContentItems } from "@/features/assessments/model/storage";
import { getTeacherChatThreads } from "@/features/chat/model/api";
import {
  countDueSoonStudyCabinetReminders,
  getStudyCabinetNotes,
  recordStudyCabinetActivity,
  type StudyCabinetNote,
} from "@/shared/lib/studyCabinet";
import { normalizeFutureSlots } from "@/features/booking/lib/schedule";
import { dispatchDataUpdate } from "@/shared/lib/dataUpdateBus";
import { subscribeAppDataUpdates } from "@/shared/lib/subscribeAppDataUpdates";
import { t } from "@/shared/i18n";
import { getTeacherDashboardContext } from "@/entities/profile/model/storage";
import {
  isTeacherScopeAccessError,
  shouldRunTeacherScopedRequest,
  TEACHER_UNAUTHORIZED_COOLDOWN_MS,
} from "@/pages/teacher/model/lifecycleGuards";

export type TeacherDashboardStudentCardData = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  photo?: string;
};

type UseTeacherDashboardDataParams = {
  userId?: string;
  isTeacher: boolean;
  tab: number;
  setCourses: Dispatch<SetStateAction<Course[]>>;
  setStudentCards: Dispatch<SetStateAction<TeacherDashboardStudentCardData[]>>;
  setLessonCounts: Dispatch<SetStateAction<Record<string, number>>>;
  setTestCounts: Dispatch<SetStateAction<Record<string, number>>>;
  setDashboardLoading: Dispatch<SetStateAction<boolean>>;
  setDashboardError: Dispatch<SetStateAction<string | null>>;
  setChatUnreadCount: Dispatch<SetStateAction<number>>;
  setStudentsWithFeedbackIds: Dispatch<SetStateAction<string[]>>;
  setChatThreadIdsByStudentId: Dispatch<SetStateAction<Record<string, string>>>;
  setStudyNotes: Dispatch<SetStateAction<StudyCabinetNote[]>>;
  setStudyReminderCount: Dispatch<SetStateAction<number>>;
  setStudyActivityVersion: Dispatch<SetStateAction<number>>;
  setAvailability: Dispatch<SetStateAction<AvailabilitySlot[]>>;
  setAvailabilityLoading: Dispatch<SetStateAction<boolean>>;
  setAvailabilityError: Dispatch<SetStateAction<string | null>>;
  setBookings: Dispatch<SetStateAction<Booking[]>>;
  setBookingLoading: Dispatch<SetStateAction<boolean>>;
  setBookingError: Dispatch<SetStateAction<string | null>>;
};

const mapAvailabilitySlots = (slots: AvailabilitySlot[]) => {
  const normalized = slots.map((slot) => ({
    id: slot.id,
    date: slot.date,
    startTime:
      (slot as AvailabilitySlot & { time?: string }).startTime ??
      (slot as AvailabilitySlot & { time?: string }).time ??
      "",
    endTime: slot.endTime ?? "",
  }));
  return normalizeFutureSlots(normalized);
};

const normalizeBookings = (
  bookings: Booking[],
  students: Array<{
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    photo?: string;
  }>
): Booking[] => {
  const studentsById = new Map(students.map((student) => [student.id, student]));
  return bookings.map((booking) => {
    const student = studentsById.get(booking.studentId);
    const normalizedBooking: Booking = {
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
    };
    if (!student) return normalizedBooking;

    const studentName =
      `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim() ||
      normalizedBooking.studentName;
    return {
      ...normalizedBooking,
      studentName,
      studentEmail: student.email ?? normalizedBooking.studentEmail,
      studentPhone: student.phone ?? normalizedBooking.studentPhone,
      studentPhoto: student.photo ?? normalizedBooking.studentPhoto,
    };
  });
};

const isUnauthorizedApiError = (error: unknown) => {
  if (isTeacherScopeAccessError(error)) return true;
  if (!(error instanceof ApiError)) return false;
  return error.status === 401 || error.status === 403;
};

export const useTeacherDashboardData = ({
  userId,
  isTeacher,
  tab,
  setCourses,
  setStudentCards,
  setLessonCounts,
  setTestCounts,
  setDashboardLoading,
  setDashboardError,
  setChatUnreadCount,
  setStudentsWithFeedbackIds,
  setChatThreadIdsByStudentId,
  setStudyNotes,
  setStudyReminderCount,
  setStudyActivityVersion,
  setAvailability,
  setAvailabilityLoading,
  setAvailabilityError,
  setBookings,
  setBookingLoading,
  setBookingError,
}: UseTeacherDashboardDataParams) => {
  const hasPrimaryLoadRef = useRef(false);
  const blockedUntilRef = useRef(0);
  const contextRequestRef = useRef<
    Promise<Awaited<ReturnType<typeof getTeacherDashboardContext>>> | null
  >(null);

  const clearTeacherScopedData = useCallback(() => {
    setCourses([]);
    setStudentCards([]);
    setLessonCounts({});
    setTestCounts({});
    setAvailability([]);
    setBookings([]);
    setChatUnreadCount(0);
    setStudentsWithFeedbackIds([]);
    setChatThreadIdsByStudentId({});
    setStudyNotes([]);
    setStudyReminderCount(0);
  }, [
    setAvailability,
    setBookings,
    setChatThreadIdsByStudentId,
    setChatUnreadCount,
    setCourses,
    setLessonCounts,
    setStudentCards,
    setStudentsWithFeedbackIds,
    setStudyNotes,
    setStudyReminderCount,
    setTestCounts,
  ]);

  const markUnauthorizedStop = useCallback(() => {
    blockedUntilRef.current = Date.now() + TEACHER_UNAUTHORIZED_COOLDOWN_MS;
    setDashboardLoading(false);
    setAvailabilityLoading(false);
    setBookingLoading(false);
    setDashboardError("Сессия преподавателя завершена. Войдите снова, чтобы продолжить.");
    setAvailabilityError(null);
    setBookingError(null);
    clearTeacherScopedData();
  }, [
    clearTeacherScopedData,
    setAvailabilityError,
    setAvailabilityLoading,
    setBookingError,
    setBookingLoading,
    setDashboardError,
    setDashboardLoading,
  ]);

  const loadDashboardContext = useCallback(async () => {
    if (contextRequestRef.current) {
      return contextRequestRef.current;
    }
    const promise = getTeacherDashboardContext().finally(() => {
      contextRequestRef.current = null;
    });
    contextRequestRef.current = promise;
    return promise;
  }, []);

  const refreshAll = useCallback(
    async (options?: { forceHardLoading?: boolean }) => {
      if (
        !shouldRunTeacherScopedRequest({
          userId,
          isTeacher,
          blockedUntilTs: blockedUntilRef.current,
        })
      ) {
        if (!userId || !isTeacher) {
          hasPrimaryLoadRef.current = false;
          blockedUntilRef.current = 0;
          clearTeacherScopedData();
          setDashboardLoading(false);
          setAvailabilityLoading(false);
          setBookingLoading(false);
          setDashboardError(null);
          setAvailabilityError(null);
          setBookingError(null);
        }
        return;
      }

      const hardLoading = options?.forceHardLoading === true || !hasPrimaryLoadRef.current;
      if (hardLoading) {
        setDashboardLoading(true);
        setAvailabilityLoading(true);
        setBookingLoading(true);
      }
      if (hardLoading) {
        setDashboardError(null);
        setAvailabilityError(null);
        setBookingError(null);
      }

      try {
        const context = await loadDashboardContext();
        blockedUntilRef.current = 0;

        const teacherCourses = context.courses;
        const allLessons = context.lessons;
        const studentUsers = context.students;
        const counts = allLessons.reduce<Record<string, number>>((acc, lesson) => {
          acc[lesson.courseId] = (acc[lesson.courseId] ?? 0) + 1;
          return acc;
        }, {});

        const testsByCourse: Record<string, number> = {};
        await Promise.all(
          teacherCourses.map(async (course) => {
            const lessonsForCourse = allLessons.filter(
              (lesson) => lesson.courseId === course.id
            );
            const queue = await getCourseContentItems(course.id, lessonsForCourse);
            testsByCourse[course.id] = queue.filter((item) => item.type === "test").length;
          })
        );

        const cards: TeacherDashboardStudentCardData[] = studentUsers.map((student) => ({
          id: student.id,
          name: `${student.firstName} ${student.lastName}`,
          email: student.email,
          phone: student.phone,
          photo: student.photo,
        }));

        setCourses(teacherCourses);
        setStudentCards(cards);
        setLessonCounts(counts);
        setTestCounts(testsByCourse);
        setAvailability(mapAvailabilitySlots(context.availability));
        setBookings(normalizeBookings(context.bookings, context.students));

        hasPrimaryLoadRef.current = true;
      } catch (error) {
        if (isUnauthorizedApiError(error)) {
          markUnauthorizedStop();
          return;
        }

        setDashboardError(t("teacherDashboard.loadDashboardError"));
        setAvailabilityError(t("teacherDashboard.loadSlotsError"));
        setBookingError(t("teacherDashboard.loadBookingsError"));
        if (hardLoading) {
          setTestCounts({});
        }
      } finally {
        if (hardLoading) {
          setDashboardLoading(false);
          setAvailabilityLoading(false);
          setBookingLoading(false);
        }
      }
    },
    [
      clearTeacherScopedData,
      isTeacher,
      loadDashboardContext,
      markUnauthorizedStop,
      setAvailability,
      setAvailabilityError,
      setAvailabilityLoading,
      setBookingError,
      setBookingLoading,
      setBookings,
      setCourses,
      setDashboardError,
      setDashboardLoading,
      setLessonCounts,
      setStudentCards,
      setTestCounts,
      userId,
    ]
  );

  const retryDashboardData = useCallback(() => {
    blockedUntilRef.current = 0;
    hasPrimaryLoadRef.current = false;
    void refreshAll({ forceHardLoading: true });
    dispatchDataUpdate("teacher-dashboard-retry");
  }, [refreshAll]);

  const refreshChatUnread = useCallback(async () => {
    if (
      !shouldRunTeacherScopedRequest({
        userId,
        isTeacher,
        blockedUntilTs: blockedUntilRef.current,
      })
    ) {
      setChatUnreadCount(0);
      setStudentsWithFeedbackIds([]);
      setChatThreadIdsByStudentId({});
      return;
    }

    try {
      const threads = await getTeacherChatThreads();
      const unread = threads.reduce(
        (sum, thread) => sum + Math.max(0, thread.unreadCount),
        0
      );
      const feedbackStudentIds = new Set<string>();
      const nextThreadIdsByStudentId: Record<string, string> = {};
      threads.forEach((thread) => {
        feedbackStudentIds.add(thread.studentId);
        nextThreadIdsByStudentId[thread.studentId] = thread.id;
      });
      setChatUnreadCount(unread);
      setStudentsWithFeedbackIds(Array.from(feedbackStudentIds));
      setChatThreadIdsByStudentId(nextThreadIdsByStudentId);
    } catch (error) {
      if (isUnauthorizedApiError(error)) {
        blockedUntilRef.current = Date.now() + TEACHER_UNAUTHORIZED_COOLDOWN_MS;
      }
      setChatUnreadCount(0);
      setStudentsWithFeedbackIds([]);
      setChatThreadIdsByStudentId({});
    }
  }, [
    isTeacher,
    setChatThreadIdsByStudentId,
    setChatUnreadCount,
    setStudentsWithFeedbackIds,
    userId,
  ]);

  const syncStudyNotes = useCallback(() => {
    if (!userId || !isTeacher) {
      setStudyNotes([]);
      setStudyReminderCount(0);
      return;
    }
    const notes = getStudyCabinetNotes("teacher", userId);
    setStudyNotes(notes);
    setStudyReminderCount(countDueSoonStudyCabinetReminders(notes, 90));
  }, [userId, isTeacher, setStudyNotes, setStudyReminderCount]);

  useEffect(() => {
    hasPrimaryLoadRef.current = false;
    blockedUntilRef.current = 0;
    contextRequestRef.current = null;
    if (!userId || !isTeacher) {
      clearTeacherScopedData();
      setDashboardLoading(false);
      setAvailabilityLoading(false);
      setBookingLoading(false);
      setDashboardError(null);
      setAvailabilityError(null);
      setBookingError(null);
    }
  }, [
    clearTeacherScopedData,
    isTeacher,
    setAvailabilityError,
    setAvailabilityLoading,
    setBookingError,
    setBookingLoading,
    setDashboardError,
    setDashboardLoading,
    userId,
  ]);

  useEffect(() => {
    void refreshAll({ forceHardLoading: true });
    const unsubscribe = subscribeAppDataUpdates(() => {
      void refreshAll();
    });
    return () => {
      unsubscribe();
    };
  }, [refreshAll]);

  useEffect(() => {
    void refreshChatUnread();
    const pollId = window.setInterval(() => {
      void refreshChatUnread();
    }, 8_000);
    const unsubscribe = subscribeAppDataUpdates(() => {
      void refreshChatUnread();
    });
    return () => {
      window.clearInterval(pollId);
      unsubscribe();
    };
  }, [refreshChatUnread]);

  useEffect(() => {
    syncStudyNotes();
    const unsubscribe = subscribeAppDataUpdates(() => {
      syncStudyNotes();
    });
    return () => {
      unsubscribe();
    };
  }, [syncStudyNotes]);

  useEffect(() => {
    if (tab !== 4 || !userId || !isTeacher) return;
    let lastMarkAt = Date.now();
    const intervalId = window.setInterval(() => {
      const now = Date.now();
      const elapsedMinutes = Math.floor((now - lastMarkAt) / 60_000);
      if (elapsedMinutes <= 0) return;
      recordStudyCabinetActivity({
        role: "teacher",
        userId,
        minutes: elapsedMinutes,
      });
      lastMarkAt = now;
      setStudyActivityVersion((prev) => prev + 1);
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
      const now = Date.now();
      const elapsedMinutes = Math.max(1, Math.floor((now - lastMarkAt) / 60_000));
      recordStudyCabinetActivity({
        role: "teacher",
        userId,
        minutes: elapsedMinutes,
      });
      setStudyActivityVersion((prev) => prev + 1);
    };
  }, [tab, userId, isTeacher, setStudyActivityVersion]);

  return {
    refreshAll,
    retryDashboardData,
    syncStudyNotes,
  };
};
