import { useCallback, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Course } from "@/entities/course/model/types";
import type { Booking } from "@/entities/booking/model/types";
import type { AvailabilitySlot } from "@/features/teacher-availability/model/types";
import {
  getCourses,
} from "@/entities/course/model/storage";
import { getLessons } from "@/entities/lesson/model/storage";
import { getUsers } from "@/features/auth/model/api";
import { getCourseContentItems } from "@/features/assessments/model/storage";
import { getTeacherChatThreads } from "@/features/chat/model/api";
import {
  getTeacherAvailability,
} from "@/features/teacher-availability/api";
import { getBookings } from "@/entities/booking/model/storage";
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
  const refreshAll = useCallback(async () => {
    if (!userId || !isTeacher) {
      setCourses([]);
      setStudentCards([]);
      setLessonCounts({});
      setTestCounts({});
      return;
    }
    try {
      setDashboardLoading(true);
      setDashboardError(null);
      const [allCourses, allLessons, studentUsers] = await Promise.all([
        getCourses(),
        getLessons(),
        getUsers("student"),
      ]);

      const teacherCourses = allCourses.filter((course) => course.teacherId === userId);
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
    } catch {
      setDashboardError(t("teacherDashboard.loadDashboardError"));
      setTestCounts({});
    } finally {
      setDashboardLoading(false);
    }
  }, [
    userId,
    isTeacher,
    setCourses,
    setStudentCards,
    setLessonCounts,
    setTestCounts,
    setDashboardLoading,
    setDashboardError,
  ]);

  const retryDashboardData = useCallback(() => {
    void refreshAll();
    dispatchDataUpdate("teacher-dashboard-retry");
  }, [refreshAll]);

  const refreshChatUnread = useCallback(async () => {
    if (!userId || !isTeacher) {
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
    } catch {
      setChatUnreadCount(0);
      setStudentsWithFeedbackIds([]);
      setChatThreadIdsByStudentId({});
    }
  }, [
    userId,
    isTeacher,
    setChatUnreadCount,
    setStudentsWithFeedbackIds,
    setChatThreadIdsByStudentId,
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
    Promise.resolve().then(() => void refreshAll());
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
    if (tab !== 4) return;
    syncStudyNotes();
    const unsubscribe = subscribeAppDataUpdates(() => {
      syncStudyNotes();
    });
    return () => {
      unsubscribe();
    };
  }, [tab, syncStudyNotes]);

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

  useEffect(() => {
    if (!userId || !isTeacher) {
      setAvailability([]);
      return;
    }
    let active = true;
    const loadAvailability = async () => {
      setAvailabilityLoading(true);
      setAvailabilityError(null);
      try {
        const slots = await getTeacherAvailability(userId);
        if (!active) return;
        const normalized = slots.map((slot) => ({
          id: slot.id,
          date: slot.date,
          startTime:
            (slot as AvailabilitySlot & { time?: string }).startTime ??
            (slot as AvailabilitySlot & { time?: string }).time ??
            "",
          endTime: slot.endTime ?? "",
        }));
        setAvailability(normalizeFutureSlots(normalized));
      } catch {
        if (!active) return;
        setAvailabilityError(t("teacherDashboard.loadSlotsError"));
      } finally {
        if (active) setAvailabilityLoading(false);
      }
    };
    void loadAvailability();
    const unsubscribe = subscribeAppDataUpdates(() => {
      void loadAvailability();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [
    userId,
    isTeacher,
    setAvailability,
    setAvailabilityLoading,
    setAvailabilityError,
  ]);

  useEffect(() => {
    if (!userId || !isTeacher) {
      setBookings([]);
      return;
    }
    let active = true;
    const loadBookings = async () => {
      setBookingLoading(true);
      setBookingError(null);
      try {
        const [data, students] = await Promise.all([
          getBookings({ teacherId: userId }),
          getUsers("student"),
        ]);
        if (!active) return;
        const studentsById = new Map(students.map((student) => [student.id, student]));
        const normalized = data.map((booking) => {
          const student = studentsById.get(booking.studentId);
          const normalizedBooking: Booking = {
            ...booking,
            lessonKind: booking.lessonKind === "trial" ? "trial" : "regular",
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
        setBookings(normalized);
      } catch {
        if (!active) return;
        setBookingError(t("teacherDashboard.loadBookingsError"));
      } finally {
        if (active) setBookingLoading(false);
      }
    };
    void loadBookings();
    const unsubscribe = subscribeAppDataUpdates(() => {
      void loadBookings();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [
    userId,
    isTeacher,
    setBookings,
    setBookingLoading,
    setBookingError,
  ]);

  return {
    refreshAll,
    retryDashboardData,
    syncStudyNotes,
  };
};
