import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Avatar,
  CircularProgress,
  IconButton,
  Skeleton,
  TextField,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import AttachFileRoundedIcon from "@mui/icons-material/AttachFileRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DiamondRoundedIcon from "@mui/icons-material/DiamondRounded";

import { useAuth } from "@/features/auth/model/AuthContext";
import { getUsers } from "@/features/auth/model/api";
import { getCourses } from "@/entities/course/model/storage";
import { getLessonsByCourse } from "@/entities/lesson/model/storage";
import { getPurchases } from "@/entities/purchase/model/storage";
import { getViewedLessonIds } from "@/entities/progress/model/storage";
import { getBookings, updateBooking } from "@/entities/booking/model/storage";
import type { Booking } from "@/entities/booking/model/types";
import type { User } from "@/entities/user/model/types";
import { fileToDataUrl } from "@/shared/lib/files";
import { generateId } from "@/shared/lib/id";
import { formatRuPhoneDisplay } from "@/shared/lib/phone";
import { getBookingEndTimestamp, getBookingStartTimestamp, isBookingCompleted } from "@/shared/lib/time";
import { t } from "@/shared/i18n";
import { ListPagination } from "@/shared/ui/ListPagination";
import { RecoverableErrorAlert } from "@/shared/ui/RecoverableErrorAlert";
import { subscribeAppDataUpdates } from "@/shared/lib/subscribeAppDataUpdates";
import { ListSkeleton } from "@/shared/ui/loading";
import {
  getAssessmentCourseProgress,
  getAssessmentKnowledgeProgress,
  getCourseContentItems,
} from "@/features/assessments/model/storage";

type CourseInfo = {
  id: string;
  title: string;
  level: string;
  progress: number;
  viewedCount: number;
  totalLessons: number;
  totalTests: number;
  completedTests: number;
  testsAveragePercent: number;
  testsKnowledgePercent: number;
  isPremium: boolean;
  purchasedAt: string;
};

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

export default function TeacherStudentProfile() {
  const { studentId } = useParams<{ studentId: string }>();
  const { user } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const navigate = useNavigate();
  const [student, setStudent] = useState<User | null>(null);
  const [courses, setCourses] = useState<CourseInfo[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [bookingSavingId, setBookingSavingId] = useState<string | null>(null);
  const [coursesPage, setCoursesPage] = useState(1);
  const [bookingsPage, setBookingsPage] = useState(1);
  const [bookingFilter, setBookingFilter] = useState<
    "all" | "scheduled" | "completed"
  >("all");
  const [courseFilter, setCourseFilter] = useState<
    "all" | "active" | "completed"
  >("all");
  const hasLoadedRef = useRef(false);

  const loadStudentData = useCallback(async () => {
    if (!studentId || !user) return;
    try {
      if (!hasLoadedRef.current) {
        setLoading(true);
      }
      setError(null);
      const [students, allCourses, purchases, bookingData] = await Promise.all([
        getUsers("student", { forceFresh: true }),
        getCourses({ forceFresh: true }),
        getPurchases({ userId: studentId }, { forceFresh: true }),
        getBookings({ teacherId: user.id, studentId }),
      ]);

      const selected = students.find((u) => u.id === studentId) ?? null;
      const studentPurchases = purchases;
      const courseInfo = await Promise.all(
        studentPurchases.map(async (purchase) => {
          const liveCourse =
            allCourses.find((candidate) => candidate.id === purchase.courseId) ?? null;
          const usePublishedCourse = liveCourse?.status === "published";
          const course =
            (usePublishedCourse
              ? liveCourse
              : purchase.courseSnapshot ?? liveCourse) ?? null;
          if (!course) return null;
          if (course.teacherId !== user.id) return null;

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

          const lessonIds = effectiveQueue
            .filter(
              (
                item
              ): item is Extract<
                (typeof effectiveQueue)[number],
                {
                  type: "lesson";
                }
              > => item.type === "lesson"
            )
            .map((item) => item.lessonId);
          const uniqueLessonIds = Array.from(new Set(lessonIds));
          const totalLessons = uniqueLessonIds.length || lessons.length;
          const testItemIds = effectiveQueue
            .filter((item) => item.type === "test")
            .map((item) => item.id);
          const [testsProgress, testsKnowledgeProgress] = await Promise.all([
            getAssessmentCourseProgress({
              studentId,
              courseId: course.id,
              testItemIds,
            }),
            getAssessmentKnowledgeProgress({
              studentId,
              courseId: course.id,
              testItemIds,
            }),
          ]);
          const viewed = await getViewedLessonIds(studentId, course.id, {
            forceFresh: true,
          });
          const viewedSet = new Set(viewed);
          const viewedCount =
            uniqueLessonIds.length > 0
              ? uniqueLessonIds.filter((lessonId) => viewedSet.has(lessonId))
                  .length
              : viewedSet.size;
          const progress =
            totalLessons === 0
              ? 0
              : Math.round((viewedCount / totalLessons) * 100);
          return {
            id: course.id,
            title: course.title,
            level: course.level || "—",
            progress,
            viewedCount,
            totalLessons,
            totalTests: testsProgress.totalTests,
            completedTests: testsProgress.completedTests,
            testsAveragePercent: testsProgress.averageLatestPercent,
            testsKnowledgePercent: testsKnowledgeProgress.averageBestPercent,
            isPremium: purchase.price === course.priceGuided,
            purchasedAt: purchase.purchasedAt,
          };
        })
      );

      setStudent(selected);
      setCourses(
        (courseInfo.filter(Boolean) as CourseInfo[]).sort((a, b) => {
          if (a.progress !== b.progress) return a.progress - b.progress;
          return b.purchasedAt.localeCompare(a.purchasedAt);
        })
      );
      setBookings(
        bookingData.map((booking) => ({
          ...booking,
          lessonKind: booking.lessonKind === "trial" ? "trial" : "regular",
          paymentStatus: booking.paymentStatus === "paid" ? "paid" : "unpaid",
        }))
      );
    } catch {
      setError(t("teacherStudentProfile.loadStudentError"));
      setStudent(null);
      setCourses([]);
      setBookings([]);
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [studentId, user]);

  useEffect(() => {
    hasLoadedRef.current = false;
    void loadStudentData();
    const unsubscribe = subscribeAppDataUpdates(() => {
      void loadStudentData();
    });
    return () => {
      unsubscribe();
    };
  }, [loadStudentData]);

  useEffect(() => {
    if (!studentId || !user) return;
    const handleFocus = () => {
      void loadStudentData();
    };
    const handleVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;
      void loadStudentData();
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadStudentData, studentId, user]);

  const getBookingStart = (booking: Booking) => getBookingStartTimestamp(booking);
  const getBookingEnd = (booking: Booking) => getBookingEndTimestamp(booking);

  const sortedBookings = useMemo(() => {
    const now = Date.now();
    return [...bookings].sort((a, b) => {
      const aStart = getBookingStart(a);
      const bStart = getBookingStart(b);
      const aUpcoming = getBookingEnd(a) >= now;
      const bUpcoming = getBookingEnd(b) >= now;
      if (aUpcoming && bUpcoming) {
        return aStart - bStart;
      }
      if (aUpcoming !== bUpcoming) {
        return aUpcoming ? -1 : 1;
      }
      return getBookingEnd(b) - getBookingEnd(a);
    });
  }, [bookings]);

  const coursesPageSize = isMobile ? 2 : 4;
  const bookingsPageSize = isMobile ? 2 : 4;

  const filteredBookings = useMemo(() => {
    if (bookingFilter === "all") return sortedBookings;
    const now = Date.now();
    return sortedBookings.filter((booking) => {
      const isCompleted = getBookingEnd(booking) < now;
      return bookingFilter === "completed" ? isCompleted : !isCompleted;
    });
  }, [bookingFilter, sortedBookings]);

  const filteredCourses = useMemo(() => {
    if (courseFilter === "all") return courses;
    return courses.filter((course) =>
      courseFilter === "completed" ? course.progress >= 100 : course.progress < 100
    );
  }, [courseFilter, courses]);

  const coursesTotalPages = Math.max(
    1,
    Math.ceil(filteredCourses.length / coursesPageSize)
  );
  const safeCoursesPage = Math.min(coursesPage, coursesTotalPages);
  const bookingsTotalPages = Math.max(
    1,
    Math.ceil(filteredBookings.length / bookingsPageSize)
  );
  const safeBookingsPage = Math.min(bookingsPage, bookingsTotalPages);

  const pagedCourses = useMemo(() => {
    const start = (safeCoursesPage - 1) * coursesPageSize;
    return filteredCourses.slice(start, start + coursesPageSize);
  }, [filteredCourses, safeCoursesPage, coursesPageSize]);

  const pagedBookings = useMemo(() => {
    const start = (safeBookingsPage - 1) * bookingsPageSize;
    return filteredBookings.slice(start, start + bookingsPageSize);
  }, [filteredBookings, safeBookingsPage, bookingsPageSize]);

  useEffect(() => {
    setBookingsPage(1);
  }, [bookingFilter]);

  useEffect(() => {
    setCoursesPage(1);
  }, [courseFilter]);

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
        prev.map((b) => (b.id === bookingId ? updated : b))
      );
      setEditingBookingId(null);
    } catch {
      setError(t("teacherStudentProfile.saveBookingError"));
    } finally {
      setBookingSavingId(null);
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
      materials: [
        ...(bookings.find((b) => b.id === bookingId)?.materials ?? []),
        ...items,
      ],
    });
  };

  const removeBookingMaterial = (bookingId: string, materialId: string) => {
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) return;
    updateBookingDraft(bookingId, {
      materials: booking.materials.filter((m) => m.id !== materialId),
    });
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/teacher/profile?tab=students");
  };

  if (!student && !loading) {
    return (
      <div className="teacher-student-profile">
        {error ? (
          <RecoverableErrorAlert
            error={error}
            onRetry={() => loadStudentData()}
            retryLabel={t("common.retryLoadData")}
            forceRetry
          />
        ) : null}
        <div className="teacher-student-profile__empty">
          {t("teacherStudentProfile.studentNotFound")}
        </div>
      </div>
    );
  }

  return (
    <div className="teacher-student-profile">
      {error ? (
        <RecoverableErrorAlert
          error={error}
          onRetry={() => loadStudentData()}
          retryLabel={t("common.retryLoadData")}
          forceRetry
        />
      ) : null}
      <div className="teacher-student-profile__header">
        <IconButton
          className="teacher-student-profile__back"
          onClick={handleBack}
          aria-label={t("teacherStudentProfile.backAria")}
        >
          <ArrowBackRoundedIcon />
        </IconButton>
        {student ? (
          <Avatar className="teacher-student-profile__avatar" src={student.photo}>
            {(student.firstName || student.email || t("teacherStudentProfile.defaultInitial"))[0]}
          </Avatar>
        ) : (
          <Skeleton variant="circular" width={72} height={72} />
        )}
        <div>
          {student ? (
            <>
              <h1>
                {student.firstName} {student.lastName}
              </h1>
              <div className="teacher-student-profile__contact">
                <span>{student.email}</span>
                <span>
                  {formatRuPhoneDisplay(student.phone) ||
                    t("teacherStudentProfile.phoneNotSet")}
                </span>
              </div>
            </>
          ) : (
            <div className="teacher-student-profile__header-skeleton">
              <Skeleton variant="text" width={220} height={28} />
              <Skeleton variant="text" width={260} height={20} />
            </div>
          )}
        </div>
      </div>

      <div className="teacher-student-profile__grid">
        <section className="teacher-student-profile__panel">
          <div className="teacher-student-profile__panel-head ui-panel-head">
            <div className="teacher-student-profile__panel-title ui-panel-head__title">
              {t("teacherStudentProfile.coursesAndProgressTitle")}
            </div>
            <p className="teacher-student-profile__panel-description ui-panel-head__description">
              Прогресс ученика по купленным курсам и текущая динамика изучения.
            </p>
          </div>
          <div className="teacher-student-profile__filters">
            <button
              type="button"
              className={courseFilter === "all" ? "is-active" : ""}
              onClick={() => setCourseFilter("all")}
            >
              Все
            </button>
            <button
              type="button"
              className={courseFilter === "active" ? "is-active" : ""}
              onClick={() => setCourseFilter("active")}
            >
              В процессе
            </button>
            <button
              type="button"
              className={courseFilter === "completed" ? "is-active" : ""}
              onClick={() => setCourseFilter("completed")}
            >
              Завершенные
            </button>
          </div>
          {loading && filteredCourses.length === 0 ? (
            <ListSkeleton
              className="teacher-student-profile__skeletons"
              count={2}
              itemHeight={140}
            />
          ) : filteredCourses.length === 0 ? (
            <div className="teacher-student-profile__empty">
              {t("teacherStudentProfile.noPurchasedCourses")}
            </div>
          ) : (
            <div className="teacher-student-profile__courses">
              {pagedCourses.map((course) => {
                const learningVisual = buildProgressVisual(course.progress);
                const knowledgeVisual = buildProgressVisual(
                  course.testsKnowledgePercent
                );
                const learningRingStyle = {
                  "--progress-color": learningVisual.color,
                  "--progress-glow": learningVisual.glow,
                } as CSSProperties;
                const knowledgeRingStyle = {
                  "--progress-color": knowledgeVisual.color,
                  "--progress-glow": knowledgeVisual.glow,
                } as CSSProperties;
                const courseMetaLine = `Уровень: ${course.level} • Уроки: ${course.viewedCount}/${course.totalLessons}${
                  course.totalTests > 0
                    ? ` • Тесты: ${course.completedTests}/${course.totalTests}`
                    : ""
                }`;
                return (
                  <div
                    key={course.id}
                    className="teacher-student-profile__course-card"
                  >
                    <div className="teacher-student-profile__course-main">
                      <h3>
                        <span className="teacher-student-profile__course-title-text">
                          {course.title}
                        </span>
                        {course.isPremium && (
                          <DiamondRoundedIcon className="teacher-student-profile__premium" />
                        )}
                      </h3>
                      <div className="teacher-student-profile__course-meta teacher-student-profile__course-meta--single-line">
                        <span>{courseMetaLine}</span>
                      </div>
                      <span
                        className={`teacher-student-profile__course-status teacher-student-profile__course-status--row ${
                          course.progress >= 100
                            ? "teacher-student-profile__course-status--completed"
                            : "teacher-student-profile__course-status--active"
                        } ui-status-chip ${
                          course.progress >= 100
                            ? "ui-status-chip--completed"
                            : "ui-status-chip--inprogress"
                        }`}
                      >
                        {course.progress >= 100
                          ? "Статус изучения: завершен"
                          : "Статус изучения: в процессе"}
                      </span>
                    </div>
                    <div className="teacher-student-profile__course-progress">
                      <div
                        className="teacher-student-profile__progress-ring-card"
                        style={learningRingStyle}
                      >
                        <div className="teacher-student-profile__progress-ring">
                          <CircularProgress
                            variant="determinate"
                            value={learningVisual.percent}
                            size={68}
                            thickness={4.2}
                            sx={{ color: learningVisual.color }}
                          />
                          <span>{learningVisual.percent}%</span>
                        </div>
                        <span className="teacher-student-profile__progress-label">
                          Изучено
                        </span>
                      </div>
                      {course.totalTests > 0 ? (
                        <div
                          className="teacher-student-profile__progress-ring-card"
                          style={knowledgeRingStyle}
                        >
                          <div className="teacher-student-profile__progress-ring">
                            <CircularProgress
                              variant="determinate"
                              value={knowledgeVisual.percent}
                              size={68}
                              thickness={4.2}
                              sx={{ color: knowledgeVisual.color }}
                            />
                            <span>{knowledgeVisual.percent}%</span>
                          </div>
                          <span className="teacher-student-profile__progress-label">
                            Сдано
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              <ListPagination
                page={safeCoursesPage}
                totalItems={filteredCourses.length}
                pageSize={coursesPageSize}
                onPageChange={setCoursesPage}
              />
            </div>
          )}
        </section>

        <section className="teacher-student-profile__panel">
          <div className="teacher-student-profile__panel-head ui-panel-head">
            <div className="teacher-student-profile__panel-title ui-panel-head__title">
              {t("teacherStudentProfile.individualLessonsTitle")}
            </div>
            <p className="teacher-student-profile__panel-description ui-panel-head__description">
              Ближайшие и завершенные занятия в хронологическом порядке.
            </p>
          </div>
          <div className="teacher-student-profile__filters">
            <button
              type="button"
              className={bookingFilter === "all" ? "is-active" : ""}
              onClick={() => setBookingFilter("all")}
            >
              Все
            </button>
            <button
              type="button"
              className={bookingFilter === "scheduled" ? "is-active" : ""}
              onClick={() => setBookingFilter("scheduled")}
            >
              Запланированные
            </button>
            <button
              type="button"
              className={bookingFilter === "completed" ? "is-active" : ""}
              onClick={() => setBookingFilter("completed")}
            >
              Завершенные
            </button>
          </div>
          {loading && filteredBookings.length === 0 ? (
            <ListSkeleton
              className="teacher-student-profile__skeletons"
              count={2}
              itemHeight={160}
            />
          ) : filteredBookings.length === 0 ? (
            <div className="teacher-student-profile__empty">
              {t("teacherStudentProfile.noBookings")}
            </div>
          ) : (
            <div className="teacher-student-profile__bookings">
              {pagedBookings.map((booking) => {
                const isEditing = editingBookingId === booking.id;
                const isCompleted = isBookingCompleted(booking, Date.now());
                return (
                  <div
                    key={booking.id}
                    className="teacher-student-profile__booking-card"
                  >
                    <div className="teacher-student-profile__booking-head">
                      <div className="teacher-student-profile__booking-when">
                        <span className="teacher-student-profile__booking-date">
                          {booking.date}
                        </span>
                        <span className="teacher-student-profile__booking-time">
                          {booking.startTime} – {booking.endTime}
                        </span>
                      </div>
                      <div className="teacher-student-profile__booking-side">
                        <div className="teacher-student-profile__booking-meta">
                          <span
                            className={`teacher-student-profile__status ${
                              isCompleted
                                ? "teacher-student-profile__status--completed"
                                : "teacher-student-profile__status--scheduled"
                            } ui-status-chip ${
                              isCompleted
                                ? "ui-status-chip--completed"
                                : "ui-status-chip--scheduled"
                            }`}
                          >
                            {isCompleted
                              ? t("teacherStudentProfile.statusCompleted")
                              : t("teacherStudentProfile.statusScheduled")}
                          </span>
                          {booking.lessonKind === "trial" && (
                            <span className="teacher-student-profile__kind ui-status-chip ui-status-chip--trial">
                              {t("teacherStudentProfile.trialLesson")}
                            </span>
                          )}
                          <span
                            className={`teacher-student-profile__payment ${
                              booking.paymentStatus === "paid"
                                ? "teacher-student-profile__payment--paid"
                                : "teacher-student-profile__payment--unpaid"
                            } ui-status-chip ${
                              booking.paymentStatus === "paid"
                                ? "ui-status-chip--paid"
                                : "ui-status-chip--unpaid"
                            }`}
                          >
                            {booking.paymentStatus === "paid"
                              ? t("teacherStudentProfile.paymentStatusPaid")
                              : t("teacherStudentProfile.paymentStatusUnpaid")}
                          </span>
                        </div>
                        <div className="teacher-student-profile__booking-actions">
                          {!isEditing ? (
                            <IconButton
                              className="teacher-student-profile__icon-btn"
                              onClick={() => setEditingBookingId(booking.id)}
                              aria-label={t("teacherStudentProfile.editBookingAria")}
                            >
                              <EditRoundedIcon fontSize="small" />
                            </IconButton>
                          ) : (
                            <IconButton
                              className="teacher-student-profile__icon-btn"
                              onClick={() => void saveBookingUpdate(booking.id)}
                              aria-label={t("teacherStudentProfile.saveBookingAria")}
                              disabled={bookingSavingId === booking.id}
                            >
                              <SaveRoundedIcon fontSize="small" />
                            </IconButton>
                          )}
                        </div>
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
                      <div className="teacher-student-profile__booking-link">
                        <LinkRoundedIcon fontSize="small" />
                        {booking.meetingUrl ? (
                          <a
                            href={booking.meetingUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {t("common.openMeetingLink")}
                          </a>
                        ) : (
                          <span>{t("common.noMeetingLink")}</span>
                        )}
                      </div>
                    )}

                    <div className="teacher-student-profile__materials">
                      <div className="teacher-student-profile__materials-list">
                        {(booking.materials ?? []).map((m) => (
                          <div
                            key={m.id}
                            className="teacher-student-profile__material-chip"
                          >
                            <a href={m.url} download={m.name}>
                              {m.name}
                            </a>
                            {isEditing && (
                              <IconButton
                                className="teacher-student-profile__icon-btn"
                                onClick={() =>
                                  removeBookingMaterial(booking.id, m.id)
                                }
                                aria-label={t("teacherStudentProfile.deleteMaterialAria")}
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
                          className="teacher-student-profile__icon-btn"
                          aria-label={t("teacherStudentProfile.addMaterialsAria")}
                        >
                          <AttachFileRoundedIcon fontSize="small" />
                          <input
                            type="file"
                            hidden
                            multiple
                            accept=".pdf,.doc,.docx,video/*"
                            onChange={(e) =>
                              void addBookingMaterials(
                                booking.id,
                                e.target.files
                              )
                            }
                          />
                        </IconButton>
                      )}
                    </div>
                  </div>
                );
              })}
              <ListPagination
                page={safeBookingsPage}
                totalItems={filteredBookings.length}
                pageSize={bookingsPageSize}
                onPageChange={setBookingsPage}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
