import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Tabs,
  Tab,
  Button,
  TextField,
  MenuItem,
  IconButton,
  Avatar,
  InputAdornment,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import GroupRoundedIcon from "@mui/icons-material/GroupRounded";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import ForumRoundedIcon from "@mui/icons-material/ForumRounded";
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded";
import AutoStoriesRoundedIcon from "@mui/icons-material/AutoStoriesRounded";
import QuizRoundedIcon from "@mui/icons-material/QuizRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import RemoveRoundedIcon from "@mui/icons-material/RemoveRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ExpandLessRoundedIcon from "@mui/icons-material/ExpandLessRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import AttachFileRoundedIcon from "@mui/icons-material/AttachFileRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import TipsAndUpdatesRoundedIcon from "@mui/icons-material/TipsAndUpdatesRounded";

import { StudentCard } from "@/entities/student/ui/StudentCard";
import { CourseCard } from "@/entities/course/ui/CourseCard";
import { CourseWithLessonsEditor } from "@/features/course-editor/ui/CourseWithLessonsEditor";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { TeacherProfile } from "@/features/teacher-profile/ui/TeacherProfile";
import { NewsFeedPanel } from "@/features/news-feed/ui/NewsFeedPanel";
import { ListPagination } from "@/shared/ui/ListPagination";
import { StudyCabinetPanel } from "@/shared/ui/StudyCabinetPanel";
import { AxiomAssistant } from "@/features/assistant/ui/AxiomAssistant";
import { RecoverableErrorAlert } from "@/shared/ui/RecoverableErrorAlert";
import { ListSkeleton } from "@/shared/ui/loading";

import { useAuth } from "@/features/auth/model/AuthContext";
import { getUsers } from "@/features/auth/model/api";
import { useNavigate, useSearchParams } from "react-router-dom";
import ChatPage from "@/pages/chat/ChatPage";
import { getTeacherChatThreads } from "@/features/chat/model/api";

import {
  getCourses,
  deleteCourse,
  updateCourse,
} from "@/entities/course/model/storage";
import {
  deletePurchasesByCourse,
  getPurchases,
} from "@/entities/purchase/model/storage";
import { getLessons, deleteLessonsByCourse } from "@/entities/lesson/model/storage";
import {
  deleteCourseContentItems,
  getCourseContentItems,
} from "@/features/assessments/model/storage";
import { getWorkbookDrafts } from "@/features/workbook/model/api";
import { deleteProgressByCourse } from "@/entities/progress/model/storage";
import {
  getTeacherAvailability,
  saveTeacherAvailability,
} from "@/features/teacher-availability/api";
import type { AvailabilitySlot } from "@/features/teacher-availability/model/types";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import type { Booking } from "@/entities/booking/model/types";
import {
  getBookings,
  updateBooking,
  deleteBooking,
} from "@/entities/booking/model/storage";
import {
  buildCalendarDays,
  normalizeFutureSlots,
} from "@/features/booking/lib/schedule";
import { fileToDataUrl } from "@/shared/lib/files";
import { generateId } from "@/shared/lib/id";
import { formatRuPhoneDisplay } from "@/shared/lib/phone";
import { getBookingEndTimestamp, getBookingStartTimestamp } from "@/shared/lib/time";
import { dispatchDataUpdate } from "@/shared/lib/dataUpdateBus";
import { subscribeAppDataUpdates } from "@/shared/lib/subscribeAppDataUpdates";
import { t } from "@/shared/i18n";
import { createNewsPost } from "@/entities/news/model/storage";
import {
  buildStudyCabinetWeekActivity,
  countDueSoonStudyCabinetReminders,
  createStudyCabinetNote,
  deleteStudyCabinetNote,
  getStudyCabinetNotes,
  recordStudyCabinetActivity,
  updateStudyCabinetNote,
  type StudyCabinetNote,
} from "@/shared/lib/studyCabinet";

import type { Course } from "@/entities/course/model/types";

type StudentCardData = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  photo?: string;
};

const TAB_KEYS = [
  "profile",
  "students",
  "courses",
  "booking",
  "study",
  "chat",
  "stats",
] as const;

const SLOT_TIME_OPTIONS = Array.from({ length: 48 }).map((_, index) => {
  const totalMinutes = index * 30;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
});

const getTabFromQuery = (value: string | null) => {
  const index = TAB_KEYS.findIndex((tabKey) => tabKey === value);
  return index >= 0 ? index : 0;
};

export default function TeacherDashboard() {
  const { user } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tab, setTab] = useState(() =>
    getTabFromQuery(searchParams.get("tab"))
  );
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [isEditorOpen, setEditorOpen] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [studentCards, setStudentCards] = useState<StudentCardData[]>([]);
  const [lessonCounts, setLessonCounts] = useState<Record<string, number>>({});
  const [testCounts, setTestCounts] = useState<Record<string, number>>({});
  const [studentQuery, setStudentQuery] = useState("");
  const [studentFeedbackFilter, setStudentFeedbackFilter] = useState<
    "all" | "with_feedback" | "without_feedback"
  >("with_feedback");
  const [courseQuery, setCourseQuery] = useState("");
  const [courseStatusFilter, setCourseStatusFilter] = useState<"published" | "draft">(
    "published"
  );
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [slotDate, setSlotDate] = useState("");
  const [slotStart, setSlotStart] = useState("");
  const [slotEnd, setSlotEnd] = useState("");
  const [slotError, setSlotError] = useState<string | null>(null);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSavingId, setBookingSavingId] = useState<string | null>(null);
  const [bookingDeletingId, setBookingDeletingId] = useState<string | null>(null);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [studentsPage, setStudentsPage] = useState(1);
  const [coursesPage, setCoursesPage] = useState(1);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [studyDrafts, setStudyDrafts] = useState<
    Awaited<ReturnType<typeof getWorkbookDrafts>>["items"]
  >([]);
  const [studyDraftsLoading, setStudyDraftsLoading] = useState(false);
  const [studyNotes, setStudyNotes] = useState<StudyCabinetNote[]>([]);
  const [studyActivityVersion, setStudyActivityVersion] = useState(0);
  const [studyReminderCount, setStudyReminderCount] = useState(0);
  const [studentsWithFeedbackIds, setStudentsWithFeedbackIds] = useState<
    string[]
  >([]);
  const [chatThreadIdsByStudentId, setChatThreadIdsByStudentId] = useState<
    Record<string, string>
  >({});
  const [slotsDateFilter, setSlotsDateFilter] = useState("");
  const [expandedSlotsDate, setExpandedSlotsDate] = useState<string | null>(
    null
  );
  const [scheduledPage, setScheduledPage] = useState(1);
  const [completedPage, setCompletedPage] = useState(1);
  const [confirm, setConfirm] = useState<{
    title: string;
    description?: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);
  const slotDateInputRef = useRef<HTMLInputElement | null>(null);

  const userId = user?.id;
  const isTeacher = user?.role === "teacher";

  useEffect(() => {
    const nextTab = getTabFromQuery(searchParams.get("tab"));
    setTab((prev) => (prev === nextTab ? prev : nextTab));
  }, [searchParams]);

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

      const teacherCourses = allCourses.filter((c) => c.teacherId === userId);
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

      const cards: StudentCardData[] = studentUsers.map((student) => ({
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
  }, [userId, isTeacher]);

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
  }, [userId, isTeacher]);

  const syncStudyNotes = useCallback(() => {
    if (!userId || !isTeacher) {
      setStudyNotes([]);
      setStudyReminderCount(0);
      return;
    }
    const notes = getStudyCabinetNotes("teacher", userId);
    setStudyNotes(notes);
    setStudyReminderCount(countDueSoonStudyCabinetReminders(notes, 90));
  }, [userId, isTeacher]);

  const loadStudyDrafts = useCallback(async () => {
    if (!userId || !isTeacher) {
      setStudyDrafts([]);
      return;
    }
    try {
      setStudyDraftsLoading(true);
      const drafts = await getWorkbookDrafts("all");
      setStudyDrafts(drafts.items);
    } catch {
      setStudyDrafts([]);
    } finally {
      setStudyDraftsLoading(false);
    }
  }, [userId, isTeacher]);

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
    void loadStudyDrafts();
    const unsubscribe = subscribeAppDataUpdates(() => {
      syncStudyNotes();
      void loadStudyDrafts();
    });
    return () => {
      unsubscribe();
    };
  }, [tab, syncStudyNotes, loadStudyDrafts]);

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
  }, [tab, userId, isTeacher]);

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
          startTime: (slot as AvailabilitySlot & { time?: string }).startTime ?? (slot as AvailabilitySlot & { time?: string }).time ?? "",
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
  }, [userId, isTeacher]);

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
        const studentsById = new Map(
          students.map((student) => [student.id, student])
        );
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
  }, [userId, isTeacher]);

  const getBookingStart = (booking: Booking) => getBookingStartTimestamp(booking);
  const getBookingEnd = (booking: Booking) => getBookingEndTimestamp(booking);

  const scheduledBookings = useMemo(() => {
    const now = Date.now();
    return [...bookings]
      .filter((booking) => getBookingEnd(booking) >= now)
      .sort((a, b) => getBookingStart(a) - getBookingStart(b));
  }, [bookings]);

  const completedBookings = useMemo(() => {
    const now = Date.now();
    return [...bookings]
      .filter((booking) => getBookingEnd(booking) < now)
      .sort((a, b) => getBookingEnd(b) - getBookingEnd(a));
  }, [bookings]);

  const upcomingReminder = useMemo(() => {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    return scheduledBookings.find((booking) => {
      const start = getBookingStart(booking);
      return start > now && start - now <= oneDay;
    }) ?? null;
  }, [scheduledBookings]);

  const teacherStudyActivityDays = useMemo(() => {
    const recalcSeed = studyActivityVersion;
    void recalcSeed;
    if (!userId) return [];
    return buildStudyCabinetWeekActivity("teacher", userId);
  }, [userId, studyActivityVersion]);

  const teacherStudyStats = useMemo(() => {
    const weeklyMinutes = teacherStudyActivityDays.reduce(
      (sum, day) => sum + day.minutes,
      0
    );
    const activeClassSessions = studyDrafts.filter(
      (draft) => draft.kind === "CLASS" && draft.statusForCard !== "ended"
    ).length;
    const completedClassSessions = new Set(
      studyDrafts
        .filter((draft) => draft.kind === "CLASS" && draft.statusForCard === "ended")
        .map((draft) => draft.sessionId)
    ).size;
    const notesWithReminder = studyNotes.filter(
      (note) => note.remind && !note.done
    ).length;

    return [
      {
        id: "weekly-minutes",
        label: "Минут в кабинете",
        value: weeklyMinutes,
        accent: true,
        icon: <AccessTimeRoundedIcon fontSize="small" />,
      },
      {
        id: "completed-individual-bookings",
        label: "Проведено индивидуальных",
        value: completedBookings.length,
        icon: <EventAvailableRoundedIcon fontSize="small" />,
      },
      {
        id: "completed-class-bookings",
        label: "Проведено коллективных на доске",
        value: completedClassSessions,
        icon: <GroupsRoundedIcon fontSize="small" />,
      },
      {
        id: "class-sessions-active",
        label: "Активные коллективные",
        value: activeClassSessions,
        icon: <AutoStoriesRoundedIcon fontSize="small" />,
      },
      {
        id: "notes-reminders",
        label: "Заметок с напоминанием",
        value: notesWithReminder,
        icon: <TipsAndUpdatesRoundedIcon fontSize="small" />,
      },
    ].filter((entry) => entry.value > 0);
  }, [teacherStudyActivityDays, studyDrafts, studyNotes, completedBookings.length]);

  const teacherStudyCalendarEvents = useMemo(() => {
    const now = Date.now();
    const events: Array<{
      id: string;
      title: string;
      description?: string;
      startAt: string;
      endAt?: string;
      color?: string;
      badge?: string;
      highlighted?: boolean;
      noteId?: string;
    }> = [];

    scheduledBookings.forEach((booking) => {
      const start = getBookingStart(booking);
      const end = getBookingEnd(booking);
      if (!Number.isFinite(start) || start <= now) return;
      events.push({
        id: `teacher-booking-${booking.id}`,
        title: `Занятие со студентом ${booking.studentName}`,
        description:
          booking.lessonKind === "trial" ? "Пробное занятие" : "Индивидуальный урок",
        startAt: new Date(start).toISOString(),
        endAt: Number.isFinite(end) ? new Date(end).toISOString() : undefined,
        badge: "Индивидуальное",
      });
    });

    studyNotes
      .filter((note) => note.remind && !note.done && note.dueAt)
      .forEach((note) => {
        const dueAt = note.dueAt ? new Date(note.dueAt).getTime() : now;
        if (!Number.isFinite(dueAt)) return;
        events.push({
          id: `teacher-note-${note.id}`,
          title: note.title,
          startAt: new Date(dueAt).toISOString(),
          endAt: note.endAt
            ? new Date(note.endAt).toISOString()
            : new Date(dueAt + 30 * 60 * 1000).toISOString(),
          description: note.body || undefined,
          color: note.color,
          highlighted: dueAt - now <= 90 * 60 * 1000,
          noteId: note.id,
        });
      });

    return events.sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    );
  }, [scheduledBookings, studyNotes]);

  const teacherStudyGeneralReminders = useMemo(() => {
    const now = Date.now();
    const reminders: Array<{
      id: string;
      title: string;
      subtitle?: string;
      badge?: string;
      highlighted?: boolean;
      source: "system" | "manual";
      sortKey: number;
    }> = [];

    studyDrafts
      .filter((draft) => draft.kind === "CLASS")
      .slice(0, 4)
      .forEach((draft) => {
        const updatedAt = new Date(draft.updatedAt).getTime();
        reminders.push({
          id: `teacher-class-${draft.sessionId}`,
          title: draft.title || "Коллективный урок",
          subtitle: `Последняя активность: ${new Date(draft.updatedAt).toLocaleString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}`,
          badge: "Коллектив",
          source: "system",
          sortKey: Number.isFinite(updatedAt) ? updatedAt : now,
        });
      });

    studyNotes
      .filter((note) => note.remind && !note.done && note.dueAt)
      .forEach((note) => {
        const dueAt = note.dueAt ? new Date(note.dueAt).getTime() : now;
        if (!Number.isFinite(dueAt)) return;
        reminders.push({
          id: `teacher-reminder-${note.id}`,
          title: note.title,
          subtitle: note.body || undefined,
          badge: "Напоминание",
          highlighted: dueAt - now <= 90 * 60 * 1000,
          source: "manual",
          sortKey: dueAt,
        });
      });

    return reminders
      .sort((a, b) => {
        if (a.source !== b.source) {
          return a.source === "system" ? -1 : 1;
        }
        if (a.source === "manual") {
          return a.sortKey - b.sortKey;
        }
        return b.sortKey - a.sortKey;
      })
      .map((item) => {
        const sortKey = item.sortKey;
        void sortKey;
        const source = item.source;
        void source;
        return {
          id: item.id,
          title: item.title,
          subtitle: item.subtitle,
          badge: item.badge,
          highlighted: item.highlighted,
        };
      });
  }, [studyDrafts, studyNotes]);

  const studyReminderHint = useMemo(() => {
    if (studyReminderCount <= 0) return null;
    return studyReminderCount === 1
      ? "Есть 1 напоминание в ближайшее время."
      : `Есть ${studyReminderCount} напоминания в ближайшее время.`;
  }, [studyReminderCount]);

  const availabilityDateGroups = useMemo(() => {
    const visibleDates = new Set(buildCalendarDays(21).map((day) => day.value));
    const groups = availability.reduce<Record<string, AvailabilitySlot[]>>(
      (acc, slot) => {
        if (!visibleDates.has(slot.date)) {
          return acc;
        }
        if (!acc[slot.date]) {
          acc[slot.date] = [];
        }
        acc[slot.date].push(slot);
        return acc;
      },
      {}
    );

    return Object.entries(groups)
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([date, slots]) => ({
        date,
        slots,
      }));
  }, [availability]);

  const studentsPageSize = isMobile ? 4 : 6;
  const coursesPageSize = isMobile ? 2 : 6;
  const bookingsPageSize = isMobile ? 2 : 4;
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const maxSlotDateIso = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    now.setDate(now.getDate() + 20);
    return now.toISOString().slice(0, 10);
  }, []);
  const slotDateDisplayValue = useMemo(() => {
    if (!slotDate) return "";
    const [year, month, day] = slotDate.split("-");
    if (!year || !month || !day) return slotDate;
    return `${day}.${month}.${year}`;
  }, [slotDate]);

  const filteredStudents = useMemo(() => {
    const query = studentQuery.trim().toLowerCase();
    const feedbackSet = new Set(studentsWithFeedbackIds);
    return studentCards.filter((student) => {
      const byQuery =
        student.name.toLowerCase().includes(query) ||
        student.email.toLowerCase().includes(query);
      const hasFeedback = feedbackSet.has(student.id);
      const byFeedback =
        studentFeedbackFilter === "all" ||
        (studentFeedbackFilter === "with_feedback"
          ? hasFeedback
          : !hasFeedback);
      return byQuery && byFeedback;
    });
  }, [studentCards, studentQuery, studentsWithFeedbackIds, studentFeedbackFilter]);

  const filteredCourses = useMemo(
    () =>
      courses.filter((course) => {
        const byStatus = course.status === courseStatusFilter;
        const byQuery = course.title
          .toLowerCase()
          .includes(courseQuery.trim().toLowerCase());
        return byStatus && byQuery;
      }),
    [courses, courseQuery, courseStatusFilter]
  );

  const studentsTotalPages = Math.max(
    1,
    Math.ceil(filteredStudents.length / studentsPageSize)
  );
  const safeStudentsPage = Math.min(studentsPage, studentsTotalPages);
  const coursesTotalPages = Math.max(
    1,
    Math.ceil(filteredCourses.length / coursesPageSize)
  );
  const safeCoursesPage = Math.min(coursesPage, coursesTotalPages);
  const scheduledTotalPages = Math.max(
    1,
    Math.ceil(scheduledBookings.length / bookingsPageSize)
  );
  const safeScheduledPage = Math.min(scheduledPage, scheduledTotalPages);
  const completedTotalPages = Math.max(
    1,
    Math.ceil(completedBookings.length / bookingsPageSize)
  );
  const safeCompletedPage = Math.min(completedPage, completedTotalPages);

  const pagedStudents = useMemo(() => {
    const start = (safeStudentsPage - 1) * studentsPageSize;
    return filteredStudents.slice(start, start + studentsPageSize);
  }, [filteredStudents, safeStudentsPage, studentsPageSize]);

  const pagedCourses = useMemo(() => {
    const start = (safeCoursesPage - 1) * coursesPageSize;
    return filteredCourses.slice(start, start + coursesPageSize);
  }, [filteredCourses, safeCoursesPage, coursesPageSize]);

  const selectedAvailabilityDate = useMemo(() => {
    if (
      slotsDateFilter &&
      availabilityDateGroups.some((group) => group.date === slotsDateFilter)
    ) {
      return slotsDateFilter;
    }
    return availabilityDateGroups[0]?.date ?? "";
  }, [availabilityDateGroups, slotsDateFilter]);

  const currentAvailabilityGroup = useMemo(
    () =>
      availabilityDateGroups.find((group) => group.date === selectedAvailabilityDate) ??
      null,
    [availabilityDateGroups, selectedAvailabilityDate]
  );

  const visibleAvailabilitySlots = useMemo(() => {
    if (!currentAvailabilityGroup) return [];
    const dateSlots = currentAvailabilityGroup.slots;
    if (dateSlots.length <= 1) return dateSlots;
    if (expandedSlotsDate === currentAvailabilityGroup.date) {
      return [...dateSlots].reverse();
    }
    return [dateSlots[dateSlots.length - 1]];
  }, [currentAvailabilityGroup, expandedSlotsDate]);

  const pagedScheduledBookings = useMemo(() => {
    const start = (safeScheduledPage - 1) * bookingsPageSize;
    return scheduledBookings.slice(start, start + bookingsPageSize);
  }, [scheduledBookings, safeScheduledPage, bookingsPageSize]);

  const pagedCompletedBookings = useMemo(() => {
    const start = (safeCompletedPage - 1) * bookingsPageSize;
    return completedBookings.slice(start, start + bookingsPageSize);
  }, [completedBookings, safeCompletedPage, bookingsPageSize]);

  const formatReminderDate = (booking: Booking) => {
    const date = new Date(`${booking.date}T${booking.startTime}`);
    return date.toLocaleString("ru-RU", {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleTeacherCreateNote = useCallback(
    (payload: {
      title: string;
      body: string;
      dueAt: string | null;
      endAt: string | null;
      remind: boolean;
      color: string;
    }) => {
      if (!userId || !isTeacher) return;
      createStudyCabinetNote({
        role: "teacher",
        userId,
        title: payload.title,
        body: payload.body,
        dueAt: payload.dueAt,
        endAt: payload.endAt,
        remind: payload.remind,
        color: payload.color,
      });
      syncStudyNotes();
    },
    [userId, isTeacher, syncStudyNotes]
  );

  const handleTeacherUpdateNote = useCallback(
    (payload: {
      noteId: string;
      title: string;
      body: string;
      dueAt: string | null;
      endAt: string | null;
      remind: boolean;
      color: string;
    }) => {
      if (!userId || !isTeacher) return;
      updateStudyCabinetNote({
        role: "teacher",
        userId,
        noteId: payload.noteId,
        title: payload.title,
        body: payload.body,
        dueAt: payload.dueAt,
        endAt: payload.endAt,
        remind: payload.remind,
        color: payload.color,
      });
      syncStudyNotes();
    },
    [userId, isTeacher, syncStudyNotes]
  );

  const handleTeacherDeleteNote = useCallback(
    (noteId: string) => {
      if (!userId || !isTeacher) return;
      deleteStudyCabinetNote({ role: "teacher", userId, noteId });
      syncStudyNotes();
    },
    [userId, isTeacher, syncStudyNotes]
  );

  const deleteCourseFull = async (courseId: string) => {
    await deleteCourse(courseId);
    await deleteLessonsByCourse(courseId);
    await deleteCourseContentItems(courseId);
    await deletePurchasesByCourse(courseId);
    await deleteProgressByCourse(courseId);
    await refreshAll();
  };

  const publishCourse = async (course: Course) => {
    const wasDraft = course.status === "draft";
    const publishedCourse = await updateCourse({ ...course, status: "published" });
    if (wasDraft && userId) {
      try {
        const purchases = await getPurchases(undefined, { forceFresh: true });
        const targetUserIds = Array.from(
          new Set(
            purchases
              .filter((purchase) => purchase.courseId === course.id)
              .map((purchase) => purchase.userId)
              .filter((value): value is string => Boolean(value))
          )
        );
        if (targetUserIds.length > 0) {
          const safeTitle = publishedCourse.title.trim() || "Без названия";
          await createNewsPost({
            authorId: userId,
            title: `В курсе «${safeTitle}» появились новинки`,
            content:
              "Добавлены новые уроки и/или тесты. Откройте курс, чтобы сразу перейти к обновлённым материалам.",
            tone: "course_update",
            highlighted: true,
            visibility: "course_students",
            targetCourseId: publishedCourse.id,
            targetUserIds,
          });
        }
      } catch {
        // Публикация курса не должна блокироваться ошибками в канале объявлений.
      }
    }
    await refreshAll();
  };

  const saveAvailability = async (next: AvailabilitySlot[]) => {
    if (!userId || availabilityLoading) return;
    setAvailability(next);
    setAvailabilityLoading(true);
    try {
      await saveTeacherAvailability(userId, next);
    } catch {
      setSlotError(t("teacherDashboard.saveSlotError"));
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const addSlot = async () => {
    if (!slotDate || !slotStart || !slotEnd || !userId || availabilityLoading) return;
    setSlotError(null);
    const toMinutes = (value: string) => {
      const [h, m] = value.split(":").map(Number);
      if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
      return h * 60 + m;
    };
    const startMinutes = toMinutes(slotStart);
    const endMinutes = toMinutes(slotEnd);
    if (endMinutes <= startMinutes) {
      setSlotError(t("teacherDashboard.slotEndAfterStartError"));
      return;
    }
    if (slotDate > maxSlotDateIso) {
      setSlotError(t("teacherDashboard.slotRangeError"));
      return;
    }
    const slotStartTimestamp = new Date(`${slotDate}T${slotStart}`).getTime();
    if (!Number.isFinite(slotStartTimestamp) || slotStartTimestamp <= Date.now()) {
      setSlotError(t("teacherDashboard.slotPastError"));
      return;
    }
    const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
      aStart < bEnd && bStart < aEnd;

    const hasConflict = availability.some((slot) => {
      if (slot.date !== slotDate) return false;
      return overlaps(startMinutes, endMinutes, toMinutes(slot.startTime), toMinutes(slot.endTime));
    });

    const hasBookingConflict = bookings.some((booking) => {
      if (booking.date !== slotDate) return false;
      const bookingEndTime = getBookingEnd(booking);
      if (!Number.isFinite(bookingEndTime) || bookingEndTime < Date.now()) {
        return false;
      }
      return overlaps(startMinutes, endMinutes, toMinutes(booking.startTime), toMinutes(booking.endTime));
    });

    if (hasConflict || hasBookingConflict) {
      setSlotError(t("teacherDashboard.slotOverlapError"));
      return;
    }
    const next: AvailabilitySlot[] = [
      ...availability,
      {
        id: generateId(),
        date: slotDate,
        startTime: slotStart,
        endTime: slotEnd,
      },
    ];
    const nextDates = Array.from(new Set(next.map((slot) => slot.date))).sort(
      (a, b) => a.localeCompare(b)
    );
    if (nextDates.includes(slotDate)) {
      setSlotsDateFilter(slotDate);
    }
    setExpandedSlotsDate(null);
    setSlotDate("");
    setSlotStart("");
    setSlotEnd("");
    await saveAvailability(next);
  };

  const removeSlot = async (id: string) => {
    setExpandedSlotsDate(null);
    await saveAvailability(availability.filter((slot) => slot.id !== id));
  };

  const openSlotDatePicker = () => {
    const input = slotDateInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.click();
  };

  const updateBookingDraft = (
    bookingId: string,
    patch: Partial<Pick<Booking, "meetingUrl" | "materials">>
  ) => {
    setBookings((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, ...patch } : b))
    );
  };

  const saveBookingUpdate = async (bookingId: string) => {
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) return;
    setBookingSavingId(bookingId);
    try {
      const updated = await updateBooking(bookingId, {
        meetingUrl: booking.meetingUrl,
        materials: booking.materials,
      });
      setBookings((prev) =>
        prev.map((b) =>
          b.id === bookingId
            ? {
                ...updated,
                studentName: b.studentName,
                studentEmail: b.studentEmail,
                studentPhone: b.studentPhone,
                studentPhoto: b.studentPhoto,
              }
            : b
        )
      );
    } catch {
      setBookingError(t("teacherDashboard.saveBookingError"));
    } finally {
      setBookingSavingId(null);
    }
  };

  const setBookingPaymentStatus = async (
    bookingId: string,
    paymentStatus: "paid" | "unpaid"
  ) => {
    const booking = bookings.find((item) => item.id === bookingId);
    if (!booking || booking.paymentStatus === paymentStatus) return;
    setBookingSavingId(bookingId);
    try {
      const updated = await updateBooking(bookingId, { paymentStatus });
      setBookings((prev) =>
        prev.map((item) =>
          item.id === bookingId
            ? {
                ...updated,
                studentName: item.studentName,
                studentEmail: item.studentEmail,
                studentPhone: item.studentPhone,
                studentPhoto: item.studentPhoto,
              }
            : item
        )
      );
    } catch {
      setBookingError(t("teacherDashboard.updatePaymentStatusError"));
    } finally {
      setBookingSavingId(null);
    }
  };

  const handleSaveBooking = async (bookingId: string) => {
    await saveBookingUpdate(bookingId);
    setEditingBookingId(null);
  };

  const handleDeleteBooking = async (bookingId: string) => {
    setBookingDeletingId(bookingId);
    try {
      await deleteBooking(bookingId);
      setBookings((prev) => prev.filter((b) => b.id !== bookingId));
    } catch {
      setBookingError(t("teacherDashboard.deleteBookingError"));
    } finally {
      setBookingDeletingId(null);
      setEditingBookingId((prev) => (prev === bookingId ? null : prev));
    }
  };

  const addBookingMaterials = async (
    bookingId: string,
    files: FileList | null
  ) => {
    if (!files || files.length === 0) return;
    const accepted = Array.from(files).filter((file) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      return (
        file.type.startsWith("video/") ||
        ext === "pdf" ||
        ext === "doc" ||
        ext === "docx"
      );
    });
    if (accepted.length === 0) return;
    const items = await Promise.all(
      accepted.map(async (file) => {
        const ext = file.name.split(".").pop()?.toLowerCase();
        const type: "pdf" | "doc" | "video" = file.type.startsWith("video/")
          ? "video"
          : ext === "pdf"
            ? "pdf"
            : "doc";
        return {
          id: generateId(),
          name: file.name,
          type,
          url: await fileToDataUrl(file),
        };
      })
    );
    updateBookingDraft(bookingId, {
      materials: [...(bookings.find((b) => b.id === bookingId)?.materials ?? []), ...items],
    });
  };

  const removeBookingMaterial = (bookingId: string, materialId: string) => {
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) return;
    updateBookingDraft(bookingId, {
      materials: booking.materials.filter((m) => m.id !== materialId),
    });
  };

  const renderBookingCard = (
    booking: Booking,
    status: "scheduled" | "completed"
  ) => {
    const studentLive = studentCards.find((student) => student.id === booking.studentId);
    const studentName = studentLive?.name ?? booking.studentName;
    const studentEmail = studentLive?.email ?? booking.studentEmail;
    const studentPhone = studentLive?.phone ?? booking.studentPhone;
    const formattedStudentPhone = formatRuPhoneDisplay(studentPhone);
    const studentPhoto = studentLive?.photo ?? booking.studentPhoto;
    const isEditing = editingBookingId === booking.id;
    const statusLabel =
      status === "scheduled"
        ? t("teacherDashboard.statusScheduled")
        : t("teacherDashboard.statusCompleted");
    const isTrial = booking.lessonKind === "trial";
    const isPaid = booking.paymentStatus === "paid";
    return (
      <div key={booking.id} className="teacher-dashboard__booking-card">
        <div className="teacher-dashboard__booking-head">
          <Avatar
            src={studentPhoto}
            className="teacher-dashboard__booking-avatar"
          >
            {studentName?.[0]}
          </Avatar>
          <div className="teacher-dashboard__booking-info">
            <h4>{studentName}</h4>
            <span>{studentEmail}</span>
            {formattedStudentPhone && <span>{formattedStudentPhone}</span>}
          </div>
          <div className="teacher-dashboard__booking-meta">
            <strong className="teacher-dashboard__booking-date">{booking.date}</strong>
            <span className="teacher-dashboard__booking-time">
              {booking.startTime} – {booking.endTime}
            </span>
          </div>
          <div className="teacher-dashboard__booking-tags">
            <span
              className={`teacher-dashboard__status teacher-dashboard__status--${status} ui-status-chip ${
                status === "scheduled"
                  ? "ui-status-chip--scheduled"
                  : "ui-status-chip--completed"
              }`}
            >
              {statusLabel}
            </span>
            {isTrial && (
              <span className="teacher-dashboard__booking-kind ui-status-chip ui-status-chip--trial">
                {t("teacherDashboard.trialLesson")}
              </span>
            )}
            <button
              type="button"
              className={`teacher-dashboard__payment-status ${
                isPaid
                  ? "teacher-dashboard__payment-status--paid"
                  : "teacher-dashboard__payment-status--unpaid"
              } ui-status-chip ${
                isPaid ? "ui-status-chip--paid" : "ui-status-chip--unpaid"
              }`}
              onClick={() =>
                void setBookingPaymentStatus(booking.id, isPaid ? "unpaid" : "paid")
              }
              disabled={bookingSavingId === booking.id}
            >
              {isPaid
                ? t("teacherDashboard.paymentStatusPaid")
                : t("teacherDashboard.paymentStatusUnpaid")}
            </button>
          </div>
          <div className="teacher-dashboard__booking-actions">
            {!isEditing ? (
              <>
                <IconButton
                  className="teacher-dashboard__icon-btn"
                  onClick={() => setEditingBookingId(booking.id)}
                  aria-label={t("teacherDashboard.editBookingAria")}
                >
                  <EditRoundedIcon fontSize="small" />
                </IconButton>
                {status === "scheduled" && (
                  <IconButton
                    className="teacher-dashboard__icon-btn"
                    onClick={() =>
                      setConfirm({
                        title: t("teacherDashboard.cancelLessonTitle"),
                        description: t("teacherDashboard.cancelLessonDescription"),
                        danger: true,
                        onConfirm: () => {
                          void handleDeleteBooking(booking.id);
                          setConfirm(null);
                        },
                      })
                    }
                    aria-label={t("teacherDashboard.deleteBookingAria")}
                    disabled={bookingDeletingId === booking.id}
                  >
                    <DeleteOutlineRoundedIcon fontSize="small" />
                  </IconButton>
                )}
              </>
            ) : (
              <IconButton
                className="teacher-dashboard__icon-btn"
                onClick={() => void handleSaveBooking(booking.id)}
                aria-label={t("teacherDashboard.saveBookingAria")}
                disabled={bookingSavingId === booking.id}
              >
                <SaveRoundedIcon fontSize="small" />
              </IconButton>
            )}
          </div>
        </div>

        {isEditing ? (
          <TextField
            label={t("common.meetingLinkLabel")}
            value={booking.meetingUrl ?? ""}
            onChange={(e) =>
              updateBookingDraft(booking.id, {
                meetingUrl: e.target.value,
              })
            }
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
        ) : (
          <div className="teacher-dashboard__booking-link">
            <LinkRoundedIcon fontSize="small" />
            {booking.meetingUrl ? (
              <a href={booking.meetingUrl} target="_blank" rel="noreferrer">
                {t("common.openMeetingLink")}
              </a>
            ) : (
              <span>{t("common.noMeetingLink")}</span>
            )}
          </div>
        )}

        <div className="teacher-dashboard__booking-materials">
          <div className="teacher-dashboard__materials-list">
            {(booking.materials ?? []).map((m) => (
              <div key={m.id} className="teacher-dashboard__material-chip">
                <a href={m.url} download={m.name}>
                  {m.name}
                </a>
                {isEditing && (
                  <IconButton
                    className="teacher-dashboard__icon-btn"
                    onClick={() => removeBookingMaterial(booking.id, m.id)}
                    aria-label={t("teacherDashboard.deleteMaterialAria")}
                  >
                    <DeleteOutlineRoundedIcon fontSize="small" />
                  </IconButton>
                )}
              </div>
            ))}
          </div>
          {isEditing && (
            <IconButton
              component="label"
              className="teacher-dashboard__icon-btn"
              aria-label={t("teacherDashboard.addMaterialsAria")}
            >
              <AttachFileRoundedIcon fontSize="small" />
              <input
                type="file"
                hidden
                multiple
                accept=".pdf,.doc,.docx,video/*"
                onChange={(e) =>
                  void addBookingMaterials(booking.id, e.target.files)
                }
              />
            </IconButton>
          )}
        </div>
      </div>
    );
  };

  if (!user || !isTeacher) return null;

  return (
    <div className="teacher-dashboard">
      {upcomingReminder && (
        <div className="teacher-dashboard__reminder">
          {t("teacherDashboard.reminder", {
            date: formatReminderDate(upcomingReminder),
          })}
        </div>
      )}
      <div className="teacher-dashboard__header">
        <h1 className="teacher-dashboard__title">
          <SchoolRoundedIcon />
          <span>{t("teacherDashboard.title")}</span>
        </h1>
      </div>

      <Tabs
        value={tab}
        onChange={(_, v) => {
          setTab(v);
          setSearchParams({ tab: TAB_KEYS[v] });
        }}
        className="teacher-dashboard__tabs"
      >
        <Tab
          label={
            <span className="teacher-dashboard__tab-label">
              {t("teacherDashboard.tabProfile")}
            </span>
          }
          icon={<PersonOutlineRoundedIcon />}
          iconPosition="start"
        />
        <Tab
          label={
            <span className="teacher-dashboard__tab-label">
              {t("teacherDashboard.tabStudents")}
            </span>
          }
          icon={<GroupRoundedIcon />}
          iconPosition="start"
        />
        <Tab
          label={
            <span className="teacher-dashboard__tab-label">
              {t("teacherDashboard.tabCourses")}
            </span>
          }
          icon={<MenuBookRoundedIcon />}
          iconPosition="start"
        />
        <Tab
          label={
            <span className="teacher-dashboard__tab-label">
              {t("teacherDashboard.tabBooking")}
            </span>
          }
          icon={<EventAvailableRoundedIcon />}
          iconPosition="start"
        />
        <Tab
          label={
            <span className="teacher-dashboard__tab-label">
              {t("teacherDashboard.tabStudy")}
            </span>
          }
          icon={
            <Badge
              color="warning"
              variant="dot"
              invisible={studyReminderCount <= 0}
            >
              <AutoStoriesRoundedIcon />
            </Badge>
          }
          iconPosition="start"
        />
        <Tab
          label={<span className="teacher-dashboard__tab-label">Чат</span>}
          icon={
            <Badge
              color="error"
              badgeContent={chatUnreadCount > 99 ? "99+" : chatUnreadCount}
              invisible={chatUnreadCount <= 0}
            >
              <ForumRoundedIcon />
            </Badge>
          }
          iconPosition="start"
        />
        <Tab
          label={
            <span className="teacher-dashboard__tab-label">
              {t("teacherDashboard.tabStats")}
            </span>
          }
          icon={<InsightsRoundedIcon />}
          iconPosition="start"
        />
      </Tabs>
      {/* PROFILE */}
      {tab === 0 && (
        <div className="teacher-dashboard__profile-layout">
          <div className="teacher-dashboard__profile-main">
            <TeacherProfile user={user} />
          </div>
          <div className="teacher-dashboard__profile-news">
            <NewsFeedPanel user={user} />
          </div>
        </div>
      )}
      {/* STUDENTS */}
      {tab === 1 && (
        <div className="teacher-dashboard__section">
          {dashboardError ? (
            <RecoverableErrorAlert
              error={dashboardError}
              onRetry={retryDashboardData}
              retryLabel={t("common.retryLoadData")}
              forceRetry
            />
          ) : null}
          <div className="teacher-dashboard__search">
            <TextField
              placeholder={t("teacherDashboard.searchStudentPlaceholder")}
              value={studentQuery}
              onChange={(e) => {
                setStudentQuery(e.target.value);
                setStudentsPage(1);
              }}
              fullWidth
              inputProps={{
                "aria-label": t("teacherDashboard.searchStudentAria"),
              }}
              InputProps={{
                endAdornment: studentQuery ? (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label={t("teacherDashboard.clearSearchAria")}
                      onClick={() => {
                        setStudentQuery("");
                        setStudentsPage(1);
                      }}
                      edge="end"
                      size="small"
                    >
                      <CloseRoundedIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
            />
          </div>
          <div className="teacher-dashboard__filter-toolbar">
            <button
              type="button"
              className={`teacher-dashboard__filter-button ${
                studentFeedbackFilter === "with_feedback" ? "is-active" : ""
              }`}
              onClick={() => {
                setStudentFeedbackFilter((prev) =>
                  prev === "with_feedback" ? "all" : "with_feedback"
                );
                setStudentsPage(1);
              }}
            >
              С обратной связью
            </button>
            <button
              type="button"
              className={`teacher-dashboard__filter-button ${
                studentFeedbackFilter === "without_feedback" ? "is-active" : ""
              }`}
              onClick={() => {
                setStudentFeedbackFilter((prev) =>
                  prev === "without_feedback" ? "all" : "without_feedback"
                );
                setStudentsPage(1);
              }}
            >
              Без обратной связи
            </button>
          </div>
          <div className="teacher-dashboard__list teacher-dashboard__list--students">
            {dashboardLoading && studentCards.length === 0 ? (
              <ListSkeleton
                className="teacher-dashboard__skeletons"
                count={3}
                itemHeight={120}
              />
            ) : (
              pagedStudents.map((student) => (
                <StudentCard
                  key={student.id}
                  name={student.name}
                  email={student.email}
                  phone={student.phone}
                  photo={student.photo}
                  onViewProfile={() =>
                    navigate(`/teacher/students/${student.id}`)
                  }
                  showChatAction={studentsWithFeedbackIds.includes(student.id)}
                  onOpenChat={() => {
                    const params = new URLSearchParams(searchParams);
                    params.set("tab", TAB_KEYS[5]);
                    const threadId = chatThreadIdsByStudentId[student.id];
                    if (threadId) {
                      params.set("threadId", threadId);
                      params.delete("studentId");
                    } else {
                      params.set("studentId", student.id);
                      params.delete("threadId");
                    }
                    setTab(5);
                    setSearchParams(params);
                  }}
                />
              ))
            )}
          </div>
          {!dashboardLoading && filteredStudents.length > 0 && (
            <ListPagination
              page={safeStudentsPage}
              totalItems={filteredStudents.length}
              pageSize={studentsPageSize}
              onPageChange={setStudentsPage}
            />
          )}
        </div>
      )}

      {/* COURSES */}
      {tab === 2 && (
        <div className="teacher-dashboard__section">
          <div className="teacher-dashboard__section-actions">
            <Button
              variant="contained"
              onClick={() => {
                setEditingCourseId(null);
                setEditorOpen(true);
              }}
            >
              {t("teacherDashboard.createCourse")}
            </Button>
            <Button
              variant="outlined"
              onClick={() => navigate("/teacher/tests")}
              startIcon={<QuizRoundedIcon />}
            >
              База тестов
            </Button>
          </div>
          {dashboardError ? (
            <RecoverableErrorAlert
              error={dashboardError}
              onRetry={retryDashboardData}
              retryLabel={t("common.retryLoadData")}
              forceRetry
            />
          ) : null}
          <div className="teacher-dashboard__search">
            <TextField
              placeholder={t("teacherDashboard.searchCoursePlaceholder")}
              value={courseQuery}
              onChange={(e) => {
                setCourseQuery(e.target.value);
                setCoursesPage(1);
              }}
              fullWidth
              inputProps={{
                "aria-label": t("teacherDashboard.searchCourseAria"),
              }}
              InputProps={{
                endAdornment: courseQuery ? (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label={t("teacherDashboard.clearSearchAria")}
                      onClick={() => {
                        setCourseQuery("");
                        setCoursesPage(1);
                      }}
                      edge="end"
                      size="small"
                    >
                      <CloseRoundedIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
            />
          </div>
          <div className="teacher-dashboard__filter-toolbar">
            <button
              type="button"
              className={`teacher-dashboard__filter-button ${
                courseStatusFilter === "published" ? "is-active" : ""
              }`}
              onClick={() => {
                setCourseStatusFilter("published");
                setCoursesPage(1);
              }}
            >
              Опубликованы
            </button>
            <button
              type="button"
              className={`teacher-dashboard__filter-button ${
                courseStatusFilter === "draft" ? "is-active" : ""
              }`}
              onClick={() => {
                setCourseStatusFilter("draft");
                setCoursesPage(1);
              }}
            >
              Черновики
            </button>
          </div>
          <div className="teacher-dashboard__list teacher-dashboard__list--courses">
            {dashboardLoading && courses.length === 0 ? (
              <ListSkeleton
                className="teacher-dashboard__skeletons"
                count={2}
                itemHeight={180}
              />
            ) : filteredCourses.length === 0 ? (
              <div className="teacher-dashboard__empty">
                {courseStatusFilter === "draft"
                  ? "Черновиков по текущему фильтру нет."
                  : t("teacherDashboard.noCourses")}
              </div>
            ) : (
              pagedCourses.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  lessonsCount={lessonCounts[course.id] ?? 0}
                  testsCount={testCounts[course.id] ?? 0}
                  showStatus
                  statusBelowTitle
                  summaryMode="level"
                  isTeacherView
                  onEdit={() => setEditingCourseId(course.id)}
                  onPublish={() =>
                    setConfirm({
                      title: t("teacherDashboard.publishCourseTitle"),
                      description: t("teacherDashboard.publishCourseDescription"),
                      onConfirm: () => {
                        void publishCourse(course);
                        setConfirm(null);
                      },
                    })
                  }
                  onDelete={() =>
                    setConfirm({
                      title: t("teacherDashboard.deleteCourseTitle"),
                      description: t("teacherDashboard.deleteCourseDescription"),
                      danger: true,
                      onConfirm: () => {
                        void deleteCourseFull(course.id);
                        setConfirm(null);
                      },
                    })
                  }
                />
              ))
            )}
          </div>
          {!dashboardLoading && filteredCourses.length > 0 && (
            <ListPagination
              page={safeCoursesPage}
              totalItems={filteredCourses.length}
              pageSize={coursesPageSize}
              onPageChange={setCoursesPage}
            />
          )}
        </div>
      )}

      {tab === 3 && (
        <div
          className={`teacher-dashboard__sessions ${
            bookingLoading || availabilityLoading || bookingSavingId
              ? "is-loading"
              : ""
          }`}
        >
          <div
            className={`teacher-dashboard__slot-panel ${
              availabilityOpen ? "is-open" : "is-collapsed"
            }`}
          >
            <div className="teacher-dashboard__slot-header">
              <div>
                <h3>{t("teacherDashboard.addSlotTitle")}</h3>
                <p>{t("teacherDashboard.addSlotDescription")}</p>
              </div>
              <div className="teacher-dashboard__slot-actions">
                <IconButton
                  className="teacher-dashboard__icon-btn"
                  onClick={() =>
                    setAvailabilityOpen((prev) => {
                      return !prev;
                    })
                  }
                  aria-label={t("teacherDashboard.toggleSlotFormAria")}
                >
                  {availabilityOpen ? <RemoveRoundedIcon /> : <AddRoundedIcon />}
                </IconButton>
                {availabilityOpen && (
                  <IconButton
                    className="teacher-dashboard__icon-btn"
                    onClick={() => void addSlot()}
                    disabled={
                      !slotDate || !slotStart || !slotEnd
                    }
                    aria-label={t("teacherDashboard.saveSlotAria")}
                  >
                    <SaveRoundedIcon />
                  </IconButton>
                )}
              </div>
            </div>

            {availabilityOpen && (
              <div className="teacher-dashboard__slot-body">
                {slotError && (
                  <Alert severity="warning" onClose={() => setSlotError(null)}>
                    {slotError}
                  </Alert>
                )}
                <div className="teacher-dashboard__availability-form">
                  <div className="teacher-dashboard__slot-date-field">
                    <TextField
                      label={t("teacherDashboard.slotDateLabel")}
                      type="text"
                      value={slotDateDisplayValue}
                      onClick={openSlotDatePicker}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openSlotDatePicker();
                        }
                      }}
                      fullWidth
                      placeholder={t("teacherDashboard.slotDatePlaceholder")}
                      InputLabelProps={{ shrink: true }}
                      InputProps={{ readOnly: true }}
                    />
                    <input
                      ref={slotDateInputRef}
                      className="teacher-dashboard__slot-date-native"
                      type="date"
                      value={slotDate}
                      min={todayIso}
                      max={maxSlotDateIso}
                      onChange={(event) => setSlotDate(event.target.value)}
                      tabIndex={-1}
                      aria-hidden="true"
                    />
                  </div>
                  <TextField
                    label={t("teacherDashboard.slotStartLabel")}
                    select
                    value={slotStart}
                    onChange={(e) => setSlotStart(e.target.value)}
                    fullWidth
                    SelectProps={{ displayEmpty: true }}
                    autoComplete="off"
                    InputLabelProps={{ shrink: true }}
                  >
                    <MenuItem value="">
                      <em>Выберите время</em>
                    </MenuItem>
                    {SLOT_TIME_OPTIONS.map((timeValue) => (
                      <MenuItem key={`slot-start-${timeValue}`} value={timeValue}>
                        {timeValue}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label={t("teacherDashboard.slotEndLabel")}
                    select
                    value={slotEnd}
                    onChange={(e) => setSlotEnd(e.target.value)}
                    fullWidth
                    SelectProps={{ displayEmpty: true }}
                    autoComplete="off"
                    InputLabelProps={{ shrink: true }}
                  >
                    <MenuItem value="">
                      <em>Выберите время</em>
                    </MenuItem>
                    {SLOT_TIME_OPTIONS.map((timeValue) => (
                      <MenuItem key={`slot-end-${timeValue}`} value={timeValue}>
                        {timeValue}
                      </MenuItem>
                    ))}
                  </TextField>
                </div>
              </div>
            )}
          </div>

          <div
            className={`teacher-dashboard__availability teacher-dashboard__availability--free ${
              availabilityDateGroups.length === 0 ? "is-empty" : ""
            }`}
          >
            <div className="teacher-dashboard__availability-header">
              <div>
                <h3>{t("teacherDashboard.freeSlotsTitle")}</h3>
                <p>
                  {currentAvailabilityGroup
                    ? `Дата: ${currentAvailabilityGroup.date}`
                    : t("teacherDashboard.freeSlotsDescription")}
                </p>
              </div>
              {currentAvailabilityGroup &&
                currentAvailabilityGroup.slots.length > 1 && (
                  <button
                    type="button"
                    className="teacher-dashboard__availability-toggle"
                    onClick={() =>
                      setExpandedSlotsDate((prev) =>
                        prev === currentAvailabilityGroup.date
                          ? null
                          : currentAvailabilityGroup.date
                      )
                    }
                  >
                    <span>
                      {expandedSlotsDate === currentAvailabilityGroup.date
                        ? "Свернуть дату"
                        : "Показать все слоты"}
                    </span>
                    {expandedSlotsDate === currentAvailabilityGroup.date ? (
                      <ExpandLessRoundedIcon fontSize="small" />
                    ) : (
                      <ExpandMoreRoundedIcon fontSize="small" />
                    )}
                  </button>
                )}
            </div>
            {availabilityDateGroups.length > 1 && (
              <div className="teacher-dashboard__availability-filters">
                {availabilityDateGroups.map((group) => (
                  <button
                    key={group.date}
                    type="button"
                    className={`teacher-dashboard__availability-filter ${
                      selectedAvailabilityDate === group.date ? "is-active" : ""
                    }`}
                    onClick={() => {
                      setSlotsDateFilter(group.date);
                      setExpandedSlotsDate(null);
                    }}
                  >
                    {new Date(`${group.date}T00:00:00`).toLocaleDateString(
                      "ru-RU",
                      {
                        day: "2-digit",
                        month: "short",
                      }
                    )}
                  </button>
                ))}
              </div>
            )}
            {availabilityError ? (
              <RecoverableErrorAlert
                error={availabilityError}
                onRetry={retryDashboardData}
                retryLabel={t("common.retryLoadData")}
                forceRetry
                onClose={() => setAvailabilityError(null)}
              />
            ) : null}
            {availabilityLoading && availabilityDateGroups.length === 0 ? (
              <ListSkeleton
                className="teacher-dashboard__skeletons"
                count={2}
                itemHeight={96}
              />
            ) : availabilityDateGroups.length === 0 ? (
              <div className="teacher-dashboard__empty teacher-dashboard__empty--compact">
                {t("teacherDashboard.noFreeSlots")}
              </div>
            ) : (
              <div className="teacher-dashboard__availability-list">
                {visibleAvailabilitySlots.map((slot) => (
                  <div key={slot.id} className="teacher-dashboard__slot">
                    <div>
                      <strong>{slot.date}</strong>
                      <span>
                        {slot.startTime} – {slot.endTime}
                      </span>
                    </div>
                    <IconButton onClick={() => void removeSlot(slot.id)}>
                      <DeleteOutlineRoundedIcon fontSize="small" />
                    </IconButton>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="teacher-dashboard__schedule-grid">
            <div className="teacher-dashboard__availability">
              <div className="teacher-dashboard__availability-header">
                <div>
                  <h3>{t("teacherDashboard.scheduledTitle")}</h3>
                  <p>{t("teacherDashboard.scheduledDescription")}</p>
                </div>
              </div>

              {bookingError ? (
                <RecoverableErrorAlert
                  error={bookingError}
                  onRetry={retryDashboardData}
                  retryLabel={t("common.retryLoadData")}
                  forceRetry
                />
              ) : null}
              {bookingLoading && scheduledBookings.length === 0 ? (
                <ListSkeleton
                  className="teacher-dashboard__skeletons"
                  count={2}
                  itemHeight={160}
                />
              ) : scheduledBookings.length === 0 ? (
                <div className="teacher-dashboard__empty">
                  {t("teacherDashboard.noScheduled")}
                </div>
              ) : (
                <div className="teacher-dashboard__booking-list">
                  {pagedScheduledBookings.map((booking) =>
                    renderBookingCard(booking, "scheduled")
                  )}
                </div>
              )}
              {!bookingLoading && scheduledBookings.length > 0 && (
                <ListPagination
                  page={safeScheduledPage}
                  totalItems={scheduledBookings.length}
                  pageSize={bookingsPageSize}
                  onPageChange={setScheduledPage}
                />
              )}
            </div>

            <div className="teacher-dashboard__availability">
              <div className="teacher-dashboard__availability-header">
                <div>
                  <h3>{t("teacherDashboard.completedTitle")}</h3>
                  <p>{t("teacherDashboard.completedDescription")}</p>
                </div>
              </div>

              {bookingError ? (
                <RecoverableErrorAlert
                  error={bookingError}
                  onRetry={retryDashboardData}
                  retryLabel={t("common.retryLoadData")}
                  forceRetry
                />
              ) : null}
              {bookingLoading && completedBookings.length === 0 ? (
                <ListSkeleton
                  className="teacher-dashboard__skeletons"
                  count={2}
                  itemHeight={160}
                />
              ) : completedBookings.length === 0 ? (
                <div className="teacher-dashboard__empty">
                  {t("teacherDashboard.noCompleted")}
                </div>
              ) : (
                <div className="teacher-dashboard__booking-list">
                  {pagedCompletedBookings.map((booking) =>
                    renderBookingCard(booking, "completed")
                  )}
                </div>
              )}
              {!bookingLoading && completedBookings.length > 0 && (
                <ListPagination
                  page={safeCompletedPage}
                  totalItems={completedBookings.length}
                  pageSize={bookingsPageSize}
                  onPageChange={setCompletedPage}
                />
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: tab === 4 ? "block" : "none" }} aria-hidden={tab !== 4}>
        <StudyCabinetPanel
          role="teacher"
          onWorkbookClick={() => {
            navigate(
              `/workbook?from=${encodeURIComponent("/teacher/profile?tab=study")}`
            );
          }}
          onChatClick={() => {
            setTab(5);
            setSearchParams({ tab: TAB_KEYS[5] });
          }}
          activityDays={teacherStudyActivityDays}
          activityStats={teacherStudyStats}
          calendarEvents={teacherStudyCalendarEvents}
          generalReminders={teacherStudyGeneralReminders}
          notes={studyNotes}
          allowNoteEditor
          onCreateNote={handleTeacherCreateNote}
          onUpdateNote={handleTeacherUpdateNote}
          onDeleteNote={handleTeacherDeleteNote}
          reminderAccent={studyReminderCount > 0}
          reminderHint={
            studyDraftsLoading
              ? "Обновляем календарь и заметки..."
              : studyReminderHint
          }
        />
      </div>

      {tab === 5 && (
        <ChatPage />
      )}

      {tab === 6 && (
        <div className="teacher-dashboard__empty">
          {t("teacherDashboard.statsSoon")}
        </div>
      )}

      {/* EDITOR */}
      {(isEditorOpen || editingCourseId) && (
        <CourseWithLessonsEditor
          teacherId={user.id}
          courseId={editingCourseId ?? undefined}
          onClose={() => {
            setEditorOpen(false);
            setEditingCourseId(null);
            void refreshAll();
          }}
        />
      )}

      {/* CONFIRM */}
      {confirm && (
        <ConfirmDialog
          open
          title={confirm.title}
          description={confirm.description}
          danger={confirm.danger}
          confirmText={
            confirm.danger
              ? t("teacherDashboard.confirmDelete")
              : t("common.confirm")
          }
          onCancel={() => setConfirm(null)}
          onConfirm={confirm.onConfirm}
        />
      )}

      <AxiomAssistant
        userId={user.id}
        role="teacher"
        mode={tab === 2 ? "course" : tab === 4 ? "study-cabinet" : "teacher-dashboard"}
      />
    </div>
  );
}
