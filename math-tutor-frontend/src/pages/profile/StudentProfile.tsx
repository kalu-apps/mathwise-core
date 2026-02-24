import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Snackbar,
  Tab,
  Tabs,
  TextField,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import AutoStoriesRoundedIcon from "@mui/icons-material/AutoStoriesRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DiamondRoundedIcon from "@mui/icons-material/DiamondRounded";
import ForumRoundedIcon from "@mui/icons-material/ForumRounded";
import SpaceDashboardRoundedIcon from "@mui/icons-material/SpaceDashboardRounded";
import EditCalendarRoundedIcon from "@mui/icons-material/EditCalendarRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import ExpandLessRoundedIcon from "@mui/icons-material/ExpandLessRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import CreditCardRoundedIcon from "@mui/icons-material/CreditCardRounded";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import { getPurchases } from "@/entities/purchase/model/storage";
import type { Purchase } from "@/entities/purchase/model/types";
import { getCourses } from "@/entities/course/model/storage";
import { getLessonsByCourse } from "@/entities/lesson/model/storage";
import { getViewedLessonIds } from "@/entities/progress/model/storage";
import {
  createBooking,
  deleteBooking,
  getBookings,
  rescheduleBooking,
} from "@/entities/booking/model/storage";
import type { Booking } from "@/entities/booking/model/types";
import { useAuth } from "@/features/auth/model/AuthContext";
import { useLocation, useNavigate } from "react-router-dom";
import type { Course } from "@/entities/course/model/types";
import { fileToDataUrl } from "@/shared/lib/files";
import { getUsers, updateUserProfile } from "@/features/auth/model/api";
import { NewsFeedPanel } from "@/features/news-feed/ui/NewsFeedPanel";
import { ListPagination } from "@/shared/ui/ListPagination";
import { getTeacherAvailability } from "@/features/teacher-availability/api";
import type { AvailabilitySlot } from "@/features/teacher-availability/model/types";
import type { User } from "@/entities/user/model/types";
import { StudyCabinetPanel } from "@/shared/ui/StudyCabinetPanel";
import { AxiomAssistant } from "@/features/assistant/ui/AxiomAssistant";
import { DialogTitleWithClose } from "@/shared/ui/DialogTitleWithClose";
import { selectPurchaseFinancialView } from "@/entities/purchase/model/selectors";
import { BnplReminderFeed } from "@/entities/purchase/ui/BnplReminderFeed";
import {
  getAssessmentCourseProgress,
  getAssessmentKnowledgeProgress,
  getCourseContentItems,
} from "@/features/assessments/model/storage";
import { getWorkbookDrafts } from "@/features/workbook/model/api";
import {
  getTeacherChatEligibility,
  getTeacherChatThreads,
} from "@/features/chat/model/api";
import type { TeacherChatEligibility } from "@/features/chat/model/types";
import ChatPage from "@/pages/chat/ChatPage";
import {
  PHONE_MASK_TEMPLATE,
  formatRuPhoneDisplay,
  formatRuPhoneInput,
  toRuPhoneStorage,
} from "@/shared/lib/phone";
import {
  buildCalendarDays,
  formatLongDate,
  groupSlotsByDate,
  isFutureSlot,
  normalizeFutureSlots,
} from "@/features/booking/lib/schedule";
import { AccessStateBanner } from "@/shared/ui/AccessStateBanner";
import { useRecoverAccessNotice } from "@/features/auth/model/useRecoverAccessNotice";
import { PasswordSecurityCard } from "@/features/auth/ui/PasswordSecurityCard";
import { RecoverableErrorAlert } from "@/shared/ui/RecoverableErrorAlert";
import {
  getBookingEndTimestamp,
  getBookingStartTimestamp,
  isBookingCompleted,
} from "@/shared/lib/time";
import { subscribeAppDataUpdates } from "@/shared/lib/subscribeAppDataUpdates";
import { ListSkeleton, SectionLoader } from "@/shared/ui/loading";
import {
  buildStudyCabinetWeekActivity,
  createStudyCabinetNote,
  deleteStudyCabinetNote,
  getStudyCabinetNotes,
  recordStudyCabinetActivity,
  updateStudyCabinetNote,
  type StudyCabinetNote,
} from "@/shared/lib/studyCabinet";

const clampPercent = (value: number) =>
  Math.max(0, Math.min(100, Math.round(value)));

const buildProgressVisual = (value: number) => {
  const percent = clampPercent(value);
  const normalized = percent / 100;
  const eased =
    percent <= 40
      ? (percent / 40) * 0.58
      : 0.58 + ((percent - 40) / 60) * 0.42;
  const hue = Math.round(4 + eased * 126);
  const saturation = Math.round(92 - normalized * 14);
  const lightness = percent === 0 ? 46 : Math.round(48 + normalized * 8);
  const color = `hsl(${hue} ${saturation}% ${lightness}%)`;
  const glow = `hsla(${hue} 96% ${Math.max(44, lightness)}% / 0.32)`;
  return { percent, color, glow };
};

export default function StudentProfile() {
  const CHAT_TAB_INDEX = 4;
  const { user, updateUser, openAuthModal, openRecoverModal } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const userId = user?.id;
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [courseQuery, setCourseQuery] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [teacher, setTeacher] = useState<User | null>(null);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [createDate, setCreateDate] = useState("");
  const [createSlotId, setCreateSlotId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleSlotId, setRescheduleSlotId] = useState<string | null>(null);
  const [bookingToReschedule, setBookingToReschedule] = useState<Booking | null>(
    null
  );
  const [bookingToCancel, setBookingToCancel] = useState<Booking | null>(null);
  const [bookingActionLoading, setBookingActionLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<string | null>(null);
  const [chatNotice, setChatNotice] = useState<{
    severity: "success" | "warning" | "error";
    message: string;
  } | null>(null);
  const [chatEligibility, setChatEligibility] =
    useState<TeacherChatEligibility | null>(null);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [studyDrafts, setStudyDrafts] = useState<
    Awaited<ReturnType<typeof getWorkbookDrafts>>["items"]
  >([]);
  const [studyDraftsLoading, setStudyDraftsLoading] = useState(false);
  const [studyNotes, setStudyNotes] = useState<StudyCabinetNote[]>([]);
  const [studyActivityVersion, setStudyActivityVersion] = useState(0);
  const [coursesPage, setCoursesPage] = useState(1);
  const [scheduledPage, setScheduledPage] = useState(1);
  const [completedPage, setCompletedPage] = useState(1);
  const [createSlotsExpanded, setCreateSlotsExpanded] = useState(false);
  const [createAcceptTerms, setCreateAcceptTerms] = useState(false);
  const [createAcceptPrivacy, setCreateAcceptPrivacy] = useState(false);
  const {
    state: accessNoticeState,
    recheck: recheckAccessNotice,
    repair: repairAccessNotice,
  } =
    useRecoverAccessNotice({
      email: user?.email,
      role: user?.role,
    });

  const [items, setItems] = useState<
    {
      course: Course;
      purchase: Purchase;
      progress: number;
      viewedCount: number;
      totalLessons: number;
      totalTests: number;
      completedTests: number;
      testsAveragePercent: number;
      testsKnowledgePercent: number;
      isPremium: boolean;
      purchasedAt: string;
    }[]
  >([]);

  const [profileDraft, setProfileDraft] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    photo: "",
  });
  const hasCoursesLoadedRef = useRef(false);
  const hasBookingsLoadedRef = useRef(false);
  const hasScheduleLoadedRef = useRef(false);

  const chatAccessAvailable = chatEligibility?.available === true;

  const resolveTabParam = useCallback(
    (tabIndex: number): "profile" | "courses" | "lessons" | "study" | "chat" => {
      if (tabIndex === 1) return "courses";
      if (tabIndex === 2) return "lessons";
      if (tabIndex === 3) return "study";
      if (tabIndex === CHAT_TAB_INDEX) return "chat";
      return "profile";
    },
    [CHAT_TAB_INDEX]
  );

  const setTabWithQuery = useCallback(
    (nextTab: number, options?: { replace?: boolean }) => {
      const safeTab =
        !chatAccessAvailable && nextTab === CHAT_TAB_INDEX ? 0 : nextTab;
      const nextTabParam = resolveTabParam(safeTab);
      const params = new URLSearchParams(location.search);
      params.set("tab", nextTabParam);
      const nextSearch = params.toString();
      const nextUrl = `${location.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
      const currentUrl = `${location.pathname}${location.search}`;
      if (nextUrl !== currentUrl) {
        navigate(nextUrl, { replace: options?.replace ?? true });
        return;
      }
      if (tab !== safeTab) {
        setTab(safeTab);
      }
    },
    [
      tab,
      chatAccessAvailable,
      CHAT_TAB_INDEX,
      location.pathname,
      location.search,
      navigate,
      resolveTabParam,
    ]
  );

  useEffect(() => {
    const tabParam = new URLSearchParams(location.search).get("tab");
    let nextTab = tab;
    if (tabParam === "courses") nextTab = 1;
    else if (tabParam === "lessons") nextTab = 2;
    else if (tabParam === "study") nextTab = 3;
    else if (tabParam === "chat")
      nextTab = chatAccessAvailable ? CHAT_TAB_INDEX : 0;
    else if (tabParam === "profile" || tabParam === null) nextTab = 0;

    if (nextTab !== tab) {
      setTab(nextTab);
    }
  }, [location.search, tab, chatAccessAvailable, CHAT_TAB_INDEX]);

  useEffect(() => {
    if (!user) return;
    setProfileDraft({
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      phone: user.phone ?? "",
      photo: user.photo ?? "",
    });
    setProfileEditing(false);
  }, [user]);

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
      const [purchases, courses] = await Promise.all([
        getPurchases({ userId }, { forceFresh: true }),
        getCourses({ forceFresh: true }),
      ]);
      const userPurchases = purchases;

      const resolved = await Promise.all(
        userPurchases.map(async (purchase) => {
          const liveCourse =
            courses.find((candidate) => candidate.id === purchase.courseId) ?? null;
          const usePublishedCourse = liveCourse?.status === "published";
          const course =
            (usePublishedCourse ? liveCourse : purchase.courseSnapshot ?? liveCourse) ??
            null;
          if (!course) return null;
          const lessons = usePublishedCourse
            ? await getLessonsByCourse(course.id, { forceFresh: true })
            : Array.isArray(purchase.lessonsSnapshot)
            ? purchase.lessonsSnapshot
            : await getLessonsByCourse(course.id, { forceFresh: true });
          const queue = await getCourseContentItems(course.id, lessons);
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
          const [testsProgress, testsKnowledgeProgress] = await Promise.all([
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
          ]);
          return {
            course,
            purchase,
            progress,
            viewedCount: viewed.length,
            totalLessons: lessons.length,
            totalTests: testsProgress.totalTests,
            completedTests: testsProgress.completedTests,
            testsAveragePercent: testsProgress.averageLatestPercent,
            testsKnowledgePercent: testsKnowledgeProgress.averageBestPercent,
            isPremium: purchase.price === course.priceGuided,
            purchasedAt: purchase.purchasedAt,
          };
        })
      );

      setItems(
        (resolved.filter(Boolean) as {
          course: Course;
          purchase: Purchase;
          progress: number;
          viewedCount: number;
          totalLessons: number;
          totalTests: number;
          completedTests: number;
          testsAveragePercent: number;
          testsKnowledgePercent: number;
          isPremium: boolean;
          purchasedAt: string;
        }[]).sort((a, b) => {
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
  }, [userId]);

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
      const data = await getBookings({ studentId: userId });
      setBookings(
        data.map((booking) => ({
          ...booking,
          lessonKind: booking.lessonKind === "trial" ? "trial" : "regular",
          paymentStatus: booking.paymentStatus === "paid" ? "paid" : "unpaid",
        }))
      );
    } catch {
      setBookingsError("Не удалось загрузить записи на занятия.");
    } finally {
      hasBookingsLoadedRef.current = true;
      setBookingsLoading(false);
    }
  }, [userId]);

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
      const teachers = await getUsers("teacher");
      const currentTeacher = teachers[0] ?? null;
      setTeacher(currentTeacher);
      if (!currentTeacher) {
        setAvailability([]);
        return;
      }
      const slots = await getTeacherAvailability(currentTeacher.id);
      const normalized = slots.map((slot) => ({
        id: slot.id,
        date: slot.date,
        startTime: slot.startTime ?? "",
        endTime: slot.endTime ?? "",
      }));
      setAvailability(normalizeFutureSlots(normalized));
    } catch {
      setScheduleError("Не удалось загрузить свободные слоты преподавателя.");
      setTeacher(null);
      setAvailability([]);
    } finally {
      hasScheduleLoadedRef.current = true;
      setScheduleLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    hasCoursesLoadedRef.current = false;
    hasBookingsLoadedRef.current = false;
    hasScheduleLoadedRef.current = false;
  }, [userId]);

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
  }, [userId]);

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
  }, [userId]);

  const syncStudyNotes = useCallback(() => {
    if (!userId) {
      setStudyNotes([]);
      return;
    }
    setStudyNotes(getStudyCabinetNotes("student", userId));
  }, [userId]);

  const loadStudyDrafts = useCallback(async () => {
    if (!userId) {
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
  }, [userId]);

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
  }, [chatAccessAvailable, loadChatUnread]);

  useEffect(() => {
    if (!chatAccessAvailable && tab === CHAT_TAB_INDEX) {
      setTabWithQuery(0, { replace: true });
    }
  }, [chatAccessAvailable, tab, CHAT_TAB_INDEX, setTabWithQuery]);

  useEffect(() => {
    if (tab !== 3) return;
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
  }, [tab, userId]);

  const upcomingBooking = useMemo(() => {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    let nearest: Booking | null = null;
    let minDiff = Number.POSITIVE_INFINITY;
    bookings.forEach((booking) => {
      if (!booking.date || !booking.startTime) return;
      const start = getBookingStartTimestamp(booking);
      if (!Number.isFinite(start)) return;
      const diff = start - now;
      if (diff > 0 && diff <= oneDay && diff < minDiff) {
        minDiff = diff;
        nearest = booking;
      }
    });
    return nearest;
  }, [bookings]);

  const unpaidCompletedBooking = useMemo(() => {
    const now = Date.now();
    const completedUnpaid = bookings
      .filter((booking) => {
        const endTime = getBookingEndTimestamp(booking);
        return (
          Number.isFinite(endTime) &&
          endTime < now &&
          booking.paymentStatus !== "paid"
        );
      })
      .sort((a, b) => {
        const aTime = getBookingEndTimestamp(a);
        const bTime = getBookingEndTimestamp(b);
        return bTime - aTime;
      });
    return completedUnpaid[0] ?? null;
  }, [bookings]);

  const sortedBookings = useMemo(() => {
    const now = Date.now();
    const getStart = (booking: Booking) => getBookingStartTimestamp(booking);
    const getEnd = (booking: Booking) => getBookingEndTimestamp(booking);
    const upcoming = bookings
      .filter((booking) => getEnd(booking) >= now)
      .sort((a, b) => getStart(a) - getStart(b));
    const past = bookings
      .filter((booking) => getEnd(booking) < now)
      .sort((a, b) => getEnd(b) - getEnd(a));
    return [...upcoming, ...past];
  }, [bookings]);

  const scheduledBookings = useMemo(() => {
    const now = Date.now();
    return sortedBookings.filter((booking) => getBookingEndTimestamp(booking) >= now);
  }, [sortedBookings]);

  const completedBookings = useMemo(() => {
    const now = Date.now();
    return sortedBookings.filter((booking) => getBookingEndTimestamp(booking) < now);
  }, [sortedBookings]);

  const scheduledCount = useMemo(() => {
    const now = Date.now();
    return bookings.filter((booking) => getBookingEndTimestamp(booking) > now).length;
  }, [bookings]);

  const calendarDays = useMemo(() => buildCalendarDays(21), []);
  const slotsByDate = useMemo(() => groupSlotsByDate(availability), [availability]);
  const availableDateSet = useMemo(
    () => new Set(availability.map((slot) => slot.date)),
    [availability]
  );
  const firstAvailableDate = useMemo(
    () =>
      calendarDays.find((day) => availableDateSet.has(day.value))?.value ??
      calendarDays[0]?.value ??
      "",
    [calendarDays, availableDateSet]
  );

  const createSelectedSlot = useMemo(
    () => availability.find((slot) => slot.id === createSlotId) ?? null,
    [availability, createSlotId]
  );
  const createDateSlots = useMemo(
    () => slotsByDate[createDate] ?? [],
    [slotsByDate, createDate]
  );
  const rescheduleSelectedSlot = useMemo(
    () => availability.find((slot) => slot.id === rescheduleSlotId) ?? null,
    [availability, rescheduleSlotId]
  );

  useEffect(() => {
    if (!calendarDays.some((day) => day.value === createDate)) {
      setCreateDate(firstAvailableDate);
      setCreateSlotId(null);
    }
  }, [createDate, calendarDays, firstAvailableDate]);

  useEffect(() => {
    if (!bookingToReschedule) {
      setRescheduleSlotId(null);
      return;
    }
    if (!calendarDays.some((day) => day.value === rescheduleDate)) {
      setRescheduleDate(firstAvailableDate);
      setRescheduleSlotId(null);
    }
  }, [
    bookingToReschedule,
    rescheduleDate,
    calendarDays,
    firstAvailableDate,
  ]);

  useEffect(() => {
    if (tab !== 2) {
      setCreateSlotsExpanded(false);
      setCreateAcceptTerms(false);
      setCreateAcceptPrivacy(false);
    }
  }, [tab]);

  const coursesPageSize = isMobile ? 2 : 4;
  const bookingsPageSize = isMobile ? 2 : 4;

  const filteredCourseItems = useMemo(
    () =>
      items.filter((item) =>
        item.course.title.toLowerCase().includes(courseQuery.trim().toLowerCase())
      ),
    [items, courseQuery]
  );

  const coursesTotalPages = Math.max(
    1,
    Math.ceil(filteredCourseItems.length / coursesPageSize)
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

  const pagedCourseItems = useMemo(() => {
    const start = (safeCoursesPage - 1) * coursesPageSize;
    return filteredCourseItems.slice(start, start + coursesPageSize);
  }, [filteredCourseItems, safeCoursesPage, coursesPageSize]);

  const pagedScheduledBookings = useMemo(() => {
    const start = (safeScheduledPage - 1) * bookingsPageSize;
    return scheduledBookings.slice(start, start + bookingsPageSize);
  }, [scheduledBookings, safeScheduledPage, bookingsPageSize]);

  const pagedCompletedBookings = useMemo(() => {
    const start = (safeCompletedPage - 1) * bookingsPageSize;
    return completedBookings.slice(start, start + bookingsPageSize);
  }, [completedBookings, safeCompletedPage, bookingsPageSize]);

  const bnplReminderItems = useMemo(() => {
    return items
      .map((item) => {
        const financial = selectPurchaseFinancialView(item.purchase);
        if (financial.paymentMethod !== "bnpl") return null;
        if (
          financial.financialStatus !== "upcoming" &&
          financial.financialStatus !== "grace" &&
          financial.financialStatus !== "restricted" &&
          financial.financialStatus !== "suspended"
        ) {
          return null;
        }
        return {
          purchaseId: item.purchase.id,
          courseTitle: item.course.title,
          financialStatus: financial.financialStatus,
          nextPaymentDate: financial.nextPaymentDate,
          overdueDays: financial.overdueDays,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort((a, b) => {
        const rank = (status: typeof a.financialStatus) => {
          if (status === "suspended") return 0;
          if (status === "restricted") return 1;
          if (status === "grace") return 2;
          return 3;
        };
        const rankDiff = rank(a.financialStatus) - rank(b.financialStatus);
        if (rankDiff !== 0) return rankDiff;
        if (a.nextPaymentDate && b.nextPaymentDate) {
          return a.nextPaymentDate.localeCompare(b.nextPaymentDate);
        }
        if (a.nextPaymentDate) return -1;
        if (b.nextPaymentDate) return 1;
        return 0;
      });
  }, [items]);

  const studyActivityDays = useMemo(() => {
    const recalcSeed = studyActivityVersion;
    void recalcSeed;
    if (!userId) return [];
    return buildStudyCabinetWeekActivity("student", userId);
  }, [userId, studyActivityVersion]);

  const studyStats = useMemo(() => {
    const weeklyMinutes = studyActivityDays.reduce(
      (sum, day) => sum + day.minutes,
      0
    );
    const totalViewedLessons = items.reduce(
      (sum, item) => sum + Math.max(0, item.viewedCount),
      0
    );
    const totalCompletedTests = items.reduce(
      (sum, item) => sum + Math.max(0, item.completedTests),
      0
    );
    const totalWorkbookSessions = studyDrafts.length;
    const totalClassSessions = studyDrafts.filter((draft) => draft.kind === "CLASS")
      .length;
    const totalPersonalSessions = studyDrafts.filter(
      (draft) => draft.kind === "PERSONAL"
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
        id: "lessons-viewed",
        label: "Просмотрено уроков",
        value: totalViewedLessons,
        icon: <MenuBookRoundedIcon fontSize="small" />,
      },
      {
        id: "tests-done",
        label: "Решено тестов",
        value: totalCompletedTests,
        icon: <TaskAltRoundedIcon fontSize="small" />,
      },
      {
        id: "bookings-done",
        label: "Инд. занятий",
        value: completedBookings.length,
        icon: <EventAvailableRoundedIcon fontSize="small" />,
      },
      {
        id: "workbook-total",
        label: "Сессий в тетради",
        value: totalWorkbookSessions,
        icon: <AutoStoriesRoundedIcon fontSize="small" />,
      },
      {
        id: "workbook-personal",
        label: "Личные сессии",
        value: totalPersonalSessions,
        icon: <SpaceDashboardRoundedIcon fontSize="small" />,
      },
      {
        id: "workbook-class",
        label: "Коллективные",
        value: totalClassSessions,
        icon: <GroupsRoundedIcon fontSize="small" />,
      },
    ].filter((entry) => entry.value > 0);
  }, [studyActivityDays, items, studyDrafts, completedBookings.length]);

  const studyCalendarEvents = useMemo(() => {
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
      onClick?: () => void;
    }> = [];

    scheduledBookings.forEach((booking) => {
      const start = getBookingStartTimestamp(booking);
      const end = getBookingEndTimestamp(booking);
      if (!Number.isFinite(start) || start <= now) return;
        events.push({
          id: `booking-${booking.id}`,
          title: "Индивидуальное занятие",
          description: booking.teacherName ? `С преподавателем ${booking.teacherName}` : undefined,
          startAt: new Date(start).toISOString(),
          endAt: Number.isFinite(end) ? new Date(end).toISOString() : undefined,
          badge: "Занятие",
        });
    });

    studyNotes
      .filter((note) => note.dueAt && !note.done)
      .forEach((note) => {
        if (!note.dueAt) return;
        const dueMs = new Date(note.dueAt).getTime();
        if (!Number.isFinite(dueMs)) return;
        events.push({
          id: `note-event-${note.id}`,
          title: note.title,
          startAt: new Date(dueMs).toISOString(),
          endAt: note.endAt
            ? new Date(note.endAt).toISOString()
            : new Date(dueMs + 30 * 60 * 1000).toISOString(),
          description: note.body || undefined,
          color: note.color,
          highlighted: note.remind,
          noteId: note.id,
        });
      });

    return events.sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    );
  }, [scheduledBookings, studyNotes]);

  const studyGeneralReminders = useMemo(() => {
    const now = Date.now();
    const reminders: Array<{
      id: string;
      title: string;
      subtitle?: string;
      badge?: string;
      highlighted?: boolean;
      onClick?: () => void;
      source: "system" | "manual";
      sortKey: number;
    }> = [];

    studyDrafts
      .filter((draft) => draft.kind === "CLASS")
      .slice(0, 3)
      .forEach((draft) => {
        const updatedAt = new Date(draft.updatedAt).getTime();
        reminders.push({
          id: `class-${draft.sessionId}`,
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

    items
      .filter((item) => item.progress < 100)
      .forEach((item) => {
        const daysSincePurchase = Math.floor(
          (now - new Date(item.purchasedAt).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (!Number.isFinite(daysSincePurchase) || daysSincePurchase < 10) return;
        reminders.push({
          id: `stale-${item.course.id}`,
          title: `Вернитесь к курсу «${item.course.title}»`,
          subtitle: `Есть непройденные материалы (${item.progress}% завершено).`,
          badge: "Напоминание",
          highlighted: true,
          onClick: () =>
            navigate(`/courses/${item.course.id}`, {
              state: { from: "/student/profile?tab=study" },
            }),
          source: "system",
          sortKey: now - daysSincePurchase * 60_000,
        });
      });

    studyNotes
      .filter((note) => note.remind && !note.done && note.dueAt)
      .forEach((note) => {
        if (!note.dueAt) return;
        const dueMs = new Date(note.dueAt).getTime();
        if (!Number.isFinite(dueMs)) return;
        reminders.push({
          id: `manual-note-${note.id}`,
          title: note.title,
          subtitle: note.body || undefined,
          badge: "Заметка",
          highlighted: dueMs >= now && dueMs - now <= 90 * 60 * 1000,
          source: "manual",
          sortKey: dueMs,
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
          onClick: item.onClick,
        };
      });
  }, [studyDrafts, items, navigate, studyNotes]);

  const handleStudentCreateNote = useCallback(
    (payload: {
      title: string;
      body: string;
      dueAt: string | null;
      endAt: string | null;
      remind: boolean;
      color: string;
    }) => {
      if (!userId) return;
      createStudyCabinetNote({
        role: "student",
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
    [userId, syncStudyNotes]
  );

  const handleStudentUpdateNote = useCallback(
    (payload: {
      noteId: string;
      title: string;
      body: string;
      dueAt: string | null;
      endAt: string | null;
      remind: boolean;
      color: string;
    }) => {
      if (!userId) return;
      updateStudyCabinetNote({
        role: "student",
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
    [userId, syncStudyNotes]
  );

  const handleStudentDeleteNote = useCallback(
    (noteId: string) => {
      if (!userId) return;
      deleteStudyCabinetNote({ role: "student", userId, noteId });
      syncStudyNotes();
    },
    [userId, syncStudyNotes]
  );

  const openRescheduleDialog = (booking: Booking) => {
    setBookingToReschedule(booking);
    const targetDate = calendarDays.some((day) => day.value === booking.date)
      ? booking.date
      : firstAvailableDate;
    setRescheduleDate(targetDate);
    setRescheduleSlotId(null);
    setBookingSuccess(null);
  };

  const handleCreateBooking = async () => {
    if (!teacher || !user || !userId || !createSelectedSlot || bookingActionLoading)
      return;
    if (!isFutureSlot(createSelectedSlot)) {
      setBookingSuccess(null);
      setBookingsError("Выбранный слот уже недоступен.");
      await loadSchedulingContext();
      return;
    }
    if (!createAcceptTerms || !createAcceptPrivacy) {
      setBookingSuccess(null);
      setBookingsError(
        "Подтвердите согласие с условиями занятия и обработкой персональных данных."
      );
      return;
    }
    try {
      setBookingActionLoading(true);
      setBookingsError(null);
      await createBooking({
        teacherId: teacher.id,
        teacherName: `${teacher.firstName} ${teacher.lastName}`.trim(),
        teacherPhoto: teacher.photo,
        studentId: userId,
        studentName: `${user.firstName} ${user.lastName}`.trim() || user.email,
        studentEmail: user.email,
        studentPhone: toRuPhoneStorage(user.phone ?? "") || undefined,
        studentPhoto: user.photo,
        slotId: createSelectedSlot.id,
        date: createSelectedSlot.date,
        startTime: createSelectedSlot.startTime,
        endTime: createSelectedSlot.endTime,
        lessonKind: "regular",
        consents: {
          acceptedScopes: ["terms", "privacy", "trial_booking"],
        },
      });
      setCreateSlotId(null);
      setCreateAcceptTerms(false);
      setCreateAcceptPrivacy(false);
      setBookingSuccess("Запись успешно создана.");
      await Promise.all([loadStudentBookings(), loadSchedulingContext()]);
    } catch (error) {
      setBookingSuccess(null);
      setBookingsError(
        error instanceof Error
          ? error.message
          : "Не удалось записаться на занятие."
      );
      await loadSchedulingContext();
    } finally {
      setBookingActionLoading(false);
    }
  };

  const handleRescheduleBooking = async () => {
    if (
      !bookingToReschedule ||
      !rescheduleSelectedSlot ||
      bookingActionLoading
    ) {
      return;
    }
    if (!isFutureSlot(rescheduleSelectedSlot)) {
      setBookingSuccess(null);
      setBookingsError("Выбранный слот уже недоступен.");
      await loadSchedulingContext();
      return;
    }
    try {
      setBookingActionLoading(true);
      setBookingsError(null);
      await rescheduleBooking(bookingToReschedule.id, rescheduleSelectedSlot.id);
      setBookingToReschedule(null);
      setRescheduleSlotId(null);
      setBookingSuccess("Занятие перенесено.");
      await Promise.all([loadStudentBookings(), loadSchedulingContext()]);
    } catch (error) {
      setBookingSuccess(null);
      setBookingsError(
        error instanceof Error
          ? error.message
          : "Не удалось перенести занятие."
      );
      await loadSchedulingContext();
    } finally {
      setBookingActionLoading(false);
    }
  };

  const handleCancelBooking = async () => {
    if (!bookingToCancel || bookingActionLoading) return;
    const bookingTime = new Date(
      `${bookingToCancel.date}T${bookingToCancel.startTime}`
    ).getTime();
    if (!Number.isFinite(bookingTime) || bookingTime <= Date.now()) {
      setBookingToCancel(null);
      setBookingSuccess(null);
      setBookingsError("Можно отменить только будущее занятие.");
      return;
    }
    try {
      setBookingActionLoading(true);
      setBookingsError(null);
      await deleteBooking(bookingToCancel.id);
      setBookingToCancel(null);
      setBookingSuccess("Занятие отменено.");
      await Promise.all([loadStudentBookings(), loadSchedulingContext()]);
    } catch (error) {
      setBookingSuccess(null);
      setBookingsError(
        error instanceof Error ? error.message : "Не удалось отменить занятие."
      );
    } finally {
      setBookingActionLoading(false);
    }
  };

  const renderBookingCard = (booking: Booking) => {
    const isCompleted = isBookingCompleted(booking, Date.now());
    const isTrial = booking.lessonKind === "trial";
    const isPaid = booking.paymentStatus === "paid";
    return (
      <div
        key={booking.id}
        className={`student-profile__lesson-card ${
          isCompleted
            ? "student-profile__lesson-card--completed"
            : "student-profile__lesson-card--scheduled"
        }`}
      >
        <div className="student-profile__lesson-head">
          <div className="student-profile__lesson-time">
            <span className="student-profile__lesson-date">{booking.date}</span>
            <strong className="student-profile__lesson-range">
              {booking.startTime} – {booking.endTime}
            </strong>
          </div>
          <div className="student-profile__lesson-meta">
            <div className="student-profile__lesson-tags">
              <span
                className={`student-profile__lesson-status ${
                  isCompleted
                    ? "student-profile__lesson-status--completed"
                    : "student-profile__lesson-status--scheduled"
                } ui-status-chip ${
                  isCompleted
                    ? "ui-status-chip--completed"
                    : "ui-status-chip--scheduled"
                }`}
              >
                {isCompleted ? "Завершено" : "Запланировано"}
              </span>
              {isTrial && (
                <span className="student-profile__lesson-kind ui-status-chip ui-status-chip--trial">
                  Пробное занятие
                </span>
              )}
              <span
                className={`student-profile__lesson-payment ${
                  isPaid
                    ? "student-profile__lesson-payment--paid"
                    : "student-profile__lesson-payment--unpaid"
                } ui-status-chip ${
                  isPaid ? "ui-status-chip--paid" : "ui-status-chip--unpaid"
                }`}
              >
                {isPaid ? "Оплачено" : "Не оплачено"}
              </span>
            </div>
            {!isCompleted && (
              <div className="student-profile__lesson-head-actions">
                <IconButton
                  className="student-profile__lesson-edit"
                  size="small"
                  onClick={() => openRescheduleDialog(booking)}
                  aria-label="Перенести занятие"
                >
                  <EditCalendarRoundedIcon fontSize="small" />
                </IconButton>
                <IconButton
                  className="student-profile__lesson-delete"
                  size="small"
                  onClick={() => setBookingToCancel(booking)}
                  aria-label="Отменить занятие"
                >
                  <DeleteOutlineRoundedIcon fontSize="small" />
                </IconButton>
              </div>
            )}
          </div>
        </div>
        <div className="student-profile__lesson-links">
          {booking.meetingUrl ? (
            <a href={booking.meetingUrl} target="_blank" rel="noreferrer">
              Перейти к созвону
            </a>
          ) : (
            <span>Ссылка на созвон появится позже</span>
          )}
        </div>
        {booking.materials?.length > 0 && (
          <div className="student-profile__lesson-materials">
            {booking.materials.map((m) => (
              <a key={m.id} href={m.url} download={m.name}>
                {m.name}
              </a>
            ))}
          </div>
        )}
      </div>
    );
  };

  const formatReminderDate = (booking: Booking) => {
    const date = new Date(`${booking.date}T${booking.startTime}`);
    return date.toLocaleString("ru-RU", {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!user) return null;
  const roleLabel = user.role === "teacher" ? "Преподаватель" : "Студент";
  const handleOpenTeacherChat = async () => {
    try {
      const eligibility = chatEligibility ?? (await getTeacherChatEligibility());
      if (!eligibility.available) {
        setChatNotice({
          severity: "warning",
          message:
            "Чат с преподавателем доступен после покупки премиум-курса или записи на индивидуальное занятие.",
        });
        return;
      }
      setChatEligibility(eligibility);
      setTabWithQuery(CHAT_TAB_INDEX, { replace: true });
    } catch (error) {
      setChatNotice({
        severity: "error",
        message:
          error instanceof Error
            ? error.message
            : "Не удалось открыть чат с преподавателем.",
      });
    }
  };
  const handleOpenWorkbook = async () => {
    try {
      const eligibility = chatEligibility ?? (await getTeacherChatEligibility());
      if (!eligibility.available) {
        setChatEligibility(eligibility);
        setChatNotice({
          severity: "warning",
          message:
            "Рабочая тетрадь доступна после покупки премиум-курса или записи на индивидуальное занятие.",
        });
        return;
      }
      setChatEligibility(eligibility);
      navigate(
        `/workbook?from=${encodeURIComponent("/student/profile?tab=study")}`
      );
    } catch (error) {
      setChatNotice({
        severity: "error",
        message:
          error instanceof Error
            ? error.message
            : "Не удалось открыть рабочую тетрадь.",
      });
    }
  };
  const mobileDialogActionSx = isMobile
    ? {
        minWidth: 44,
        width: 44,
        height: 44,
        padding: 0.9,
        borderRadius: 2.5,
        flex: "0 0 auto",
      }
    : undefined;
  const avatarResponsiveSx = {
    width: { xs: 64, md: 96 },
    height: { xs: 64, md: 96 },
    fontSize: { xs: 28, md: 36 },
  } as const;

  return (
    <div className="student-profile">
      <Snackbar
        open={Boolean(chatNotice)}
        autoHideDuration={4200}
        onClose={() => setChatNotice(null)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          severity={chatNotice?.severity ?? "info"}
          onClose={() => setChatNotice(null)}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {chatNotice?.message}
        </Alert>
      </Snackbar>
      {unpaidCompletedBooking && (
        <div className="student-profile__reminder student-profile__reminder--priority">
          Внимание: занятие от {formatReminderDate(unpaidCompletedBooking)} пока не
          отмечено как оплачено. Свяжитесь с преподавателем для подтверждения.
        </div>
      )}
      {upcomingBooking && (
        <div className="student-profile__reminder">
          Напоминание: занятие назначено на {formatReminderDate(upcomingBooking)}
        </div>
      )}
      {accessNoticeState && (
        <AccessStateBanner
          state={accessNoticeState}
          onLogin={openAuthModal}
          onRecover={() => openRecoverModal(user?.email)}
          onRecheck={
            accessNoticeState === "paid_but_restricted"
              ? () => {
                  void repairAccessNotice();
                }
              : recheckAccessNotice
          }
          onCompleteProfile={() => {
            setTabWithQuery(0, { replace: true });
            setProfileEditing(true);
          }}
        />
      )}
      <BnplReminderFeed
        items={bnplReminderItems}
        onOpenPurchase={(purchaseId) =>
          navigate(`/profile/purchases/${purchaseId}`, {
            state: { from: `${location.pathname}${location.search}` },
          })
        }
      />
      <div className="student-profile__header">
        <h1 className="student-profile__title">
          <SpaceDashboardRoundedIcon />
          <span>Панель студента</span>
        </h1>
        <Tabs
          value={tab}
          onChange={(_, next) => setTabWithQuery(next, { replace: true })}
          className="student-profile__tabs"
        >
          <Tab
            label={<span className="student-profile__tab-label">Мой профиль</span>}
            icon={<PersonRoundedIcon />}
            iconPosition="start"
          />
          <Tab
            label={<span className="student-profile__tab-label">Мои курсы</span>}
            icon={<MenuBookRoundedIcon />}
            iconPosition="start"
          />
          <Tab
            label={
              <span className="student-profile__tab-label">
                Индивидуальные занятия
              </span>
            }
            icon={
              <Badge
                color="error"
                variant="dot"
                invisible={scheduledCount === 0}
              >
                <EventAvailableRoundedIcon />
              </Badge>
            }
            iconPosition="start"
          />
          <Tab
            label={
              <span className="student-profile__tab-label">
                Учебный кабинет
              </span>
            }
            icon={<AutoStoriesRoundedIcon />}
            iconPosition="start"
          />
          {chatAccessAvailable ? (
            <Tab
              label={
                <span className="student-profile__tab-label">
                  Чат с преподавателем
                </span>
              }
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
          ) : null}
        </Tabs>
      </div>

      {tab === 1 && (
        <div className="student-profile__courses">
          {coursesError ? (
            <RecoverableErrorAlert
              error={coursesError}
              onRetry={() => loadStudentCourses()}
              retryLabel="Повторить загрузку курсов"
              forceRetry
            />
          ) : null}
          <div className="student-profile__search">
            <TextField
              placeholder="Поиск курса..."
              value={courseQuery}
              onChange={(e) => {
                setCourseQuery(e.target.value);
                setCoursesPage(1);
              }}
              fullWidth
              inputProps={{ "aria-label": "Поиск курса" }}
              InputProps={{
                endAdornment: courseQuery ? (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="Очистить поиск"
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
          {coursesLoading && items.length === 0 && (
            <ListSkeleton
              className="student-profile__skeletons"
              count={3}
              itemHeight={180}
            />
          )}
          {!coursesLoading && items.length === 0 && (
            <div className="student-profile__empty">
              Пока нет купленных курсов
            </div>
          )}
          {pagedCourseItems.map(
            ({
              course,
              purchase,
              progress,
              viewedCount,
              totalLessons,
              totalTests,
              completedTests,
              testsKnowledgePercent,
              isPremium,
            }) => {
              const financialView = selectPurchaseFinancialView(purchase);
              const nextDateLabel =
                financialView.nextPaymentDate &&
                new Date(financialView.nextPaymentDate).toLocaleDateString("ru-RU");
              const bnplStatusClass =
                financialView.financialStatus === "suspended"
                  ? "ui-status-chip--danger"
                  : financialView.financialStatus === "restricted"
                  ? "ui-status-chip--warning"
                  : financialView.financialStatus === "grace"
                  ? "ui-status-chip--warning"
                  : financialView.financialStatus === "upcoming"
                  ? "ui-status-chip--scheduled"
                  : "ui-status-chip--paid";
              const bnplStatusLabel =
                financialView.financialStatus === "ok"
                  ? "Платежи в норме"
                  : financialView.financialStatus === "upcoming"
                  ? "Скоро платеж"
                  : financialView.financialStatus === "grace"
                  ? "Льготный период"
                  : financialView.financialStatus === "restricted"
                  ? "Ограничен новый контент"
                  : "Доступ приостановлен";
              const learningVisual = buildProgressVisual(progress);
              const knowledgeVisual = buildProgressVisual(testsKnowledgePercent);
              const learningRingStyle = {
                "--progress-color": learningVisual.color,
                "--progress-glow": learningVisual.glow,
              } as CSSProperties;
              const knowledgeRingStyle = {
                "--progress-color": knowledgeVisual.color,
                "--progress-glow": knowledgeVisual.glow,
              } as CSSProperties;
              const profileCoursesFrom = "/student/profile?tab=courses";
              const isCourseCompleted =
                viewedCount >= totalLessons &&
                (totalTests === 0 ||
                  (completedTests >= totalTests && testsKnowledgePercent > 0));
              const courseCtaLabel = isCourseCompleted
                ? "Рестарт"
                : "Открыть";
              return (
                <div key={course.id} className="student-profile__course-card">
                  <div className="student-profile__course-main">
                    <h3>
                      <span className="student-profile__course-title-row">
                        <span className="student-profile__course-title">
                          <span className="student-profile__course-title-text">
                            {course.title}
                          </span>
                          {isPremium && (
                            <DiamondRoundedIcon className="student-profile__premium" />
                          )}
                        </span>
                      </span>
                    </h3>
                    <div className="student-profile__course-meta">
                      <span className="student-profile__course-meta-level">
                        Уровень: {course.level}
                      </span>
                      <span className="student-profile__course-meta-progress">
                        {`Уроков: ${viewedCount}/${totalLessons}${
                          totalTests > 0
                            ? ` • Тестов: ${completedTests}/${totalTests}`
                            : ""
                        }`}
                      </span>
                    </div>
                    <div className="student-profile__course-payment">
                      {financialView.paymentMethod === "bnpl" ? (
                        <>
                          {nextDateLabel && (
                            <span className="student-profile__course-payment-line student-profile__course-payment-line--accent student-profile__course-payment-line--next-payment">
                              Следующий платеж: {nextDateLabel}
                            </span>
                          )}
                          {!nextDateLabel ? (
                            <span className="student-profile__course-payment-line student-profile__course-payment-line--accent">
                              Оплата частями активна
                            </span>
                          ) : null}
                          <span className={`ui-status-chip ${bnplStatusClass}`}>
                            {bnplStatusLabel}
                          </span>
                        </>
                      ) : (
                        <span className="ui-status-chip ui-status-chip--paid">
                          Оплачено полностью
                        </span>
                      )}
                    </div>
                    <div className="student-profile__course-actions">
                      <button
                        className="student-profile__course-link"
                        onClick={() =>
                          navigate(`/courses/${course.id}`, {
                            state: { from: profileCoursesFrom },
                          })
                        }
                      >
                        <AutoStoriesRoundedIcon
                          fontSize="inherit"
                          className="student-profile__course-link-icon"
                        />
                        {courseCtaLabel}
                      </button>
                      <button
                        className="student-profile__course-link student-profile__course-link--ghost"
                        onClick={() =>
                          navigate(`/profile/purchases/${purchase.id}`, {
                            state: { from: profileCoursesFrom },
                          })
                        }
                      >
                        <CreditCardRoundedIcon
                          fontSize="inherit"
                          className="student-profile__course-link-icon"
                        />
                        Оплата
                      </button>
                    </div>
                  </div>

                  <div className="student-profile__course-progress">
                    <span
                      className={`student-profile__course-status student-profile__course-status--corner ${
                        progress >= 100
                          ? "student-profile__course-status--completed"
                          : "student-profile__course-status--active"
                      } ui-status-chip ${
                        progress >= 100
                          ? "ui-status-chip--completed"
                          : "ui-status-chip--inprogress"
                      }`}
                    >
                      {progress >= 100 ? "Завершен" : "В процессе изучения"}
                    </span>
                    <div
                      className={`student-profile__course-progress-rings ${
                        totalTests > 0 ? "is-double" : "is-single"
                      }`}
                    >
                      <div
                        className="student-profile__progress-ring-card"
                        style={learningRingStyle}
                      >
                        <div className="student-profile__progress-ring">
                          <CircularProgress
                            variant="determinate"
                            value={learningVisual.percent}
                            size={66}
                            thickness={4.2}
                            sx={{ color: learningVisual.color }}
                          />
                          <span>{learningVisual.percent}%</span>
                        </div>
                        <span className="student-profile__progress-label">
                          Изучение
                        </span>
                      </div>
                      {totalTests > 0 ? (
                        <div
                          className="student-profile__progress-ring-card"
                          style={knowledgeRingStyle}
                        >
                          <div className="student-profile__progress-ring">
                            <CircularProgress
                              variant="determinate"
                              value={knowledgeVisual.percent}
                              size={66}
                              thickness={4.2}
                              sx={{ color: knowledgeVisual.color }}
                            />
                            <span>{knowledgeVisual.percent}%</span>
                          </div>
                          <span className="student-profile__progress-label">
                            Тесты
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            }
          )}
          {!coursesLoading && filteredCourseItems.length > 0 && (
            <ListPagination
              page={safeCoursesPage}
              totalItems={filteredCourseItems.length}
              pageSize={coursesPageSize}
              onPageChange={setCoursesPage}
            />
          )}
          {coursesLoading && items.length > 0 && (
            <SectionLoader className="student-profile__loading" rows={1} compact showRing />
          )}
        </div>
      )}

      {tab === 2 && (
        <div className="student-profile__lessons">
          {scheduleError ? (
            <RecoverableErrorAlert
              error={scheduleError}
              onRetry={() => loadSchedulingContext()}
              retryLabel="Повторить загрузку слотов"
              forceRetry
            />
          ) : null}
          {bookingsError ? (
            <RecoverableErrorAlert
              error={bookingsError}
              onRetry={() => loadStudentBookings()}
              retryLabel="Повторить загрузку занятий"
              forceRetry
            />
          ) : null}
          {bookingSuccess && (
            <Alert
              severity="success"
              onClose={() => setBookingSuccess(null)}
            >
              {bookingSuccess}
            </Alert>
          )}
          <section className="student-profile__calendar-panel">
            <div className="student-profile__calendar-head">
              <h3 className="student-profile__lessons-title">
                Запись на индивидуальное занятие
              </h3>
              <span>Выберите дату и диапазон времени</span>
            </div>
            {scheduleLoading ? (
              <SectionLoader className="student-profile__skeletons" rows={2} showRing />
            ) : availability.length === 0 ? (
              <div className="student-profile__empty student-profile__empty--inner">
                Свободных слотов пока нет.
              </div>
            ) : (
              <>
                <div className="student-profile__calendar-days">
                  {calendarDays.map((day) => {
                    const isAvailable = availableDateSet.has(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        className={`student-profile__calendar-day ${
                          createDate === day.value ? "is-active" : ""
                        } ${isAvailable ? "is-available" : "is-muted"} ${
                          day.isWeekend ? "is-weekend" : ""
                        }`}
                        onClick={() => {
                          setCreateDate(day.value);
                          setCreateSlotId(null);
                          setCreateSlotsExpanded(true);
                        }}
                      >
                        <span className="student-profile__calendar-weekday">
                          {day.weekday}
                        </span>
                        <span className="student-profile__calendar-daynum">
                          {day.label}
                        </span>
                        {day.isToday && (
                          <span className="student-profile__calendar-today">
                            Сегодня
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div
                  className={`student-profile__calendar-collapsible ${
                    createSlotsExpanded ? "is-open" : "is-collapsed"
                  }`}
                >
                  <div className="student-profile__calendar-title">
                    {createDate ? formatLongDate(createDate) : ""}
                  </div>
                  {createDateSlots.length === 0 ? (
                    <div className="student-profile__empty student-profile__empty--inner">
                      На выбранную дату свободных слотов нет.
                    </div>
                  ) : (
                    <div className="student-profile__calendar-times">
                      {createDateSlots.map((slot) => (
                        <button
                          key={slot.id}
                          type="button"
                          className={`student-profile__calendar-time ${
                            createSlotId === slot.id ? "is-active" : ""
                          }`}
                          onClick={() => setCreateSlotId(slot.id)}
                        >
                          <span>
                            {slot.startTime} – {slot.endTime}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {createSelectedSlot && (
                    <div className="student-profile__calendar-summary">
                      <span>Вы выбрали слот:</span>
                      <strong>
                        {createSelectedSlot.startTime} – {createSelectedSlot.endTime}
                      </strong>
                    </div>
                  )}
                  <div className="student-profile__calendar-actions">
                    <div className="student-profile__consent-group">
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={createAcceptTerms}
                            onChange={(e) =>
                              setCreateAcceptTerms(e.target.checked)
                            }
                          />
                        }
                        label="Согласен с условиями записи на занятие"
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={createAcceptPrivacy}
                            onChange={(e) =>
                              setCreateAcceptPrivacy(e.target.checked)
                            }
                          />
                        }
                        label="Согласен на обработку персональных данных"
                      />
                    </div>
                    <Button
                      variant="contained"
                      onClick={() => void handleCreateBooking()}
                      disabled={!createSelectedSlot || bookingActionLoading}
                    >
                      {bookingActionLoading ? (
                        <CircularProgress size={18} color="inherit" />
                      ) : (
                        "Записаться на занятие"
                      )}
                    </Button>
                  </div>
                </div>
                <button
                  type="button"
                  className="student-profile__calendar-toggle"
                  onClick={() => setCreateSlotsExpanded((prev) => !prev)}
                  aria-label={
                    createSlotsExpanded
                      ? "Свернуть блок со слотами"
                      : "Развернуть блок со слотами"
                  }
                >
                  <span>
                    {createSlotsExpanded
                      ? "Свернуть слоты времени"
                      : "Показать слоты времени"}
                  </span>
                  {createSlotsExpanded ? (
                    <ExpandLessRoundedIcon fontSize="small" />
                  ) : (
                    <ExpandMoreRoundedIcon fontSize="small" />
                  )}
                </button>
              </>
            )}
          </section>
          {bookingsLoading && bookings.length === 0 ? (
            <ListSkeleton
              className="student-profile__skeletons"
              count={2}
              itemHeight={140}
            />
          ) : bookings.length === 0 ? (
            <div className="student-profile__empty">
              Записей на индивидуальные занятия пока нет.
            </div>
          ) : (
            <div className="student-profile__lessons-layout">
              <section className="student-profile__lessons-panel">
                <h3 className="student-profile__lessons-title">
                  Запланированные занятия
                </h3>
                {scheduledBookings.length === 0 ? (
                  <div className="student-profile__empty student-profile__empty--inner">
                    Запланированных занятий нет
                  </div>
                ) : (
                  <>
                    {pagedScheduledBookings.map(renderBookingCard)}
                    <ListPagination
                      page={safeScheduledPage}
                      totalItems={scheduledBookings.length}
                      pageSize={bookingsPageSize}
                      onPageChange={setScheduledPage}
                    />
                  </>
                )}
              </section>
              <div className="student-profile__lessons-divider" />
              <section className="student-profile__lessons-panel">
                <h3 className="student-profile__lessons-title">
                  Завершенные занятия
                </h3>
                {completedBookings.length === 0 ? (
                  <div className="student-profile__empty student-profile__empty--inner">
                    Завершенных занятий нет
                  </div>
                ) : (
                  <>
                    {pagedCompletedBookings.map(renderBookingCard)}
                    <ListPagination
                      page={safeCompletedPage}
                      totalItems={completedBookings.length}
                      pageSize={bookingsPageSize}
                      onPageChange={setCompletedPage}
                    />
                  </>
                )}
              </section>
            </div>
          )}
          {bookingsLoading && bookings.length > 0 && (
            <SectionLoader className="student-profile__loading" rows={1} compact showRing />
          )}
        </div>
      )}

      <Dialog
        open={Boolean(bookingToReschedule)}
        onClose={() => setBookingToReschedule(null)}
        fullWidth
        maxWidth="md"
        className="ui-dialog ui-dialog--wide student-profile-dialog"
      >
        <DialogTitleWithClose
          title="Перенос занятия"
          onClose={() => setBookingToReschedule(null)}
          closeAriaLabel="Закрыть окно переноса занятия"
        />
        <DialogContent className="student-profile__dialog-content">
          <div className="student-profile__calendar-head">
            <h3 className="student-profile__lessons-title">
              Выберите новый слот
            </h3>
            <span>Свободные интервалы доступны только на 21 день вперед</span>
          </div>
          {availability.length === 0 ? (
            <div className="student-profile__empty student-profile__empty--inner">
              Свободных слотов пока нет.
            </div>
          ) : (
            <>
              <div className="student-profile__calendar-days">
                {calendarDays.map((day) => {
                  const isAvailable = availableDateSet.has(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      className={`student-profile__calendar-day ${
                        rescheduleDate === day.value ? "is-active" : ""
                      } ${isAvailable ? "is-available" : "is-muted"} ${
                        day.isWeekend ? "is-weekend" : ""
                      }`}
                      onClick={() => {
                        setRescheduleDate(day.value);
                        setRescheduleSlotId(null);
                      }}
                    >
                      <span className="student-profile__calendar-weekday">
                        {day.weekday}
                      </span>
                      <span className="student-profile__calendar-daynum">
                        {day.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="student-profile__calendar-title">
                {rescheduleDate ? formatLongDate(rescheduleDate) : ""}
              </div>
              {(slotsByDate[rescheduleDate] ?? []).length === 0 ? (
                <div className="student-profile__empty student-profile__empty--inner">
                  На выбранную дату свободных слотов нет.
                </div>
              ) : (
                <div className="student-profile__calendar-times">
                  {(slotsByDate[rescheduleDate] ?? []).map((slot) => (
                    <button
                      key={slot.id}
                      type="button"
                      className={`student-profile__calendar-time ${
                        rescheduleSlotId === slot.id ? "is-active" : ""
                      }`}
                      onClick={() => setRescheduleSlotId(slot.id)}
                    >
                      <span>
                        {slot.startTime} – {slot.endTime}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {rescheduleSelectedSlot && (
                <div className="student-profile__calendar-summary">
                  <span>Новый выбранный слот:</span>
                  <strong>
                    {rescheduleSelectedSlot.startTime} – {rescheduleSelectedSlot.endTime}
                  </strong>
                </div>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            color="inherit"
            onClick={() => setBookingToReschedule(null)}
            disabled={bookingActionLoading}
            sx={mobileDialogActionSx}
            aria-label={isMobile ? "Отмена" : undefined}
          >
            {isMobile ? <CloseRoundedIcon fontSize="small" /> : "Отмена"}
          </Button>
          <Button
            variant="contained"
            onClick={() => void handleRescheduleBooking()}
            disabled={!rescheduleSelectedSlot || bookingActionLoading}
            sx={mobileDialogActionSx}
            aria-label={isMobile ? "Сохранить новое время" : undefined}
          >
            {bookingActionLoading ? (
              <CircularProgress size={18} color="inherit" />
            ) : isMobile ? (
              <SaveRoundedIcon fontSize="small" />
            ) : (
              "Сохранить новое время"
            )}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(bookingToCancel)}
        onClose={() => setBookingToCancel(null)}
        fullWidth
        maxWidth="xs"
        className="ui-dialog ui-dialog--compact student-profile-dialog"
      >
        <DialogTitleWithClose
          title="Отменить занятие?"
          onClose={() => setBookingToCancel(null)}
          closeAriaLabel="Закрыть окно отмены занятия"
        />
        <DialogContent className="student-profile__dialog-content">
          <Alert severity="warning">
            Вы уверены, что хотите отменить запись? Вместо отмены можно выбрать
            другое свободное время через кнопку ниже.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button
            color="inherit"
            onClick={() => setBookingToCancel(null)}
            sx={mobileDialogActionSx}
            aria-label={isMobile ? "Закрыть" : undefined}
          >
            {isMobile ? <CloseRoundedIcon fontSize="small" /> : "Закрыть"}
          </Button>
          <Button
            variant="outlined"
            onClick={() => {
              if (bookingToCancel) {
                openRescheduleDialog(bookingToCancel);
              }
              setBookingToCancel(null);
            }}
            sx={mobileDialogActionSx}
            aria-label={isMobile ? "Выбрать другую дату" : undefined}
          >
            {isMobile ? (
              <EditCalendarRoundedIcon fontSize="small" />
            ) : (
              "Выбрать другую дату"
            )}
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => void handleCancelBooking()}
            disabled={bookingActionLoading}
            sx={mobileDialogActionSx}
            aria-label={isMobile ? "Отменить занятие" : undefined}
          >
            {bookingActionLoading ? (
              <CircularProgress size={18} color="inherit" />
            ) : isMobile ? (
              <DeleteOutlineRoundedIcon fontSize="small" />
            ) : (
              "Отменить занятие"
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {tab === 0 && (
        <div className="student-profile__profile-layout">
          <div className="student-profile__profile-card">
            <div className="student-profile__profile-head">
              <div className="student-profile__profile-head-main">
                <h2>Личные данные</h2>
                <span>Изменения сохраняются в вашем аккаунте</span>
              </div>
              <div className="student-profile__profile-head-actions">
                {profileEditing ? (
                  <>
                    <IconButton
                      className="student-profile__profile-head-action student-profile__profile-head-action--save"
                      onClick={async () => {
                        if (!user) return;
                        setSaving(true);
                        setProfileError(null);
                        try {
                          const updated = await updateUserProfile(user.id, {
                            firstName: profileDraft.firstName.trim(),
                            lastName: profileDraft.lastName.trim(),
                            phone: toRuPhoneStorage(profileDraft.phone),
                            photo: profileDraft.photo,
                          });
                          updateUser(updated);
                          setProfileEditing(false);
                        } catch (error) {
                          setProfileError(
                            error instanceof Error
                              ? error.message
                              : "Не удалось сохранить профиль."
                          );
                        } finally {
                          setSaving(false);
                        }
                      }}
                      disabled={saving}
                      aria-label="Сохранить изменения профиля"
                    >
                      {saving ? (
                        <CircularProgress size={18} color="inherit" />
                      ) : (
                        <SaveRoundedIcon fontSize="small" />
                      )}
                    </IconButton>
                    <IconButton
                      className="student-profile__profile-head-action"
                      onClick={() => {
                        setProfileDraft({
                          firstName: user.firstName ?? "",
                          lastName: user.lastName ?? "",
                          phone: user.phone ?? "",
                          photo: user.photo ?? "",
                        });
                        setProfileEditing(false);
                      }}
                      disabled={saving}
                      aria-label="Отменить изменения профиля"
                    >
                      <CloseRoundedIcon fontSize="small" />
                    </IconButton>
                  </>
                ) : (
                  <IconButton
                    className="student-profile__profile-head-action"
                    onClick={() => {
                      setProfileDraft({
                        firstName: user.firstName ?? "",
                        lastName: user.lastName ?? "",
                        phone: user.phone ?? "",
                        photo: user.photo ?? "",
                      });
                      setProfileEditing(true);
                    }}
                    aria-label="Редактировать профиль"
                  >
                    <EditRoundedIcon fontSize="small" />
                  </IconButton>
                )}
              </div>
            </div>
            {profileError && <Alert severity="error">{profileError}</Alert>}
            <div
              className={`student-profile__profile-main ${
                profileEditing ? "is-editing" : "has-bot"
              }`}
            >
              <div className="student-profile__profile-avatar">
                <Avatar
                  src={profileDraft.photo || undefined}
                  className="student-profile__avatar"
                  sx={avatarResponsiveSx}
                >
                  {(user.firstName || user.email)[0]}
                </Avatar>
                {!profileEditing && (
                  <span
                    className="student-profile__avatar-verified"
                    aria-label="Профиль подтвержден"
                    title="Профиль подтвержден"
                  >
                    <TaskAltRoundedIcon fontSize="inherit" />
                  </span>
                )}
                {profileEditing && (
                  <Button
                    variant="outlined"
                    onClick={() => avatarInputRef.current?.click()}
                    className="student-profile__avatar-button"
                  >
                    Загрузить фото
                  </Button>
                )}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  ref={avatarInputRef}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const dataUrl = await fileToDataUrl(file);
                    setProfileDraft((prev) => ({ ...prev, photo: dataUrl }));
                    e.target.value = "";
                  }}
                />
                {!profileEditing && (
                  <div className="student-profile__identity-cloud">
                    <div className="student-profile__identity-pill student-profile__identity-pill--status">
                      {roleLabel}
                    </div>
                    <div className="student-profile__identity-pill student-profile__identity-pill--name">
                      {profileDraft.firstName || "Имя"} {profileDraft.lastName || "Фамилия"}
                    </div>
                    <div className="student-profile__identity-pill student-profile__identity-pill--mail">
                      {user.email}
                    </div>
                    <div className="student-profile__identity-pill student-profile__identity-pill--phone">
                      {formatRuPhoneDisplay(profileDraft.phone) || "Телефон не указан"}
                    </div>
                  </div>
                )}
              </div>

              {profileEditing ? (
                <div className="student-profile__profile-fields">
                  <TextField
                    label="Имя"
                    value={profileDraft.firstName}
                    onChange={(e) =>
                      setProfileDraft((prev) => ({
                        ...prev,
                        firstName: e.target.value,
                      }))
                    }
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    label="Фамилия"
                    value={profileDraft.lastName}
                    onChange={(e) =>
                      setProfileDraft((prev) => ({
                        ...prev,
                        lastName: e.target.value,
                      }))
                    }
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    label="Статус"
                    value={roleLabel}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    disabled
                  />
                  <TextField
                    label="Email"
                    value={user.email}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    disabled
                  />
                  <TextField
                    label="Телефон"
                    value={formatRuPhoneInput(profileDraft.phone)}
                    onChange={(e) =>
                      setProfileDraft((prev) => ({
                        ...prev,
                        phone: formatRuPhoneInput(e.target.value),
                      }))
                    }
                    placeholder={PHONE_MASK_TEMPLATE}
                    inputProps={{ inputMode: "tel" }}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                  />

                </div>
              ) : null}
            </div>
            <PasswordSecurityCard className="student-profile__password-card" />
          </div>
          <NewsFeedPanel user={user} />
        </div>
      )}

      <div style={{ display: tab === 3 ? "block" : "none" }} aria-hidden={tab !== 3}>
        <StudyCabinetPanel
          role="student"
          onWorkbookClick={() => {
            void handleOpenWorkbook();
          }}
          onChatClick={() => {
            void handleOpenTeacherChat();
          }}
          chatLocked={chatEligibility?.available === false}
          activityDays={studyActivityDays}
          activityStats={studyStats}
          calendarEvents={studyCalendarEvents}
          generalReminders={studyGeneralReminders}
          notes={studyNotes}
          allowNoteEditor
          onCreateNote={handleStudentCreateNote}
          onUpdateNote={handleStudentUpdateNote}
          onDeleteNote={handleStudentDeleteNote}
          reminderHint={
            studyDraftsLoading
              ? "Обновляем данные учебного кабинета..."
              : null
          }
        />
      </div>

      {tab === CHAT_TAB_INDEX && chatAccessAvailable && <ChatPage />}

      <AxiomAssistant
        userId={user.id}
        role="student"
        mode={tab === 1 ? "course" : tab === 3 ? "study-cabinet" : "course"}
      />

    </div>
  );
}
