import { useTeacherDashboardUiStore } from "@/pages/teacher/model/teacherDashboardUiStore";

export const useTeacherDashboardUiState = () => {
  const tab = useTeacherDashboardUiStore((state) => state.tab);
  const setTab = useTeacherDashboardUiStore((state) => state.setTab);
  const studentQuery = useTeacherDashboardUiStore((state) => state.studentQuery);
  const setStudentQuery = useTeacherDashboardUiStore((state) => state.setStudentQuery);
  const courseQuery = useTeacherDashboardUiStore((state) => state.courseQuery);
  const setCourseQuery = useTeacherDashboardUiStore((state) => state.setCourseQuery);
  const slotDate = useTeacherDashboardUiStore((state) => state.slotDate);
  const setSlotDate = useTeacherDashboardUiStore((state) => state.setSlotDate);
  const slotStart = useTeacherDashboardUiStore((state) => state.slotStart);
  const setSlotStart = useTeacherDashboardUiStore((state) => state.setSlotStart);
  const slotEnd = useTeacherDashboardUiStore((state) => state.slotEnd);
  const setSlotEnd = useTeacherDashboardUiStore((state) => state.setSlotEnd);
  const availabilityOpen = useTeacherDashboardUiStore(
    (state) => state.availabilityOpen
  );
  const setAvailabilityOpen = useTeacherDashboardUiStore(
    (state) => state.setAvailabilityOpen
  );
  const studentsPage = useTeacherDashboardUiStore((state) => state.studentsPage);
  const setStudentsPage = useTeacherDashboardUiStore(
    (state) => state.setStudentsPage
  );
  const coursesPage = useTeacherDashboardUiStore((state) => state.coursesPage);
  const setCoursesPage = useTeacherDashboardUiStore((state) => state.setCoursesPage);
  const chatUnreadCount = useTeacherDashboardUiStore((state) => state.chatUnreadCount);
  const setChatUnreadCount = useTeacherDashboardUiStore(
    (state) => state.setChatUnreadCount
  );
  const slotsDateFilter = useTeacherDashboardUiStore(
    (state) => state.slotsDateFilter
  );
  const setSlotsDateFilter = useTeacherDashboardUiStore(
    (state) => state.setSlotsDateFilter
  );
  const tabMenuOpen = useTeacherDashboardUiStore((state) => state.tabMenuOpen);
  const setTabMenuOpen = useTeacherDashboardUiStore((state) => state.setTabMenuOpen);
  const scheduledPage = useTeacherDashboardUiStore((state) => state.scheduledPage);
  const setScheduledPage = useTeacherDashboardUiStore((state) => state.setScheduledPage);
  const completedPage = useTeacherDashboardUiStore((state) => state.completedPage);
  const setCompletedPage = useTeacherDashboardUiStore((state) => state.setCompletedPage);
  const resetTeacherDashboardUiState = useTeacherDashboardUiStore(
    (state) => state.resetTeacherDashboardUiState
  );

  return {
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
  };
};
