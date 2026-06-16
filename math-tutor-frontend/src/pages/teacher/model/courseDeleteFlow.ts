export type CourseDeleteFlowDeps = {
  deleteCourse: (courseId: string) => Promise<void>;
  refreshAll: () => Promise<void>;
};

export const deleteCourseFromTeacherWorkspace = async (
  courseId: string,
  deps: CourseDeleteFlowDeps
): Promise<void> => {
  await deps.deleteCourse(courseId);
  await deps.refreshAll();
};
