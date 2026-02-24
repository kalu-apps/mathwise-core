import type { AssistantMode } from "@/shared/api/assistant-contracts";

export const resolveAssistantModeByPath = (pathname: string): AssistantMode => {
  if (pathname.startsWith("/teacher/tests")) return "test-library";
  if (pathname.startsWith("/teacher/profile")) return "teacher-dashboard";
  if (pathname.startsWith("/courses/") && pathname.includes("/tests/")) return "lesson";
  if (pathname.startsWith("/courses/")) return "course";
  if (pathname.startsWith("/lessons/")) return "lesson";
  if (pathname.startsWith("/workbook")) return "whiteboard";
  return "study-cabinet";
};

export const getAssistantSessionTitle = (mode: AssistantMode) => {
  switch (mode) {
    case "teacher-dashboard":
      return "Аксиом · Аналитика";
    case "whiteboard":
      return "Аксиом · Доска";
    case "course":
      return "Аксиом · Курс";
    case "lesson":
      return "Аксиом · Урок";
    case "test-library":
      return "Аксиом · Тесты";
    case "study-cabinet":
    default:
      return "Аксиом · Кабинет";
  }
};
