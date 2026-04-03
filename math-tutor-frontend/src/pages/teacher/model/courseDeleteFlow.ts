export type CourseDeleteFlowDeps = {
  deleteCourse: (courseId: string) => Promise<void>;
  deleteCourseContentItems: (courseId: string) => Promise<void>;
  deletePurchasesByCourse: (courseId: string) => Promise<void>;
  deleteProgressByCourse: (courseId: string) => Promise<void>;
  refreshAll: () => Promise<void>;
};

export const deleteCourseWithCascade = async (
  courseId: string,
  deps: CourseDeleteFlowDeps
): Promise<void> => {
  await deps.deleteCourse(courseId);
  await deps.deleteCourseContentItems(courseId);
  await deps.deletePurchasesByCourse(courseId);
  await deps.deleteProgressByCourse(courseId);
  await deps.refreshAll();
};
