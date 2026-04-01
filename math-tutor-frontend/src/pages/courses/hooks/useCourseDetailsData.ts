import { useCallback, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getCourseById } from "@/entities/course/model/storage";
import { getLessonsByCourse } from "@/entities/lesson/model/storage";
import {
  attachCheckoutPurchase,
  getPurchases,
} from "@/entities/purchase/model/storage";
import {
  getAssessmentCourseProgress,
  getAssessmentKnowledgeProgress,
  getCourseContentItems,
  getCourseMaterialBlocks,
  getLatestAssessmentAttemptsMap,
} from "@/features/assessments/model/storage";
import { getViewedLessonIds } from "@/entities/progress/model/storage";
import {
  getOpenedLessonIds,
} from "@/entities/purchase/model/openedLessons";
import type { Course } from "@/entities/course/model/types";
import type { Lesson } from "@/entities/lesson/model/types";
import type {
  CourseContentItem,
  CourseContentTestItem,
  CourseMaterialBlock,
} from "@/features/assessments/model/types";
import type { Purchase } from "@/entities/purchase/model/types";
import type { User } from "@/entities/user/model/types";
import {
  getCheckouts,
  type CheckoutListItem,
  type CheckoutStatusResponse,
  getCheckoutStatus,
  getCourseAccessDecision,
} from "@/domain/auth-payments/model/api";
import type { CourseAccessDecision } from "@/domain/auth-payments/model/access";
import {
  getCheckoutAccessUiState,
  type AccessUiState,
} from "@/domain/auth-payments/model/ui";
import { subscribeAppDataUpdates } from "@/shared/lib/subscribeAppDataUpdates";
import { getMyCapabilities } from "@/features/capabilities/model/api";

type UseCourseDetailsDataParams = {
  courseId: string;
  reloadSeq: number;
  user: User | null;
  expandedBlockFromState: string | null;
  course: Course | null;
  courseContentItems: CourseContentItem[];
  checkoutFlowOpen: boolean;
  activeCheckoutId: string | null;
  checkoutFlowStatus: CheckoutStatusResponse | null;
  pendingAttachCheckoutId: string | null;
  resumableCheckoutStates: ReadonlySet<string>;
  getPaymentProviderLabel: (method?: string | null, fallback?: string) => string;
  updateUser: (nextUser: User) => void;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setLoadError: Dispatch<SetStateAction<unknown | null>>;
  setCheckoutNoticeState: Dispatch<SetStateAction<AccessUiState | null>>;
  setCourseAccess: Dispatch<SetStateAction<CourseAccessDecision | null>>;
  setCourse: Dispatch<SetStateAction<Course | null>>;
  setLessons: Dispatch<SetStateAction<Lesson[]>>;
  setCourseContentItems: Dispatch<SetStateAction<CourseContentItem[]>>;
  setCourseBlocks: Dispatch<SetStateAction<CourseMaterialBlock[]>>;
  setSelectedBlockId: Dispatch<SetStateAction<string | null>>;
  setRoadmapFocusBlockId: Dispatch<SetStateAction<string | null>>;
  setHasPurchase: Dispatch<SetStateAction<boolean>>;
  setCoursePurchase: Dispatch<SetStateAction<Purchase | null>>;
  setIsPremiumPurchased: Dispatch<SetStateAction<boolean>>;
  setViewedLessonIds: Dispatch<SetStateAction<string[]>>;
  setOpenedLessonIds: Dispatch<SetStateAction<string[]>>;
  setResumeCheckout: Dispatch<SetStateAction<CheckoutListItem | null>>;
  setTestTitleByItemId: Dispatch<SetStateAction<Record<string, string>>>;
  setLatestTestAttemptByItemId: Dispatch<
    SetStateAction<Record<string, { percent: number; submittedAt?: string }>>
  >;
  setTestsProgress: Dispatch<
    SetStateAction<{
      totalTests: number;
      completedTests: number;
      averageLatestPercent: number;
    }>
  >;
  setTestsKnowledgeProgress: Dispatch<
    SetStateAction<{
      totalTests: number;
      completedTests: number;
      averageBestPercent: number;
    }>
  >;
  setReloadSeq: Dispatch<SetStateAction<number>>;
  setCheckoutFlowLoading: Dispatch<SetStateAction<boolean>>;
  setCheckoutFlowError: Dispatch<SetStateAction<string | null>>;
  setCheckoutFlowStatus: Dispatch<SetStateAction<CheckoutStatusResponse | null>>;
  setCheckoutPaymentUrl: Dispatch<SetStateAction<string | null>>;
  setCheckoutProviderLabel: Dispatch<SetStateAction<string>>;
  setPurchaseLoading: Dispatch<SetStateAction<boolean>>;
  setActiveCheckoutId: Dispatch<SetStateAction<string | null>>;
  setCheckoutFlowOpen: Dispatch<SetStateAction<boolean>>;
  setModalMessage: Dispatch<SetStateAction<string>>;
  setShowLoginAction: Dispatch<SetStateAction<boolean>>;
  setPendingAttachCheckoutId: Dispatch<SetStateAction<string | null>>;
  setModalOpen: Dispatch<SetStateAction<boolean>>;
};

export const useCourseDetailsData = ({
  courseId,
  reloadSeq,
  user,
  expandedBlockFromState,
  course,
  courseContentItems,
  checkoutFlowOpen,
  activeCheckoutId,
  checkoutFlowStatus,
  pendingAttachCheckoutId,
  resumableCheckoutStates,
  getPaymentProviderLabel,
  updateUser,
  setLoading,
  setLoadError,
  setCheckoutNoticeState,
  setCourseAccess,
  setCourse,
  setLessons,
  setCourseContentItems,
  setCourseBlocks,
  setSelectedBlockId,
  setRoadmapFocusBlockId,
  setHasPurchase,
  setCoursePurchase,
  setIsPremiumPurchased,
  setViewedLessonIds,
  setOpenedLessonIds,
  setResumeCheckout,
  setTestTitleByItemId,
  setLatestTestAttemptByItemId,
  setTestsProgress,
  setTestsKnowledgeProgress,
  setReloadSeq,
  setCheckoutFlowLoading,
  setCheckoutFlowError,
  setCheckoutFlowStatus,
  setCheckoutPaymentUrl,
  setCheckoutProviderLabel,
  setPurchaseLoading,
  setActiveCheckoutId,
  setCheckoutFlowOpen,
  setModalMessage,
  setShowLoginAction,
  setPendingAttachCheckoutId,
  setModalOpen,
}: UseCourseDetailsDataParams) => {
  const syncStudentCourseState = useCallback(
    async (userId: string) => {
      if (!course) return;
      const [decision, purchases, capabilities] = await Promise.all([
        getCourseAccessDecision({
          courseId: course.id,
        }),
        getPurchases({ userId }, { forceFresh: true }),
        getMyCapabilities({ forceFresh: true }),
      ]);
      setCourseAccess(decision);
      setHasPurchase(decision.canAccessAllLessons);
      const purchase = purchases.find(
        (item) => item.userId === userId && item.courseId === course.id
      );
      setCoursePurchase(purchase ?? null);
      setIsPremiumPurchased(
        capabilities.premiumCourseIds.includes(course.id) ||
          Boolean(purchase && purchase.tariff === "premium")
      );
      setOpenedLessonIds(getOpenedLessonIds(userId, course.id));
      const testItemIds = courseContentItems
        .filter((item): item is CourseContentTestItem => item.type === "test")
        .map((item) => item.id);
      if (testItemIds.length > 0) {
        const [attemptsMap, metrics, knowledgeMetrics] = await Promise.all([
          getLatestAssessmentAttemptsMap({
            studentId: userId,
            courseId: course.id,
          }),
          getAssessmentCourseProgress({
            studentId: userId,
            courseId: course.id,
            testItemIds,
          }),
          getAssessmentKnowledgeProgress({
            studentId: userId,
            courseId: course.id,
            testItemIds,
          }),
        ]);
        const mapped: Record<string, { percent: number; submittedAt?: string }> = {};
        attemptsMap.forEach((attempt, itemId) => {
          mapped[itemId] = {
            percent: attempt.score.percent,
            submittedAt: attempt.submittedAt,
          };
        });
        setLatestTestAttemptByItemId(mapped);
        setTestsProgress(metrics);
        setTestsKnowledgeProgress(knowledgeMetrics);
      } else {
        setTestsProgress({
          totalTests: 0,
          completedTests: 0,
          averageLatestPercent: 0,
        });
        setTestsKnowledgeProgress({
          totalTests: 0,
          completedTests: 0,
          averageBestPercent: 0,
        });
      }
      if (decision.canAccessAllLessons) {
        setCheckoutNoticeState(null);
        setResumeCheckout(null);
      }
    },
    [
      course,
      courseContentItems,
      setCourseAccess,
      setHasPurchase,
      setCoursePurchase,
      setIsPremiumPurchased,
      setOpenedLessonIds,
      setLatestTestAttemptByItemId,
      setTestsProgress,
      setTestsKnowledgeProgress,
      setCheckoutNoticeState,
      setResumeCheckout,
    ]
  );

  const refreshCheckoutFlow = useCallback(
    async (checkoutId: string, options?: { silent?: boolean }) => {
      if (!checkoutId) return;
      const silent = options?.silent === true;
      if (!silent) {
        setCheckoutFlowLoading(true);
        setCheckoutFlowError(null);
      }
      try {
        const status = await getCheckoutStatus(checkoutId);
        setCheckoutFlowStatus(status);
        setCheckoutPaymentUrl(
          status.payment.redirectUrl ??
            status.payment.paymentUrl ??
            status.payment.sbp?.deepLinkUrl ??
            status.payment.sbp?.qrUrl ??
            null
        );
        setCheckoutProviderLabel(getPaymentProviderLabel(status.method));
        setResumeCheckout((prev) => {
          if (!prev || prev.id !== status.checkoutId) return prev;
          if (resumableCheckoutStates.has(status.state)) {
            return {
              ...prev,
              state: status.state as CheckoutListItem["state"],
              method: status.method as CheckoutListItem["method"],
              updatedAt: status.updatedAt,
            };
          }
          return null;
        });
        if (status.access?.accessState) {
          if (status.access.accessState === "active") {
            setCheckoutNoticeState(null);
          } else {
            setCheckoutNoticeState(getCheckoutAccessUiState(status.access.accessState));
          }
        }
        if (
          user?.role === "student" &&
          (status.isTerminal ||
            status.access?.accessState === "active" ||
            status.payment.status === "provider_confirmed")
        ) {
          await syncStudentCourseState(user.id);
        }
      } catch (error) {
        setCheckoutFlowError(
          error instanceof Error
            ? error.message
            : "Не удалось обновить статус оплаты."
        );
      } finally {
        if (!silent) {
          setCheckoutFlowLoading(false);
        }
      }
    },
    [
      user,
      setCheckoutFlowLoading,
      setCheckoutFlowError,
      setCheckoutFlowStatus,
      setCheckoutPaymentUrl,
      setCheckoutProviderLabel,
      setResumeCheckout,
      resumableCheckoutStates,
      getPaymentProviderLabel,
      setCheckoutNoticeState,
      syncStudentCourseState,
    ]
  );

  useEffect(() => {
    if (!courseId) return;
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        setLoadError(null);
        setCheckoutNoticeState(null);
        const [courseData, lessonsData, purchases, accessDecision, checkouts, capabilities] =
          await Promise.all([
            getCourseById(courseId, { forceFresh: true }),
            getLessonsByCourse(courseId, { forceFresh: true }),
            user?.role === "student"
              ? getPurchases({ userId: user.id }, { forceFresh: true })
              : Promise.resolve([]),
            getCourseAccessDecision({
              courseId,
            }),
            user?.role === "student"
              ? getCheckouts({ userId: user.id, courseId })
              : Promise.resolve([]),
            user?.role === "student"
              ? getMyCapabilities({ forceFresh: true })
              : Promise.resolve(null),
          ]);
        if (!active) return;
        setCourseAccess(accessDecision);
        if (user?.role === "student") {
          const purchase = purchases.find(
            (entry) => entry.userId === user.id && entry.courseId === courseId
          );
          const purchased = Boolean(purchase);
          const usePublishedCourse = courseData?.status === "published";
          const resolvedCourse = usePublishedCourse
            ? courseData ?? purchase?.courseSnapshot ?? null
            : purchase?.courseSnapshot ?? courseData ?? null;
          const resolvedLessons = usePublishedCourse
            ? lessonsData
            : Array.isArray(purchase?.lessonsSnapshot)
            ? purchase.lessonsSnapshot
            : lessonsData;
          setCourse(resolvedCourse);
          setLessons(resolvedLessons);
          const [queue, blocks] = await Promise.all([
            getCourseContentItems(courseId, resolvedLessons),
            getCourseMaterialBlocks(courseId),
          ]);
          const purchasedTestItemIdSet = new Set(
            Array.isArray(purchase?.purchasedTestItemIds)
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
                if (!purchase?.purchasedAt) return true;
                return item.createdAt <= purchase.purchasedAt;
              });
          if (!active) return;
          setCourseContentItems(effectiveQueue);
          setCourseBlocks(blocks);
          const initialBlockSelection =
            blocks.length > 1 &&
            expandedBlockFromState &&
            blocks.some((block) => block.id === expandedBlockFromState)
              ? expandedBlockFromState
              : null;
          setSelectedBlockId(initialBlockSelection);
          setRoadmapFocusBlockId(initialBlockSelection ?? blocks[0]?.id ?? null);
          setHasPurchase(purchased);
          setCoursePurchase(purchase ?? null);
          setIsPremiumPurchased(
            Boolean(
              purchase &&
                ((capabilities?.premiumCourseIds ?? []).includes(courseId) ||
                  purchase.tariff === "premium")
            )
          );
          const [viewed, opened] = await Promise.all([
            getViewedLessonIds(user.id, courseId, { forceFresh: true }),
            Promise.resolve(getOpenedLessonIds(user.id, courseId)),
          ]);
          if (!active) return;
          setViewedLessonIds(viewed);
          setOpenedLessonIds(opened);
          const candidate =
            checkouts.find((item) => resumableCheckoutStates.has(item.state)) ?? null;
          setResumeCheckout(candidate);

          const testItems = effectiveQueue.filter(
            (item): item is CourseContentTestItem => item.type === "test"
          );
          const titles = testItems.reduce<Record<string, string>>((acc, item) => {
            acc[item.id] = item.templateSnapshot?.title ?? item.titleSnapshot;
            return acc;
          }, {});
          if (!active) return;
          setTestTitleByItemId(titles);

          if (purchased) {
            const attemptsMap = await getLatestAssessmentAttemptsMap({
              studentId: user.id,
              courseId,
            });
            if (!active) return;
            const mapped: Record<string, { percent: number; submittedAt?: string }> = {};
            attemptsMap.forEach((attempt, itemId) => {
              mapped[itemId] = {
                percent: attempt.score.percent,
                submittedAt: attempt.submittedAt,
              };
            });
            setLatestTestAttemptByItemId(mapped);
            const [testsMetrics, testsKnowledgeMetrics] = await Promise.all([
              getAssessmentCourseProgress({
                studentId: user.id,
                courseId,
                testItemIds: testItems.map((item) => item.id),
              }),
              getAssessmentKnowledgeProgress({
                studentId: user.id,
                courseId,
                testItemIds: testItems.map((item) => item.id),
              }),
            ]);
            if (!active) return;
            setTestsProgress(testsMetrics);
            setTestsKnowledgeProgress(testsKnowledgeMetrics);
          } else {
            setLatestTestAttemptByItemId({});
            setTestsProgress({
              totalTests: testItems.length,
              completedTests: 0,
              averageLatestPercent: 0,
            });
            setTestsKnowledgeProgress({
              totalTests: testItems.length,
              completedTests: 0,
              averageBestPercent: 0,
            });
          }
        } else {
          setCourse(courseData);
          setLessons(lessonsData);
          const [queue, blocks] = await Promise.all([
            getCourseContentItems(courseId, lessonsData),
            getCourseMaterialBlocks(courseId),
          ]);
          if (!active) return;
          setCourseContentItems(queue);
          setCourseBlocks(blocks);
          const initialBlockSelection =
            blocks.length > 1 &&
            expandedBlockFromState &&
            blocks.some((block) => block.id === expandedBlockFromState)
              ? expandedBlockFromState
              : null;
          setSelectedBlockId(initialBlockSelection);
          setRoadmapFocusBlockId(initialBlockSelection ?? blocks[0]?.id ?? null);
          const testItems = queue.filter(
            (item): item is CourseContentTestItem => item.type === "test"
          );
          const titles = testItems.reduce<Record<string, string>>((acc, item) => {
            acc[item.id] = item.templateSnapshot?.title ?? item.titleSnapshot;
            return acc;
          }, {});
          if (!active) return;
          setTestTitleByItemId(titles);
          setLatestTestAttemptByItemId({});
          setTestsProgress({
            totalTests: testItems.length,
            completedTests: 0,
            averageLatestPercent: 0,
          });
          setTestsKnowledgeProgress({
            totalTests: testItems.length,
            completedTests: 0,
            averageBestPercent: 0,
          });
          setViewedLessonIds([]);
          setOpenedLessonIds([]);
          setHasPurchase(false);
          setCoursePurchase(null);
          setIsPremiumPurchased(false);
          setResumeCheckout(null);
        }
      } catch (error) {
        if (!active) return;
        setLoadError(
          error instanceof Error
            ? error
            : new Error("Не удалось загрузить данные курса.")
        );
        setCourse(null);
        setLessons([]);
        setCourseBlocks([]);
        setSelectedBlockId(null);
        setRoadmapFocusBlockId(null);
        setCourseContentItems([]);
        setTestTitleByItemId({});
        setLatestTestAttemptByItemId({});
        setTestsProgress({
          totalTests: 0,
          completedTests: 0,
          averageLatestPercent: 0,
        });
        setTestsKnowledgeProgress({
          totalTests: 0,
          completedTests: 0,
          averageBestPercent: 0,
        });
        setViewedLessonIds([]);
        setOpenedLessonIds([]);
        setHasPurchase(false);
        setCoursePurchase(null);
        setIsPremiumPurchased(false);
        setCourseAccess(null);
        setResumeCheckout(null);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [
    courseId,
    reloadSeq,
    user?.id,
    user?.role,
    expandedBlockFromState,
    resumableCheckoutStates,
    setLoading,
    setLoadError,
    setCheckoutNoticeState,
    setCourseAccess,
    setCourse,
    setLessons,
    setCourseContentItems,
    setCourseBlocks,
    setSelectedBlockId,
    setRoadmapFocusBlockId,
    setHasPurchase,
    setCoursePurchase,
    setIsPremiumPurchased,
    setViewedLessonIds,
    setOpenedLessonIds,
    setResumeCheckout,
    setTestTitleByItemId,
    setLatestTestAttemptByItemId,
    setTestsProgress,
    setTestsKnowledgeProgress,
  ]);

  useEffect(() => {
    const unsubscribe = subscribeAppDataUpdates(() => {
      setReloadSeq((prev) => prev + 1);
    });
    return () => {
      unsubscribe();
    };
  }, [setReloadSeq]);

  useEffect(() => {
    if (!checkoutFlowOpen || !activeCheckoutId) return;
    if (user?.role !== "student") return;
    void refreshCheckoutFlow(activeCheckoutId);
  }, [checkoutFlowOpen, activeCheckoutId, user?.id, user?.role, refreshCheckoutFlow]);

  useEffect(() => {
    if (!checkoutFlowOpen || !activeCheckoutId) return;
    if (user?.role !== "student") return;
    if (!checkoutFlowStatus?.payment.requiresConfirmation) return;
    if (checkoutFlowStatus.isTerminal) return;
    const timer = window.setInterval(() => {
      void refreshCheckoutFlow(activeCheckoutId, { silent: true });
    }, 3500);
    return () => window.clearInterval(timer);
  }, [
    checkoutFlowOpen,
    activeCheckoutId,
    checkoutFlowStatus?.payment.requiresConfirmation,
    checkoutFlowStatus?.isTerminal,
    user?.id,
    user?.role,
    refreshCheckoutFlow,
  ]);

  useEffect(() => {
    if (!user || user.role !== "student") return;
    if (!pendingAttachCheckoutId || !course) return;
    let active = true;
    const attachCheckout = async () => {
      let shouldOpenAttentionModal = false;
      try {
        setPurchaseLoading(true);
        const result = await attachCheckoutPurchase(pendingAttachCheckoutId);
        if (!active) return;
        if (result.user) {
          updateUser(result.user);
        }
        setActiveCheckoutId(result.checkoutId);
        setCheckoutPaymentUrl(
          result.payment?.redirectUrl ??
            result.payment?.paymentUrl ??
            result.payment?.sbp?.deepLinkUrl ??
            result.payment?.sbp?.qrUrl ??
            null
        );
        setCheckoutProviderLabel(getPaymentProviderLabel(result.payment?.provider));
        setCheckoutFlowStatus(null);
        setCheckoutFlowError(null);
        setCheckoutFlowOpen(true);
        await refreshCheckoutFlow(result.checkoutId);
      } catch (error) {
        if (!active) return;
        setModalMessage(
          error instanceof Error
            ? error.message
            : "Не удалось привязать покупку после входа."
        );
        setShowLoginAction(false);
        shouldOpenAttentionModal = true;
      } finally {
        if (active) {
          setPurchaseLoading(false);
          setPendingAttachCheckoutId(null);
          if (shouldOpenAttentionModal) {
            setModalOpen(true);
          }
        }
      }
    };
    void attachCheckout();
    return () => {
      active = false;
    };
  }, [
    course,
    pendingAttachCheckoutId,
    refreshCheckoutFlow,
    updateUser,
    user,
    getPaymentProviderLabel,
    setPurchaseLoading,
    setActiveCheckoutId,
    setCheckoutPaymentUrl,
    setCheckoutProviderLabel,
    setCheckoutFlowStatus,
    setCheckoutFlowError,
    setCheckoutFlowOpen,
    setModalMessage,
    setShowLoginAction,
    setPendingAttachCheckoutId,
    setModalOpen,
  ]);

  return {
    syncStudentCourseState,
    refreshCheckoutFlow,
  };
};
