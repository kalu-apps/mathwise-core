import type {
  AssistantAction,
  AssistantResponseBlock,
} from "../../../../shared/api/assistant-contracts";
import { runAuthoringQualityChecks } from "./quality-checks";

const normalizeTopic = (value: string, fallback: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const section = (title: string, practice: string[] = []) => ({ title, practice });

export const generateCourseOutlineBlocks = (params: {
  topic: string;
  level: string;
  durationWeeks: number;
}): AssistantResponseBlock[] => {
  const topic = normalizeTopic(params.topic, "Математика");
  const durationWeeks = Math.max(1, Math.min(24, Math.floor(params.durationWeeks || 4)));
  const level = normalizeTopic(params.level, "Базовый");

  const sections = [
    section(`Введение в тему: ${topic}`, ["Диагностический мини-тест"]),
    section("Ключевые методы и типовые ошибки", ["Разбор 5 базовых задач"]),
    section("Экзаменационные задачи повышенного уровня", ["Практикум формата ЕГЭ/ОГЭ"]),
    section("Итоговый модуль и закрепление", ["Контрольный тест + разбор"]),
  ];

  const checks = runAuthoringQualityChecks({
    goal: `За ${durationWeeks} недель довести тему «${topic}» до уверенного решения задач уровня ${level}.`,
    sections,
  });

  return [
    {
      id: "authoring-outline-text",
      type: "text",
      title: "Черновик структуры курса",
      text: `Тема: ${topic}\nУровень: ${level}\nДлительность: ${durationWeeks} нед.`,
      tone: "default",
    },
    {
      id: "authoring-outline-checklist",
      type: "checklist",
      title: "Контроль качества структуры",
      items: checks,
    },
    {
      id: "authoring-outline-actions",
      type: "quick_actions",
      title: "Следующие действия",
      actions: [
        { id: "teacher.lesson-template", label: "Сгенерировать урок 1" },
        { id: "teacher.test-blueprint", label: "Собрать blueprint теста" },
      ],
    },
  ];
};

export const generateLessonDraftBlocks = (params: {
  lessonTopic: string;
  audienceLevel: string;
}): AssistantResponseBlock[] => {
  const lessonTopic = normalizeTopic(params.lessonTopic, "Новый урок");
  const audienceLevel = normalizeTopic(params.audienceLevel, "Базовый");
  const sections = [
    section("Цель урока и входная диагностика"),
    section("Пример с пошаговым разбором", ["Задача 1", "Задача 2"]),
    section("Самостоятельная практика", ["Задача A", "Задача B", "Задача C"]),
  ];
  const checks = runAuthoringQualityChecks({
    goal: `Понять и применить ${lessonTopic}`,
    sections,
    durationMinutes: 40,
  });

  const links = sections.map((entry, index) => ({
    id: `lesson-section-${index + 1}`,
    label: `${index + 1}. ${entry.title}`,
    entity: {},
  }));

  return [
    {
      id: "authoring-lesson-summary",
      type: "text",
      title: "Черновик урока",
      text: `Тема урока: ${lessonTopic}\nЦелевая группа: ${audienceLevel}\nРекомендуемая длительность: 40 минут.`,
      tone: "default",
    },
    {
      id: "authoring-lesson-sections",
      type: "entity_links",
      title: "Структура по блокам",
      links,
    },
    {
      id: "authoring-lesson-checks",
      type: "checklist",
      title: "Проверки качества",
      items: checks,
    },
  ];
};

export const generateTestBlueprintBlocks = (topic: string): AssistantResponseBlock[] => {
  const normalizedTopic = normalizeTopic(topic, "Текущая тема");
  const actions: AssistantAction[] = [
    { id: "teacher.test-blueprint", label: "Обновить blueprint" },
    { id: "teacher.improve", label: "Добавить рекомендации" },
  ];
  return [
    {
      id: "authoring-test-text",
      type: "text",
      title: "План теста",
      text: `Тема: ${normalizedTopic}\nСложность: 30% легкие / 45% средние / 25% сложные.\nВключите минимум 1 задачу на типичную ошибку.`,
      tone: "default",
    },
    {
      id: "authoring-test-checklist",
      type: "checklist",
      title: "Контрольные пункты",
      items: [
        {
          id: "blueprint-balance",
          label: "Баланс сложности соблюден",
          checked: true,
          severity: "info",
        },
        {
          id: "blueprint-goal",
          label: "Проверяются заявленные цели урока",
          checked: true,
          severity: "info",
        },
        {
          id: "blueprint-traps",
          label: "Есть вопрос на типичную ошибку",
          checked: true,
          severity: "info",
        },
      ],
    },
    {
      id: "authoring-test-actions",
      type: "quick_actions",
      title: "Действия",
      actions,
    },
  ];
};
