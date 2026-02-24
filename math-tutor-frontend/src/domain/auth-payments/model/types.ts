export type CheckoutState =
  | "created"
  | "awaiting_payment"
  | "paid"
  | "failed"
  | "canceled"
  | "expired"
  | "provisioning"
  | "provisioned";

export type CheckoutMethod = "card" | "sbp" | "bnpl" | "mock";

export type CheckoutProcess = {
  id: string;
  idempotencyKey: string;
  userId?: string;
  email: string;
  profileDraft?: {
    firstName?: string;
    lastName?: string;
    phone?: string;
  };
  courseId: string;
  amount: number;
  currency: "RUB";
  method: CheckoutMethod;
  bnplInstallmentsCount?: number;
  state: CheckoutState;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
};

export type PaymentEventStatus =
  | "awaiting_payment"
  | "paid"
  | "failed"
  | "canceled"
  | "expired";

export type PaymentEventProvider = "mock" | "sbp" | "card" | "bnpl";

export type PaymentEventOutcome =
  | "applied"
  | "duplicate"
  | "ignored_out_of_order"
  | "ignored_missing_checkout";

export type PaymentEventRecord = {
  id: string;
  provider: PaymentEventProvider;
  externalEventId: string;
  dedupeKey: string;
  checkoutId: string;
  status: PaymentEventStatus;
  payload?: string;
  outcome: PaymentEventOutcome;
  createdAt: string;
  processedAt: string;
};

export type IdempotencyRecord = {
  id: string;
  key: string;
  method: "POST" | "PUT";
  path: string;
  bodyHash: string;
  statusCode: number;
  responseBody: string;
  createdAt: string;
  expiresAt: string;
};

export type ReconciliationIssueCode =
  | "paid_without_access"
  | "access_without_paid"
  | "multiple_paid_checkouts"
  | "duplicate_purchases"
  | "refunded_with_access";

export type SupportActionType =
  | "restore_access_from_paid_checkout"
  | "revoke_unpaid_access"
  | "dedupe_duplicate_purchases"
  | "refund_and_revoke_course_access";

export type SupportActionRecord = {
  id: string;
  type: SupportActionType;
  issueCode?: ReconciliationIssueCode;
  userId?: string;
  courseId?: string;
  checkoutId?: string;
  notes?: string;
  createdAt: string;
};

export type IdentityState =
  | "anonymous"
  | "known_unverified"
  | "verified"
  | "restricted";

export type IdentityRecord = {
  email: string;
  userId?: string;
  state: IdentityState;
  createdAt: string;
  updatedAt: string;
};

export type EntitlementKind =
  | "course_access"
  | "premium_timebound"
  | "trial_access_limited";

export type EntitlementState =
  | "pending_activation"
  | "active"
  | "expired"
  | "revoked";

export type EntitlementSourceType = "checkout" | "booking" | "system";

export type EntitlementRecord = {
  id: string;
  userId: string;
  kind: EntitlementKind;
  state: EntitlementState;
  sourceType: EntitlementSourceType;
  sourceId: string;
  courseId?: string;
  createdAt: string;
  updatedAt: string;
  activeUntil?: string;
};

export type TrialBookingState =
  | "requested"
  | "scheduled"
  | "completed"
  | "canceled";

export type BookingLifecycleRecord = {
  bookingId: string;
  state: TrialBookingState;
  updatedAt: string;
};

export type ConsentScope =
  | "auth"
  | "checkout"
  | "trial_booking"
  | "privacy"
  | "terms";

export type ConsentRecord = {
  id: string;
  userId?: string;
  email: string;
  scope: ConsentScope;
  documentVersion: string;
  capturedAt: string;
};

export type AuthSessionState = "active" | "revoked" | "expired";

export type AuthSessionRecord = {
  id: string;
  userId: string;
  email: string;
  role: "student" | "teacher";
  state: AuthSessionState;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  lastActivityAt?: string;
};

export type OutboxChannel = "email";

export type OutboxTemplate =
  | "purchase_success"
  | "verification_required"
  | "verification_resend"
  | "access_recovery"
  | "auth_code"
  | "password_reset";

export type OutboxStatus = "queued" | "sent" | "failed";

export type OutboxRecord = {
  id: string;
  channel: OutboxChannel;
  provider?: string;
  providerMessageId?: string;
  template: OutboxTemplate;
  dedupeKey: string;
  recipientEmail: string;
  userId?: string;
  checkoutId?: string;
  status: OutboxStatus;
  subject: string;
  body: string;
  payload?: string;
  attemptCount: number;
  maxAttempts?: number;
  nextAttemptAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
};

export type AuthCredentialState =
  | "none"
  | "active"
  | "reset_pending"
  | "locked_temp";

export type AuthCredentialAlgo = "scrypt-v1";

export type AuthCredentialRecord = {
  userId: string;
  algo: AuthCredentialAlgo;
  passwordHash?: string;
  state: AuthCredentialState;
  failedAttempts: number;
  lockedUntil?: string;
  createdAt: string;
  updatedAt: string;
  lastPasswordChangeAt?: string;
};

export type PasswordResetTokenState = "issued" | "consumed" | "expired";

export type PasswordResetTokenRecord = {
  id: string;
  userId: string;
  email: string;
  tokenHash: string;
  state: PasswordResetTokenState;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  consumedAt?: string;
};

export type AuthOneTimeCodePurpose = "login";

export type AuthOneTimeCodeState = "issued" | "consumed" | "expired";

export type AuthOneTimeCodeRecord = {
  id: string;
  email: string;
  userId?: string;
  purpose: AuthOneTimeCodePurpose;
  codeHash: string;
  state: AuthOneTimeCodeState;
  expiresAt: string;
  maxAttempts: number;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  consumedAt?: string;
};

export type AuthAuditAction =
  | "magic_code_requested"
  | "magic_code_confirmed"
  | "magic_code_failed"
  | "magic_code_expired"
  | "password_set"
  | "password_changed"
  | "password_reset_requested"
  | "password_reset_completed"
  | "password_login_failed"
  | "password_login_succeeded"
  | "password_login_locked";

export type AuthAuditRecord = {
  id: string;
  action: AuthAuditAction;
  userId?: string;
  email: string;
  metadata?: string;
  createdAt: string;
};
