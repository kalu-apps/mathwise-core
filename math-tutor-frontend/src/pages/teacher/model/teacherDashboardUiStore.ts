import { create } from "zustand";
import { resolveStoreSetState, type StoreSetStateAction } from "@/shared/lib/storeState";

type TeacherDashboardUiStore = {
  tab: number;
  tabMenuOpen: boolean;
  studentQuery: string;
  courseQuery: string;
  slotDate: string;
  slotStart: string;
  slotEnd: string;
  availabilityOpen: boolean;
  slotsDateFilter: string;
  studentsPage: number;
  coursesPage: number;
  scheduledPage: number;
  completedPage: number;
  chatUnreadCount: number;
  setTab: (next: StoreSetStateAction<number>) => void;
  setTabMenuOpen: (next: StoreSetStateAction<boolean>) => void;
  setStudentQuery: (next: StoreSetStateAction<string>) => void;
  setCourseQuery: (next: StoreSetStateAction<string>) => void;
  setSlotDate: (next: StoreSetStateAction<string>) => void;
  setSlotStart: (next: StoreSetStateAction<string>) => void;
  setSlotEnd: (next: StoreSetStateAction<string>) => void;
  setAvailabilityOpen: (next: StoreSetStateAction<boolean>) => void;
  setSlotsDateFilter: (next: StoreSetStateAction<string>) => void;
  setStudentsPage: (next: StoreSetStateAction<number>) => void;
  setCoursesPage: (next: StoreSetStateAction<number>) => void;
  setScheduledPage: (next: StoreSetStateAction<number>) => void;
  setCompletedPage: (next: StoreSetStateAction<number>) => void;
  setChatUnreadCount: (next: StoreSetStateAction<number>) => void;
  resetTeacherDashboardUiState: () => void;
};

const TEACHER_DASHBOARD_UI_DEFAULTS = {
  tab: 0,
  tabMenuOpen: false,
  studentQuery: "",
  courseQuery: "",
  slotDate: "",
  slotStart: "",
  slotEnd: "",
  availabilityOpen: false,
  slotsDateFilter: "",
  studentsPage: 1,
  coursesPage: 1,
  scheduledPage: 1,
  completedPage: 1,
  chatUnreadCount: 0,
};

export const useTeacherDashboardUiStore = create<TeacherDashboardUiStore>((set) => ({
  ...TEACHER_DASHBOARD_UI_DEFAULTS,
  setTab: (next) => set((state) => ({ tab: resolveStoreSetState(state.tab, next) })),
  setTabMenuOpen: (next) =>
    set((state) => ({
      tabMenuOpen: resolveStoreSetState(state.tabMenuOpen, next),
    })),
  setStudentQuery: (next) =>
    set((state) => ({
      studentQuery: resolveStoreSetState(state.studentQuery, next),
    })),
  setCourseQuery: (next) =>
    set((state) => ({
      courseQuery: resolveStoreSetState(state.courseQuery, next),
    })),
  setSlotDate: (next) =>
    set((state) => ({ slotDate: resolveStoreSetState(state.slotDate, next) })),
  setSlotStart: (next) =>
    set((state) => ({ slotStart: resolveStoreSetState(state.slotStart, next) })),
  setSlotEnd: (next) =>
    set((state) => ({ slotEnd: resolveStoreSetState(state.slotEnd, next) })),
  setAvailabilityOpen: (next) =>
    set((state) => ({
      availabilityOpen: resolveStoreSetState(state.availabilityOpen, next),
    })),
  setSlotsDateFilter: (next) =>
    set((state) => ({
      slotsDateFilter: resolveStoreSetState(state.slotsDateFilter, next),
    })),
  setStudentsPage: (next) =>
    set((state) => ({
      studentsPage: resolveStoreSetState(state.studentsPage, next),
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
  setChatUnreadCount: (next) =>
    set((state) => ({
      chatUnreadCount: resolveStoreSetState(state.chatUnreadCount, next),
    })),
  resetTeacherDashboardUiState: () => set(TEACHER_DASHBOARD_UI_DEFAULTS),
}));
