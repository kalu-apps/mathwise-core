import { create } from "zustand";
import type {
  CheckoutListItem,
  CheckoutStatusResponse,
} from "@/domain/auth-payments/model/api";
import { resolveStoreSetState, type StoreSetStateAction } from "@/shared/lib/storeState";

export type CourseDetailsPaymentMethod = "card" | "sbp" | "bnpl";

type CourseDetailsUiStore = {
  modalOpen: boolean;
  modalMessage: string;
  showLoginAction: boolean;
  reloadSeq: number;
  purchaseOpen: boolean;
  purchaseEmail: string;
  purchaseFirstName: string;
  purchaseLastName: string;
  purchasePhone: string;
  purchaseAcceptTerms: boolean;
  purchaseAcceptPrivacy: boolean;
  purchaseMethod: CourseDetailsPaymentMethod;
  purchaseBnplInstallmentsCount: number;
  purchaseLoading: boolean;
  checkoutFlowOpen: boolean;
  checkoutFlowLoading: boolean;
  checkoutFlowError: string | null;
  activeCheckoutId: string | null;
  checkoutFlowStatus: CheckoutStatusResponse | null;
  checkoutPaymentUrl: string | null;
  checkoutProviderLabel: string;
  resumeCheckout: CheckoutListItem | null;
  pendingAttachCheckoutId: string | null;
  lessonsPage: number;
  bnplInfoOpen: boolean;
  setModalOpen: (next: StoreSetStateAction<boolean>) => void;
  setModalMessage: (next: StoreSetStateAction<string>) => void;
  setShowLoginAction: (next: StoreSetStateAction<boolean>) => void;
  setReloadSeq: (next: StoreSetStateAction<number>) => void;
  setPurchaseOpen: (next: StoreSetStateAction<boolean>) => void;
  setPurchaseEmail: (next: StoreSetStateAction<string>) => void;
  setPurchaseFirstName: (next: StoreSetStateAction<string>) => void;
  setPurchaseLastName: (next: StoreSetStateAction<string>) => void;
  setPurchasePhone: (next: StoreSetStateAction<string>) => void;
  setPurchaseAcceptTerms: (next: StoreSetStateAction<boolean>) => void;
  setPurchaseAcceptPrivacy: (next: StoreSetStateAction<boolean>) => void;
  setPurchaseMethod: (next: StoreSetStateAction<CourseDetailsPaymentMethod>) => void;
  setPurchaseBnplInstallmentsCount: (next: StoreSetStateAction<number>) => void;
  setPurchaseLoading: (next: StoreSetStateAction<boolean>) => void;
  setCheckoutFlowOpen: (next: StoreSetStateAction<boolean>) => void;
  setCheckoutFlowLoading: (next: StoreSetStateAction<boolean>) => void;
  setCheckoutFlowError: (next: StoreSetStateAction<string | null>) => void;
  setActiveCheckoutId: (next: StoreSetStateAction<string | null>) => void;
  setCheckoutFlowStatus: (
    next: StoreSetStateAction<CheckoutStatusResponse | null>
  ) => void;
  setCheckoutPaymentUrl: (next: StoreSetStateAction<string | null>) => void;
  setCheckoutProviderLabel: (next: StoreSetStateAction<string>) => void;
  setResumeCheckout: (next: StoreSetStateAction<CheckoutListItem | null>) => void;
  setPendingAttachCheckoutId: (next: StoreSetStateAction<string | null>) => void;
  setLessonsPage: (next: StoreSetStateAction<number>) => void;
  setBnplInfoOpen: (next: StoreSetStateAction<boolean>) => void;
  resetCourseDetailsUiState: () => void;
};

const COURSE_DETAILS_UI_DEFAULTS = {
  modalOpen: false,
  modalMessage: "",
  showLoginAction: false,
  reloadSeq: 0,
  purchaseOpen: false,
  purchaseEmail: "",
  purchaseFirstName: "",
  purchaseLastName: "",
  purchasePhone: "",
  purchaseAcceptTerms: false,
  purchaseAcceptPrivacy: false,
  purchaseMethod: "card" as CourseDetailsPaymentMethod,
  purchaseBnplInstallmentsCount: 4,
  purchaseLoading: false,
  checkoutFlowOpen: false,
  checkoutFlowLoading: false,
  checkoutFlowError: null as string | null,
  activeCheckoutId: null as string | null,
  checkoutFlowStatus: null as CheckoutStatusResponse | null,
  checkoutPaymentUrl: null as string | null,
  checkoutProviderLabel: "",
  resumeCheckout: null as CheckoutListItem | null,
  pendingAttachCheckoutId: null as string | null,
  lessonsPage: 1,
  bnplInfoOpen: false,
};

export const useCourseDetailsUiStore = create<CourseDetailsUiStore>((set) => ({
  ...COURSE_DETAILS_UI_DEFAULTS,
  setModalOpen: (next) =>
    set((state) => ({ modalOpen: resolveStoreSetState(state.modalOpen, next) })),
  setModalMessage: (next) =>
    set((state) => ({
      modalMessage: resolveStoreSetState(state.modalMessage, next),
    })),
  setShowLoginAction: (next) =>
    set((state) => ({
      showLoginAction: resolveStoreSetState(state.showLoginAction, next),
    })),
  setReloadSeq: (next) =>
    set((state) => ({ reloadSeq: resolveStoreSetState(state.reloadSeq, next) })),
  setPurchaseOpen: (next) =>
    set((state) => ({
      purchaseOpen: resolveStoreSetState(state.purchaseOpen, next),
    })),
  setPurchaseEmail: (next) =>
    set((state) => ({
      purchaseEmail: resolveStoreSetState(state.purchaseEmail, next),
    })),
  setPurchaseFirstName: (next) =>
    set((state) => ({
      purchaseFirstName: resolveStoreSetState(state.purchaseFirstName, next),
    })),
  setPurchaseLastName: (next) =>
    set((state) => ({
      purchaseLastName: resolveStoreSetState(state.purchaseLastName, next),
    })),
  setPurchasePhone: (next) =>
    set((state) => ({
      purchasePhone: resolveStoreSetState(state.purchasePhone, next),
    })),
  setPurchaseAcceptTerms: (next) =>
    set((state) => ({
      purchaseAcceptTerms: resolveStoreSetState(state.purchaseAcceptTerms, next),
    })),
  setPurchaseAcceptPrivacy: (next) =>
    set((state) => ({
      purchaseAcceptPrivacy: resolveStoreSetState(state.purchaseAcceptPrivacy, next),
    })),
  setPurchaseMethod: (next) =>
    set((state) => ({
      purchaseMethod: resolveStoreSetState(state.purchaseMethod, next),
    })),
  setPurchaseBnplInstallmentsCount: (next) =>
    set((state) => ({
      purchaseBnplInstallmentsCount: resolveStoreSetState(
        state.purchaseBnplInstallmentsCount,
        next
      ),
    })),
  setPurchaseLoading: (next) =>
    set((state) => ({
      purchaseLoading: resolveStoreSetState(state.purchaseLoading, next),
    })),
  setCheckoutFlowOpen: (next) =>
    set((state) => ({
      checkoutFlowOpen: resolveStoreSetState(state.checkoutFlowOpen, next),
    })),
  setCheckoutFlowLoading: (next) =>
    set((state) => ({
      checkoutFlowLoading: resolveStoreSetState(state.checkoutFlowLoading, next),
    })),
  setCheckoutFlowError: (next) =>
    set((state) => ({
      checkoutFlowError: resolveStoreSetState(state.checkoutFlowError, next),
    })),
  setActiveCheckoutId: (next) =>
    set((state) => ({
      activeCheckoutId: resolveStoreSetState(state.activeCheckoutId, next),
    })),
  setCheckoutFlowStatus: (next) =>
    set((state) => ({
      checkoutFlowStatus: resolveStoreSetState(state.checkoutFlowStatus, next),
    })),
  setCheckoutPaymentUrl: (next) =>
    set((state) => ({
      checkoutPaymentUrl: resolveStoreSetState(state.checkoutPaymentUrl, next),
    })),
  setCheckoutProviderLabel: (next) =>
    set((state) => ({
      checkoutProviderLabel: resolveStoreSetState(state.checkoutProviderLabel, next),
    })),
  setResumeCheckout: (next) =>
    set((state) => ({
      resumeCheckout: resolveStoreSetState(state.resumeCheckout, next),
    })),
  setPendingAttachCheckoutId: (next) =>
    set((state) => ({
      pendingAttachCheckoutId: resolveStoreSetState(
        state.pendingAttachCheckoutId,
        next
      ),
    })),
  setLessonsPage: (next) =>
    set((state) => ({
      lessonsPage: resolveStoreSetState(state.lessonsPage, next),
    })),
  setBnplInfoOpen: (next) =>
    set((state) => ({
      bnplInfoOpen: resolveStoreSetState(state.bnplInfoOpen, next),
    })),
  resetCourseDetailsUiState: () => set(COURSE_DETAILS_UI_DEFAULTS),
}));
