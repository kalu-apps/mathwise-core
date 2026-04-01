export type TeacherChatEligibilityReason =
  | "teacher"
  | "eligible"
  | "premium_or_booking_required"
  | "teacher_not_found";

export type TeacherChatEligibilityDto = {
  available: boolean;
  reason: TeacherChatEligibilityReason;
  hasPremiumAccess: boolean;
  hasBookingAccess: boolean;
  teacherId: string | null;
  teacherName: string | null;
  teacherPhoto?: string | null;
};

export type ChatSenderRole = "student" | "teacher";

export type TeacherChatThreadDto = {
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

export type TeacherChatAttachmentDto = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
};

export type TeacherChatMessageDto = {
  id: string;
  threadId: string;
  senderId: string;
  senderRole: ChatSenderRole;
  senderName: string;
  senderPhoto?: string;
  text: string;
  createdAt: string;
  editedAt?: string;
  attachments?: TeacherChatAttachmentDto[];
  deletedForAll?: boolean;
  readByPeer?: boolean;
};

export type SendTeacherChatMessagePayloadDto = {
  threadId?: string;
  text: string;
  attachments?: TeacherChatAttachmentDto[];
};

export type UpdateTeacherChatMessagePayloadDto = {
  threadId: string;
  text: string;
  attachments?: TeacherChatAttachmentDto[];
};

export type DeleteTeacherChatMessagePayloadDto = {
  threadId: string;
  scope: "self" | "all";
};
