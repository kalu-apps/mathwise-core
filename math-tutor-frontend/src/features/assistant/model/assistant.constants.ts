import type { AssistantAction, AssistantRole } from "@/shared/api/assistant-contracts";

export const ASSISTANT_NAME = "Аксиом";

export const ASSISTANT_DEFAULT_GREETING =
  "Я Аксиом. Помогу с планом обучения, разбором слабых тем и следующими шагами.";

export const STUDENT_QUICK_ACTIONS: AssistantAction[] = [
  { id: "student.review", label: "Что повторить", icon: "refresh" },
  { id: "student.plan", label: "План на неделю", icon: "calendar" },
  { id: "student.buy", label: "Что изучить дальше", icon: "spark" },
  { id: "student.hint", label: "Подсказка", icon: "hint" },
  { id: "student.check", label: "Проверить решение", icon: "check" },
];

export const TEACHER_QUICK_ACTIONS: AssistantAction[] = [
  { id: "teacher.kpi", label: "Сводка по курсам", icon: "kpi" },
  { id: "teacher.dropoff", label: "Где просадка", icon: "chart" },
  { id: "teacher.improve", label: "Улучшения", icon: "improve" },
  { id: "teacher.lesson-template", label: "Шаблон урока", icon: "template" },
  { id: "teacher.test-blueprint", label: "План теста", icon: "exam" },
];

export const getDefaultActionsByRole = (role: AssistantRole): AssistantAction[] =>
  role === "teacher" ? TEACHER_QUICK_ACTIONS : STUDENT_QUICK_ACTIONS;

export const ASSISTANT_RESPONSE_SKELETON = {
  cards: 3,
  lines: 4,
} as const;
