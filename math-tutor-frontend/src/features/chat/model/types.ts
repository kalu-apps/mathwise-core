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
  urlExpiresAt?: string;
  mediaObjectId?: string;
};

export type TeacherChatVoiceMessage = {
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
  voice?: TeacherChatVoiceMessage;
  deletedForAll?: boolean;
  readByPeer?: boolean;
};

export type TeacherChatMediaAccess = {
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

export type TeacherChatRealtimeEvent = {
  type: TeacherChatRealtimeEventType;
  version: number;
  at: string;
  threadId?: string;
  messageId?: string;
  message?: TeacherChatMessage;
};

export type SendTeacherChatMessagePayload = {
  threadId?: string;
  text: string;
  attachments?: TeacherChatAttachment[];
  voice?: TeacherChatVoiceMessage;
};

export type UpdateTeacherChatMessagePayload = {
  messageId: string;
  threadId: string;
  text: string;
  attachments?: TeacherChatAttachment[];
  voice?: TeacherChatVoiceMessage;
};

export type DeleteTeacherChatMessagePayload = {
  messageId: string;
  threadId: string;
  scope: "self" | "all";
};

export type MarkTeacherChatVoiceListenedPayload = {
  messageId: string;
  threadId: string;
};
