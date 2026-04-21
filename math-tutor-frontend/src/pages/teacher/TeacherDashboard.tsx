import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Tabs,
  Tab,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  Drawer,
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
import CollectionsBookmarkRoundedIcon from "@mui/icons-material/CollectionsBookmarkRounded";
import QuizRoundedIcon from "@mui/icons-material/QuizRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import RemoveRoundedIcon from "@mui/icons-material/RemoveRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import AttachFileRoundedIcon from "@mui/icons-material/AttachFileRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import PhotoCameraRoundedIcon from "@mui/icons-material/PhotoCameraRounded";
import AppsRoundedIcon from "@mui/icons-material/AppsRounded";

import { StudentCard } from "@/entities/student/ui/StudentCard";
import { CourseCard } from "@/entities/course/ui/CourseCard";
import { CourseWithLessonsEditor } from "@/features/course-editor/ui/CourseWithLessonsEditor";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { NewsFeedPanel } from "@/features/news-feed/ui/NewsFeedPanel";
import { ListPagination } from "@/shared/ui/ListPagination";
import { PasswordSecurityCard } from "@/features/auth/ui/PasswordSecurityCard";
import { DialogTitleWithClose } from "@/shared/ui/DialogTitleWithClose";
import { formatUserBadgeName } from "@/shared/lib/userDisplayName";
import {
  openExternalWhiteboard,
  WORKBOOK_POPUP_BLOCKED_MESSAGE,
} from "@/shared/lib/openExternalWhiteboard";
import { RecoverableErrorAlert } from "@/shared/ui/RecoverableErrorAlert";
import { ListSkeleton } from "@/shared/ui/loading";
import { logCollectionPressure, usePerfScreenTag } from "@/shared/lib/perfScreen";

import { useAuth } from "@/features/auth/model/AuthContext";
import { updateUserProfile } from "@/features/auth/model/api";
import { useNavigate, useSearchParams } from "react-router-dom";
import ChatPage from "@/pages/chat/ChatPage";
import {
  type TeacherDashboardStudentCardData,
  useTeacherDashboardData,
} from "@/pages/teacher/hooks/useTeacherDashboardData";
import { useTeacherDashboardUiState } from "@/pages/teacher/hooks/useTeacherDashboardUiState";
import {
  TEACHER_TAB_KEYS,
  SLOT_TIME_OPTIONS,
  buildAvailabilityDateGroups,
  filterTeacherCourses,
  filterTeacherStudents,
  formatBookingReminderDate,
  getTabFromQuery,
  hasTimeOverlap,
  paginateList,
  resolveSelectedAvailabilityDate,
  splitTeacherBookingsByCompletion,
  toMinutes,
  selectUpcomingBookingReminder,
} from "@/pages/teacher/model/selectors";
import { deleteCourseWithCascade } from "@/pages/teacher/model/courseDeleteFlow";

import {
  deleteCourse,
  publishCourse as publishCourseCommand,
} from "@/entities/course/model/storage";
import { createTeacherInvite } from "@/entities/profile/model/storage";
import {
  deletePurchasesByCourse,
  getPurchases,
} from "@/entities/purchase/model/storage";
import {
  getLessonsByCourse,
} from "@/entities/lesson/model/storage";
import {
  deleteCourseContentItems,
  getCourseContentItems,
  getCourseMaterialBlocks,
} from "@/features/assessments/model/storage";
import { deleteProgressByCourse } from "@/entities/progress/model/storage";
import {
  saveTeacherAvailability,
} from "@/features/teacher-availability/api";
import type { AvailabilitySlot } from "@/features/teacher-availability/model/types";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import type { Booking } from "@/entities/booking/model/types";
import {
  updateBooking,
  deleteBooking,
} from "@/entities/booking/model/storage";
import {
  buildCalendarDays,
} from "@/features/booking/lib/schedule";
import { fileToDataUrl } from "@/shared/lib/files";
import { generateId } from "@/shared/lib/id";
import { formatRuPhoneDisplay, formatRuPhoneInput, toRuPhoneStorage } from "@/shared/lib/phone";
import { t } from "@/shared/i18n";
import { createNewsPost } from "@/entities/news/model/storage";

import type { Course } from "@/entities/course/model/types";

const PROFILE_AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export default function TeacherDashboard() {
  const { user, updateUser } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isNonDesktop = useMediaQuery(theme.breakpoints.down("lg"));
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    tab,
    setTab,
    studentQuery,
    setStudentQuery,
    courseQuery,
    setCourseQuery,
    slotDate,
    setSlotDate,
    slotStart,
    setSlotStart,
    slotEnd,
    setSlotEnd,
    availabilityOpen,
    setAvailabilityOpen,
    studentsPage,
    setStudentsPage,
    coursesPage,
    setCoursesPage,
    chatUnreadCount,
    setChatUnreadCount,
    slotsDateFilter,
    setSlotsDateFilter,
    tabMenuOpen,
    setTabMenuOpen,
    scheduledPage,
    setScheduledPage,
    completedPage,
    setCompletedPage,
    resetTeacherDashboardUiState,
  } = useTeacherDashboardUiState();
  usePerfScreenTag("TeacherDashboard");
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [isEditorOpen, setEditorOpen] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [studentCards, setStudentCards] = useState<TeacherDashboardStudentCardData[]>([]);
  const [lessonCounts, setLessonCounts] = useState<Record<string, number>>({});
  const [testCounts, setTestCounts] = useState<Record<string, number>>({});
  const [studentFeedbackFilter, setStudentFeedbackFilter] = useState<
    "all" | "with_feedback" | "without_feedback"
  >("with_feedback");
  const [courseStatusFilter, setCourseStatusFilter] = useState<"published" | "draft">(
    "published"
  );
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSavingId, setBookingSavingId] = useState<string | null>(null);
  const [bookingDeletingId, setBookingDeletingId] = useState<string | null>(null);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [studentsWithFeedbackIds, setStudentsWithFeedbackIds] = useState<
    string[]
  >([]);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteStatusMessage, setInviteStatusMessage] = useState<string | null>(null);
  const [inviteCreating, setInviteCreating] = useState(false);
  const [chatThreadIdsByStudentId, setChatThreadIdsByStudentId] = useState<
    Record<string, string>
  >({});
  const [expandedSlotsDate, setExpandedSlotsDate] = useState<string | null>(
    null
  );
  const [confirm, setConfirm] = useState<{
    title: string;
    description?: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileDraft, setProfileDraft] = useState({
    firstName: user?.firstName ?? "",
    lastName: user?.lastName ?? "",
    phone: user?.phone ?? "",
    photo: user?.photo ?? "",
  });
  const slotDateInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const userId = user?.id;
  const isTeacher = user?.role === "teacher";
  const TEACHER_STUDY_TAB_INDEX = 4;
  const TEACHER_WORKBOOK_TAB_INDEX = 5;
  const TEACHER_CHAT_TAB_INDEX = 6;
  const TEACHER_STATS_TAB_INDEX = 7;

  useEffect(() => {
    resetTeacherDashboardUiState();
  }, [resetTeacherDashboardUiState, userId]);

  useEffect(() => {
    const nextTab = getTabFromQuery(searchParams.get("tab"));
    setTab((prev) => (prev === nextTab ? prev : nextTab));
  }, [searchParams, setTab]);

  useEffect(() => {
    if (!isNonDesktop && tabMenuOpen) {
      setTabMenuOpen(false);
    }
  }, [isNonDesktop, setTabMenuOpen, tabMenuOpen]);

  useEffect(() => {
    if (!user) return;
    setProfileDraft({
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      phone: user.phone ?? "",
      photo: user.photo ?? "",
    });
  }, [user?.id, user?.firstName, user?.lastName, user?.phone, user?.photo]);

  const openProfileEditDialog = useCallback(() => {
    if (!user) return;
    setProfileDraft({
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      phone: user.phone ?? "",
      photo: user.photo ?? "",
    });
    setProfileError(null);
    setProfileEditOpen(true);
  }, [user]);

  const closeProfileEditDialog = useCallback(() => {
    setProfileEditOpen(false);
    setProfileError(null);
  }, []);

  const saveProfileDraft = useCallback(async () => {
    if (!user) return;
    const firstName = profileDraft.firstName.trim();
    const lastName = profileDraft.lastName.trim();
    if (!firstName || !lastName) {
      setProfileError("Введите имя и фамилию.");
      return;
    }
    try {
      setProfileSaving(true);
      setProfileError(null);
      const updated = await updateUserProfile(user.id, {
        firstName,
        lastName,
        phone: toRuPhoneStorage(profileDraft.phone),
        photo: profileDraft.photo,
      });
      updateUser(updated);
      setProfileEditOpen(false);
    } catch (error) {
      setProfileError(
        error instanceof Error ? error.message : "Не удалось сохранить личные данные."
      );
    } finally {
      setProfileSaving(false);
    }
  }, [
    profileDraft.firstName,
    profileDraft.lastName,
    profileDraft.phone,
    profileDraft.photo,
    updateUser,
    user,
  ]);

  const { refreshAll, retryDashboardData } = useTeacherDashboardData({
    userId,
    isTeacher,
    setCourses,
    setStudentCards,
    setLessonCounts,
    setTestCounts,
    setDashboardLoading,
    setDashboardError,
    setChatUnreadCount,
    setStudentsWithFeedbackIds,
    setChatThreadIdsByStudentId,
    setAvailability,
    setAvailabilityLoading,
    setAvailabilityError,
    setBookings,
    setBookingLoading,
    setBookingError,
  });

  const { scheduled: scheduledBookings, completed: completedBookings } = useMemo(
    () => splitTeacherBookingsByCompletion(bookings),
    [bookings]
  );

  const upcomingReminder = useMemo(
    () => selectUpcomingBookingReminder(scheduledBookings),
    [scheduledBookings]
  );

  const availabilityDateGroups = useMemo(
    () =>
      buildAvailabilityDateGroups(
        availability,
        buildCalendarDays(21).map((day) => day.value)
      ),
    [availability]
  );

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

  const filteredStudents = useMemo(
    () =>
      filterTeacherStudents({
        students: studentCards,
        query: studentQuery,
        feedbackStudentIds: studentsWithFeedbackIds,
        feedbackFilter: studentFeedbackFilter,
      }),
    [studentCards, studentQuery, studentsWithFeedbackIds, studentFeedbackFilter]
  );

  const filteredCourses = useMemo(
    () =>
      filterTeacherCourses({
        courses,
        query: courseQuery,
        status: courseStatusFilter,
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

  const pagedStudents = useMemo(
    () => paginateList(filteredStudents, safeStudentsPage, studentsPageSize),
    [filteredStudents, safeStudentsPage, studentsPageSize]
  );

  const pagedCourses = useMemo(
    () => paginateList(filteredCourses, safeCoursesPage, coursesPageSize),
    [filteredCourses, safeCoursesPage, coursesPageSize]
  );

  const selectedAvailabilityDate = useMemo(
    () => resolveSelectedAvailabilityDate(availabilityDateGroups, slotsDateFilter),
    [availabilityDateGroups, slotsDateFilter]
  );

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

  const pagedScheduledBookings = useMemo(
    () => paginateList(scheduledBookings, safeScheduledPage, bookingsPageSize),
    [scheduledBookings, safeScheduledPage, bookingsPageSize]
  );

  const pagedCompletedBookings = useMemo(
    () => paginateList(completedBookings, safeCompletedPage, bookingsPageSize),
    [completedBookings, safeCompletedPage, bookingsPageSize]
  );

  useEffect(() => {
    logCollectionPressure({
      screen: "TeacherDashboard",
      metric: "teacher-dashboard-collections",
      size:
        studentCards.length +
        courses.length +
        bookings.length +
        availability.length,
      warnAt: 180,
      errorAt: 360,
      details: {
        students: studentCards.length,
        courses: courses.length,
        bookings: bookings.length,
        availability: availability.length,
      },
    });
  }, [availability.length, bookings.length, courses.length, studentCards.length]);

  const handleCreateInviteLink = useCallback(async () => {
    if (!isTeacher) return;
    const targetEmailInput = window.prompt(
      "Email ученика для инвайта (необязательно):",
      ""
    );
    if (targetEmailInput === null) return;
    const noteInput = window.prompt("Комментарий к инвайту (необязательно):", "");
    if (noteInput === null) return;

    setInviteCreating(true);
    setInviteStatusMessage(null);
    try {
      const response = await createTeacherInvite({
        targetEmail: targetEmailInput.trim() || undefined,
        note: noteInput.trim() || undefined,
      });
      setInviteLink(response.inviteUrl);
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(response.inviteUrl);
          copied = true;
        } catch {
          copied = false;
        }
      }
      setInviteStatusMessage(
        copied
          ? "Ссылка-приглашение создана и скопирована в буфер."
          : "Ссылка-приглашение создана. Скопируйте ее вручную."
      );
    } catch (error) {
      setInviteStatusMessage(
        error instanceof Error ? error.message : "Не удалось создать ссылку-приглашение."
      );
    } finally {
      setInviteCreating(false);
    }
  }, [isTeacher]);

  const handleTeacherOpenWorkbook = useCallback(async () => {
    const launch = await openExternalWhiteboard({
      from: "/teacher/profile?tab=workbook",
    });
    if (!launch.ok) {
      setDashboardError(
        launch.error ??
          "Не удалось открыть рабочую тетрадь. Проверьте настройки запуска."
      );
    } else if (launch.code === "popup_blocked") {
      setDashboardError(WORKBOOK_POPUP_BLOCKED_MESSAGE);
    }
  }, [setDashboardError]);

  const deleteCourseFull = async (courseId: string) => {
    await deleteCourseWithCascade(courseId, {
      deleteCourse,
      deleteCourseContentItems,
      deletePurchasesByCourse,
      deleteProgressByCourse,
      refreshAll,
    });
  };

  const handleDeleteCourseConfirm = (courseId: string) => {
    void deleteCourseFull(courseId)
      .catch(() => {
        setDashboardError("Не удалось удалить курс. Попробуйте снова.");
      })
      .finally(() => {
        setConfirm(null);
      });
  };

  const publishCourse = async (course: Course) => {
    const wasDraft = course.status === "draft";
    const lessons = await getLessonsByCourse(course.id, { forceFresh: true });
    const [contentItems, blocks] = await Promise.all([
      getCourseContentItems(course.id, lessons),
      getCourseMaterialBlocks(course.id),
    ]);
    const assessmentsSnapshot = {
      items: contentItems.map((item) => ({
        id: item.id,
        courseId: item.courseId,
        blockId: item.blockId,
        type: item.type,
        order: item.order,
        lessonId: item.type === "lesson" ? item.lessonId : undefined,
        templateId: item.type === "test" ? item.templateId : undefined,
        titleSnapshot: item.type === "test" ? item.titleSnapshot : undefined,
        templateSnapshot: item.type === "test" ? item.templateSnapshot : undefined,
        createdAt: item.createdAt,
      })),
      blocks: blocks.map((block) => ({
        id: block.id,
        courseId: block.courseId,
        title: block.title,
        description: block.description,
        order: block.order,
      })),
    };

    await publishCourseCommand(course.id, {
      assessmentsSnapshot,
    });
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
          const safeTitle = course.title.trim() || "Без названия";
          await createNewsPost({
            authorId: userId,
            title: `В курсе «${safeTitle}» появились новинки`,
            content:
              "Добавлены новые уроки и/или тесты. Откройте курс, чтобы сразу перейти к обновлённым материалам.",
            tone: "course_update",
            highlighted: true,
            visibility: "course_students",
            targetCourseId: course.id,
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
    const hasConflict = availability.some((slot) => {
      if (slot.date !== slotDate) return false;
      return hasTimeOverlap(
        startMinutes,
        endMinutes,
        toMinutes(slot.startTime),
        toMinutes(slot.endTime)
      );
    });

    const hasBookingConflict = bookings.some((booking) => {
      if (booking.date !== slotDate) return false;
      const bookingEndTime = new Date(`${booking.date}T${booking.endTime}`).getTime();
      if (!Number.isFinite(bookingEndTime) || bookingEndTime < Date.now()) {
        return false;
      }
      return hasTimeOverlap(
        startMinutes,
        endMinutes,
        toMinutes(booking.startTime),
        toMinutes(booking.endTime)
      );
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

  const teacherTabItems = [
    {
      index: 0,
      label: t("teacherDashboard.tabProfile"),
      icon: <PersonOutlineRoundedIcon />,
    },
    {
      index: 1,
      label: t("teacherDashboard.tabStudents"),
      icon: <GroupRoundedIcon />,
    },
    {
      index: 2,
      label: t("teacherDashboard.tabCourses"),
      icon: <MenuBookRoundedIcon />,
    },
    {
      index: 3,
      label: t("teacherDashboard.tabBooking"),
      icon: <EventAvailableRoundedIcon />,
    },
    {
      index: TEACHER_STUDY_TAB_INDEX,
      label: t("teacherDashboard.tabStudy"),
      icon: <CollectionsBookmarkRoundedIcon />,
    },
    {
      index: TEACHER_WORKBOOK_TAB_INDEX,
      label: "Рабочая тетрадь",
      icon: <AutoStoriesRoundedIcon />,
    },
    {
      index: TEACHER_CHAT_TAB_INDEX,
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
    {
      index: TEACHER_STATS_TAB_INDEX,
      label: t("teacherDashboard.tabStats"),
      icon: <InsightsRoundedIcon />,
    },
  ] as const;

  const activeTeacherTab =
    teacherTabItems.find((item) => item.index === tab) ?? teacherTabItems[0];
  const identityName = formatUserBadgeName(user);
  const identityInitials = `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase();

  return (
    <div className="teacher-dashboard">
      {upcomingReminder && (
        <div className="teacher-dashboard__reminder">
          {t("teacherDashboard.reminder", {
            date: formatBookingReminderDate(upcomingReminder),
          })}
        </div>
      )}
      <div className="teacher-dashboard__header">
        <h1 className="teacher-dashboard__title">
          <SchoolRoundedIcon />
          <span>{t("teacherDashboard.title")}</span>
        </h1>
      </div>

      <div
        className={
          isNonDesktop
            ? "teacher-dashboard__workspace"
            : "teacher-dashboard__workspace teacher-dashboard__workspace--with-tabs"
        }
      >
        {!isNonDesktop ? (
          <div className="teacher-dashboard__nav-shell">
            <section className="teacher-dashboard__identity-card">
              <IconButton
                className="teacher-dashboard__identity-edit-icon"
                onClick={openProfileEditDialog}
                aria-label="Редактировать профиль"
                size="small"
              >
                <EditRoundedIcon fontSize="small" />
              </IconButton>
              <div className="teacher-dashboard__identity-main">
                <Avatar
                  className="teacher-dashboard__identity-avatar"
                  src={user.photo || undefined}
                >
                  {identityInitials || "П"}
                </Avatar>
                <div className="teacher-dashboard__identity-copy">
                  <h3>{identityName}</h3>
                  <span className="teacher-dashboard__identity-role">
                    {user.role === "teacher" ? "Преподаватель" : "Студент"}
                  </span>
                </div>
              </div>
            </section>
            <Tabs
              orientation="vertical"
              value={tab}
              onChange={(_, v) => {
                setTab(v);
                setSearchParams({ tab: TEACHER_TAB_KEYS[v] });
              }}
              className="teacher-dashboard__tabs"
            >
              {teacherTabItems.map((item) => (
                <Tab
                  key={item.index}
                  label={
                    <span className="teacher-dashboard__tab-label">{item.label}</span>
                  }
                  icon={item.icon}
                  iconPosition="start"
                />
              ))}
            </Tabs>
          </div>
        ) : (
          <div className="teacher-dashboard__tabs-mobile">
            <Button
              className="teacher-dashboard__tabs-mobile-trigger"
              variant="outlined"
              startIcon={<AppsRoundedIcon />}
              onClick={() => setTabMenuOpen(true)}
            >
              Раздел: {activeTeacherTab.label}
            </Button>
          </div>
        )}
        <div className="teacher-dashboard__workspace-main">
          {isNonDesktop ? (
            <Drawer
              anchor={isMobile ? "bottom" : "left"}
              open={tabMenuOpen}
              onClose={() => setTabMenuOpen(false)}
              PaperProps={{
                className: isMobile
                  ? "teacher-dashboard__tabs-drawer teacher-dashboard__tabs-drawer--mobile"
                  : "teacher-dashboard__tabs-drawer",
              }}
            >
              <div className="teacher-dashboard__tabs-drawer-head">
                <h3>Разделы кабинета</h3>
                <span>Выберите нужный раздел</span>
              </div>
              <div className="teacher-dashboard__tabs-drawer-grid">
                {teacherTabItems.map((item) => (
                  <button
                    key={item.index}
                    type="button"
                    className={`teacher-dashboard__tabs-drawer-item ${
                      tab === item.index ? "is-active" : ""
                    }`}
                    onClick={() => {
                      setTab(item.index);
                      setSearchParams({ tab: TEACHER_TAB_KEYS[item.index] });
                      setTabMenuOpen(false);
                    }}
                  >
                    <span className="teacher-dashboard__tabs-drawer-icon">
                      {item.icon}
                    </span>
                    <span className="teacher-dashboard__tabs-drawer-label">
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
            </Drawer>
          ) : null}
          {isNonDesktop ? (
            <section className="teacher-dashboard__identity-card teacher-dashboard__identity-card--mobile">
              <IconButton
                className="teacher-dashboard__identity-edit-icon"
                onClick={openProfileEditDialog}
                aria-label="Редактировать профиль"
                size="small"
              >
                <EditRoundedIcon fontSize="small" />
              </IconButton>
              <div className="teacher-dashboard__identity-main">
                <Avatar
                  className="teacher-dashboard__identity-avatar"
                  src={user.photo || undefined}
                >
                  {identityInitials || "П"}
                </Avatar>
                <div className="teacher-dashboard__identity-copy">
                  <h3>{identityName}</h3>
                  <span className="teacher-dashboard__identity-role">
                    {user.role === "teacher" ? "Преподаватель" : "Студент"}
                  </span>
                </div>
              </div>
            </section>
          ) : null}
          {/* PROFILE */}
          {tab === 0 && (
            <div className="teacher-dashboard__profile-feed">
              <NewsFeedPanel user={user} />
            </div>
          )}
          {/* STUDENTS */}
          {tab === 1 && (
            <div className="teacher-dashboard__section">
          <div className="teacher-dashboard__invite-shell">
            <div className="teacher-dashboard__invite-copy">
              <span>Teacher invite</span>
              <h3>Добавьте ученика по персональной ссылке</h3>
              <p>
                Ссылка запускает controlled onboarding: ученик регистрируется или входит в аккаунт
                и безопасно привязывается к вашему контуру.
              </p>
            </div>
            <div className="teacher-dashboard__section-actions">
              <Button
                variant="contained"
                onClick={() => {
                  void handleCreateInviteLink();
                }}
                startIcon={<LinkRoundedIcon />}
                disabled={inviteCreating}
              >
                {inviteCreating ? "Создаем..." : "Создать invite-ссылку"}
              </Button>
            </div>
          </div>
          {inviteStatusMessage ? (
            <Alert
              severity={
                inviteStatusMessage.includes("Не удалось") ? "error" : "success"
              }
              sx={{ mb: 2 }}
            >
              {inviteStatusMessage}
              {inviteLink ? (
                <div className="teacher-dashboard__invite-link">{inviteLink}</div>
              ) : null}
            </Alert>
          ) : null}
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
                    params.set("tab", TEACHER_TAB_KEYS[TEACHER_CHAT_TAB_INDEX]);
                    const threadId = chatThreadIdsByStudentId[student.id];
                    if (threadId) {
                      params.set("threadId", threadId);
                      params.delete("studentId");
                    } else {
                      params.set("studentId", student.id);
                      params.delete("threadId");
                    }
                    setTab(TEACHER_CHAT_TAB_INDEX);
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
                        handleDeleteCourseConfirm(course.id);
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
                    {expandedSlotsDate === currentAvailabilityGroup.date
                      ? "Свернуть дату"
                      : "Показать все слоты"}
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
                    <div className="teacher-dashboard__slot-meta">
                      <strong className="teacher-dashboard__slot-date">{slot.date}</strong>
                      <span className="teacher-dashboard__slot-time">
                        {slot.startTime} – {slot.endTime}
                      </span>
                    </div>
                    <IconButton
                      className="teacher-dashboard__slot-remove"
                      onClick={() => void removeSlot(slot.id)}
                      aria-label="Удалить слот"
                    >
                      <CloseRoundedIcon fontSize="inherit" />
                    </IconButton>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="teacher-dashboard__bookings-grid">
            <div className="teacher-dashboard__availability">
              <div className="teacher-dashboard__availability-header">
                <div>
                  <h3>{t("teacherDashboard.scheduledTitle")}</h3>
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

          {tab === TEACHER_STUDY_TAB_INDEX && (
            <div className="teacher-dashboard__section" />
          )}

          {tab === TEACHER_WORKBOOK_TAB_INDEX && (
            <div className="teacher-dashboard__section teacher-dashboard__tool-launch">
              <div className="teacher-dashboard__invite-shell">
                <div className="teacher-dashboard__invite-copy">
                  <span>Рабочая тетрадь</span>
                  <h3>Откройте внешний рабочий контур</h3>
                  <p>
                    Цифровая тетрадь доступна отдельной вкладкой для быстрых разборов
                    и работы с материалами курса.
                  </p>
                </div>
                <div className="teacher-dashboard__section-actions">
                  <Button
                    variant="contained"
                    startIcon={<AutoStoriesRoundedIcon />}
                    onClick={() => {
                      void handleTeacherOpenWorkbook();
                    }}
                  >
                    Открыть рабочую тетрадь
                  </Button>
                </div>
              </div>
            </div>
          )}

          {tab === TEACHER_CHAT_TAB_INDEX && (
            <ChatPage />
          )}

          {tab === TEACHER_STATS_TAB_INDEX && (
            <div className="teacher-dashboard__empty">
              {t("teacherDashboard.statsSoon")}
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={profileEditOpen}
        onClose={closeProfileEditDialog}
        fullWidth
        maxWidth="sm"
        className="ui-dialog ui-dialog--compact teacher-dashboard__profile-edit-modal"
      >
        <DialogTitleWithClose
          title="Редактирование профиля"
          onClose={closeProfileEditDialog}
          closeAriaLabel="Закрыть окно редактирования профиля"
        />
        <DialogContent className="teacher-dashboard__profile-edit-content">
          <div className="teacher-dashboard__profile-edit-head">
            <h3>Профиль преподавателя</h3>
            <span>Изменения применяются к аккаунту.</span>
          </div>
          {profileError ? <Alert severity="error">{profileError}</Alert> : null}
          <div className="teacher-dashboard__profile-edit-avatar-row">
            <button
              type="button"
              className="teacher-dashboard__profile-edit-avatar-control"
              onClick={() => avatarInputRef.current?.click()}
              aria-label="Изменить фото профиля"
            >
              <Avatar
                src={profileDraft.photo || undefined}
                className="teacher-dashboard__profile-edit-avatar-media"
              >
                {identityInitials || "П"}
              </Avatar>
              <span className="teacher-dashboard__profile-edit-avatar-icon" aria-hidden>
                <PhotoCameraRoundedIcon fontSize="inherit" />
              </span>
            </button>
            <div className="teacher-dashboard__profile-edit-avatar-copy">
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
          <div className="teacher-dashboard__profile-edit-grid">
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
              fullWidth
              inputProps={{ inputMode: "tel" }}
            />
            <TextField
              label="Email"
              value={user.email}
              fullWidth
              InputProps={{ readOnly: true }}
            />
          </div>
          <PasswordSecurityCard
            className="teacher-dashboard__profile-edit-security"
            presentation="row"
            title="Пароль"
          />
        </DialogContent>
        <DialogActions className="teacher-dashboard__profile-edit-actions">
          <Button
            color="inherit"
            onClick={closeProfileEditDialog}
            disabled={profileSaving}
          >
            Отмена
          </Button>
          <Button
            variant="contained"
            onClick={() => void saveProfileDraft()}
            disabled={profileSaving}
          >
            {profileSaving ? "Сохраняем..." : "Сохранить изменения"}
          </Button>
        </DialogActions>
      </Dialog>

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

    </div>
  );
}
