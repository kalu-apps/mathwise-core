import type {
  AboutTeacherEducationItem,
  AboutTeacherMetric,
  AboutTeacherReviewFallback,
} from "./types";

export const ABOUT_TEACHER_HERO_COPY = {
  eyebrow: "",
  title: "Здравствуйте! Меня зовут - Анна Викторовна. Я помогу Вам освоить математику.",
  description:
    "Объясняю сложные темы спокойно и структурно: от базы до уверенного результата на контрольных и экзаменах.",
  primaryCta: "Смотреть курсы",
  secondaryCta: "Задать вопрос",
};

export const ABOUT_TEACHER_METRICS: AboutTeacherMetric[] = [
  {
    label: "Опыт преподавания",
    value: "18 лет",
    note: "Репетитор с 2008 года",
  },
];

export const ABOUT_TEACHER_EDUCATION: AboutTeacherEducationItem[] = [
  {
    title:
      "Московский государственный университет путей сообщения Императора Николая II",
    subtitle: "Факультет электрификации железных дорог",
    years: "1995",
    description: "Квалификация — инженер-технолог.",
  },
  {
    title: "Московская академия профессиональной компетенции",
    subtitle: "Учитель, преподаватель математики",
    years: "2019–2020",
    description: "Профессиональная переподготовка по преподаванию математики.",
  },
  {
    title: "Московская академия профессиональных компетенций",
    subtitle:
      "Современные подходы к подготовке школьников к ЕГЭ по математике",
    years: "2021",
    description: "Программа повышения квалификации в логике ФГОС СОО.",
  },
];

export const ABOUT_TEACHER_REVIEW_FALLBACKS: AboutTeacherReviewFallback[] = [
  {
    author: "Мария, 9 класс",
    context: "Планиметрия",
    quote: "За три месяца подтянула оценку и перестала бояться задач с доказательствами.",
  },
  {
    author: "Данил, ЕГЭ",
    context: "Профильная математика",
    quote: "Собрали чёткий план, разобрали слабые темы и вышли на стабильный результат.",
  },
  {
    author: "Софья, 8 класс",
    context: "Геометрия",
    quote: "Стало понятно, как рассуждать в задачах. Домашние теперь делаю быстрее.",
  },
  {
    author: "Илья, 10 класс",
    context: "Алгебра",
    quote: "Появилась система: знаю, что повторять и как удерживать темп.",
  },
];
