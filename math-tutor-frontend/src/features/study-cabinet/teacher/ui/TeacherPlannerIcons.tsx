import type { SVGProps } from "react";

export type TeacherPlannerIconName =
  | "add"
  | "bell"
  | "book"
  | "calendar"
  | "card"
  | "chat"
  | "chevron-left"
  | "chevron-right"
  | "clock"
  | "day"
  | "edit"
  | "event"
  | "collapse"
  | "expand"
  | "link"
  | "lock"
  | "note"
  | "schedule"
  | "spark"
  | "trash"
  | "week"
  | "x";

type TeacherPlannerIconProps = SVGProps<SVGSVGElement> & {
  name: TeacherPlannerIconName;
};

export function TeacherPlannerIcon({ name, ...props }: TeacherPlannerIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {name === "add" ? (
        <>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </>
      ) : null}
      {name === "bell" ? (
        <>
          <path d="M6.8 9.4a5.2 5.2 0 0 1 10.4 0c0 5 2 5.9 2 7.1H4.8c0-1.2 2-2.1 2-7.1Z" />
          <path d="M10 19a2.2 2.2 0 0 0 4 0" />
        </>
      ) : null}
      {name === "book" ? (
        <>
          <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16H7.5A2.5 2.5 0 0 0 5 21V5.5Z" />
          <path d="M5 18.5A2.5 2.5 0 0 1 7.5 16H19" />
        </>
      ) : null}
      {name === "calendar" ? (
        <>
          <path d="M7 3v3" />
          <path d="M17 3v3" />
          <path d="M4.5 8h15" />
          <rect x="4" y="5" width="16" height="15" rx="3" />
        </>
      ) : null}
      {name === "card" ? (
        <>
          <rect x="3.5" y="5.5" width="17" height="13" rx="3" />
          <path d="M3.5 10h17" />
          <path d="M7 15h3" />
        </>
      ) : null}
      {name === "chat" ? (
        <>
          <path d="M20 11.5a7.2 7.2 0 0 1-7.4 7.1 8.6 8.6 0 0 1-3-.5L4 20l1.7-4.4a6.7 6.7 0 0 1-.9-3.4A7.2 7.2 0 0 1 12.2 5 7.2 7.2 0 0 1 20 11.5Z" />
          <path d="M8.5 11.5h7" />
          <path d="M8.5 14.2H13" />
        </>
      ) : null}
      {name === "chevron-left" ? <path d="m15 18-6-6 6-6" /> : null}
      {name === "chevron-right" ? <path d="m9 6 6 6-6 6" /> : null}
      {name === "clock" ? (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5v5l3.2 2" />
        </>
      ) : null}
      {name === "day" ? (
        <>
          <rect x="5" y="4" width="14" height="16" rx="3" />
          <path d="M8 9h8" />
          <path d="M8 13h8" />
          <path d="M8 17h5" />
        </>
      ) : null}
      {name === "edit" ? (
        <>
          <path d="M4 20h4.2L19 9.2 14.8 5 4 15.8V20Z" />
          <path d="m13.5 6.3 4.2 4.2" />
        </>
      ) : null}
      {name === "event" ? (
        <>
          <path d="M7 3v3" />
          <path d="M17 3v3" />
          <rect x="4" y="5" width="16" height="15" rx="3" />
          <path d="m8 13 2.5 2.5L16 10" />
        </>
      ) : null}
      {name === "collapse" ? (
        <>
          <path d="M9 4v5H4" />
          <path d="m4 9 5-5" />
          <path d="M15 20v-5h5" />
          <path d="m20 15-5 5" />
        </>
      ) : null}
      {name === "expand" ? (
        <>
          <path d="M8 4H4v4" />
          <path d="m4 4 6 6" />
          <path d="M16 20h4v-4" />
          <path d="m20 20-6-6" />
        </>
      ) : null}
      {name === "link" ? (
        <>
          <path d="M9.5 14.5 14.5 9.5" />
          <path d="M13.5 16.5 12 18a4.2 4.2 0 0 1-6-6l1.5-1.5" />
          <path d="M10.5 7.5 12 6a4.2 4.2 0 0 1 6 6l-1.5 1.5" />
        </>
      ) : null}
      {name === "lock" ? (
        <>
          <rect x="5" y="10" width="14" height="10" rx="3" />
          <path d="M8 10V7.8a4 4 0 0 1 8 0V10" />
        </>
      ) : null}
      {name === "note" ? (
        <>
          <path d="M6 3.5h8l4 4V20H6V3.5Z" />
          <path d="M14 3.5V8h4" />
          <path d="M9 12h6" />
          <path d="M9 15.5h4" />
        </>
      ) : null}
      {name === "schedule" ? (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7v5.5l3.5 2.1" />
          <path d="M5 4.5 3 6.5" />
          <path d="m19 4.5 2 2" />
        </>
      ) : null}
      {name === "spark" ? (
        <>
          <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
          <path d="m18 15 .8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15Z" />
        </>
      ) : null}
      {name === "trash" ? (
        <>
          <path d="M4 7h16" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
          <path d="M6.5 7 7.4 20h9.2l.9-13" />
          <path d="M9 7V4.5h6V7" />
        </>
      ) : null}
      {name === "week" ? (
        <>
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="M8 4v16" />
          <path d="M12 4v16" />
          <path d="M16 4v16" />
        </>
      ) : null}
      {name === "x" ? (
        <>
          <path d="M6 6l12 12" />
          <path d="M18 6 6 18" />
        </>
      ) : null}
    </svg>
  );
}
