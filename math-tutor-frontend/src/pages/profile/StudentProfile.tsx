import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
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
  Drawer,
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
import CollectionsBookmarkRoundedIcon from "@mui/icons-material/CollectionsBookmarkRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DiamondRoundedIcon from "@mui/icons-material/DiamondRounded";
import ForumRoundedIcon from "@mui/icons-material/ForumRounded";
import SpaceDashboardRoundedIcon from "@mui/icons-material/SpaceDashboardRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import EditCalendarRoundedIcon from "@mui/icons-material/EditCalendarRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import PhotoCameraRoundedIcon from "@mui/icons-material/PhotoCameraRounded";
import AppsRoundedIcon from "@mui/icons-material/AppsRounded";
import {
  createBooking,
  deleteBooking,
  rescheduleBooking,
} from "@/entities/booking/model/storage";
import type { Booking } from "@/entities/booking/model/types";
import { useAuth } from "@/features/auth/model/AuthContext";
import { useLocation, useNavigate } from "react-router-dom";
import { fileToDataUrl } from "@/shared/lib/files";
import { updateUserProfile } from "@/features/auth/model/api";
import { NewsFeedPanel } from "@/features/news-feed/ui/NewsFeedPanel";
import { ListPagination } from "@/shared/ui/ListPagination";
import type { AvailabilitySlot } from "@/features/teacher-availability/model/types";
import type { User } from "@/entities/user/model/types";
import { StudyCabinetPanel } from "@/shared/ui/StudyCabinetPanel";
import {
  openExternalWhiteboard,
  WORKBOOK_POPUP_BLOCKED_MESSAGE,
} from "@/shared/lib/openExternalWhiteboard";
import type { StudentStudyCabinetCourseItem } from "@/features/study-cabinet/student/model/types";
import { useStudentProfileData } from "@/pages/profile/hooks/useStudentProfileData";
import {
  buildBnplReminderItems,
  countScheduledBookings,
  filterStudentCoursesByQuery,
  formatBookingReminderDate,
  paginateItems,
  resolveSafePage,
  selectUnpaidCompletedBooking,
  selectUpcomingBooking,
  sortBookingsByTimeline,
  splitBookingsByCompletion,
} from "@/pages/profile/model/selectors";
import { useStudentProfileUiState } from "@/pages/profile/hooks/useStudentProfileUiState";
import { DialogTitleWithClose } from "@/shared/ui/DialogTitleWithClose";
import { BnplReminderFeed } from "@/entities/purchase/ui/BnplReminderFeed";
import {
  getTeacherChatEligibility,
} from "@/features/chat/model/api";
import type { TeacherChatEligibility } from "@/features/chat/model/types";
import ChatPage from "@/pages/chat/ChatPage";
import {
  PHONE_MASK_TEMPLATE,
  formatRuPhoneInput,
  toRuPhoneStorage,
} from "@/shared/lib/phone";
import {
  buildCalendarDays,
  formatLongDate,
  groupSlotsByDate,
  isFutureSlot,
} from "@/features/booking/lib/schedule";
import { AccessStateBanner } from "@/shared/ui/AccessStateBanner";
import { useRecoverAccessNotice } from "@/features/auth/model/useRecoverAccessNotice";
import { PasswordSecurityCard } from "@/features/auth/ui/PasswordSecurityCard";
import { RecoverableErrorAlert } from "@/shared/ui/RecoverableErrorAlert";
import {
  isBookingCompleted,
} from "@/shared/lib/time";
import { ListSkeleton, SectionLoader } from "@/shared/ui/loading";
import { logCollectionPressure, usePerfScreenTag } from "@/shared/lib/perfScreen";
import {
  buildStudyCabinetWeekActivity,
  type StudyCabinetNote,
} from "@/shared/lib/studyCabinet";
import { formatUserBadgeName, getUserAvatarInitial } from "@/shared/lib/userDisplayName";

const PROFILE_AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export default function StudentProfile() {
  const WORKBOOK_TAB_INDEX = 4;
  const CHAT_TAB_INDEX = 5;
  const { user, updateUser, openAuthModal, openRecoverModal } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isNonDesktop = useMediaQuery(theme.breakpoints.down("lg"));
  const userId = user?.id;
  const navigate = useNavigate();
  const location = useLocation();
  const {
    tab,
    setTab,
    courseQuery,
    setCourseQuery,
    createDate,
    setCreateDate,
    createSlotId,
    setCreateSlotId,
    rescheduleDate,
    setRescheduleDate,
    rescheduleSlotId,
    setRescheduleSlotId,
    chatUnreadCount,
    setChatUnreadCount,
    tabMenuOpen,
    setTabMenuOpen,
    studyActivityVersion,
    setStudyActivityVersion,
    coursesPage,
    setCoursesPage,
    scheduledPage,
    setScheduledPage,
    completedPage,
    setCompletedPage,
    createAcceptTerms,
    setCreateAcceptTerms,
    createAcceptPrivacy,
    setCreateAcceptPrivacy,
    resetStudentProfileUiState,
  } = useStudentProfileUiState();
  usePerfScreenTag("StudentProfile");
  const [saving, setSaving] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
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
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [bookingDialogMode, setBookingDialogMode] = useState<
    "create" | "reschedule"
  >("create");
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
  const [lockedToolsModal, setLockedToolsModal] = useState<
    "workbook" | "chat" | null
  >(null);
  const [chatEligibility, setChatEligibility] =
    useState<TeacherChatEligibility | null>(null);
  const [studyNotes, setStudyNotes] = useState<StudyCabinetNote[]>([]);
  const {
    state: accessNoticeState,
    recheck: recheckAccessNotice,
    repair: repairAccessNotice,
  } =
    useRecoverAccessNotice({
      email: user?.email,
      role: user?.role,
    });

  const [items, setItems] = useState<StudentStudyCabinetCourseItem[]>([]);

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

  useEffect(() => {
    resetStudentProfileUiState();
  }, [resetStudentProfileUiState, userId]);

  const {
    setTabWithQuery,
    loadStudentCourses,
    loadStudentBookings,
    loadSchedulingContext,
  } = useStudentProfileData({
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
  });

  useEffect(() => {
    if (!isNonDesktop && tabMenuOpen) {
      setTabMenuOpen(false);
    }
  }, [isNonDesktop, setTabMenuOpen, tabMenuOpen]);

  useEffect(() => {
    if (chatAccessAvailable) return;
    if (tab === WORKBOOK_TAB_INDEX) {
      setLockedToolsModal("workbook");
      setTabWithQuery(3, { replace: true });
      return;
    }
    if (tab === CHAT_TAB_INDEX) {
      setLockedToolsModal("chat");
      setTabWithQuery(3, { replace: true });
    }
  }, [
    chatAccessAvailable,
    tab,
    WORKBOOK_TAB_INDEX,
    CHAT_TAB_INDEX,
    setTabWithQuery,
  ]);

  const upcomingBooking = useMemo(() => selectUpcomingBooking(bookings), [bookings]);
  const unpaidCompletedBooking = useMemo(
    () => selectUnpaidCompletedBooking(bookings),
    [bookings]
  );
  const sortedBookings = useMemo(() => sortBookingsByTimeline(bookings), [bookings]);
  const { scheduled: scheduledBookings, completed: completedBookings } = useMemo(
    () => splitBookingsByCompletion(sortedBookings),
    [sortedBookings]
  );
  const scheduledCount = useMemo(
    () => countScheduledBookings(bookings),
    [bookings]
  );

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
  const rescheduleSelectedSlot = useMemo(
    () => availability.find((slot) => slot.id === rescheduleSlotId) ?? null,
    [availability, rescheduleSlotId]
  );

  useEffect(() => {
    if (!calendarDays.some((day) => day.value === createDate)) {
      setCreateDate(firstAvailableDate);
      setCreateSlotId(null);
    }
  }, [calendarDays, createDate, firstAvailableDate, setCreateDate, setCreateSlotId]);

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
    setRescheduleDate,
    setRescheduleSlotId,
  ]);

  useEffect(() => {
    if (tab !== 2) {
      setCreateAcceptTerms(false);
      setCreateAcceptPrivacy(false);
      setBookingDialogOpen(false);
      setBookingDialogMode("create");
      setBookingToReschedule(null);
    }
  }, [setCreateAcceptPrivacy, setCreateAcceptTerms, tab]);

  const coursesPageSize = isMobile ? 2 : 4;
  const bookingsPageSize = isMobile ? 2 : 4;

  const filteredCourseItems = useMemo(
    () => filterStudentCoursesByQuery(items, courseQuery),
    [items, courseQuery]
  );
  const { safePage: safeCoursesPage } = useMemo(
    () => resolveSafePage(coursesPage, filteredCourseItems.length, coursesPageSize),
    [coursesPage, filteredCourseItems.length, coursesPageSize]
  );
  const { safePage: safeScheduledPage } = useMemo(
    () => resolveSafePage(scheduledPage, scheduledBookings.length, bookingsPageSize),
    [scheduledPage, scheduledBookings.length, bookingsPageSize]
  );
  const { safePage: safeCompletedPage } = useMemo(
    () => resolveSafePage(completedPage, completedBookings.length, bookingsPageSize),
    [completedPage, completedBookings.length, bookingsPageSize]
  );

  const pagedCourseItems = useMemo(
    () => paginateItems(filteredCourseItems, safeCoursesPage, coursesPageSize),
    [filteredCourseItems, safeCoursesPage, coursesPageSize]
  );

  const pagedScheduledBookings = useMemo(
    () => paginateItems(scheduledBookings, safeScheduledPage, bookingsPageSize),
    [scheduledBookings, safeScheduledPage, bookingsPageSize]
  );

  const pagedCompletedBookings = useMemo(
    () => paginateItems(completedBookings, safeCompletedPage, bookingsPageSize),
    [completedBookings, safeCompletedPage, bookingsPageSize]
  );

  const bookingModalDate =
    bookingDialogMode === "reschedule" ? rescheduleDate : createDate;
  const bookingModalSlotId =
    bookingDialogMode === "reschedule" ? rescheduleSlotId : createSlotId;
  const bookingModalSlots = slotsByDate[bookingModalDate] ?? [];
  const bookingModalSelectedSlot =
    bookingDialogMode === "reschedule" ? rescheduleSelectedSlot : createSelectedSlot;

  useEffect(() => {
    logCollectionPressure({
      screen: "StudentProfile",
      metric: "student-dashboard-collections",
      size: items.length + bookings.length + availability.length,
      warnAt: 120,
      errorAt: 240,
      details: {
        courses: items.length,
        bookings: bookings.length,
        availability: availability.length,
      },
    });
  }, [availability.length, bookings.length, items.length]);

  const bnplReminderItems = useMemo(() => buildBnplReminderItems(items), [items]);

  const studyActivityDays = useMemo(() => {
    const recalcSeed = studyActivityVersion;
    void recalcSeed;
    if (!userId) return [];
    return buildStudyCabinetWeekActivity("student", userId);
  }, [userId, studyActivityVersion]);

  const openRescheduleDialog = (booking: Booking) => {
    setBookingToReschedule(booking);
    const targetDate = calendarDays.some((day) => day.value === booking.date)
      ? booking.date
      : firstAvailableDate;
    setRescheduleDate(targetDate);
    setRescheduleSlotId(null);
    setBookingDialogMode("reschedule");
    setBookingDialogOpen(true);
    setBookingSuccess(null);
  };

  const openCreateBookingDialog = () => {
    const targetDate = calendarDays.some((day) => day.value === createDate)
      ? createDate
      : firstAvailableDate;
    setCreateDate(targetDate);
    setCreateSlotId(null);
    setBookingToReschedule(null);
    setBookingDialogMode("create");
    setBookingDialogOpen(true);
    setBookingSuccess(null);
  };

  const closeBookingDialog = () => {
    setBookingDialogOpen(false);
    if (bookingDialogMode === "reschedule") {
      setBookingToReschedule(null);
      setRescheduleSlotId(null);
    }
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
      setBookingDialogOpen(false);
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
      setBookingDialogOpen(false);
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
          {!isCompleted && (
            <div className="student-profile__lesson-head-actions">
              <button
                type="button"
                className="student-profile__lesson-reschedule"
                onClick={() => openRescheduleDialog(booking)}
                aria-label="Перенести занятие"
              >
                <EditCalendarRoundedIcon fontSize="small" />
                <span>Перенос занятия</span>
              </button>
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
        <div className="student-profile__lesson-status-line">
          <span
            className={`student-profile__lesson-status ${
              isCompleted
                ? "student-profile__lesson-status--completed"
                : "student-profile__lesson-status--scheduled"
            }`}
          >
            {isCompleted ? "Завершено" : "Запланировано"}
          </span>
          {isTrial && (
            <span className="student-profile__lesson-kind">
              Пробное занятие
            </span>
          )}
          <span
            className={`student-profile__lesson-payment ${
              isPaid
                ? "student-profile__lesson-payment--paid"
                : "student-profile__lesson-payment--unpaid"
            }`}
          >
            {isPaid ? "Оплачено" : "Не оплачено"}
          </span>
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
      const launch = await openExternalWhiteboard({
        from: "/student/profile?tab=study",
      });
      if (!launch.ok) {
        setChatNotice({
          severity: "warning",
          message:
            launch.error ??
            "Не удалось открыть рабочую тетрадь. Попробуйте позже.",
        });
      } else if (launch.code === "popup_blocked") {
        setChatNotice({
          severity: "warning",
          message: WORKBOOK_POPUP_BLOCKED_MESSAGE,
        });
      }
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

  const handleStudentTabSelect = (nextTab: number) => {
    if (nextTab === WORKBOOK_TAB_INDEX) {
      if (!chatAccessAvailable) {
        setLockedToolsModal("workbook");
        return;
      }
      setTabWithQuery(WORKBOOK_TAB_INDEX, { replace: true });
      return;
    }
    if (nextTab === CHAT_TAB_INDEX) {
      if (!chatAccessAvailable) {
        setLockedToolsModal("chat");
        return;
      }
      setTabWithQuery(CHAT_TAB_INDEX, { replace: true });
      return;
    }
    setTabWithQuery(nextTab, { replace: true });
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

  const studentTabItems = useMemo(
    () =>
      [
        {
          index: 0,
          label: "Мой профиль",
          icon: <PersonRoundedIcon />,
        },
        {
          index: 1,
          label: "Мои курсы",
          icon: <MenuBookRoundedIcon />,
        },
        {
          index: 2,
          label: "Индивидуальные занятия",
          icon: (
            <Badge color="error" variant="dot" invisible={scheduledCount === 0}>
              <EventAvailableRoundedIcon />
            </Badge>
          ),
        },
        {
          index: 3,
          label: "Учебный кабинет",
          icon: <CollectionsBookmarkRoundedIcon />,
        },
        {
          index: WORKBOOK_TAB_INDEX,
          label: "Рабочая тетрадь",
          premium: true,
          icon: <AutoStoriesRoundedIcon />,
        },
        {
          index: CHAT_TAB_INDEX,
          label: "Чат",
          premium: true,
          icon: (
            <Badge
              color="error"
              badgeContent={chatUnreadCount > 99 ? "99+" : chatUnreadCount}
              invisible={chatUnreadCount <= 0 || !chatAccessAvailable}
            >
              <ForumRoundedIcon />
            </Badge>
          ),
        },
      ] satisfies Array<{
        index: number;
        label: string;
        icon: ReactNode;
        premium?: boolean;
      }>,
    [
      CHAT_TAB_INDEX,
      WORKBOOK_TAB_INDEX,
      chatAccessAvailable,
      chatUnreadCount,
      scheduledCount,
    ]
  );

  const activeStudentTab = useMemo(
    () =>
      studentTabItems.find((item) => item.index === tab) ?? studentTabItems[0] ?? null,
    [studentTabItems, tab]
  );

  if (!user) return null;
  const roleLabel = user.role === "teacher" ? "Преподаватель" : "Студент";
  const identityName = formatUserBadgeName(user);
  const identityInitial = getUserAvatarInitial(user) || "С";

  const openProfileEditDialog = () => {
    setProfileDraft({
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      phone: user.phone ?? "",
      photo: user.photo ?? "",
    });
    setProfileError(null);
    setProfileEditing(true);
  };

  const closeProfileEditDialog = () => {
    setProfileDraft({
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      phone: user.phone ?? "",
      photo: user.photo ?? "",
    });
    setProfileError(null);
    setProfileEditing(false);
  };

  const saveProfileDraft = async () => {
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
        error instanceof Error ? error.message : "Не удалось сохранить профиль."
      );
    } finally {
      setSaving(false);
    }
  };

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
      <Dialog
        open={lockedToolsModal !== null}
        onClose={() => setLockedToolsModal(null)}
        fullWidth
        maxWidth="xs"
        className="ui-dialog ui-dialog--compact student-profile__locked-tools-modal"
      >
        <DialogTitleWithClose
          title="Премиум-инструменты"
          onClose={() => setLockedToolsModal(null)}
          closeAriaLabel="Закрыть уведомление"
        />
        <DialogContent className="student-profile__locked-tools-content">
          <p>
            {lockedToolsModal === "chat"
              ? "Чат с преподавателем доступен после покупки премиум-курса или записи на индивидуальное занятие."
              : "Рабочая тетрадь доступна после покупки премиум-курса или записи на индивидуальное занятие."}
          </p>
        </DialogContent>
        <DialogActions className="student-profile__locked-tools-actions">
          <Button color="inherit" onClick={() => setLockedToolsModal(null)}>
            Понятно
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setLockedToolsModal(null);
              setTabWithQuery(2, { replace: true });
            }}
          >
            Индивидуальные занятия
          </Button>
        </DialogActions>
      </Dialog>
      {unpaidCompletedBooking && (
        <div className="student-profile__reminder student-profile__reminder--priority">
          {`Оплата занятия ${formatBookingReminderDate(unpaidCompletedBooking)} не подтверждена.`}
        </div>
      )}
      {upcomingBooking && (
        <div className="student-profile__reminder">
          {`Ближайшее занятие: ${formatBookingReminderDate(upcomingBooking)}`}
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
            openProfileEditDialog();
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
      </div>
      <div
        className={
          isNonDesktop
            ? "student-profile__workspace"
            : "student-profile__workspace student-profile__workspace--with-tabs"
        }
      >
        {!isNonDesktop ? (
          <div className="student-profile__nav-shell">
            <section className="student-profile__identity-card">
              <IconButton
                className="student-profile__identity-edit-icon"
                onClick={openProfileEditDialog}
                aria-label="Редактировать профиль"
                size="small"
              >
                <EditRoundedIcon fontSize="small" />
              </IconButton>
              <div className="student-profile__identity-main">
                <Avatar
                  className="student-profile__identity-avatar"
                  src={user.photo || undefined}
                >
                  {identityInitial}
                </Avatar>
                <div className="student-profile__identity-copy">
                  <h3>{identityName || "Профиль студента"}</h3>
                  <span className="student-profile__identity-role">{roleLabel}</span>
                </div>
              </div>
            </section>
            <Tabs
              orientation="vertical"
              value={tab}
              onChange={(_, next) => handleStudentTabSelect(next)}
              className="student-profile__tabs"
            >
              {studentTabItems.map((item) => (
                <Tab
                  key={item.index}
                  label={
                    <span
                      className={`student-profile__tab-label ${
                        item.premium ? "student-profile__tab-label--premium" : ""
                      }`}
                    >
                      <span>{item.label}</span>
                      {item.premium ? (
                        <DiamondRoundedIcon className="student-profile__tab-diamond" />
                      ) : null}
                    </span>
                  }
                  icon={item.icon}
                  iconPosition="start"
                />
              ))}
            </Tabs>
          </div>
        ) : (
          <div className="student-profile__tabs-mobile">
            <Button
              className="student-profile__tabs-mobile-trigger"
              variant="outlined"
              startIcon={<AppsRoundedIcon />}
              onClick={() => setTabMenuOpen(true)}
            >
              {activeStudentTab ? `Раздел: ${activeStudentTab.label}` : "Разделы"}
            </Button>
          </div>
        )}
        <div className="student-profile__workspace-main">
          {isNonDesktop ? (
            <section className="student-profile__identity-card student-profile__identity-card--mobile">
              <IconButton
                className="student-profile__identity-edit-icon"
                onClick={openProfileEditDialog}
                aria-label="Редактировать профиль"
                size="small"
              >
                <EditRoundedIcon fontSize="small" />
              </IconButton>
              <div className="student-profile__identity-main">
                <Avatar
                  className="student-profile__identity-avatar"
                  src={user.photo || undefined}
                >
                  {identityInitial}
                </Avatar>
                <div className="student-profile__identity-copy">
                  <h3>{identityName || "Профиль студента"}</h3>
                  <span className="student-profile__identity-role">{roleLabel}</span>
                </div>
              </div>
            </section>
          ) : null}

      {tab === 1 && (
        <div className="student-profile__courses">
          <div className="student-profile__page-head">
            <div>
              <h2>Мои курсы</h2>
              <p>Откройте курс и продолжите обучение.</p>
            </div>
          </div>
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
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRoundedIcon fontSize="small" />
                  </InputAdornment>
                ),
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
            <div className="student-profile__empty student-profile__empty--feature">
              <MenuBookRoundedIcon fontSize="small" />
              <strong>Курсы пока не добавлены</strong>
              <span>После покупки курс появится в этом разделе.</span>
            </div>
          )}
          {pagedCourseItems.map(
            ({
              course,
              progress,
              viewedCount,
              totalLessons,
              totalTests,
              completedTests,
              testsKnowledgePercent,
              isPremium,
            }) => {
              const profileCoursesFrom = "/student/profile?tab=courses";
              const courseCtaLabel = "Продолжить";
              const learningPercent = Math.max(0, Math.min(100, Math.round(progress)));
              const testsPercent = Math.max(
                0,
                Math.min(100, Math.round(testsKnowledgePercent))
              );
              const resolveProgressPalette = (value: number) => {
                const clamped = Math.max(0, Math.min(100, value));
                const hue = Math.round((clamped / 100) * 130);
                const startHue = Math.max(4, hue - 18);
                const endHue = Math.min(140, hue + 14);
                return {
                  start: `hsl(${startHue} 84% 56%)`,
                  end: `hsl(${endHue} 88% 63%)`,
                };
              };
              const progressItems = [
                {
                  key: "content",
                  label: "Изучено",
                  value: learningPercent,
                },
                ...(totalTests > 0
                  ? [
                      {
                        key: "tests",
                        label: "Сдано",
                        value: testsPercent,
                      },
                    ]
                  : []),
              ];
              const navigateToCourse = () => {
                navigate(`/courses/${course.id}`, {
                  state: { from: profileCoursesFrom },
                });
              };
              return (
                <div
                  key={course.id}
                  className="student-profile__course-card"
                  role="button"
                  tabIndex={0}
                  onClick={navigateToCourse}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigateToCourse();
                    }
                  }}
                  aria-label={`Открыть курс ${course.title}`}
                >
                  <div className="student-profile__course-main">
                    <div className="student-profile__course-head">
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
                    </div>
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
                  </div>

                  <div className="student-profile__course-progress">
                    <div className="student-profile__course-progress-lines">
                      {progressItems.map((item) => {
                        const palette = resolveProgressPalette(item.value);
                        return (
                          <div
                            key={item.key}
                            className="student-profile__course-progress-line"
                          >
                            <div className="student-profile__course-progress-line-head">
                              <span>{item.label}</span>
                              <strong>{item.value}%</strong>
                            </div>
                            <div
                              className={`student-profile__course-progress-track ${
                                item.value === 0
                                  ? "student-profile__course-progress-track--empty"
                                  : ""
                              }`}
                            >
                              <span
                                className="student-profile__course-progress-fill"
                                style={{
                                  width: `${Math.max(
                                    item.value,
                                    item.value === 0 ? 4 : 0
                                  )}%`,
                                  background: `linear-gradient(90deg, ${palette.start}, ${palette.end})`,
                                }}
                              />
                              <span
                                className="student-profile__course-progress-point"
                                style={{
                                  left: `${item.value}%`,
                                  background: palette.end,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="student-profile__course-progress-actions">
                      <button
                        type="button"
                        className="student-profile__course-link student-profile__course-link--inline"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigateToCourse();
                        }}
                      >
                        <AutoStoriesRoundedIcon
                          fontSize="inherit"
                          className="student-profile__course-link-icon"
                        />
                        {courseCtaLabel}
                      </button>
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
          <div className="student-profile__page-head">
            <div>
              <h2>Индивидуальные занятия</h2>
              <p>Запись и история встреч.</p>
            </div>
          </div>
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
          <div className="student-profile__lessons-booking-action">
            <Button
              variant="outlined"
              className="student-profile__booking-trigger"
              startIcon={<EventAvailableRoundedIcon fontSize="small" />}
              onClick={openCreateBookingDialog}
              disabled={scheduleLoading}
            >
              Записаться на занятие
            </Button>
          </div>
          {bookingsLoading && bookings.length === 0 ? (
            <ListSkeleton
              className="student-profile__skeletons"
              count={2}
              itemHeight={140}
            />
          ) : bookings.length === 0 ? (
            <div className="student-profile__empty student-profile__empty--feature">
              <EventAvailableRoundedIcon fontSize="small" />
              <strong>Пока нет записей</strong>
              <span>Ваши занятия появятся здесь после бронирования.</span>
            </div>
          ) : (
            <div className="student-profile__lessons-layout">
              <section className="student-profile__lessons-panel">
                <h3 className="student-profile__lessons-title">
                  Запланированные занятия
                </h3>
                {scheduledBookings.length === 0 ? (
                  <div className="student-profile__empty student-profile__empty--inner">
                    Запланированных занятий пока нет
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
                    Завершённых занятий пока нет
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
        open={bookingDialogOpen}
        onClose={closeBookingDialog}
        fullWidth
        maxWidth="md"
        className="ui-dialog booking-dialog student-profile-dialog"
        disableRestoreFocus
      >
        <DialogTitleWithClose
          title={
            bookingDialogMode === "reschedule"
              ? "Перенос занятия"
              : "Выберите дату и время"
          }
          onClose={closeBookingDialog}
          closeAriaLabel="Закрыть окно выбора времени"
        />
        <DialogContent className="booking-calendar student-profile__booking-dialog-content">
          <div className="booking-calendar__legend">
            <span>
              <i className="booking-calendar__legend-dot booking-calendar__legend-dot--active" />
              Доступные даты
            </span>
            <span>
              <i className="booking-calendar__legend-dot" />
              Без свободных слотов
            </span>
          </div>
          {availability.length === 0 && (
            <div className="booking-calendar__empty">
              Свободных слотов пока нет.
            </div>
          )}
          <div className="booking-calendar__group">
            <div className="booking-calendar__section-title">
              <h4>Дата</h4>
              <span>Даты со свободными слотами подсвечены.</span>
            </div>
            <div className="booking-calendar__grid">
              {calendarDays.map((day) => {
                const isAvailable = availableDateSet.has(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    className={`booking-calendar__day ${
                      bookingModalDate === day.value ? "is-active" : ""
                    } ${isAvailable ? "is-available" : "is-muted"} ${
                      day.isWeekend ? "is-weekend" : ""
                    }`}
                    onClick={() => {
                      if (bookingDialogMode === "reschedule") {
                        setRescheduleDate(day.value);
                        setRescheduleSlotId(null);
                      } else {
                        setCreateDate(day.value);
                        setCreateSlotId(null);
                      }
                    }}
                  >
                    <span className="booking-calendar__weekday">
                      {day.weekday}
                    </span>
                    <span className="booking-calendar__daynum">{day.label}</span>
                    {day.isToday && (
                      <span className="booking-calendar__today">Сегодня</span>
                    )}
                    {isAvailable && <span className="booking-calendar__dot" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="booking-calendar__group">
            <div className="booking-calendar__section-title">
              <h4>Время</h4>
              <span>
                {bookingModalDate ? formatLongDate(bookingModalDate) : ""}
              </span>
            </div>
            {bookingModalSlots.length === 0 ? (
              <div className="booking-calendar__empty">
                На выбранную дату свободных слотов нет.
              </div>
            ) : (
              <div className="booking-calendar__times">
                {bookingModalSlots.map((slot) => (
                  <button
                    key={slot.id}
                    type="button"
                    className={`booking-calendar__time ${
                      bookingModalSlotId === slot.id ? "is-active" : ""
                    }`}
                    onClick={() => {
                      if (bookingDialogMode === "reschedule") {
                        setRescheduleSlotId(slot.id);
                      } else {
                        setCreateSlotId(slot.id);
                      }
                    }}
                  >
                    <span className="booking-calendar__time-range">
                      {slot.startTime} – {slot.endTime}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {bookingDialogMode === "create" && (
            <div className="booking-calendar__group student-profile__booking-consents">
              <FormControlLabel
                control={
                  <Checkbox
                    checked={createAcceptTerms}
                    onChange={(e) => setCreateAcceptTerms(e.target.checked)}
                  />
                }
                label="Согласен с условиями записи на занятие"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={createAcceptPrivacy}
                    onChange={(e) => setCreateAcceptPrivacy(e.target.checked)}
                  />
                }
                label="Согласен на обработку персональных данных"
              />
            </div>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={closeBookingDialog}
            color="inherit"
            disabled={bookingActionLoading}
            sx={mobileDialogActionSx}
            aria-label={isMobile ? "Отмена" : undefined}
          >
            {isMobile ? <CloseRoundedIcon fontSize="small" /> : "Отмена"}
          </Button>
          <Button
            variant="contained"
            onClick={() =>
              void (bookingDialogMode === "reschedule"
                ? handleRescheduleBooking()
                : handleCreateBooking())
            }
            disabled={!bookingModalSelectedSlot || bookingActionLoading}
            sx={mobileDialogActionSx}
            aria-label={isMobile ? "Подтвердить запись" : undefined}
          >
            {bookingActionLoading ? (
              <CircularProgress size={18} color="inherit" />
            ) : isMobile ? (
              bookingDialogMode === "reschedule" ? (
                <SaveRoundedIcon fontSize="small" />
              ) : (
                <EventAvailableRoundedIcon fontSize="small" />
              )
            ) : bookingDialogMode === "reschedule" ? (
              "Сохранить новое время"
            ) : (
              "Записаться"
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

      <Dialog
        open={profileEditing}
        onClose={closeProfileEditDialog}
        fullWidth
        maxWidth="sm"
        className="ui-dialog ui-dialog--compact student-profile__profile-edit-modal"
      >
        <DialogTitleWithClose
          title="Редактирование профиля"
          onClose={closeProfileEditDialog}
          closeAriaLabel="Закрыть окно редактирования профиля"
        />
        <DialogContent className="student-profile__profile-edit-content">
          <p className="student-profile__profile-edit-subtitle">
            Изменения применятся к аккаунту.
          </p>
          {profileError ? <Alert severity="error">{profileError}</Alert> : null}
          <div className="student-profile__profile-edit-avatar-row">
            <button
              type="button"
              className="student-profile__profile-edit-avatar-control"
              onClick={() => avatarInputRef.current?.click()}
              aria-label="Изменить фото профиля"
            >
              <Avatar
                src={profileDraft.photo || undefined}
                className="student-profile__profile-edit-avatar-media"
              >
                {identityInitial}
              </Avatar>
              <span className="student-profile__profile-edit-avatar-icon" aria-hidden>
                <PhotoCameraRoundedIcon fontSize="inherit" />
              </span>
            </button>
            <div className="student-profile__profile-edit-avatar-copy">
              <strong>Фото профиля</strong>
              <span>PNG, JPG или WEBP до 2 МБ</span>
            </div>
            <input
              type="file"
              accept="image/*"
              hidden
              ref={avatarInputRef}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (!file.type.startsWith("image/")) {
                  setProfileError("Загрузите изображение в формате PNG, JPG или WEBP.");
                  event.target.value = "";
                  return;
                }
                if (file.size > PROFILE_AVATAR_MAX_BYTES) {
                  setProfileError("Слишком большой файл аватара. Максимальный размер — 2 МБ.");
                  event.target.value = "";
                  return;
                }
                setProfileError(null);
                const dataUrl = await fileToDataUrl(file);
                setProfileDraft((prev) => ({ ...prev, photo: dataUrl }));
                event.target.value = "";
              }}
            />
          </div>
          <div className="student-profile__profile-edit-grid">
            <TextField
              label="Имя"
              value={profileDraft.firstName}
              onChange={(event) =>
                setProfileDraft((prev) => ({
                  ...prev,
                  firstName: event.target.value,
                }))
              }
              fullWidth
              autoComplete="given-name"
            />
            <TextField
              label="Фамилия"
              value={profileDraft.lastName}
              onChange={(event) =>
                setProfileDraft((prev) => ({
                  ...prev,
                  lastName: event.target.value,
                }))
              }
              fullWidth
              autoComplete="family-name"
            />
            <TextField
              label="Телефон"
              value={formatRuPhoneInput(profileDraft.phone)}
              onChange={(event) =>
                setProfileDraft((prev) => ({
                  ...prev,
                  phone: formatRuPhoneInput(event.target.value),
                }))
              }
              placeholder={PHONE_MASK_TEMPLATE}
              inputProps={{ inputMode: "tel" }}
              fullWidth
            />
            <TextField
              label="Email"
              value={user.email}
              fullWidth
              InputProps={{ readOnly: true }}
            />
          </div>
          <PasswordSecurityCard
            className="student-profile__profile-edit-security"
            presentation="row"
            title="Пароль"
          />
        </DialogContent>
        <DialogActions className="student-profile__profile-edit-actions">
          <Button color="inherit" onClick={closeProfileEditDialog} disabled={saving}>
            Отмена
          </Button>
          <Button
            variant="contained"
            onClick={() => void saveProfileDraft()}
            disabled={saving}
          >
            {saving ? "Сохраняем..." : "Сохранить изменения"}
          </Button>
        </DialogActions>
      </Dialog>

      {tab === 0 && (
        <div className="student-profile__profile-feed">
          <NewsFeedPanel user={user} />
        </div>
      )}

      <div style={{ display: tab === 3 ? "block" : "none" }} aria-hidden={tab !== 3}>
        <StudyCabinetPanel
          role="student"
          userId={user.id}
          courses={items}
          bookings={bookings}
          notes={studyNotes}
          activityDays={studyActivityDays}
          onBrowseCourses={() => {
            navigate("/courses", {
              state: { from: "/student/profile?tab=study" },
            });
          }}
          onOpenBooking={() => {
            setTabWithQuery(2);
          }}
          onOpenCourse={(courseId, options) => {
            navigate(`/courses/${courseId}`, {
              state: {
                from: "/student/profile?tab=study",
                focusBlockId: options?.blockId,
                source: options?.source,
              },
            });
          }}
          onOpenLesson={(lessonId, options) => {
            navigate(`/lessons/${lessonId}`, {
              state: {
                from: "/student/profile?tab=study",
                courseId: options?.courseId,
                source: options?.source,
              },
            });
          }}
          onOpenTest={(courseId, testItemId, options) => {
            navigate(`/courses/${courseId}/tests/${testItemId}`, {
              state: {
                from: "/student/profile?tab=study",
                source: options?.source,
              },
            });
          }}
          chatLocked={chatEligibility?.available === false}
          chatDisabled={!chatAccessAvailable}
        />
      </div>

      {tab === WORKBOOK_TAB_INDEX && (
        <section className="student-profile__tool-panel">
          <div className="student-profile__page-head">
            <div>
              <h2>Рабочая тетрадь</h2>
              <p>Открывайте цифровую тетрадь и фиксируйте решения в одном месте.</p>
            </div>
          </div>
          <div className="student-profile__tool-panel-shell">
            <Button
              variant="contained"
              onClick={() => {
                void handleOpenWorkbook();
              }}
            >
              Открыть рабочую тетрадь
            </Button>
          </div>
        </section>
      )}

      {tab === CHAT_TAB_INDEX && chatAccessAvailable && <ChatPage />}
        </div>
      </div>
      {isNonDesktop ? (
        <Drawer
          anchor={isMobile ? "bottom" : "left"}
          open={tabMenuOpen}
          onClose={() => setTabMenuOpen(false)}
          PaperProps={{
            className: isMobile
              ? "student-profile__tabs-drawer student-profile__tabs-drawer--mobile"
              : "student-profile__tabs-drawer",
          }}
        >
          <div className="student-profile__tabs-drawer-head">
            <h3>Разделы кабинета</h3>
            <span>Выберите нужный раздел</span>
          </div>
          <div className="student-profile__tabs-drawer-grid">
            {studentTabItems.map((item) => (
              <button
                key={item.index}
                type="button"
                className={`student-profile__tabs-drawer-item ${
                  tab === item.index ? "is-active" : ""
                }`}
                onClick={() => {
                  handleStudentTabSelect(item.index);
                  setTabMenuOpen(false);
                }}
              >
                <span className="student-profile__tabs-drawer-icon">{item.icon}</span>
                <span className="student-profile__tabs-drawer-label">
                  <span>{item.label}</span>
                  {item.premium ? (
                    <DiamondRoundedIcon className="student-profile__tab-diamond" />
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        </Drawer>
      ) : null}

    </div>
  );
}
