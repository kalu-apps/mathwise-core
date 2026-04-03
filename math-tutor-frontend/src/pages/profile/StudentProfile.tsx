import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
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
  buildStudentProgressVisual,
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
import { selectPurchaseFinancialView } from "@/entities/purchase/model/selectors";
import { BnplReminderFeed } from "@/entities/purchase/ui/BnplReminderFeed";
import {
  getTeacherChatEligibility,
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
import { getUserAvatarInitial } from "@/shared/lib/userDisplayName";

export default function StudentProfile() {
  const CHAT_TAB_INDEX = 4;
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
    createSlotsExpanded,
    setCreateSlotsExpanded,
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
      setCreateSlotsExpanded(false);
      setCreateAcceptTerms(false);
      setCreateAcceptPrivacy(false);
    }
  }, [setCreateAcceptPrivacy, setCreateAcceptTerms, setCreateSlotsExpanded, tab]);

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
          icon: <AutoStoriesRoundedIcon />,
        },
        ...(chatAccessAvailable
          ? [
              {
                index: CHAT_TAB_INDEX,
                label: "Чат",
                icon: (
                  <Badge
                    color="error"
                    badgeContent={chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                    invisible={chatUnreadCount <= 0}
                  >
                    <ForumRoundedIcon />
                  </Badge>
                ),
              },
            ]
          : []),
      ] satisfies Array<{ index: number; label: string; icon: ReactNode }>,
    [chatAccessAvailable, CHAT_TAB_INDEX, chatUnreadCount, scheduledCount]
  );

  const activeStudentTab = useMemo(
    () =>
      studentTabItems.find((item) => item.index === tab) ?? studentTabItems[0] ?? null,
    [studentTabItems, tab]
  );

  if (!user) return null;
  const roleLabel = user.role === "teacher" ? "Преподаватель" : "Студент";

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
          Внимание: занятие от {formatBookingReminderDate(unpaidCompletedBooking)} пока не
          отмечено как оплачено. Свяжитесь с преподавателем для подтверждения.
        </div>
      )}
      {upcomingBooking && (
        <div className="student-profile__reminder">
          Напоминание: занятие назначено на {formatBookingReminderDate(upcomingBooking)}
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
        {!isNonDesktop ? (
          <Tabs
            value={tab}
            onChange={(_, next) => setTabWithQuery(next, { replace: true })}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            className="student-profile__tabs"
          >
            {studentTabItems.map((item) => (
              <Tab
                key={item.index}
                label={<span className="student-profile__tab-label">{item.label}</span>}
                icon={item.icon}
                iconPosition="start"
              />
            ))}
          </Tabs>
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
                  setTabWithQuery(item.index, { replace: true });
                  setTabMenuOpen(false);
                }}
              >
                <span className="student-profile__tabs-drawer-icon">{item.icon}</span>
                <span className="student-profile__tabs-drawer-label">{item.label}</span>
              </button>
            ))}
          </div>
        </Drawer>
      ) : null}

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
              const learningVisual = buildStudentProgressVisual(progress);
              const knowledgeVisual = buildStudentProgressVisual(testsKnowledgePercent);
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
              const paymentActionLabel = "Оплата";
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
                        {paymentActionLabel}
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
                          Изучено
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
                            Сдано
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
                  {getUserAvatarInitial(user)}
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
          userId={user.id}
          courses={items}
          bookings={bookings}
          notes={studyNotes}
          activityDays={studyActivityDays}
          onWorkbookClick={() => {
            void handleOpenWorkbook();
          }}
          onChatClick={() => {
            void handleOpenTeacherChat();
          }}
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

      {tab === CHAT_TAB_INDEX && chatAccessAvailable && <ChatPage />}

    </div>
  );
}
