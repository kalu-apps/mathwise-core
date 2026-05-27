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
  urlExpiresAt?: string;
  mediaObjectId?: string;
};

export type TeacherChatVoiceMessageDto = {
  id: string;
  mimeType: string;
  size: number;
  url: string;
  urlExpiresAt?: string;
  mediaObjectId?: string;
  durationSeconds?: number;
  waveform?: number[];
  listenedByPeer?: boolean;
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
  voice?: TeacherChatVoiceMessageDto;
  deletedForAll?: boolean;
  readByPeer?: boolean;
};

export type TeacherChatMediaAccessDto = {
  messageId: string;
  threadId: string;
  mediaObjectId: string;
  downloadUrl: string;
  expiresAt: string;
  contentType?: string;
  sizeBytes?: number;
};

export type TeacherChatRealtimeEventType =
  | "connected"
  | "ping"
  | "message.created"
  | "message.updated"
  | "message.deleted"
  | "thread.cleared"
  | "thread.read"
  | "voice.listened";

export type TeacherChatRealtimeEventDto = {
  type: TeacherChatRealtimeEventType;
  version: number;
  at: string;
  threadId?: string;
  messageId?: string;
  message?: TeacherChatMessageDto;
};

export type SendTeacherChatMessagePayloadDto = {
  threadId?: string;
  text: string;
  attachments?: TeacherChatAttachmentDto[];
  voice?: TeacherChatVoiceMessageDto;
};

export type UpdateTeacherChatMessagePayloadDto = {
  threadId: string;
  text: string;
  attachments?: TeacherChatAttachmentDto[];
  voice?: TeacherChatVoiceMessageDto;
};

export type DeleteTeacherChatMessagePayloadDto = {
  threadId: string;
  scope: "self" | "all";
};

export type MarkTeacherChatVoiceListenedPayloadDto = {
  threadId: string;
};
