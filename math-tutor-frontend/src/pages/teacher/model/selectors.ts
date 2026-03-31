import type { Course } from "@/entities/course/model/types";
import type { TeacherDashboardStudentCardData } from "@/pages/teacher/hooks/useTeacherDashboardData";

export const filterTeacherStudents = (params: {
  students: TeacherDashboardStudentCardData[];
  query: string;
  feedbackStudentIds: string[];
  feedbackFilter: "all" | "with_feedback" | "without_feedback";
}) => {
  const query = params.query.trim().toLowerCase();
  const feedbackSet = new Set(params.feedbackStudentIds);
  return params.students.filter((student) => {
    const byQuery =
      student.name.toLowerCase().includes(query) ||
      student.email.toLowerCase().includes(query);
    const hasFeedback = feedbackSet.has(student.id);
    const byFeedback =
      params.feedbackFilter === "all" ||
      (params.feedbackFilter === "with_feedback" ? hasFeedback : !hasFeedback);
    return byQuery && byFeedback;
  });
};

export const filterTeacherCourses = (params: {
  courses: Course[];
  query: string;
  status: "published" | "draft";
}) =>
  params.courses.filter((course) => {
    const byStatus = course.status === params.status;
    const byQuery = course.title
      .toLowerCase()
      .includes(params.query.trim().toLowerCase());
    return byStatus && byQuery;
  });

export const paginateList = <T,>(items: T[], page: number, pageSize: number) => {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
};
