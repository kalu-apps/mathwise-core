import { useStudentProfileUiStore } from "@/pages/profile/model/studentProfileUiStore";

export const useStudentProfileUiState = () => {
  const tab = useStudentProfileUiStore((state) => state.tab);
  const setTab = useStudentProfileUiStore((state) => state.setTab);
  const courseQuery = useStudentProfileUiStore((state) => state.courseQuery);
  const setCourseQuery = useStudentProfileUiStore((state) => state.setCourseQuery);
  const createDate = useStudentProfileUiStore((state) => state.createDate);
  const setCreateDate = useStudentProfileUiStore((state) => state.setCreateDate);
  const createSlotId = useStudentProfileUiStore((state) => state.createSlotId);
  const setCreateSlotId = useStudentProfileUiStore((state) => state.setCreateSlotId);
  const rescheduleDate = useStudentProfileUiStore((state) => state.rescheduleDate);
  const setRescheduleDate = useStudentProfileUiStore((state) => state.setRescheduleDate);
  const rescheduleSlotId = useStudentProfileUiStore((state) => state.rescheduleSlotId);
  const setRescheduleSlotId = useStudentProfileUiStore(
    (state) => state.setRescheduleSlotId
  );
  const chatUnreadCount = useStudentProfileUiStore((state) => state.chatUnreadCount);
  const setChatUnreadCount = useStudentProfileUiStore(
    (state) => state.setChatUnreadCount
  );
  const tabMenuOpen = useStudentProfileUiStore((state) => state.tabMenuOpen);
  const setTabMenuOpen = useStudentProfileUiStore((state) => state.setTabMenuOpen);
  const studyActivityVersion = useStudentProfileUiStore(
    (state) => state.studyActivityVersion
  );
  const setStudyActivityVersion = useStudentProfileUiStore(
    (state) => state.setStudyActivityVersion
  );
  const coursesPage = useStudentProfileUiStore((state) => state.coursesPage);
  const setCoursesPage = useStudentProfileUiStore((state) => state.setCoursesPage);
  const scheduledPage = useStudentProfileUiStore((state) => state.scheduledPage);
  const setScheduledPage = useStudentProfileUiStore((state) => state.setScheduledPage);
  const completedPage = useStudentProfileUiStore((state) => state.completedPage);
  const setCompletedPage = useStudentProfileUiStore((state) => state.setCompletedPage);
  const createSlotsExpanded = useStudentProfileUiStore(
    (state) => state.createSlotsExpanded
  );
  const setCreateSlotsExpanded = useStudentProfileUiStore(
    (state) => state.setCreateSlotsExpanded
  );
  const createAcceptTerms = useStudentProfileUiStore(
    (state) => state.createAcceptTerms
  );
  const setCreateAcceptTerms = useStudentProfileUiStore(
    (state) => state.setCreateAcceptTerms
  );
  const createAcceptPrivacy = useStudentProfileUiStore(
    (state) => state.createAcceptPrivacy
  );
  const setCreateAcceptPrivacy = useStudentProfileUiStore(
    (state) => state.setCreateAcceptPrivacy
  );
  const resetStudentProfileUiState = useStudentProfileUiStore(
    (state) => state.resetStudentProfileUiState
  );

  return {
    tab,
    setTab,
    courseQuery,
    setCourseQuery,
    createDate,
    setCreateDate,
    createSlotId,
    setCreateSlotId,
    rescheduleDate,
    setRescheduleDate,
    rescheduleSlotId,
    setRescheduleSlotId,
    chatUnreadCount,
    setChatUnreadCount,
    tabMenuOpen,
    setTabMenuOpen,
    studyActivityVersion,
    setStudyActivityVersion,
    coursesPage,
    setCoursesPage,
    scheduledPage,
    setScheduledPage,
    completedPage,
    setCompletedPage,
    createSlotsExpanded,
    setCreateSlotsExpanded,
    createAcceptTerms,
    setCreateAcceptTerms,
    createAcceptPrivacy,
    setCreateAcceptPrivacy,
    resetStudentProfileUiState,
  };
};
