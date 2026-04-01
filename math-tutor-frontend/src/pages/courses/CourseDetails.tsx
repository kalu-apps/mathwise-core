import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { LessonItem } from "@/entities/lesson/ui/LessonItem";
import { useAuth } from "@/features/auth/model/AuthContext";
import { selfHealAccess } from "@/features/auth/model/api";
import {
  checkoutPurchase,
} from "@/entities/purchase/model/storage";
import type { Purchase } from "@/entities/purchase/model/types";
import {
  Alert,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogActions,
  FormControlLabel,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  Star,
  RocketLaunch,
  Diamond,
  CloseRounded,
  LoginRounded,
  PaymentsRounded,
  CreditCardRounded,
  QrCode2Rounded,
  AccountBalanceWalletRounded,
  OpenInNewRounded,
  RefreshRounded,
  CheckCircleRounded,
  HourglassTopRounded,
  AssignmentTurnedInRounded,
  GavelRounded,
  BoltRounded,
  TrendingUpRounded,
  FlagRounded,
} from "@mui/icons-material";
import { ListPagination } from "@/shared/ui/ListPagination";
import type {
  CourseContentItem,
  CourseContentTestItem,
  CourseMaterialBlock,
} from "@/features/assessments/model/types";
import {
  formatRuPhoneInput,
  isRuPhoneComplete,
  toRuPhoneStorage,
  PHONE_MASK_TEMPLATE,
} from "@/shared/lib/phone";
import type { Course } from "@/entities/course/model/types";
import type { Lesson } from "@/entities/lesson/model/types";
import {
  cancelCheckout,
  retryCheckout,
  type CheckoutListItem,
} from "@/domain/auth-payments/model/api";
import type { CourseAccessDecision } from "@/domain/auth-payments/model/access";
import {
  getCourseAccessUiState,
  type AccessUiState,
} from "@/domain/auth-payments/model/ui";
import { AccessStateBanner } from "@/shared/ui/AccessStateBanner";
import { ApiError } from "@/shared/api/client";
import { useActionGuard } from "@/shared/lib/useActionGuard";
import { t } from "@/shared/i18n";
import { RecoverableErrorAlert } from "@/shared/ui/RecoverableErrorAlert";
import { PageLoader } from "@/shared/ui/loading";
import { DialogTitleWithClose } from "@/shared/ui/DialogTitleWithClose";
import { BackNavButton } from "@/shared/ui/BackNavButton";
import { logCollectionPressure, usePerfScreenTag } from "@/shared/lib/perfScreen";
import {
  selectBnplMarketingInfo,
  selectCourseAccessState,
  selectPurchaseFinancialView,
} from "@/entities/purchase/model/selectors";
import { markLessonOpened } from "@/entities/purchase/model/openedLessons";
import { useCourseDetailsData } from "@/pages/courses/hooks/useCourseDetailsData";
import { useCourseDetailsUiState } from "@/pages/courses/hooks/useCourseDetailsUiState";
import {
  buildCourseProgressVisual,
  getAssessmentKindByItem,
} from "@/pages/courses/model/mappers";
import {
  PAYMENT_METHODS as PAYMENT_METHODS_BASE,
  RESUMABLE_CHECKOUT_STATES,
  formatApproxMonthlyBnplLine,
  getBnplStatusBanner,
  getApproxMonthlyFrom,
  getCheckoutDialogHint,
  getCheckoutDialogTitle,
  getCheckoutStatusLabel,
  getPaymentProviderLabel,
  hasLessonChangedFromPurchaseSnapshot,
  type PaymentMethod,
} from "@/pages/courses/model/courseDetailsHelpers";

type CourseDetailsLocationState = {
  from?: string;
  expandedBlockId?: string | null;
};

type PaymentMethodMeta = (typeof PAYMENT_METHODS_BASE)[number] & {
  Icon: typeof CreditCardRounded;
};

const PAYMENT_METHOD_ICON_BY_ID: Record<PaymentMethod, typeof CreditCardRounded> = {
  card: CreditCardRounded,
  sbp: QrCode2Rounded,
  bnpl: AccountBalanceWalletRounded,
};

const PAYMENT_METHODS: PaymentMethodMeta[] = PAYMENT_METHODS_BASE.map((method) => ({
  ...method,
  Icon: PAYMENT_METHOD_ICON_BY_ID[method.id],
}));

export default function CourseDetails() {
  const { courseId: courseIdParam } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isDesktopCourseLayout = useMediaQuery(theme.breakpoints.up("lg"));
  const courseId = courseIdParam ?? "";
  const { user, openAuthModal, openRecoverModal, updateUser } = useAuth();
  const {
    modalOpen,
    setModalOpen,
    modalMessage,
    setModalMessage,
    showLoginAction,
    setShowLoginAction,
    reloadSeq,
    setReloadSeq,
    purchaseOpen,
    setPurchaseOpen,
    purchaseEmail,
    setPurchaseEmail,
    purchaseFirstName,
    setPurchaseFirstName,
    purchaseLastName,
    setPurchaseLastName,
    purchasePhone,
    setPurchasePhone,
    purchaseAcceptTerms,
    setPurchaseAcceptTerms,
    purchaseAcceptPrivacy,
    setPurchaseAcceptPrivacy,
    purchaseMethod,
    setPurchaseMethod,
    purchaseBnplInstallmentsCount,
    setPurchaseBnplInstallmentsCount,
    purchaseLoading,
    setPurchaseLoading,
    checkoutFlowOpen,
    setCheckoutFlowOpen,
    checkoutFlowLoading,
    setCheckoutFlowLoading,
    checkoutFlowError,
    setCheckoutFlowError,
    activeCheckoutId,
    setActiveCheckoutId,
    checkoutFlowStatus,
    setCheckoutFlowStatus,
    checkoutPaymentUrl,
    setCheckoutPaymentUrl,
    checkoutProviderLabel,
    setCheckoutProviderLabel,
    resumeCheckout,
    setResumeCheckout,
    pendingAttachCheckoutId,
    setPendingAttachCheckoutId,
    lessonsPage,
    setLessonsPage,
    bnplInfoOpen,
    setBnplInfoOpen,
    resetCourseDetailsUiState,
  } = useCourseDetailsUiState();
  usePerfScreenTag("CourseDetails");
  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [courseBlocks, setCourseBlocks] = useState<CourseMaterialBlock[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [roadmapFocusBlockId, setRoadmapFocusBlockId] = useState<string | null>(null);
  const [courseContentItems, setCourseContentItems] = useState<CourseContentItem[]>([]);
  const [testTitleByItemId, setTestTitleByItemId] = useState<Record<string, string>>({});
  const [latestTestAttemptByItemId, setLatestTestAttemptByItemId] = useState<
    Record<string, { percent: number; submittedAt?: string }>
  >({});
  const [, setTestsProgress] = useState({
    totalTests: 0,
    completedTests: 0,
    averageLatestPercent: 0,
  });
  const [testsKnowledgeProgress, setTestsKnowledgeProgress] = useState({
    totalTests: 0,
    completedTests: 0,
    averageBestPercent: 0,
  });
  const [viewedLessonIds, setViewedLessonIds] = useState<string[]>([]);
  const [openedLessonIds, setOpenedLessonIds] = useState<string[]>([]);
  const [hasPurchase, setHasPurchase] = useState(false);
  const [coursePurchase, setCoursePurchase] = useState<Purchase | null>(null);
  const [isPremiumPurchased, setIsPremiumPurchased] = useState(false);
  const [courseAccess, setCourseAccess] = useState<CourseAccessDecision | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown | null>(null);
  const [pendingType, setPendingType] = useState<"guided" | "self" | null>(null);
  const [checkoutNoticeState, setCheckoutNoticeState] = useState<AccessUiState | null>(
    null
  );
  const purchaseSubmitGuard = useActionGuard();
  const checkoutActionGuard = useActionGuard();
  const locationState = (location.state as CourseDetailsLocationState | null) ?? null;
  const sourceFromPath =
    typeof locationState?.from === "string" ? locationState.from : null;
  const expandedBlockFromState =
    typeof locationState?.expandedBlockId === "string"
      ? locationState.expandedBlockId
      : null;

  useEffect(() => {
    resetCourseDetailsUiState();
  }, [courseId, resetCourseDetailsUiState]);

  const hasMultipleBlocks = courseBlocks.length > 1;
  const effectiveSelectedBlockId = hasMultipleBlocks ? selectedBlockId : null;
  const selectedBlock = effectiveSelectedBlockId
    ? courseBlocks.find((block) => block.id === effectiveSelectedBlockId) ?? null
    : null;
  const effectiveRoadmapFocusBlockId = hasMultipleBlocks
    ? roadmapFocusBlockId && courseBlocks.some((block) => block.id === roadmapFocusBlockId)
      ? roadmapFocusBlockId
      : selectedBlockId && courseBlocks.some((block) => block.id === selectedBlockId)
      ? selectedBlockId
      : courseBlocks[0]?.id ?? null
    : null;
  const roadmapFocusBlock = effectiveRoadmapFocusBlockId
    ? courseBlocks.find((block) => block.id === effectiveRoadmapFocusBlockId) ?? null
    : null;
  const visibleCourseItems = effectiveSelectedBlockId
    ? courseContentItems.filter((item) => item.blockId === effectiveSelectedBlockId)
    : courseContentItems;

  const { syncStudentCourseState, refreshCheckoutFlow } = useCourseDetailsData({
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
    resumableCheckoutStates: RESUMABLE_CHECKOUT_STATES,
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
  });

  const lessonsById = useMemo(
    () =>
      lessons.reduce<Record<string, Lesson>>((acc, lesson) => {
        acc[lesson.id] = lesson;
        return acc;
      }, {}),
    [lessons]
  );
  const courseTestItems = useMemo(
    () =>
      courseContentItems.filter(
        (item): item is CourseContentTestItem => item.type === "test"
      ),
    [courseContentItems]
  );
  const purchasedLessonsById = useMemo(() => {
    const map = new Map<string, Lesson>();
    if (!Array.isArray(coursePurchase?.lessonsSnapshot)) return map;
    coursePurchase.lessonsSnapshot.forEach((lesson) => {
      map.set(lesson.id, lesson);
    });
    return map;
  }, [coursePurchase?.lessonsSnapshot]);
  const purchasedTestItemIds = useMemo(
    () => new Set(coursePurchase?.purchasedTestItemIds ?? []),
    [coursePurchase?.purchasedTestItemIds]
  );
  const newMaterialItemIds = useMemo(() => {
    if (user?.role !== "student" || !hasPurchase) {
      return new Set<string>();
    }
    const purchasedAtMs = Number.isFinite(Date.parse(coursePurchase?.purchasedAt ?? ""))
      ? Date.parse(coursePurchase?.purchasedAt ?? "")
      : NaN;
    const fallbackByCreatedAt = (createdAt: string) => {
      if (!Number.isFinite(purchasedAtMs)) return false;
      const createdAtMs = Date.parse(createdAt);
      if (!Number.isFinite(createdAtMs)) return false;
      return createdAtMs > purchasedAtMs;
    };

    const result = new Set<string>();
    courseContentItems.forEach((item) => {
      if (item.type === "lesson") {
        const baselineLesson = purchasedLessonsById.get(item.lessonId);
        const currentLesson = lessonsById[item.lessonId];
        if (!baselineLesson) {
          result.add(item.id);
          return;
        }
        if (currentLesson && hasLessonChangedFromPurchaseSnapshot(currentLesson, baselineLesson)) {
          result.add(item.id);
        }
        return;
      }

      if (purchasedTestItemIds.size > 0) {
        if (!purchasedTestItemIds.has(item.id)) {
          result.add(item.id);
        }
        return;
      }

      if (fallbackByCreatedAt(item.createdAt)) {
        result.add(item.id);
      }
    });

    return result;
  }, [
    courseContentItems,
    coursePurchase?.purchasedAt,
    hasPurchase,
    lessonsById,
    purchasedLessonsById,
    purchasedTestItemIds,
    user?.role,
  ]);
  const lessonsPageSize = isMobile ? 4 : 8;
  const lessonsTotalPages = Math.max(
    1,
    Math.ceil(visibleCourseItems.length / lessonsPageSize)
  );
  const safeLessonsPage = Math.min(lessonsPage, lessonsTotalPages);
  useEffect(() => {
    setLessonsPage(1);
  }, [effectiveSelectedBlockId, setLessonsPage]);

  const pagedContentItems = useMemo(() => {
    const start = (safeLessonsPage - 1) * lessonsPageSize;
    return visibleCourseItems.slice(start, start + lessonsPageSize);
  }, [visibleCourseItems, safeLessonsPage, lessonsPageSize]);

  useEffect(() => {
    logCollectionPressure({
      screen: "CourseDetails",
      metric: "course-items-visible",
      size: visibleCourseItems.length,
      warnAt: 120,
      errorAt: 260,
      details: {
        lessons: lessons.length,
        blocks: courseBlocks.length,
      },
    });
  }, [courseBlocks.length, lessons.length, visibleCourseItems.length]);

  const handlePageNoticeRecheck = useCallback(() => {
    if (user?.role !== "student") return;
    if (activeCheckoutId) {
      void refreshCheckoutFlow(activeCheckoutId);
      return;
    }
    if (resumeCheckout?.id) {
      void refreshCheckoutFlow(resumeCheckout.id);
      return;
    }
    if (user.id) {
      void syncStudentCourseState(user.id);
    }
  }, [
    activeCheckoutId,
    refreshCheckoutFlow,
    resumeCheckout?.id,
    syncStudentCourseState,
    user?.id,
    user?.role,
  ]);

  const handleRepairAndRecheck = useCallback(async () => {
    if (user?.role !== "student") return;
    if (!course?.id) return;
    try {
      await selfHealAccess({ courseId: course.id });
    } catch {
      // No-op: fallback to recheck to surface current authoritative state.
    }
    handlePageNoticeRecheck();
  }, [course?.id, handlePageNoticeRecheck, user?.role]);

  const handleResumeCheckout = useCallback(() => {
    if (!resumeCheckout?.id) return;
    setActiveCheckoutId(resumeCheckout.id);
    setCheckoutProviderLabel(getPaymentProviderLabel(resumeCheckout.method));
    setCheckoutFlowError(null);
    setCheckoutFlowOpen(true);
    if (user?.role === "student") {
      void refreshCheckoutFlow(resumeCheckout.id);
    }
  }, [
    refreshCheckoutFlow,
    resumeCheckout,
    setActiveCheckoutId,
    setCheckoutFlowError,
    setCheckoutFlowOpen,
    setCheckoutProviderLabel,
    user?.role,
  ]);

  const handleCompleteProfile = useCallback(() => {
    if (user?.role === "student") {
      navigate("/profile");
      return;
    }
    const fallbackEmail =
      (purchaseEmail || user?.email || "").trim().toLowerCase() || undefined;
    openRecoverModal(fallbackEmail);
  }, [navigate, openRecoverModal, purchaseEmail, user?.email, user?.role]);

  const handleBackToSource = useCallback(() => {
    if (sourceFromPath) {
      navigate(sourceFromPath);
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    if (user?.role === "teacher") {
      navigate("/teacher/profile?tab=courses");
      return;
    }
    navigate("/student/profile?tab=courses");
  }, [navigate, sourceFromPath, user?.role]);

  if (!courseId) return null;

  if (loading) {
    return (
      <section className="course-details">
        <PageLoader
          className="course-details__loader"
          title={t("courseEditor.loadingCourse")}
          description="Подготавливаем материалы и проверяем доступ к урокам."
          minHeight={380}
        />
      </section>
    );
  }

  if (!course) {
    return (
      <section className="course-details">
        {loadError ? (
          <RecoverableErrorAlert
            error={loadError}
            onRetry={() => setReloadSeq((prev) => prev + 1)}
            retryLabel={t("common.retryLoadData")}
            forceRetry
          />
        ) : null}
        <p>Курс не найден</p>
      </section>
    );
  }

  const isTeacher = user?.role === "teacher";
  const viewedLessonIdSet = new Set(viewedLessonIds);
  const openedOrViewedLessonIdSet = new Set([...openedLessonIds, ...viewedLessonIds]);
  const viewedLessonsCount = viewedLessonIdSet.size;
  const purchaseFinancialView = coursePurchase
    ? selectPurchaseFinancialView(coursePurchase)
    : null;
  const purchaseAccessState = selectCourseAccessState(coursePurchase);
  const isBnplRestricted =
    purchaseFinancialView?.paymentMethod === "bnpl" &&
    purchaseAccessState.accessLevel === "restricted_new_content";
  const isBnplSuspended =
    purchaseFinancialView?.paymentMethod === "bnpl" &&
    purchaseAccessState.accessLevel === "suspended_readonly";
  const hasDomainAccess =
    isTeacher || hasPurchase || courseAccess?.canAccessAllLessons === true;
  const canAccessAll = hasDomainAccess && !isBnplSuspended;
  const showPurchaseSection = isTeacher || (!canAccessAll && !hasPurchase);
  const showRoadmapSection = user?.role === "student" && hasPurchase;
  const showDesktopRoadmapSection = showRoadmapSection && isDesktopCourseLayout;
  const showInlineRoadmapProgress = showRoadmapSection && !isDesktopCourseLayout;
  const bnplStatusBanner =
    purchaseFinancialView?.paymentMethod === "bnpl"
      ? getBnplStatusBanner(purchaseFinancialView.financialStatus, {
          nextPaymentDate: purchaseFinancialView.nextPaymentDate,
          overdueDays: purchaseFinancialView.overdueDays,
        })
      : null;
  const guidedBnplMarketing = selectBnplMarketingInfo(course.priceGuided);
  const selfBnplMarketing = selectBnplMarketingInfo(course.priceSelf);
  const guidedBnplLine = formatApproxMonthlyBnplLine({
    fromAmount: guidedBnplMarketing.fromAmount,
    periodLabel: guidedBnplMarketing.periodLabel,
  });
  const selfBnplLine = formatApproxMonthlyBnplLine({
    fromAmount: selfBnplMarketing.fromAmount,
    periodLabel: selfBnplMarketing.periodLabel,
  });
  const checkoutPrice =
    pendingType === "guided"
      ? course.priceGuided
      : pendingType === "self"
        ? course.priceSelf
        : null;
  const checkoutBnplMarketing =
    checkoutPrice !== null ? selectBnplMarketingInfo(checkoutPrice) : null;
  const bnplCheckoutDisabled = Boolean(
    checkoutBnplMarketing && !checkoutBnplMarketing.isAvailable
  );
  const selectedCheckoutBnplPlan =
    checkoutBnplMarketing?.availablePlans.find(
      (item) => item.installmentsCount === purchaseBnplInstallmentsCount
    ) ??
    checkoutBnplMarketing?.availablePlans[0] ??
    null;
  const bnplCheckoutSubtitle = bnplCheckoutDisabled
    ? checkoutBnplMarketing?.disclaimer ??
      "Оплата частями временно недоступна для выбранного тарифа."
    : selectedCheckoutBnplPlan?.fromAmount
      ? `От ${getApproxMonthlyFrom({
          fromAmount: selectedCheckoutBnplPlan.fromAmount,
          periodLabel: selectedCheckoutBnplPlan.periodLabel,
        })?.toLocaleString("ru-RU")} ₽ в месяц • ${
          selectedCheckoutBnplPlan.installmentsCount
        } платежей`
      : checkoutBnplMarketing?.fromAmount
        ? `От ${getApproxMonthlyFrom({
            fromAmount: checkoutBnplMarketing.fromAmount,
            periodLabel: checkoutBnplMarketing.periodLabel,
          })?.toLocaleString("ru-RU")} ₽ в месяц • ${
            checkoutBnplMarketing.installmentsCount
          } платежей`
        : "Оплата частями (точные условия на следующем шаге).";
  const courseNoticeState = getCourseAccessUiState({
    decision: courseAccess,
    hasPurchase,
    isTeacher,
  });
  const pageNoticeState = checkoutNoticeState ?? courseNoticeState;
  const onboardingStates: AccessUiState[] = [
    "awaiting_profile",
    "awaiting_verification",
    "paid_but_restricted",
  ];
  const showOnboardingPanel =
    !isTeacher && Boolean(pageNoticeState && onboardingStates.includes(pageNoticeState));
  const isAwaitingCheckoutPayment =
    checkoutFlowStatus?.payment.status === "awaiting_provider";
  const shouldShowAwaitingProviderHint =
    isAwaitingCheckoutPayment &&
    (checkoutFlowStatus?.method === "card" || checkoutFlowStatus?.method === "sbp");
  const sbpPaymentView =
    checkoutFlowStatus?.method === "sbp"
      ? checkoutFlowStatus.payment.sbp
      : undefined;

  const mobileDialogActionSx = isMobile
    ? {
        minWidth: 44,
        width: "auto",
        height: 44,
        px: 1.2,
        py: 0.9,
        borderRadius: 2.5,
        flex: "1 1 44px",
        whiteSpace: "nowrap",
      }
    : undefined;
  const modalPaperSx = {
    borderRadius: 4,
    backdropFilter: "blur(12px)",
    background: "var(--surface-translucent)",
    p: 3,
  };
  const attentionDialogContentSx = { fontSize: 16 };
  const attentionDialogActionsSx = {
    flexWrap: isMobile ? "wrap" : "nowrap",
    gap: 1,
  } as const;
  const stackedDialogContentSx = {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } as const;
  const closeDialogActionSx = isMobile
    ? mobileDialogActionSx
    : {
        color: "var(--brand-violet)",
        fontWeight: 600,
        "&:hover": {
          background:
            "color-mix(in srgb, var(--brand-violet) 16%, transparent)",
        },
      };

  const openPurchase = (type: "guided" | "self") => {
    if (user?.role === "teacher") {
      setModalMessage(
        "Платёж отменён: вы уже владелец этого курса и всех материалов. Можно сразу идти преподавать."
      );
      setShowLoginAction(false);
      setModalOpen(true);
      return;
    }
    setPendingType(type);
    setPurchaseEmail(user?.email ?? "");
    setPurchaseFirstName(user?.firstName ?? "");
    setPurchaseLastName(user?.lastName ?? "");
    setPurchasePhone(user?.phone ?? "");
    setPurchaseAcceptTerms(false);
    setPurchaseAcceptPrivacy(false);
    setPurchaseMethod("card");
    const nextBnplMarketing = selectBnplMarketingInfo(
      type === "guided" ? course.priceGuided : course.priceSelf
    );
    setPurchaseBnplInstallmentsCount(
      nextBnplMarketing.availablePlans[0]?.installmentsCount ??
        nextBnplMarketing.installmentsCount
    );
    setCheckoutFlowError(null);
    setCheckoutFlowStatus(null);
    setActiveCheckoutId(null);
    setCheckoutPaymentUrl(null);
    setPurchaseOpen(true);
  };

  const handlePurchaseSubmit = async () => {
    if (!pendingType || !course) return;
    if (!purchaseFirstName.trim() || !purchaseLastName.trim()) {
      setModalMessage("Введите имя и фамилию.");
      setModalOpen(true);
      return;
    }
    if (!isRuPhoneComplete(purchasePhone)) {
      setModalMessage("Введите корректный номер телефона.");
      setModalOpen(true);
      return;
    }
    if (!user && !purchaseEmail.trim()) {
      setModalMessage("Введите email для оформления покупки.");
      setModalOpen(true);
      return;
    }
    if (!purchaseAcceptTerms || !purchaseAcceptPrivacy) {
      setModalMessage(
        "Подтвердите согласие с условиями оферты и политикой обработки персональных данных."
      );
      setModalOpen(true);
      return;
    }

    const price = pendingType === "guided" ? course.priceGuided : course.priceSelf;
    const checkoutEmail = user?.email ?? purchaseEmail.trim().toLowerCase();
    const executed = await purchaseSubmitGuard.run(
      async () => {
        let shouldOpenAttentionModal = false;
        try {
          setPurchaseLoading(true);
          const result = await checkoutPurchase({
            userId: user?.id,
            email: checkoutEmail,
            firstName: purchaseFirstName.trim(),
            lastName: purchaseLastName.trim(),
            phone: toRuPhoneStorage(purchasePhone),
            courseId: course.id,
            price,
            tariff: pendingType === "guided" ? "premium" : "standard",
            paymentMethod: purchaseMethod,
            bnplInstallmentsCount:
              purchaseMethod === "bnpl"
                ? purchaseBnplInstallmentsCount
                : undefined,
            consents: {
              acceptedScopes: ["terms", "privacy", "checkout"],
            },
          });

          setPurchaseOpen(false);
          if (user?.role === "student" && result.user) {
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
          setCheckoutProviderLabel(
            getPaymentProviderLabel(result.payment?.provider ?? purchaseMethod)
          );
          setResumeCheckout({
            id: result.checkoutId,
            userId: user?.id,
            email: checkoutEmail,
            courseId: course.id,
            method: (result.payment?.provider ??
              purchaseMethod) as CheckoutListItem["method"],
            state: (result.checkoutState ?? "created") as CheckoutListItem["state"],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          setCheckoutFlowStatus(null);
          setCheckoutFlowError(null);
          setCheckoutFlowOpen(true);
          if (user?.role === "student") {
            await refreshCheckoutFlow(result.checkoutId);
          }
          return;
        } catch (error) {
          if (error instanceof ApiError) {
            const details = (error.details ?? {}) as {
              code?: string;
              checkoutId?: string;
            };
            if (
              details.code === "identity_conflict_auth_required" &&
              typeof details.checkoutId === "string" &&
              details.checkoutId
            ) {
              setPendingAttachCheckoutId(details.checkoutId);
              setShowLoginAction(true);
              setPurchaseOpen(false);
              setModalMessage(error.message);
              shouldOpenAttentionModal = true;
              return;
            }
          }
          const requiresAuthAttach =
            error instanceof Error && error.message.includes("Авторизуйтесь");
          setModalMessage(
            error instanceof Error
              ? error.message
              : "Не удалось оформить покупку. Попробуйте позже."
          );
          setShowLoginAction(requiresAuthAttach);
          shouldOpenAttentionModal = true;
        } finally {
          setPurchaseLoading(false);
          if (shouldOpenAttentionModal) {
            setModalOpen(true);
          }
        }
      },
      {
        lockKey: `checkout-submit:${course.id}:${checkoutEmail}:${pendingType}:${purchaseMethod}:${purchaseMethod === "bnpl" ? purchaseBnplInstallmentsCount : "single"}`,
        retry: { label: t("common.retryCheckoutAction") },
      }
    );
    if (executed === undefined) return;
  };

  const openCheckoutPayment = () => {
    if (!checkoutPaymentUrl) return;
    window.open(checkoutPaymentUrl, "_blank", "noopener,noreferrer");
  };

  const handleCheckoutRetry = async () => {
    if (!activeCheckoutId) return;
    const executed = await checkoutActionGuard.run(
      async () => {
        try {
          setCheckoutFlowLoading(true);
          setCheckoutFlowError(null);
          const result = await retryCheckout(activeCheckoutId);
          setCheckoutPaymentUrl(
            result.payment.redirectUrl ??
              result.payment.paymentUrl ??
              result.payment.sbp?.deepLinkUrl ??
              result.payment.sbp?.qrUrl ??
              null
          );
          await refreshCheckoutFlow(activeCheckoutId, { silent: true });
        } catch (error) {
          setCheckoutFlowError(
            error instanceof Error
              ? error.message
              : "Не удалось повторить оплату. Попробуйте позже."
          );
        } finally {
          setCheckoutFlowLoading(false);
        }
      },
      {
        lockKey: `checkout-action:retry:${activeCheckoutId}`,
        retry: { label: t("common.retryCheckoutAction") },
      }
    );
    if (executed === undefined) return;
  };

  const handleCheckoutCancel = async () => {
    if (!activeCheckoutId) return;
    const executed = await checkoutActionGuard.run(
      async () => {
        try {
          setCheckoutFlowLoading(true);
          setCheckoutFlowError(null);
          await cancelCheckout(activeCheckoutId);
          await refreshCheckoutFlow(activeCheckoutId, { silent: true });
          setCheckoutFlowOpen(false);
          setModalMessage(
            "Платеж отменен. Вы можете оформить покупку заново в любое время."
          );
          setShowLoginAction(false);
          setModalOpen(true);
        } catch (error) {
          setCheckoutFlowError(
            error instanceof Error ? error.message : "Не удалось отменить платеж."
          );
        } finally {
          setCheckoutFlowLoading(false);
        }
      },
      {
        lockKey: `checkout-action:cancel:${activeCheckoutId}`,
        retry: { label: t("common.retryCheckoutAction") },
      }
    );
    if (executed === undefined) return;
  };

  const selectedBlockItems = selectedBlock
    ? courseContentItems
        .filter((item) => item.blockId === selectedBlock.id)
        .sort((a, b) => a.order - b.order)
    : [];
  const selectedBlockLessonIds = selectedBlockItems
    .filter(
      (item): item is Extract<CourseContentItem, { type: "lesson" }> =>
        item.type === "lesson"
    )
    .map((item) => item.lessonId);
  const selectedBlockTestIds = selectedBlockItems
    .filter((item): item is CourseContentTestItem => item.type === "test")
    .map((item) => item.id);
  const selectedBlockLessonsViewed = selectedBlockLessonIds.filter((lessonId) =>
    viewedLessonIdSet.has(lessonId)
  ).length;
  const selectedBlockCompletedTests = selectedBlockTestIds.filter((testId) =>
    Boolean(latestTestAttemptByItemId[testId])
  ).length;
  const selectedBlockProgressPercent =
    selectedBlockLessonIds.length > 0
      ? Math.round((selectedBlockLessonsViewed / selectedBlockLessonIds.length) * 100)
      : 0;
  const selectedBlockAverageResult =
    selectedBlockCompletedTests > 0
      ? Math.round(
          selectedBlockTestIds
            .map((testId) => latestTestAttemptByItemId[testId]?.percent ?? 0)
            .reduce((sum, value) => sum + value, 0) / selectedBlockCompletedTests
        )
      : 0;
  const hasCourseTests = courseTestItems.length > 0;
  const selectedBlockHasTests = selectedBlockTestIds.length > 0;
  const roadmapBlockItems = roadmapFocusBlock
    ? courseContentItems
        .filter((item) => item.blockId === roadmapFocusBlock.id)
        .sort((a, b) => a.order - b.order)
    : [];
  const lessonsTotalLabel = selectedBlock
    ? selectedBlockHasTests
      ? `Уроков: ${selectedBlockLessonIds.length} • Тестов: ${selectedBlockTestIds.length}`
      : `Уроков: ${selectedBlockLessonIds.length}`
    : hasCourseTests
      ? `Уроков: ${lessons.length} • Тестов: ${courseTestItems.length}`
      : `Уроков: ${lessons.length}`;

  const lessonsSection = () => (
    <div className="course-details__lessons">
      <header className="course-details__hero">
        <div className="course-details__hero-main">
          <div className="course-details__hero-content">
            <span className="course-details__kicker">Содержание курса</span>
            <h1 className="course-details__title">
              <span>{course.title}</span>
              {isPremiumPurchased && hasPurchase && (
                <Diamond className="course-details__title-premium" />
              )}
            </h1>
            {course.description && (
              <p className="course-details__description">{course.description}</p>
            )}
          </div>
        </div>
      </header>
      {showInlineRoadmapProgress ? roadmapProgressSection : null}
      <div className="course-details__lessons-head">
        <h2 className="course-details__lessons-title">Материалы курса</h2>
        <div className="course-details__lessons-head-right">
          {selectedBlock ? (
            <Button
              size="small"
              variant="outlined"
              onClick={() => setSelectedBlockId(null)}
            >
              К списку блоков
            </Button>
          ) : null}
          <span className="course-details__lessons-total">
            {lessonsTotalLabel}
          </span>
        </div>
      </div>
      <p className="course-details__lessons-subtitle">
        {hasCourseTests
          ? "Видео, практические материалы и проверочные тесты в логической последовательности."
          : "Видео и практические материалы в логической последовательности."}
      </p>
      {selectedBlock && user?.role === "student" && hasPurchase ? (
        <div className="course-details__block-dashboard">
          <span className="ui-status-chip ui-status-chip--scheduled">
            Уроков: {selectedBlockLessonsViewed}/{selectedBlockLessonIds.length}
          </span>
          {selectedBlockHasTests ? (
            <>
              <span className="ui-status-chip ui-status-chip--inprogress">
                Тестов: {selectedBlockCompletedTests}/{selectedBlockTestIds.length}
              </span>
              <span className="ui-status-chip ui-status-chip--paid">
                Результат блока: {selectedBlockAverageResult}%
              </span>
            </>
          ) : null}
          <span className="ui-status-chip ui-status-chip--completed">
            Прогресс блока: {selectedBlockProgressPercent}%
          </span>
        </div>
      ) : null}
      {hasMultipleBlocks && !effectiveSelectedBlockId ? (
        <div className="course-details__blocks-grid">
          {courseBlocks.map((block) => {
            const blockItems = courseContentItems.filter(
              (item) => item.blockId === block.id
            );
            const blockLessonsCount = blockItems.filter(
              (item) => item.type === "lesson"
            ).length;
            const blockTestsCount = blockItems.filter(
              (item) => item.type === "test"
            ).length;
            return (
              <article key={block.id} className="course-details__block-card">
                <strong>{block.title}</strong>
                <span>
                  {blockTestsCount > 0
                    ? `Уроков: ${blockLessonsCount} • Тестов: ${blockTestsCount}`
                    : `Уроков: ${blockLessonsCount}`}
                </span>
                <Button
                  variant="contained"
                  onClick={() => {
                    setRoadmapFocusBlockId(block.id);
                    setSelectedBlockId(block.id);
                  }}
                >
                  Перейти к изучению блока
                </Button>
              </article>
            );
          })}
        </div>
      ) : (
        <>
          {visibleCourseItems.length === 0 && <p>Материалов пока нет</p>}
          {pagedContentItems.map((contentItem) => {
            const absoluteIndex = courseContentItems.findIndex(
              (item) => item.id === contentItem.id
            );

            if (contentItem.type === "test") {
              const latestAttempt = latestTestAttemptByItemId[contentItem.id];
              const hasAttempt = Boolean(latestAttempt);
              const assessmentKind = getAssessmentKindByItem(contentItem);
              const blockQueue = courseContentItems
                .filter((item) => item.blockId === contentItem.blockId)
                .sort((a, b) => a.order - b.order);
              const blockIndex = blockQueue.findIndex(
                (item) => item.id === contentItem.id
              );
              const previousItems =
                blockIndex <= 0 ? [] : blockQueue.slice(0, blockIndex);
              const prerequisiteMissing = isTeacher
                ? 0
                : previousItems.filter((item) => {
                    if (item.type !== "lesson") return false;
                    return !viewedLessonIdSet.has(item.lessonId);
                  }).length;
              const testLockedByAccess = !hasDomainAccess
                ? absoluteIndex > 0
                : isBnplSuspended
                ? true
                : false;
              const testLocked = isTeacher
                ? false
                : testLockedByAccess || prerequisiteMissing > 0;

              return (
                <article
                  key={contentItem.id}
                  className={`course-details__test-item ${
                    testLocked ? "is-locked" : ""
                  } ${hasAttempt ? "is-complete" : ""} ${
                    newMaterialItemIds.has(contentItem.id) ? "is-new" : ""
                  }`}
                >
                  <div>
                    <strong className="course-details__test-head">
                      <span>
                        Тест: {testTitleByItemId[contentItem.id] ?? contentItem.titleSnapshot}
                      </span>
                      <span
                        className={`course-details__test-kind-badge ${
                          assessmentKind === "exam"
                            ? "is-exam"
                            : "is-credit"
                        }`}
                      >
                        {assessmentKind === "exam" ? (
                          <GavelRounded fontSize="inherit" />
                        ) : (
                          <AssignmentTurnedInRounded fontSize="inherit" />
                        )}
                        {assessmentKind === "exam" ? "Экзамен" : "Зачет"}
                      </span>
                      {newMaterialItemIds.has(contentItem.id) ? (
                        <span className="course-details__new-badge">Новое</span>
                      ) : null}
                    </strong>
                    <p>
                      {testLocked && prerequisiteMissing > 0
                        ? `Сначала завершите материалы этого блока (${prerequisiteMissing}).`
                        : hasAttempt
                        ? `Последний результат: ${latestAttempt?.percent ?? 0}%`
                        : "Тест еще не проходили"}
                    </p>
                  </div>
                  <Button
                    variant={hasAttempt ? "outlined" : "contained"}
                    onClick={() => {
                      if (testLocked && prerequisiteMissing > 0) {
                        setModalMessage(
                          "Чтобы открыть тест, сначала изучите все материалы и тесты, которые идут перед ним в рамках текущего блока."
                        );
                        setShowLoginAction(false);
                        setModalOpen(true);
                        return;
                      }
                      navigate(`/courses/${course.id}/tests/${contentItem.id}`, {
                        state: {
                          fromCoursePath: `${location.pathname}${location.search}`,
                          courseBackFrom: sourceFromPath,
                          expandedBlockId: hasMultipleBlocks
                            ? contentItem.blockId ?? effectiveSelectedBlockId ?? null
                            : null,
                        },
                      });
                    }}
                    disabled={testLockedByAccess}
                  >
                    {isTeacher
                      ? "Предпросмотр"
                      : hasAttempt
                      ? "Пройти заново"
                      : "Открыть тест"}
                  </Button>
                </article>
              );
            }

            const lesson = lessonsById[contentItem.lessonId];
            if (!lesson) return null;

            const wasOpened = openedOrViewedLessonIdSet.has(lesson.id);
            const locked = !hasDomainAccess
              ? absoluteIndex > 0
              : isBnplSuspended
              ? true
              : isBnplRestricted
              ? !wasOpened
              : false;

            return (
              <LessonItem
                key={lesson.id}
                lesson={lesson}
                locked={locked}
                viewed={viewedLessonIdSet.has(lesson.id)}
                isNew={newMaterialItemIds.has(contentItem.id)}
                navigationState={{
                  fromCoursePath: `${location.pathname}${location.search}`,
                  courseBackFrom: sourceFromPath,
                  expandedBlockId: hasMultipleBlocks
                    ? contentItem.blockId ?? effectiveSelectedBlockId ?? null
                    : null,
                }}
                onOpen={(openedLesson) => {
                  if (!user?.id || user.role !== "student") return;
                  markLessonOpened(user.id, openedLesson.courseId, openedLesson.id);
                  setOpenedLessonIds((prev) =>
                    prev.includes(openedLesson.id) ? prev : [...prev, openedLesson.id]
                  );
                }}
                onLockedClick={() => {
                  if (isBnplSuspended) {
                    setModalMessage(
                      "Доступ к урокам временно приостановлен из-за просрочки по оплате частями. Перейдите в «Мои курсы» и проверьте детали платежей."
                    );
                  } else if (isBnplRestricted) {
                    setModalMessage(
                      "Новые уроки временно недоступны до погашения просрочки по оплате частями."
                    );
                  } else {
                    setModalMessage("Для доступа к этому уроку оплатите курс.");
                  }
                  setShowLoginAction(false);
                  setModalOpen(true);
                }}
              />
            );
          })}
        </>
      )}
      {(!hasMultipleBlocks || Boolean(effectiveSelectedBlockId)) && (
        <ListPagination
          page={safeLessonsPage}
          totalItems={visibleCourseItems.length}
          pageSize={lessonsPageSize}
          onPageChange={setLessonsPage}
        />
      )}
    </div>
  );

  const purchaseSection = (
    <div className="course-details__purchase">
      {user?.role === "student" && resumeCheckout && (
        <Alert
          severity="info"
          className="ui-alert course-details__resume-alert"
          action={
            <Button size="small" onClick={handleResumeCheckout}>
              Продолжить оплату
            </Button>
          }
        >
          Найдена незавершенная покупка по этому курсу. Текущий статус:{" "}
          {getCheckoutStatusLabel(resumeCheckout.state)}.
        </Alert>
      )}
      <div className="course-details__offer">
        <ul className="course-details__offer-list">
          <li>Проверка домашних заданий и обратная связь</li>
          <li>Индивидуальные консультации по темам</li>
          <li>Приоритетные ответы преподавателя</li>
        </ul>
        <div className="course-details__card course-details__card--premium">
          <div className="course-details__card-header">
            <Star className="course-details__card-icon" />
            <span>Премиум</span>
          </div>
          <div className="course-details__card-price">
            {course.priceGuided} ₽
            <Diamond className="course-details__premium-icon" />
          </div>
          <div className="course-details__card-tooltip">
            {guidedBnplLine}
            {" • "}
            <button
              type="button"
              className="course-details__inline-link"
              onClick={() => setBnplInfoOpen(true)}
            >
              Как работает сплит
            </button>
          </div>
          <Button
            className="course-details__card-button"
            onClick={() => openPurchase("guided")}
            disabled={purchaseLoading}
          >
            {purchaseLoading ? (
              <CircularProgress size={18} color="inherit" />
            ) : (
              "Купить"
            )}
          </Button>
        </div>
      </div>

      <div className="course-details__offer">
        <ul className="course-details__offer-list">
          <li>Видеоуроки 24/7 в удобном темпе</li>
          <li>Дополнительные материалы и конспекты</li>
          <li>Доступ к курсу с любого устройства</li>
        </ul>
        <div className="course-details__card course-details__card--basic">
          <div className="course-details__card-header">
            <RocketLaunch className="course-details__card-icon" />
            <span>Базовый</span>
          </div>
          <div className="course-details__card-price">{course.priceSelf} ₽</div>
          <div className="course-details__card-tooltip">
            {selfBnplLine}
            {" • "}
            <button
              type="button"
              className="course-details__inline-link"
              onClick={() => setBnplInfoOpen(true)}
            >
              Как работает сплит
            </button>
          </div>
          <Button
            className="course-details__card-button course-details__card-button--secondary"
            onClick={() => openPurchase("self")}
            disabled={purchaseLoading}
          >
            {purchaseLoading ? (
              <CircularProgress size={18} color="inherit" />
            ) : (
              "Купить"
            )}
          </Button>
        </div>
      </div>
    </div>
  );

  const roadmapItems = roadmapFocusBlock
    ? roadmapBlockItems
    : effectiveSelectedBlockId
    ? visibleCourseItems
    : courseContentItems;
  const blockTitleById = courseBlocks.reduce<Record<string, string>>(
    (acc, block) => {
      acc[block.id] = block.title;
      return acc;
    },
    {}
  );
  const roadmapIndexById = roadmapItems.reduce<Record<string, number>>(
    (acc, item, index) => {
      acc[item.id] = index;
      return acc;
    },
    {}
  );
  const roadmapGroups = (() => {
    if (roadmapFocusBlock) {
      return [
        {
          id: roadmapFocusBlock.id,
          title: roadmapFocusBlock.title,
          items: roadmapItems,
        },
      ];
    }
    const groups: Array<{
      id: string;
      title: string;
      items: CourseContentItem[];
    }> = [];
    roadmapItems.forEach((item) => {
      const groupId = item.blockId ?? "__main__";
      const existing = groups.find((entry) => entry.id === groupId);
      if (existing) {
        existing.items.push(item);
        return;
      }
      groups.push({
        id: groupId,
        title:
          groupId === "__main__"
            ? "Основной блок"
            : blockTitleById[groupId] ?? "Блок",
        items: [item],
      });
    });
    return groups;
  })();
  const firstIncompleteContentIndex = roadmapItems.findIndex((item) => {
    if (item.type === "test") {
      return !latestTestAttemptByItemId[item.id];
    }
    return !viewedLessonIdSet.has(item.lessonId);
  });
  const learningProgressPercent =
    lessons.length > 0
      ? Math.round((viewedLessonsCount / lessons.length) * 100)
      : 0;
  const knowledgeProgressPercent = testsKnowledgeProgress.averageBestPercent;
  const learningProgressVisual = buildCourseProgressVisual(learningProgressPercent);
  const knowledgeProgressVisual = buildCourseProgressVisual(knowledgeProgressPercent);
  const roadmapProgressSection = user?.role === "student" && hasPurchase ? (
    <div
      className={`course-details__roadmap-progress ${
        hasCourseTests ? "" : "course-details__roadmap-progress--single"
      } ${showInlineRoadmapProgress ? "course-details__roadmap-progress--inline" : ""}`}
    >
      <article
        className="course-details__roadmap-progress-card"
        style={
          {
            "--progress-color": learningProgressVisual.color,
            "--progress-glow": learningProgressVisual.glow,
          } as CSSProperties
        }
      >
        <div className="course-details__roadmap-progress-ring">
          <CircularProgress
            variant="determinate"
            value={learningProgressPercent}
            size={74}
            thickness={4.8}
            sx={{ color: "var(--progress-color)" }}
          />
          <span>{learningProgressPercent}%</span>
        </div>
        <strong>Изучено</strong>
      </article>
      {hasCourseTests ? (
        <article
          className="course-details__roadmap-progress-card"
          style={
            {
              "--progress-color": knowledgeProgressVisual.color,
              "--progress-glow": knowledgeProgressVisual.glow,
            } as CSSProperties
          }
        >
          <div className="course-details__roadmap-progress-ring">
            <CircularProgress
              variant="determinate"
              value={knowledgeProgressPercent}
              size={74}
              thickness={4.8}
              sx={{ color: "var(--progress-color)" }}
            />
            <span>{knowledgeProgressPercent}%</span>
          </div>
          <strong>Сдано</strong>
        </article>
      ) : null}
    </div>
  ) : null;
  const getLessonLockedState = (
    contentItem: Extract<CourseContentItem, { type: "lesson" }>
  ) => {
    const absoluteIndex = courseContentItems.findIndex(
      (entry) => entry.id === contentItem.id
    );
    const wasOpened = openedOrViewedLessonIdSet.has(contentItem.lessonId);
    const locked = !hasDomainAccess
      ? absoluteIndex > 0
      : isBnplSuspended
      ? true
      : isBnplRestricted
      ? !wasOpened
      : false;
    return {
      locked,
      wasOpened,
    };
  };

  const getTestLockedState = (contentItem: CourseContentTestItem) => {
    const absoluteIndex = courseContentItems.findIndex(
      (entry) => entry.id === contentItem.id
    );
    const blockQueue = courseContentItems
      .filter((entry) => entry.blockId === contentItem.blockId)
      .sort((a, b) => a.order - b.order);
    const blockIndex = blockQueue.findIndex((entry) => entry.id === contentItem.id);
    const previousItems = blockIndex <= 0 ? [] : blockQueue.slice(0, blockIndex);
    const prerequisiteMissing = isTeacher
      ? 0
      : previousItems.filter((entry) => {
          if (entry.type !== "lesson") return false;
          return !viewedLessonIdSet.has(entry.lessonId);
        }).length;
    const testLockedByAccess = !hasDomainAccess
      ? absoluteIndex > 0
      : isBnplSuspended
      ? true
      : false;
    const locked = isTeacher ? false : testLockedByAccess || prerequisiteMissing > 0;
    return {
      locked,
      testLockedByAccess,
      prerequisiteMissing,
    };
  };

  const handleRoadmapItemOpen = (item: CourseContentItem) => {
    if (item.type === "test") {
      const testState = getTestLockedState(item);
      if (testState.locked && testState.prerequisiteMissing > 0) {
        setModalMessage(
          "Чтобы открыть тест, сначала изучите все материалы и тесты, которые идут перед ним в рамках текущего блока."
        );
        setShowLoginAction(false);
        setModalOpen(true);
        return;
      }
      if (testState.testLockedByAccess) {
        if (isBnplSuspended) {
          setModalMessage(
            "Доступ к тестам временно приостановлен из-за просрочки по оплате частями. Проверьте статус оплаты в деталях покупки."
          );
        } else {
          setModalMessage("Для доступа к этому тесту оплатите курс.");
        }
        setShowLoginAction(false);
        setModalOpen(true);
        return;
      }
      navigate(`/courses/${course.id}/tests/${item.id}`, {
        state: {
          fromCoursePath: `${location.pathname}${location.search}`,
          courseBackFrom: sourceFromPath,
          expandedBlockId: hasMultipleBlocks
            ? item.blockId ?? effectiveSelectedBlockId ?? null
            : null,
        },
      });
      return;
    }

    const lesson = lessonsById[item.lessonId];
    if (!lesson) return;
    const lessonState = getLessonLockedState(item);
    if (lessonState.locked) {
      if (isBnplSuspended) {
        setModalMessage(
          "Доступ к урокам временно приостановлен из-за просрочки по оплате частями. Перейдите в «Мои курсы» и проверьте детали платежей."
        );
      } else if (isBnplRestricted) {
        setModalMessage(
          "Новые уроки временно недоступны до погашения просрочки по оплате частями."
        );
      } else {
        setModalMessage("Для доступа к этому уроку оплатите курс.");
      }
      setShowLoginAction(false);
      setModalOpen(true);
      return;
    }

    if (user?.id && user.role === "student") {
      markLessonOpened(user.id, lesson.courseId, lesson.id);
      setOpenedLessonIds((prev) =>
        prev.includes(lesson.id) ? prev : [...prev, lesson.id]
      );
    }
    navigate(`/lessons/${lesson.id}`, {
      state: {
        fromCoursePath: `${location.pathname}${location.search}`,
        courseBackFrom: sourceFromPath,
        expandedBlockId: hasMultipleBlocks
          ? item.blockId ?? effectiveSelectedBlockId ?? null
          : null,
      },
    });
  };

  const roadmapLanesSection = (
    <div className="course-details__roadmap-groups">
      {roadmapGroups.map((group) => {
        const roadmapLaneChunkSize = hasMultipleBlocks ? 4 : 1;
        const roadmapRows = group.items.reduce<CourseContentItem[][]>((acc, item, index) => {
          const rowIndex = Math.floor(index / roadmapLaneChunkSize);
          if (!acc[rowIndex]) {
            acc[rowIndex] = [];
          }
          acc[rowIndex].push(item);
          return acc;
        }, []);

        return (
          <section key={group.id} className="course-details__roadmap-group">
            {roadmapGroups.length > 1 && (
              <header className="course-details__roadmap-group-head">
                <strong>{group.title}</strong>
              </header>
            )}
            <div className="course-details__roadmap-lanes">
              {roadmapRows.map((row, rowIndex) => {
                const isReverse = rowIndex % 2 === 1;
                const visualRow = isReverse ? [...row].reverse() : row;
                return (
                  <div
                    key={`${group.id}-row-${rowIndex}`}
                    className={`course-details__roadmap-lane ${
                      isReverse ? "is-reverse" : ""
                    }`}
                  >
                    <div className="course-details__roadmap-lane-line" />
                    <div className="course-details__roadmap-lane-items">
                      {visualRow.map((item) => {
                        const isTest = item.type === "test";
                        const viewed = isTest
                          ? Boolean(latestTestAttemptByItemId[item.id])
                          : viewedLessonIdSet.has(item.lessonId);
                        const itemIndex = roadmapIndexById[item.id] ?? 0;
                        const isActive =
                          !viewed &&
                          (firstIncompleteContentIndex === -1
                            ? itemIndex === roadmapItems.length - 1
                            : itemIndex === firstIncompleteContentIndex);

                        const lesson =
                          item.type === "lesson" ? lessonsById[item.lessonId] : null;
                        const title =
                          item.type === "test"
                            ? `Тест: ${testTitleByItemId[item.id] ?? item.titleSnapshot}`
                            : lesson?.title ?? "Урок";
                        const StatusIcon = isActive
                          ? BoltRounded
                          : viewed
                          ? CheckCircleRounded
                          : isTest
                          ? FlagRounded
                          : TrendingUpRounded;

                        return (
                          <div
                            key={item.id}
                            className={`course-details__roadmap-lane-item ${
                              viewed
                                ? "is-complete"
                                : isActive
                                ? "is-active"
                                : "is-pending"
                            } ${isTest ? "is-test" : "is-lesson"} ${
                              newMaterialItemIds.has(item.id) ? "is-new" : ""
                            }`}
                          >
                            <button
                              type="button"
                              className="course-details__roadmap-node course-details__roadmap-node--action"
                              onClick={() => handleRoadmapItemOpen(item)}
                              aria-label={`Открыть: ${title}`}
                            >
                              <StatusIcon
                                fontSize="inherit"
                                className="course-details__roadmap-node-icon"
                              />
                            </button>
                            <button
                              type="button"
                              className="course-details__roadmap-lane-label"
                              onClick={() => handleRoadmapItemOpen(item)}
                            >
                              <span>{title}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );

  const roadmapDetailSection = showDesktopRoadmapSection && hasMultipleBlocks ? (
    <section className="course-details__roadmap course-details__roadmap--detail">
      {roadmapLanesSection}
    </section>
  ) : null;

  const roadmapSidebarSection = showDesktopRoadmapSection && !hasMultipleBlocks ? (
    <section className="course-details__roadmap course-details__roadmap--sidebar">
      {roadmapLanesSection}
    </section>
  ) : null;

  const roadmapSection = showDesktopRoadmapSection ? (
    <aside className="course-details__layout-side course-details__layout-side--roadmap">
      {roadmapProgressSection}
      {hasMultipleBlocks ? (
        <div className="course-details__roadmap course-details__roadmap--navigator">
          <div className="course-details__roadmap-header course-details__roadmap-header--navigator">
            <h3>Навигатор курса</h3>
          </div>
          <div className="course-details__roadmap-nav-list">
            {courseBlocks.map((block) => {
              const blockId = block.id;
              const blockItems = courseContentItems.filter(
                (item) => item.blockId === blockId
              );
              const blockLessons = blockItems.filter(
                (item): item is Extract<CourseContentItem, { type: "lesson" }> =>
                  item.type === "lesson"
              );
              const blockTests = blockItems.filter(
                (item): item is CourseContentTestItem => item.type === "test"
              );
              const viewedLessons = blockLessons.filter((item) =>
                viewedLessonIdSet.has(item.lessonId)
              ).length;
              const completedTests = blockTests.filter((item) =>
                Boolean(latestTestAttemptByItemId[item.id])
              ).length;
              const isActive = blockId === effectiveRoadmapFocusBlockId;
              const blockProgressPercent =
                blockLessons.length > 0
                  ? Math.round((viewedLessons / blockLessons.length) * 100)
                  : 0;

              return (
                <article
                  key={block.id}
                  className={`course-details__roadmap-nav-card ${
                    isActive ? "is-active" : ""
                  }`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setRoadmapFocusBlockId(blockId);
                    setSelectedBlockId(blockId);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setRoadmapFocusBlockId(blockId);
                      setSelectedBlockId(blockId);
                    }
                  }}
                >
                  <div className="course-details__roadmap-nav-card-top">
                    <strong>{block.title}</strong>
                    <span>{blockProgressPercent}%</span>
                  </div>
                  <p>
                    {blockTests.length > 0
                      ? `Уроков: ${viewedLessons}/${blockLessons.length} • Тестов: ${completedTests}/${blockTests.length}`
                      : `Уроков: ${viewedLessons}/${blockLessons.length}`}
                  </p>
                  <div className="course-details__roadmap-nav-actions">
                    <button
                      type="button"
                      className="course-details__roadmap-nav-link"
                      onClick={(event) => {
                        event.stopPropagation();
                        setRoadmapFocusBlockId(blockId);
                        setSelectedBlockId(blockId);
                      }}
                    >
                      {selectedBlockId === blockId
                        ? "Материалы открыты"
                        : "Открыть материалы"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : (
        roadmapSidebarSection
      )}
    </aside>
  ) : null;

  return (
    <section className="course-details">
      {loadError ? (
        <RecoverableErrorAlert
          error={loadError}
          onRetry={() => setReloadSeq((prev) => prev + 1)}
          retryLabel={t("common.retryLoadData")}
          forceRetry
        />
      ) : null}
      <div className="course-details__top-nav">
        <BackNavButton
          onClick={handleBackToSource}
          className="course-details__back-button"
        />
      </div>
      {pageNoticeState && (
        <AccessStateBanner
          state={pageNoticeState}
          onLogin={pageNoticeState !== "entitlement_missing" ? openAuthModal : undefined}
          onRecover={
            pageNoticeState !== "entitlement_missing"
              ? () => openRecoverModal(user?.email)
              : undefined
          }
          onCompleteProfile={
            pageNoticeState === "awaiting_profile" ? handleCompleteProfile : undefined
          }
          onRecheck={
            user?.role === "student" && pageNoticeState === "paid_but_restricted"
              ? () => {
                  void handleRepairAndRecheck();
                }
              : user?.role === "student" &&
                (pageNoticeState === "awaiting_profile" ||
                  pageNoticeState === "awaiting_verification")
              ? handlePageNoticeRecheck
              : undefined
          }
        />
      )}
      {bnplStatusBanner && (
        <Alert
          severity={bnplStatusBanner.severity}
          className="ui-alert course-details__bnpl-alert"
          action={
            <Button
              size="small"
              onClick={() =>
                navigate(
                  coursePurchase?.id
                    ? `/profile/purchases/${coursePurchase.id}`
                    : "/student/profile",
                  {
                    state: { from: `${location.pathname}${location.search}` },
                  }
                )
              }
            >
              Детали оплаты
            </Button>
          }
        >
          {bnplStatusBanner.text}
        </Alert>
      )}
      {showOnboardingPanel && (
        <section className="course-details__onboarding">
          <header className="course-details__onboarding-head">
            <h2>Активация доступа</h2>
            <span>Путь после оплаты</span>
          </header>
          <div className="course-details__onboarding-steps">
            <article className="course-details__onboarding-step is-done">
              <strong>1. Оплата подтверждена</strong>
              <p>Система зафиксировала успешный checkout и подготовила доступ к курсу.</p>
            </article>
            <article
              className={`course-details__onboarding-step ${
                pageNoticeState === "awaiting_profile" ? "is-current" : "is-done"
              }`}
            >
              <strong>2. Профиль</strong>
              <p>Заполните имя, фамилию и телефон в личном кабинете.</p>
            </article>
            <article
              className={`course-details__onboarding-step ${
                pageNoticeState === "awaiting_verification" ? "is-current" : ""
              }`}
            >
              <strong>3. Подтверждение email</strong>
              <p>Выполните вход по email, чтобы подтвердить владение адресом.</p>
            </article>
            <article
              className={`course-details__onboarding-step ${
                pageNoticeState === "paid_but_restricted" ? "is-current" : ""
              }`}
            >
              <strong>4. Активация прав</strong>
              <p>Проверьте статус, чтобы включить курс в полном объеме.</p>
            </article>
          </div>
        </section>
      )}

      {showPurchaseSection ? (
        <div className="course-details__layout">
          <div className="course-details__layout-main">{lessonsSection()}</div>
          <aside className="course-details__layout-side">{purchaseSection}</aside>
        </div>
      ) : showDesktopRoadmapSection ? (
        <div className="course-details__layout">
          <div className="course-details__layout-main course-details__layout-main--stacked">
            {lessonsSection()}
            {roadmapDetailSection}
          </div>
          {roadmapSection}
        </div>
      ) : (
        lessonsSection()
      )}

      <Dialog
        open={bnplInfoOpen}
        onClose={() => setBnplInfoOpen(false)}
        maxWidth="xs"
        fullWidth
        className="ui-dialog ui-dialog--compact course-details-dialog"
      >
        <DialogTitleWithClose
          title="Оплата частями"
          onClose={() => setBnplInfoOpen(false)}
          closeAriaLabel="Закрыть описание оплаты частями"
        />
        <DialogContent sx={stackedDialogContentSx}>
          <Typography color="text.secondary">
            Доступна оплата частями через внешнего провайдера рассрочки. Точный
            график, комиссии и суммы взносов рассчитываются на этапе оплаты.
          </Typography>
          <Typography color="text.secondary">
            При просрочке сначала действует льготный период, затем могут
            ограничиваться только новые уроки.
          </Typography>
          <Typography color="text.secondary">
            После погашения просрочки доступ восстанавливается автоматически.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBnplInfoOpen(false)} sx={mobileDialogActionSx}>
            {isMobile ? <CloseRounded fontSize="small" /> : "Понятно"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===== MODAL ===== */}
      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        fullWidth
        maxWidth="xs"
        className="ui-dialog ui-dialog--compact course-details-dialog"
        PaperProps={{
          sx: modalPaperSx,
        }}
      >
        <DialogTitleWithClose
          title="Внимание"
          onClose={() => setModalOpen(false)}
          closeAriaLabel="Закрыть уведомление"
        />
        <DialogContent sx={attentionDialogContentSx}>{modalMessage}</DialogContent>
        <DialogActions sx={attentionDialogActionsSx}>
          {showLoginAction && (
            <Button
              onClick={() => {
                setModalOpen(false);
                openAuthModal();
              }}
              variant="contained"
              sx={mobileDialogActionSx}
              aria-label={isMobile ? "Войти" : undefined}
            >
              {isMobile ? <LoginRounded fontSize="small" /> : "Войти"}
            </Button>
          )}
          <Button
            onClick={() => setModalOpen(false)}
            sx={closeDialogActionSx}
            aria-label={isMobile ? "Закрыть" : undefined}
          >
            {isMobile ? <CloseRounded fontSize="small" /> : "Закрыть"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={purchaseOpen}
        onClose={() => {
          setPurchaseOpen(false);
          setPendingType(null);
        }}
        maxWidth="xs"
        fullWidth
        className="ui-dialog ui-dialog--compact course-details-dialog"
      >
        <DialogTitleWithClose
          title="Оформление покупки"
          onClose={() => {
            setPurchaseOpen(false);
            setPendingType(null);
          }}
          closeAriaLabel="Закрыть форму покупки"
        />
        <DialogContent sx={stackedDialogContentSx}>
          {!user && (
            <>
              <Typography color="text.secondary">
                Укажите email — на него будет отправлена ссылка для входа.
              </Typography>
              <TextField
                label="Email"
                type="email"
                value={purchaseEmail}
                onChange={(e) => setPurchaseEmail(e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </>
          )}
          <TextField
            label="Имя"
            value={purchaseFirstName}
            onChange={(e) => setPurchaseFirstName(e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Фамилия"
            value={purchaseLastName}
            onChange={(e) => setPurchaseLastName(e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Телефон"
            value={formatRuPhoneInput(purchasePhone)}
            onChange={(e) => setPurchasePhone(formatRuPhoneInput(e.target.value))}
            placeholder={PHONE_MASK_TEMPLATE}
            inputProps={{ inputMode: "tel" }}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
          <div className="course-details__payment-methods">
            <Typography className="course-details__payment-method-title">
              Способ оплаты
            </Typography>
            <div className="course-details__payment-method-grid">
              {PAYMENT_METHODS.map(({ id, title, subtitle, Icon }) => {
                const isBnpl = id === "bnpl";
                const disabled = isBnpl && bnplCheckoutDisabled;
                const dynamicSubtitle = isBnpl ? bnplCheckoutSubtitle : subtitle;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`course-details__payment-method ${
                      purchaseMethod === id ? "is-selected" : ""
                    } ${disabled ? "is-disabled" : ""}`}
                    onClick={() => {
                      if (disabled) return;
                      setPurchaseMethod(id);
                    }}
                    disabled={disabled}
                    aria-disabled={disabled}
                    aria-label={disabled ? `${title}: временно недоступно` : title}
                  >
                    <span className="course-details__payment-method-icon">
                      <Icon fontSize="small" />
                    </span>
                    <span className="course-details__payment-method-copy">
                      <strong>{title}</strong>
                      <small>{dynamicSubtitle}</small>
                    </span>
                  </button>
                );
              })}
            </div>
            {purchaseMethod === "bnpl" &&
              !bnplCheckoutDisabled &&
              (checkoutBnplMarketing?.availablePlans.length ?? 0) > 1 && (
                <div className="course-details__bnpl-plan-picker">
                  <Typography className="course-details__payment-method-title">
                    План оплаты частями
                  </Typography>
                  <div className="course-details__bnpl-plan-grid">
                    {checkoutBnplMarketing?.availablePlans.map((plan) => {
                      const selected =
                        purchaseBnplInstallmentsCount ===
                        plan.installmentsCount;
                      return (
                        <button
                          key={plan.installmentsCount}
                          type="button"
                          className={`course-details__bnpl-plan ${
                            selected ? "is-selected" : ""
                          }`}
                          onClick={() =>
                            setPurchaseBnplInstallmentsCount(
                              plan.installmentsCount
                            )
                          }
                        >
                          <strong>{plan.installmentsCount} платежей</strong>
                          <span>
                            {typeof plan.fromAmount === "number"
                              ? `от ${plan.fromAmount.toLocaleString("ru-RU")} ₽`
                              : "Расчет на checkout"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            {bnplCheckoutDisabled && (
              <Alert severity="info" className="ui-alert">
                Оплата частями недоступна для выбранного тарифа. Выберите банковскую
                карту или СБП.
              </Alert>
            )}
          </div>
          <FormControlLabel
            control={
              <Checkbox
                checked={purchaseAcceptTerms}
                onChange={(e) => setPurchaseAcceptTerms(e.target.checked)}
              />
            }
            label="Согласен с условиями оферты и правилами покупки курса"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={purchaseAcceptPrivacy}
                onChange={(e) => setPurchaseAcceptPrivacy(e.target.checked)}
              />
            }
            label="Согласен на обработку персональных данных"
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setPurchaseOpen(false)}
            color="inherit"
            sx={mobileDialogActionSx}
            aria-label={isMobile ? "Отмена" : undefined}
          >
            {isMobile ? <CloseRounded fontSize="small" /> : "Отмена"}
          </Button>
          <Button
            variant="contained"
            onClick={() => void handlePurchaseSubmit()}
            sx={mobileDialogActionSx}
            aria-label={isMobile ? "Продолжить" : undefined}
          >
            {isMobile ? <PaymentsRounded fontSize="small" /> : "Продолжить"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={checkoutFlowOpen}
        onClose={() => setCheckoutFlowOpen(false)}
        maxWidth="sm"
        fullWidth
        className="ui-dialog ui-dialog--compact course-details-dialog"
      >
        <DialogTitleWithClose
          title={
            <span className="course-details__checkout-title">
              {checkoutFlowStatus?.payment.status === "provider_confirmed" ||
              checkoutFlowStatus?.state === "provisioned" ||
              checkoutFlowStatus?.state === "email_verification_pending" ? (
                <CheckCircleRounded fontSize="small" />
              ) : (
                <HourglassTopRounded fontSize="small" />
              )}
              {getCheckoutDialogTitle(checkoutFlowStatus?.payment.status)}
            </span>
          }
          onClose={() => setCheckoutFlowOpen(false)}
          closeAriaLabel="Закрыть окно статуса оплаты"
        />
        <DialogContent sx={stackedDialogContentSx}>
          <div className="course-details__checkout-summary">
            <div>
              <span>Checkout ID</span>
              <strong>{activeCheckoutId ?? "—"}</strong>
            </div>
            <div>
              <span>Метод</span>
              <strong>{checkoutProviderLabel || "—"}</strong>
            </div>
            <div>
              <span>Статус</span>
              <strong>{getCheckoutStatusLabel(checkoutFlowStatus?.payment.status)}</strong>
            </div>
          </div>
          <Typography color="text.secondary">
            {getCheckoutDialogHint(
              checkoutFlowStatus?.payment.status,
              checkoutFlowStatus?.payment.requiresConfirmation
            )}
          </Typography>
          {checkoutFlowStatus?.method === "card" &&
          checkoutFlowStatus?.payment.requiresConfirmation ? (
            <Alert severity="info" className="ui-alert">
              Для карточной оплаты может потребоваться 3DS-подтверждение. Нажмите
              «Открыть оплату», завершите проверку в банке и вернитесь в кабинет.
            </Alert>
          ) : null}
          {sbpPaymentView?.qrUrl ? (
            <Alert severity="info" className="ui-alert">
              Оплата через СБП активна.
              {sbpPaymentView.expiresAt
                ? ` Ссылка действует до ${new Date(
                    sbpPaymentView.expiresAt
                  ).toLocaleTimeString("ru-RU", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}.`
                : ""}{" "}
              Используйте кнопку «Открыть оплату» или deeplink банка.
            </Alert>
          ) : null}
          {checkoutFlowError && <Alert severity="warning">{checkoutFlowError}</Alert>}
          {!user && (
            <Alert severity="info">
              После оплаты войдите по email, чтобы система автоматически привязала курс к
              вашему профилю.
            </Alert>
          )}
          {shouldShowAwaitingProviderHint && (
            <Alert severity="info">
              Статус оплаты обновляется только после подтверждения от платежного провайдера.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setCheckoutFlowOpen(false)}
            color="inherit"
            sx={mobileDialogActionSx}
            aria-label={isMobile ? "Закрыть окно оплаты" : undefined}
          >
            {isMobile ? <CloseRounded fontSize="small" /> : "Закрыть"}
          </Button>
          <Button
            onClick={() => void refreshCheckoutFlow(activeCheckoutId ?? "")}
            disabled={!activeCheckoutId || checkoutFlowLoading || user?.role !== "student"}
            sx={mobileDialogActionSx}
            aria-label={isMobile ? "Проверить статус оплаты" : undefined}
          >
            {isMobile ? <RefreshRounded fontSize="small" /> : "Проверить статус"}
          </Button>
          {checkoutPaymentUrl && (
            <Button
              variant="outlined"
              onClick={openCheckoutPayment}
              sx={mobileDialogActionSx}
              aria-label={isMobile ? "Открыть страницу оплаты" : undefined}
            >
              {isMobile ? <OpenInNewRounded fontSize="small" /> : "Открыть оплату"}
            </Button>
          )}
          <Button
            variant="contained"
            onClick={() => void handleCheckoutRetry()}
            disabled={!activeCheckoutId || checkoutFlowLoading || user?.role !== "student"}
            sx={mobileDialogActionSx}
            aria-label={isMobile ? "Повторить оплату" : undefined}
          >
            {isMobile ? <PaymentsRounded fontSize="small" /> : "Повторить"}
          </Button>
          <Button
            onClick={() => void handleCheckoutCancel()}
            disabled={!activeCheckoutId || checkoutFlowLoading || user?.role !== "student"}
            sx={mobileDialogActionSx}
            aria-label={isMobile ? "Отменить оплату" : undefined}
          >
            {isMobile ? <CloseRounded fontSize="small" /> : "Отменить"}
          </Button>
        </DialogActions>
      </Dialog>
    </section>
  );
}
