export type HomeProofPoint = {
  label: string;
  value: string;
};

export type HomeGuidedPath = {
  id: string;
  title: string;
  summary: string;
  detail: string;
  actionLabel: string;
  route: string;
  tone: "primary" | "secondary";
  icon: "catalog" | "intensive" | "support";
};

export const HOME_PROOF_POINTS: HomeProofPoint[] = [
  {
    label: "Формат",
    value: "Курсы, практика и разборы в единой траектории",
  },
  {
    label: "Фокус",
    value: "ЕГЭ, ОГЭ и школьная математика без информационного шума",
  },
  {
    label: "Поддержка",
    value: "Индивидуальные занятия и обратная связь по реальному прогрессу",
  },
];

export const HOME_GUIDED_PATHS: HomeGuidedPath[] = [
  {
    id: "catalog",
    title: "Рекомендуемый старт",
    summary: "Собрать персональный маршрут через каталог",
    detail:
      "Подберите курс по целям, уровню и ближайшему результату. Это лучший первый шаг для нового студента.",
    actionLabel: "Открыть каталог",
    route: "/courses",
    tone: "primary",
    icon: "catalog",
  },
  {
    id: "intensive",
    title: "Индивидуальный разбор",
    summary: "Запись на персональное занятие с преподавателем",
    detail:
      "Нужна быстрая стабилизация перед контрольной или экзаменом? Запланируйте точечный разбор темы.",
    actionLabel: "Записаться",
    route: "/booking",
    tone: "secondary",
    icon: "intensive",
  },
  {
    id: "support",
    title: "Вопрос по траектории",
    summary: "Уточнить план обучения и формат подготовки",
    detail:
      "Если не уверены, с чего начать, задайте вопрос и получите рекомендацию по следующему шагу.",
    actionLabel: "Задать вопрос",
    route: "/contact",
    tone: "secondary",
    icon: "support",
  },
];
