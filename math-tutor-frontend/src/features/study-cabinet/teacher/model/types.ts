import type { Booking } from "@/entities/booking/model/types";
import type { AvailabilitySlot } from "@/features/teacher-availability/model/types";
import type { StudyCabinetNote } from "@/shared/lib/studyCabinet";

export type TeacherStudyCabinetPanelProps = {
  userId: string;
  bookings: Booking[];
  availability: AvailabilitySlot[];
  notes: StudyCabinetNote[];
  activityDays: Array<{
    key: string;
    label: string;
    minutes: number;
  }>;
  chatUnreadCount: number;
  onWorkbookClick?: () => void;
  onChatClick?: () => void;
  onOpenSchedule?: () => void;
  onOpenStudentChat?: (studentId: string) => void;
  onCreateNote?: (payload: {
    title: string;
    body: string;
    dueAt: string | null;
    endAt: string | null;
    remind: boolean;
    color: string;
    kind?: "prep" | "followup" | "focus" | "break" | "custom";
    linkedBookingId?: string | null;
  }) => void;
  onUpdateNote?: (payload: {
    noteId: string;
    title: string;
    body: string;
    dueAt: string | null;
    endAt: string | null;
    remind: boolean;
    color: string;
    kind?: "prep" | "followup" | "focus" | "break" | "custom";
    linkedBookingId?: string | null;
  }) => void;
  onDeleteNote?: (noteId: string) => void;
};
