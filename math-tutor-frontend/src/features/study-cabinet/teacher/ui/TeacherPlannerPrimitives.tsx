import type { ButtonHTMLAttributes, ReactNode } from "react";

type TeacherPlannerButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

export function TeacherPlannerButton({
  icon,
  variant = "secondary",
  className = "",
  children,
  type = "button",
  ...props
}: TeacherPlannerButtonProps) {
  return (
    <button
      type={type}
      className={`teacher-planner-button teacher-planner-button--${variant} ${className}`}
      {...props}
    >
      {icon ? <span className="teacher-planner-button__icon">{icon}</span> : null}
      <span>{children}</span>
    </button>
  );
}

type TeacherPlannerIconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  variant?: "secondary" | "ghost" | "danger";
};

export function TeacherPlannerIconButton({
  label,
  variant = "ghost",
  className = "",
  children,
  type = "button",
  title,
  ...props
}: TeacherPlannerIconButtonProps) {
  return (
    <button
      type={type}
      className={`teacher-planner-icon-button teacher-planner-icon-button--${variant} ${className}`}
      aria-label={label}
      title={title ?? label}
      {...props}
    >
      {children}
    </button>
  );
}
