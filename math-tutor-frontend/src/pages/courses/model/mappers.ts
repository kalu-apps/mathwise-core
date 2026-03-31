import type { CourseContentTestItem } from "@/features/assessments/model/types";

const clampPercent = (value: number) =>
  Math.max(0, Math.min(100, Math.round(value)));

export const buildCourseProgressVisual = (value: number) => {
  const percent = clampPercent(value);
  const normalized = percent / 100;
  const eased =
    percent <= 40
      ? (percent / 40) * 0.58
      : 0.58 + ((percent - 40) / 60) * 0.42;
  const hue = Math.round(4 + eased * 126);
  const saturation = Math.round(92 - normalized * 14);
  const lightness = percent === 0 ? 46 : Math.round(48 + normalized * 8);
  const color = `hsl(${hue} ${saturation}% ${lightness}%)`;
  const glow = `hsla(${hue} 96% ${Math.max(44, lightness)}% / 0.32)`;
  return { percent, color, glow };
};

export const getAssessmentKindByItem = (item: CourseContentTestItem) =>
  item.templateSnapshot?.assessmentKind === "exam" ? "exam" : "credit";
