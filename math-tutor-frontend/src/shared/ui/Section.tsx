import type { ReactNode } from "react";

export function Section({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const classes = ["ui-section", className].filter(Boolean).join(" ");
  return <section className={classes}>{children}</section>;
}
