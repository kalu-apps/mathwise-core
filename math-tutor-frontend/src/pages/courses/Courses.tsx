import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  IconButton,
  InputAdornment,
  TextField,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import LocalLibraryRoundedIcon from "@mui/icons-material/LocalLibraryRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import { getCourses } from "@/entities/course/model/storage";
import { CourseCard } from "@/entities/course/ui/CourseCard";
import { PageTitle } from "@/shared/ui/PageTitle";
import { ListPagination } from "@/shared/ui/ListPagination";
import type { Course } from "@/entities/course/model/types";
import { getLessons } from "@/entities/lesson/model/storage";
import { useAuth } from "@/features/auth/model/AuthContext";
import { getPurchases } from "@/entities/purchase/model/storage";
import { getViewedLessonIds } from "@/entities/progress/model/storage";
import { getCourseAccessList } from "@/domain/auth-payments/model/api";
import type { CourseAccessDecision } from "@/domain/auth-payments/model/access";
import { AccessStateBanner } from "@/shared/ui/AccessStateBanner";
import { getCatalogAccessUiState } from "@/domain/auth-payments/model/ui";
import { RecoverableErrorAlert } from "@/shared/ui/RecoverableErrorAlert";
import { t } from "@/shared/i18n";
import { ListSkeleton } from "@/shared/ui/loading";
import { selectBnplMarketingInfo } from "@/entities/purchase/model/selectors";
import {
  getAssessmentCourseProgress,
  getAssessmentKnowledgeProgress,
  getCourseContentItems,
} from "@/features/assessments/model/storage";
import { subscribeAppDataUpdates } from "@/shared/lib/subscribeAppDataUpdates";

const toApproxMonthly = (fromAmount: number | null, periodLabel: string) => {
  if (!fromAmount || fromAmount <= 0) return null;
  const normalizedPeriod = periodLabel.toLowerCase();
  if (normalizedPeriod.includes("2 нед")) return fromAmount * 2;
  if (normalizedPeriod.includes("нед")) return Math.round((fromAmount * 52) / 12);
  return fromAmount;
};

export default function Courses() {
  const { user, openAuthModal, openRecoverModal } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isTablet = useMediaQuery(theme.breakpoints.down("md"));
  const [searchParams, setSearchParams] = useSearchParams();
  const searchTab = searchParams.get("tab");
  const requestedStudentTab: "notPurchased" | "purchased" =
    searchTab === "purchased" ? "purchased" : "notPurchased";
  const [courses, setCourses] = useState<Course[]>([]);
  const [purchasedCourses, setPurchasedCourses] = useState<Course[]>([]);
  const [lessonCounts, setLessonCounts] = useState<Record<string, number>>({});
  const [purchasedIds, setPurchasedIds] = useState<string[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [premiumMap, setPremiumMap] = useState<Record<string, boolean>>({});
  const [purchasedProgressMap, setPurchasedProgressMap] = useState<
    Record<
      string,
      {
        progress: number;
        lessonsViewed: number;
        lessonsTotal: number;
        testsCompleted: number;
        testsTotal: number;
        knowledgePercent: number;
      }
    >
  >({});
  const [accessMap, setAccessMap] = useState<Record<string, CourseAccessDecision>>(
    {}
  );
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<unknown | null>(null);
  const [page, setPage] = useState(1);
  const [studentTab, setStudentTab] = useState<"notPurchased" | "purchased">(
    requestedStudentTab
  );

  const pageSize = isMobile ? 4 : isTablet ? 4 : 6;

  const isStudent = user?.role === "student";
  const purchasedSet = useMemo(() => new Set(purchasedIds), [purchasedIds]);

  useEffect(() => {
    if (!isStudent) return;
    if (studentTab === requestedStudentTab) return;
    setStudentTab(requestedStudentTab);
    setPage(1);
  }, [isStudent, requestedStudentTab, studentTab]);

  const visibleCourses = useMemo(() => {
    if (!isStudent) {
      return courses;
    }
    if (studentTab === "purchased") {
      return [...purchasedCourses].sort((a, b) => {
        const aProgress = progressMap[a.id] ?? 100;
        const bProgress = progressMap[b.id] ?? 100;
        if (aProgress !== bProgress) return aProgress - bProgress;
        return a.title.localeCompare(b.title, "ru");
      });
    }
    return courses.filter((course) => !purchasedSet.has(course.id));
  }, [courses, isStudent, studentTab, purchasedCourses, purchasedSet, progressMap]);

  const filteredCourses = useMemo(
    () =>
      visibleCourses.filter((course) =>
        course.title.toLowerCase().includes(query.trim().toLowerCase())
      ),
    [visibleCourses, query]
  );

  const totalPages = Math.max(1, Math.ceil(filteredCourses.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const pagedCourses = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredCourses.slice(start, start + pageSize);
  }, [filteredCourses, safePage, pageSize]);

  const catalogNoticeState = useMemo(
    () =>
      getCatalogAccessUiState({
        decisions: Object.values(accessMap),
        isStudent,
      }),
    [isStudent, accessMap]
  );

  const loadCatalog = useCallback(async () => {
    try {
      setLoading(true);
      setPageError(null);
      const [coursesData, lessons, purchases, accessData] = await Promise.all([
        getCourses({ forceFresh: true }),
        getLessons({ forceFresh: true }),
        user?.role === "student"
          ? getPurchases({ userId: user.id }, { forceFresh: true })
          : Promise.resolve([]),
        getCourseAccessList({ userId: user?.id }),
      ]);
      const accessByCourse = accessData.decisions.reduce<
        Record<string, CourseAccessDecision>
      >((acc, decision) => {
        acc[decision.courseId] = decision;
        return acc;
      }, {});
      setAccessMap(accessByCourse);
      const publishedCourses = coursesData.filter((course) => course.status === "published");
      setCourses(publishedCourses);
      const counts = lessons.reduce<Record<string, number>>((acc, lesson) => {
        acc[lesson.courseId] = (acc[lesson.courseId] ?? 0) + 1;
        return acc;
      }, {});
      if (user?.role === "student") {
        const userPurchases = purchases.filter((purchase) => purchase.userId === user.id);
        const uniquePurchases = [...userPurchases]
          .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt))
          .filter(
            (purchase, index, array) =>
              array.findIndex((candidate) => candidate.courseId === purchase.courseId) ===
              index
          );
        const ids = uniquePurchases.map((p) => p.courseId);
        setPurchasedIds(ids);
        const purchasedCards = uniquePurchases
          .map((purchase) => {
            const liveCourse =
              coursesData.find((candidate) => candidate.id === purchase.courseId) ?? null;
            const usePublishedCourse = liveCourse?.status === "published";
            return (usePublishedCourse
              ? liveCourse
              : purchase.courseSnapshot ?? liveCourse) as Course | null;
          })
          .filter((course): course is Course => Boolean(course));
        setPurchasedCourses(purchasedCards);

        const premiumLookup = uniquePurchases
          .reduce<Record<string, boolean>>((acc, purchase) => {
            const liveCourse =
              coursesData.find((candidate) => candidate.id === purchase.courseId) ??
              null;
            const course =
              (liveCourse?.status === "published"
                ? liveCourse
                : purchase.courseSnapshot ?? liveCourse) ?? null;
            if (!course) return acc;
            acc[purchase.courseId] = purchase.price === course.priceGuided;
            return acc;
          }, {});
        setPremiumMap(premiumLookup);

        const progressEntries = await Promise.all(
          uniquePurchases.map(async (purchase) => {
            const courseId = purchase.courseId;
            const liveCourse =
              coursesData.find((candidate) => candidate.id === courseId) ?? null;
            const usePublishedCourse = liveCourse?.status === "published";
            const lessonsForProgress = usePublishedCourse
              ? lessons.filter((lesson) => lesson.courseId === courseId)
              : Array.isArray(purchase.lessonsSnapshot)
              ? purchase.lessonsSnapshot
              : lessons.filter((lesson) => lesson.courseId === courseId);
            const queue = await getCourseContentItems(courseId, lessonsForProgress);
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
            const lessonIds = Array.from(
              new Set(
                effectiveQueue
                  .filter(
                    (
                      item
                    ): item is Extract<
                      (typeof queue)[number],
                      {
                        type: "lesson";
                      }
                    > => item.type === "lesson"
                  )
                  .map((item) => item.lessonId)
              )
            );
            const totalLessons =
              lessonIds.length > 0
                ? lessonIds.length
                : counts[courseId] ?? 0;
            const viewedLessonIds = await getViewedLessonIds(user.id, courseId, {
              forceFresh: true,
            });
            const viewedSet = new Set(viewedLessonIds);
            const lessonsViewed =
              lessonIds.length > 0
                ? lessonIds.filter((lessonId) => viewedSet.has(lessonId)).length
                : viewedSet.size;
            const progress =
              totalLessons > 0
                ? Math.round((lessonsViewed / totalLessons) * 100)
                : 0;
            const testItemIds = effectiveQueue
              .filter((item) => item.type === "test")
              .map((item) => item.id);
            const [testsProgress, testsKnowledgeProgress] = await Promise.all([
              getAssessmentCourseProgress({
                studentId: user.id,
                courseId,
                testItemIds,
              }),
              getAssessmentKnowledgeProgress({
                studentId: user.id,
                courseId,
                testItemIds,
              }),
            ]);
            return [
              courseId,
              {
                progress,
                lessonsViewed,
                lessonsTotal: totalLessons,
                testsCompleted: testsProgress.completedTests,
                testsTotal: testsProgress.totalTests,
                knowledgePercent: testsKnowledgeProgress.averageBestPercent,
              },
            ] as const;
          })
        );
        const nextProgressMap = progressEntries.reduce<Record<string, number>>(
          (acc, [courseId, values]) => {
            acc[courseId] = values.progress;
            return acc;
          },
          {}
        );
        const nextPurchasedProgressMap = progressEntries.reduce<
          Record<
            string,
            {
              progress: number;
              lessonsViewed: number;
              lessonsTotal: number;
              testsCompleted: number;
              testsTotal: number;
              knowledgePercent: number;
            }
          >
        >((acc, [courseId, values]) => {
          acc[courseId] = values;
          return acc;
        }, {});
        const nextLessonCounts = { ...counts };
        progressEntries.forEach(([courseId, values]) => {
          nextLessonCounts[courseId] = values.lessonsTotal;
        });
        setLessonCounts(nextLessonCounts);
        setProgressMap(nextProgressMap);
        setPurchasedProgressMap(nextPurchasedProgressMap);
      } else {
        setLessonCounts(counts);
        setPurchasedIds([]);
        setPurchasedCourses([]);
        setProgressMap({});
        setPremiumMap({});
        setPurchasedProgressMap({});
      }
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error
          : new Error(t("courses.loadCatalogError"))
      );
      setAccessMap({});
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.role]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (!isStudent) return;
    void loadCatalog();
  }, [isStudent, studentTab, loadCatalog]);

  useEffect(() => {
    const unsubscribe = subscribeAppDataUpdates(() => {
      void loadCatalog();
    });
    const handleFocus = () => {
      void loadCatalog();
    };
    const handleVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;
      void loadCatalog();
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadCatalog]);

  return (
    <section className="courses-page">
      <div className="courses-page__container">
        <PageTitle title="Каталог курсов" className="courses-page__title" />

        {pageError ? (
          <RecoverableErrorAlert
            error={pageError}
            onRetry={() => loadCatalog()}
            retryLabel={t("common.retryLoadData")}
            forceRetry
          />
        ) : null}
        {catalogNoticeState && (
          <AccessStateBanner
            state={catalogNoticeState}
            onLogin={openAuthModal}
            onRecover={() => openRecoverModal(user?.email)}
          />
        )}

        <div className="courses-page__search">
            <TextField
              placeholder="Поиск курса..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            fullWidth
            inputProps={{ "aria-label": "Поиск курса" }}
            InputProps={{
              endAdornment: query ? (
                <InputAdornment position="end">
                  <IconButton
                    aria-label="Очистить поиск"
                    onClick={() => {
                      setQuery("");
                      setPage(1);
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

        {isStudent && (
          <div className="courses-page__segment">
            <button
              type="button"
              className={`courses-page__segment-btn ${
                studentTab === "notPurchased" ? "is-active" : ""
              }`}
              onClick={() => {
                setStudentTab("notPurchased");
                setPage(1);
                setSearchParams({ tab: "notPurchased" }, { replace: true });
              }}
            >
              <span className="courses-page__segment-icon">
                <AutoAwesomeRoundedIcon fontSize="small" />
              </span>
              <span className="courses-page__segment-copy">
                <span className="courses-page__segment-title">Новые курсы</span>
                <span className="courses-page__segment-note">
                  Выберите следующий шаг
                </span>
              </span>
            </button>
            <button
              type="button"
              className={`courses-page__segment-btn ${
                studentTab === "purchased" ? "is-active" : ""
              }`}
              onClick={() => {
                setStudentTab("purchased");
                setPage(1);
                setSearchParams({ tab: "purchased" }, { replace: true });
              }}
            >
              <span className="courses-page__segment-icon">
                <LocalLibraryRoundedIcon fontSize="small" />
              </span>
              <span className="courses-page__segment-copy">
                <span className="courses-page__segment-title">Мои курсы</span>
                <span className="courses-page__segment-note">
                  Продолжить обучение
                </span>
              </span>
            </button>
          </div>
        )}

        {loading && courses.length === 0 ? (
          <ListSkeleton className="courses-page__grid" count={6} itemHeight={220} />
        ) : (
          <div
            className={`courses-page__grid ${
              !isStudent || studentTab === "notPurchased"
                ? "courses-page__grid--catalog"
                : "courses-page__grid--purchased"
            }`}
          >
            {pagedCourses.map((course) => {
              const isTeacher = user?.role === "teacher";
              const decision = accessMap[course.id];
              const locked =
                decision !== undefined
                  ? !decision.canAccessAllLessons
                  : !isTeacher && !purchasedIds.includes(course.id);
              const progress =
                user?.role === "student" &&
                decision?.canAccessAllLessons !== false &&
                !locked
                  ? progressMap[course.id] ?? 0
                  : null;
              const bnplMarketing = selectBnplMarketingInfo(
                Math.min(course.priceSelf, course.priceGuided)
              );
              const bnplFromMonthly = toApproxMonthly(
                bnplMarketing.fromAmount,
                bnplMarketing.periodLabel
              );
              const ctaLabel = locked ? "Подробнее" : "Продолжить просмотр";
              const purchasedProgress = purchasedProgressMap[course.id] ?? null;
              const isPurchasedCard = isStudent && studentTab === "purchased";
              const isCourseCompleted = Boolean(
                purchasedProgress &&
                  purchasedProgress.lessonsViewed >= purchasedProgress.lessonsTotal &&
                  (purchasedProgress.testsTotal === 0 ||
                    (purchasedProgress.testsCompleted >=
                      purchasedProgress.testsTotal &&
                      purchasedProgress.knowledgePercent > 0))
              );
              const purchasedCtaLabel = isCourseCompleted
                ? "Пройти курс заново"
                : "Продолжить изучение";

              return (
                <CourseCard
                  key={course.id}
                  course={course}
                  lessonsCount={lessonCounts[course.id] ?? 0}
                  showLessonsCount={false}
                  locked={locked}
                  progress={progress}
                  ctaLabel={isPurchasedCard ? purchasedCtaLabel : ctaLabel}
                  isPremium={premiumMap[course.id] ?? false}
                  bnplAvailable={bnplMarketing.isAvailable}
                  bnplFromAmount={bnplFromMonthly}
                  showPrices={!isPurchasedCard}
                  summaryMode="level"
                  progressDetails={isPurchasedCard ? purchasedProgress : null}
                  detailsFromPath={
                    isStudent
                      ? `/courses?tab=${isPurchasedCard ? "purchased" : "notPurchased"}`
                      : undefined
                  }
                />
              );
            })}
          </div>
        )}

        {!loading && filteredCourses.length > 0 && (
          <ListPagination
            page={safePage}
            totalItems={filteredCourses.length}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        )}

        {!loading && filteredCourses.length === 0 && (
          <div className="courses-page__empty-tab">
            {isStudent && studentTab === "purchased"
              ? "Пока нет купленных курсов."
              : "По этому фильтру курсов пока нет."}
          </div>
        )}
      </div>
    </section>
  );
}
