import { useCourseDetailsUiStore } from "@/pages/courses/model/courseDetailsUiStore";

export const useCourseDetailsUiState = () => {
  const modalOpen = useCourseDetailsUiStore((state) => state.modalOpen);
  const setModalOpen = useCourseDetailsUiStore((state) => state.setModalOpen);
  const modalMessage = useCourseDetailsUiStore((state) => state.modalMessage);
  const setModalMessage = useCourseDetailsUiStore((state) => state.setModalMessage);
  const showLoginAction = useCourseDetailsUiStore((state) => state.showLoginAction);
  const setShowLoginAction = useCourseDetailsUiStore(
    (state) => state.setShowLoginAction
  );
  const reloadSeq = useCourseDetailsUiStore((state) => state.reloadSeq);
  const setReloadSeq = useCourseDetailsUiStore((state) => state.setReloadSeq);
  const purchaseOpen = useCourseDetailsUiStore((state) => state.purchaseOpen);
  const setPurchaseOpen = useCourseDetailsUiStore((state) => state.setPurchaseOpen);
  const purchaseEmail = useCourseDetailsUiStore((state) => state.purchaseEmail);
  const setPurchaseEmail = useCourseDetailsUiStore((state) => state.setPurchaseEmail);
  const purchaseFirstName = useCourseDetailsUiStore(
    (state) => state.purchaseFirstName
  );
  const setPurchaseFirstName = useCourseDetailsUiStore(
    (state) => state.setPurchaseFirstName
  );
  const purchaseLastName = useCourseDetailsUiStore((state) => state.purchaseLastName);
  const setPurchaseLastName = useCourseDetailsUiStore(
    (state) => state.setPurchaseLastName
  );
  const purchasePhone = useCourseDetailsUiStore((state) => state.purchasePhone);
  const setPurchasePhone = useCourseDetailsUiStore((state) => state.setPurchasePhone);
  const purchaseAcceptTerms = useCourseDetailsUiStore(
    (state) => state.purchaseAcceptTerms
  );
  const setPurchaseAcceptTerms = useCourseDetailsUiStore(
    (state) => state.setPurchaseAcceptTerms
  );
  const purchaseAcceptPrivacy = useCourseDetailsUiStore(
    (state) => state.purchaseAcceptPrivacy
  );
  const setPurchaseAcceptPrivacy = useCourseDetailsUiStore(
    (state) => state.setPurchaseAcceptPrivacy
  );
  const purchaseMethod = useCourseDetailsUiStore((state) => state.purchaseMethod);
  const setPurchaseMethod = useCourseDetailsUiStore((state) => state.setPurchaseMethod);
  const purchaseBnplInstallmentsCount = useCourseDetailsUiStore(
    (state) => state.purchaseBnplInstallmentsCount
  );
  const setPurchaseBnplInstallmentsCount = useCourseDetailsUiStore(
    (state) => state.setPurchaseBnplInstallmentsCount
  );
  const purchaseLoading = useCourseDetailsUiStore((state) => state.purchaseLoading);
  const setPurchaseLoading = useCourseDetailsUiStore(
    (state) => state.setPurchaseLoading
  );
  const checkoutFlowOpen = useCourseDetailsUiStore((state) => state.checkoutFlowOpen);
  const setCheckoutFlowOpen = useCourseDetailsUiStore(
    (state) => state.setCheckoutFlowOpen
  );
  const checkoutFlowLoading = useCourseDetailsUiStore(
    (state) => state.checkoutFlowLoading
  );
  const setCheckoutFlowLoading = useCourseDetailsUiStore(
    (state) => state.setCheckoutFlowLoading
  );
  const checkoutFlowError = useCourseDetailsUiStore((state) => state.checkoutFlowError);
  const setCheckoutFlowError = useCourseDetailsUiStore(
    (state) => state.setCheckoutFlowError
  );
  const activeCheckoutId = useCourseDetailsUiStore((state) => state.activeCheckoutId);
  const setActiveCheckoutId = useCourseDetailsUiStore(
    (state) => state.setActiveCheckoutId
  );
  const checkoutFlowStatus = useCourseDetailsUiStore(
    (state) => state.checkoutFlowStatus
  );
  const setCheckoutFlowStatus = useCourseDetailsUiStore(
    (state) => state.setCheckoutFlowStatus
  );
  const checkoutPaymentUrl = useCourseDetailsUiStore(
    (state) => state.checkoutPaymentUrl
  );
  const setCheckoutPaymentUrl = useCourseDetailsUiStore(
    (state) => state.setCheckoutPaymentUrl
  );
  const checkoutProviderLabel = useCourseDetailsUiStore(
    (state) => state.checkoutProviderLabel
  );
  const setCheckoutProviderLabel = useCourseDetailsUiStore(
    (state) => state.setCheckoutProviderLabel
  );
  const resumeCheckout = useCourseDetailsUiStore((state) => state.resumeCheckout);
  const setResumeCheckout = useCourseDetailsUiStore((state) => state.setResumeCheckout);
  const pendingAttachCheckoutId = useCourseDetailsUiStore(
    (state) => state.pendingAttachCheckoutId
  );
  const setPendingAttachCheckoutId = useCourseDetailsUiStore(
    (state) => state.setPendingAttachCheckoutId
  );
  const lessonsPage = useCourseDetailsUiStore((state) => state.lessonsPage);
  const setLessonsPage = useCourseDetailsUiStore((state) => state.setLessonsPage);
  const bnplInfoOpen = useCourseDetailsUiStore((state) => state.bnplInfoOpen);
  const setBnplInfoOpen = useCourseDetailsUiStore((state) => state.setBnplInfoOpen);
  const resetCourseDetailsUiState = useCourseDetailsUiStore(
    (state) => state.resetCourseDetailsUiState
  );

  return {
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
  };
};
