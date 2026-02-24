import type { AssistantChecklistItem } from "../../../../shared/api/assistant-contracts";

type OutlineLike = {
  goal?: string;
  sections: Array<{ title: string; practice?: string[] }>;
  durationMinutes?: number;
};

const createItem = (
  id: string,
  label: string,
  checked: boolean,
  severity: "info" | "warning" | "error"
): AssistantChecklistItem => ({
  id,
  label,
  checked,
  severity,
});

export const runAuthoringQualityChecks = (outline: OutlineLike): AssistantChecklistItem[] => {
  const sectionsCount = outline.sections.length;
  const hasGoal = Boolean(outline.goal && outline.goal.trim().length > 0);
  const hasExampleSection = outline.sections.some((section) =>
    section.title.toLowerCase().includes("пример")
  );
  const hasPracticeCoverage = outline.sections.some(
    (section) => (section.practice?.length ?? 0) > 0
  );
  const lessonDuration = outline.durationMinutes ?? 0;

  return [
    createItem(
      "check-goal",
      "Указана измеримая цель урока",
      hasGoal,
      hasGoal ? "info" : "error"
    ),
    createItem(
      "check-example",
      "Есть пример до самостоятельной практики",
      hasExampleSection,
      hasExampleSection ? "info" : "warning"
    ),
    createItem(
      "check-practice",
      "Практика покрывает ключевые темы",
      hasPracticeCoverage,
      hasPracticeCoverage ? "info" : "warning"
    ),
    createItem(
      "check-duration",
      "Длительность урока не перегружена (>45 мин)",
      lessonDuration > 0 ? lessonDuration <= 45 : true,
      lessonDuration > 45 ? "warning" : "info"
    ),
    createItem(
      "check-structure",
      "Структура содержит минимум 3 секции",
      sectionsCount >= 3,
      sectionsCount >= 3 ? "info" : "warning"
    ),
  ];
};
