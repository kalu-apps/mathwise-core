import type { CSSProperties } from "react";
import { cn } from "@/shared/lib/cn";
import {
  buildCourseVisualLayers,
  resolveCourseVisualMetadata,
  type CourseVisualRenderMode,
  type CourseVisualStyleInput,
} from "@/entities/course/model/courseVisuals";

type Props = {
  course: CourseVisualStyleInput;
  mode?: CourseVisualRenderMode;
  className?: string;
};

export function CourseVisualBackground({
  course,
  mode = "card",
  className,
}: Props) {
  const metadata = resolveCourseVisualMetadata(course);
  const layers = buildCourseVisualLayers(metadata, mode);
  const style = {
    "--course-visual-base": layers.baseGradient,
    "--course-visual-pattern": layers.patternImage,
    "--course-visual-glow": layers.glowGradient,
    "--course-visual-shimmer": layers.shimmerGradient,
  } as CSSProperties;

  return (
    <div
      className={cn("course-visual-bg", `course-visual-bg--${mode}`, className)}
      style={style}
      aria-hidden="true"
    >
      <span className="course-visual-bg__layer course-visual-bg__layer--base" />
      <span className="course-visual-bg__layer course-visual-bg__layer--pattern" />
      <span className="course-visual-bg__layer course-visual-bg__layer--glow" />
      <span className="course-visual-bg__layer course-visual-bg__layer--shimmer" />
      <span className="course-visual-bg__layer course-visual-bg__layer--veil" />
    </div>
  );
}
