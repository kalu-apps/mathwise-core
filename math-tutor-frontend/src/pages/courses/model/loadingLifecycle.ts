export const shouldEnterCourseDetailsHardLoading = (params: {
  hasResolvedInitialLoad: boolean;
}) => !params.hasResolvedInitialLoad;

