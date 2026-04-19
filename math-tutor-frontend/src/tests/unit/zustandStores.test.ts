import { beforeEach, describe, expect, it } from "vitest";
import { useCourseDetailsUiStore } from "@/pages/courses/model/courseDetailsUiStore";
import { useStudentProfileUiStore } from "@/pages/profile/model/studentProfileUiStore";
import { useTeacherDashboardUiStore } from "@/pages/teacher/model/teacherDashboardUiStore";

describe("zustand orchestration stores", () => {
  beforeEach(() => {
    useStudentProfileUiStore.getState().resetStudentProfileUiState();
    useTeacherDashboardUiStore.getState().resetTeacherDashboardUiState();
    useCourseDetailsUiStore.getState().resetCourseDetailsUiState();
  });

  it("supports functional updates for student profile tab coordination", () => {
    const studentStore = useStudentProfileUiStore.getState();
    studentStore.setTab(2);
    studentStore.setTab((prev) => prev + 1);
    expect(useStudentProfileUiStore.getState().tab).toBe(3);
  });

  it("keeps teacher dashboard ui counters in store", () => {
    const teacherStore = useTeacherDashboardUiStore.getState();
    teacherStore.setChatUnreadCount(4);
    teacherStore.setCoursesPage((prev) => prev + 2);
    expect(useTeacherDashboardUiStore.getState().chatUnreadCount).toBe(4);
    expect(useTeacherDashboardUiStore.getState().coursesPage).toBe(3);
  });

  it("resets course details checkout orchestration state", () => {
    const courseStore = useCourseDetailsUiStore.getState();
    courseStore.setCheckoutFlowOpen(true);
    courseStore.setActiveCheckoutId("co_123");
    courseStore.resetCourseDetailsUiState();
    const next = useCourseDetailsUiStore.getState();
    expect(next.checkoutFlowOpen).toBe(false);
    expect(next.activeCheckoutId).toBeNull();
  });
});
