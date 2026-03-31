import { create } from "zustand";
import { resolveStoreSetState, type StoreSetStateAction } from "@/shared/lib/storeState";

type StudentProfileUiStore = {
  tab: number;
  tabMenuOpen: boolean;
  courseQuery: string;
  chatUnreadCount: number;
  studyActivityVersion: number;
  coursesPage: number;
  scheduledPage: number;
  completedPage: number;
  createDate: string;
  createSlotId: string | null;
  rescheduleDate: string;
  rescheduleSlotId: string | null;
  createSlotsExpanded: boolean;
  createAcceptTerms: boolean;
  createAcceptPrivacy: boolean;
  setTab: (next: StoreSetStateAction<number>) => void;
  setTabMenuOpen: (next: StoreSetStateAction<boolean>) => void;
  setCourseQuery: (next: StoreSetStateAction<string>) => void;
  setChatUnreadCount: (next: StoreSetStateAction<number>) => void;
  setStudyActivityVersion: (next: StoreSetStateAction<number>) => void;
  setCoursesPage: (next: StoreSetStateAction<number>) => void;
  setScheduledPage: (next: StoreSetStateAction<number>) => void;
  setCompletedPage: (next: StoreSetStateAction<number>) => void;
  setCreateDate: (next: StoreSetStateAction<string>) => void;
  setCreateSlotId: (next: StoreSetStateAction<string | null>) => void;
  setRescheduleDate: (next: StoreSetStateAction<string>) => void;
  setRescheduleSlotId: (next: StoreSetStateAction<string | null>) => void;
  setCreateSlotsExpanded: (next: StoreSetStateAction<boolean>) => void;
  setCreateAcceptTerms: (next: StoreSetStateAction<boolean>) => void;
  setCreateAcceptPrivacy: (next: StoreSetStateAction<boolean>) => void;
  resetStudentProfileUiState: () => void;
};

const STUDENT_PROFILE_UI_DEFAULTS = {
  tab: 0,
  tabMenuOpen: false,
  courseQuery: "",
  chatUnreadCount: 0,
  studyActivityVersion: 0,
  coursesPage: 1,
  scheduledPage: 1,
  completedPage: 1,
  createDate: "",
  createSlotId: null as string | null,
  rescheduleDate: "",
  rescheduleSlotId: null as string | null,
  createSlotsExpanded: false,
  createAcceptTerms: false,
  createAcceptPrivacy: false,
};

export const useStudentProfileUiStore = create<StudentProfileUiStore>((set) => ({
  ...STUDENT_PROFILE_UI_DEFAULTS,
  setTab: (next) => set((state) => ({ tab: resolveStoreSetState(state.tab, next) })),
  setTabMenuOpen: (next) =>
    set((state) => ({
      tabMenuOpen: resolveStoreSetState(state.tabMenuOpen, next),
    })),
  setCourseQuery: (next) =>
    set((state) => ({
      courseQuery: resolveStoreSetState(state.courseQuery, next),
    })),
  setChatUnreadCount: (next) =>
    set((state) => ({
      chatUnreadCount: resolveStoreSetState(state.chatUnreadCount, next),
    })),
  setStudyActivityVersion: (next) =>
    set((state) => ({
      studyActivityVersion: resolveStoreSetState(state.studyActivityVersion, next),
    })),
  setCoursesPage: (next) =>
    set((state) => ({
      coursesPage: resolveStoreSetState(state.coursesPage, next),
    })),
  setScheduledPage: (next) =>
    set((state) => ({
      scheduledPage: resolveStoreSetState(state.scheduledPage, next),
    })),
  setCompletedPage: (next) =>
    set((state) => ({
      completedPage: resolveStoreSetState(state.completedPage, next),
    })),
  setCreateDate: (next) =>
    set((state) => ({
      createDate: resolveStoreSetState(state.createDate, next),
    })),
  setCreateSlotId: (next) =>
    set((state) => ({
      createSlotId: resolveStoreSetState(state.createSlotId, next),
    })),
  setRescheduleDate: (next) =>
    set((state) => ({
      rescheduleDate: resolveStoreSetState(state.rescheduleDate, next),
    })),
  setRescheduleSlotId: (next) =>
    set((state) => ({
      rescheduleSlotId: resolveStoreSetState(state.rescheduleSlotId, next),
    })),
  setCreateSlotsExpanded: (next) =>
    set((state) => ({
      createSlotsExpanded: resolveStoreSetState(state.createSlotsExpanded, next),
    })),
  setCreateAcceptTerms: (next) =>
    set((state) => ({
      createAcceptTerms: resolveStoreSetState(state.createAcceptTerms, next),
    })),
  setCreateAcceptPrivacy: (next) =>
    set((state) => ({
      createAcceptPrivacy: resolveStoreSetState(state.createAcceptPrivacy, next),
    })),
  resetStudentProfileUiState: () => set(STUDENT_PROFILE_UI_DEFAULTS),
}));
