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
    value: "Курсы, практика и разборы в одном контуре",
  },
  {
    label: "Фокус",
    value: "ЕГЭ, ОГЭ и школьная программа без лишнего шума",
  },
  {
    label: "Поддержка",
    value: "Персональные сессии и обратная связь по прогрессу",
  },
];

export const HOME_GUIDED_PATHS: HomeGuidedPath[] = [
  {
    id: "catalog",
    title: "Рекомендуемый старт",
    summary: "Собрать персональный маршрут через каталог",
    detail:
      "Выберите курс по цели и уровню. Это самый быстрый и точный старт для нового студента.",
    actionLabel: "Открыть каталог",
    route: "/courses",
    tone: "primary",
    icon: "catalog",
  },
  {
    id: "intensive",
    title: "Индивидуальный разбор",
    summary: "Запись на персональный разбор темы",
    detail:
      "Когда нужен быстрый прогресс перед контрольной или экзаменом, забронируйте точечную сессию.",
    actionLabel: "Записаться",
    route: "/booking",
    tone: "secondary",
    icon: "intensive",
  },
  {
    id: "support",
    title: "Вопрос по траектории",
    summary: "Уточнить план и формат подготовки",
    detail:
      "Если старт неочевиден, задайте вопрос и получите рекомендацию по следующему шагу.",
    actionLabel: "Задать вопрос",
    route: "/contact",
    tone: "secondary",
    icon: "support",
  },
];
