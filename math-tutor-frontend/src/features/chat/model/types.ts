export type TeacherChatEligibilityReason =
  | "teacher"
  | "eligible"
  | "premium_or_booking_required"
  | "teacher_not_found";

export type TeacherChatEligibility = {
  available: boolean;
  reason: TeacherChatEligibilityReason;
  hasPremiumAccess: boolean;
  hasBookingAccess: boolean;
  teacherId: string | null;
  teacherName: string | null;
  teacherPhoto?: string | null;
};

export type ChatSenderRole = "student" | "teacher";

export type TeacherChatThread = {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  studentPhoto?: string;
  teacherId: string;
  teacherName: string;
  teacherPhoto?: string;
  updatedAt: string;
  createdAt: string;
  lastMessageText?: string;
  lastMessageAt?: string;
  unreadCount: number;
};

export type TeacherChatAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
};

export type TeacherChatMessage = {
  id: string;
  threadId: string;
  senderId: string;
  senderRole: ChatSenderRole;
  senderName: string;
  senderPhoto?: string;
  text: string;
  createdAt: string;
  editedAt?: string;
  attachments?: TeacherChatAttachment[];
  deletedForAll?: boolean;
  readByPeer?: boolean;
};

export type SendTeacherChatMessagePayload = {
  threadId?: string;
  text: string;
  attachments?: TeacherChatAttachment[];
};

export type UpdateTeacherChatMessagePayload = {
  messageId: string;
  threadId: string;
  text: string;
  attachments?: TeacherChatAttachment[];
};

export type DeleteTeacherChatMessagePayload = {
  messageId: string;
  threadId: string;
  scope: "self" | "all";
};
