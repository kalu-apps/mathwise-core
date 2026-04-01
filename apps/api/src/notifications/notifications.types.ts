export type NotificationTemplate =
  | "registration"
  | "purchase_confirmed"
  | "purchase_access_granted"
  | "recovery_requested"
  | "login_hint";

export type NotificationStatus = "queued" | "sent" | "failed";

export type NotificationOutboxRecordDto = {
  id: string;
  template: NotificationTemplate;
  dedupeKey: string;
  recipientEmail: string;
  userId?: string;
  checkoutId?: string;
  status: NotificationStatus;
  payload: Record<string, unknown>;
  attemptCount: number;
  maxAttempts: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
};

export type EnqueueNotificationInput = {
  id: string;
  template: NotificationTemplate;
  dedupeKey: string;
  recipientEmail: string;
  userId?: string;
  checkoutId?: string;
  payload: Record<string, unknown>;
  maxAttempts?: number;
};
