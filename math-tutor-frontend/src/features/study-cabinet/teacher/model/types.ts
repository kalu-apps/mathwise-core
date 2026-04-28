import type { Booking } from "@/entities/booking/model/types";
import type { AvailabilitySlot } from "@/features/teacher-availability/model/types";
import type { StudyCabinetNote } from "@/shared/lib/studyCabinet";

export type TeacherPlannerTabId =
  | "all"
  | "bookings"
  | "trial"
  | "regular"
  | "availability"
  | "notes";

export type TeacherPlannerEventKind =
  | "regular-booking"
  | "trial-booking"
  | "availability-slot"
  | "note";

export type TeacherPlannerEvent = {
  id: string;
  sourceId: string;
  kind: TeacherPlannerEventKind;
  dateKey: string;
  startTime: string;
  endTime: string;
  startMinutes: number;
  endMinutes: number;
  startAtMs: number;
  endAtMs: number;
  title: string;
  subtitle: string;
  description?: string;
  badge: string;
  secondaryBadge?: string;
  statusLabel?: string;
  paymentLabel?: string;
  studentId?: string;
  studentName?: string;
  color: string;
  booking?: Booking;
  availability?: AvailabilitySlot;
  note?: StudyCabinetNote;
};

export type TeacherPlannerDay = {
  key: string;
  date: Date;
};

export type TeacherPlannerViewMode = "day" | "week";

export type TeacherPlannerTabOption = {
  id: TeacherPlannerTabId;
  label: string;
};

export type TeacherStudyNoteTemplateId =
  | "prep"
  | "followup"
  | "office"
  | "break"
  | "custom";

export type TeacherStudyNoteDraftRequest = {
  templateId?: TeacherStudyNoteTemplateId;
  booking?: Booking;
  dateKey?: string;
  startTime?: string;
  endTime?: string;
};

export type TeacherStudyNotePayload = {
  title: string;
  body: string;
  dueAt: string | null;
  endAt: string | null;
  remind: boolean;
  color: string;
  kind?: "prep" | "followup" | "focus" | "break" | "custom";
  linkedBookingId?: string | null;
};

export type TeacherStudyNoteUpdatePayload = TeacherStudyNotePayload & {
  noteId: string;
};

export type TeacherStudyCabinetPanelProps = {
  bookings: Booking[];
  availability: AvailabilitySlot[];
  notes: StudyCabinetNote[];
  loading?: boolean;
  onOpenSchedule?: () => void;
  onOpenStudentChat?: (studentId: string) => void;
  onCreateNote?: (payload: TeacherStudyNotePayload) => void;
  onUpdateNote?: (payload: TeacherStudyNoteUpdatePayload) => void;
  onDeleteNote?: (noteId: string) => void;
};
