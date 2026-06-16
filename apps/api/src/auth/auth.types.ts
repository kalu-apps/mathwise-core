export type AuthUserRole = "student" | "teacher";
export type AuthIdentityIntentChannel = "email";
export type AuthIdentityIntentState =
  | "pending"
  | "verified"
  | "expired"
  | "consumed"
  | "conflict";
export type AuthIdentityIntentConflictReason =
  | "existing_account"
  | "identity_conflict"
  | "channel_not_supported"
  | "invalid_identity"
  | "too_many_attempts"
  | "unknown";

export type AuthUserDto = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: AuthUserRole;
  phone?: string;
  photo?: string;
};

export type RequestMagicCodeResponseDto = {
  ok: boolean;
  message: string;
  expiresAt?: string | null;
  debugCode?: string | null;
};

export type AuthLogoutResponseDto = {
  ok: boolean;
};

export type AuthRecoveryRequestResponseDto = {
  ok: boolean;
  message: string;
  debugCode?: string | null;
};

export type AuthRecoveryVerifyResponseDto = {
  ok: boolean;
  message: string;
  recoveryToken?: string;
};

export type AuthPasswordResetResponseDto = {
  ok: boolean;
  message: string;
};

export type AuthPasswordStatusStateDto =
  | "none"
  | "active"
  | "reset_pending"
  | "locked_temp";

export type AuthPasswordStatusResponseDto = {
  ok: boolean;
  hasPassword: boolean;
  state: AuthPasswordStatusStateDto;
  lockedUntil: string | null;
  lastPasswordChangeAt: string | null;
};

export type AuthIdentityCompletionStateDto =
  | "pending_identity_verification"
  | "pending_account_finalization"
  | "pending_first_password"
  | "completed";

export type AuthIdentityCompletionStatusResponseDto = {
  ok: true;
  userId: string;
  identityVerified: boolean;
  accountFinalized: boolean;
  hasPassword: boolean;
  firstPasswordRequired: boolean;
  completionState: AuthIdentityCompletionStateDto;
  identityVerifiedAt: string | null;
  accountFinalizedAt: string | null;
  firstPasswordSetAt: string | null;
  completedAt: string | null;
  source: string | null;
};

export type AuthPasswordSaveResponseDto = {
  ok: boolean;
  message: string;
};

export type AuthFirstPasswordStatusResponseDto = {
  ok: true;
  userId: string;
  required: boolean;
  hasPassword: boolean;
  completionState: AuthIdentityCompletionStateDto;
  completed: boolean;
};

export type AuthFirstPasswordCompleteResponseDto = {
  ok: boolean;
  message: string;
  firstPasswordRequired?: boolean;
  completionState?: AuthIdentityCompletionStateDto;
  completed?: boolean;
};

export type AuthIdentityIntentStartResponseDto = {
  ok: boolean;
  intentId: string | null;
  state: AuthIdentityIntentState;
  expiresAt: string | null;
  message: string;
  debugCode?: string | null;
};

export type AuthIdentityIntentVerifyResponseDto = {
  ok: boolean;
  intentId: string | null;
  state: AuthIdentityIntentState;
  expiresAt: string | null;
  message: string;
  conflictReason?: AuthIdentityIntentConflictReason;
  nextAction?: "login" | "restart";
};

export type AuthIdentityIntentStatusResponseDto = {
  ok: true;
  intentId: string;
  channel: AuthIdentityIntentChannel;
  state: AuthIdentityIntentState;
  expiresAt: string | null;
  verifiedAt: string | null;
  consumedAt: string | null;
  conflictReason?: AuthIdentityIntentConflictReason;
  canConsume: boolean;
};

export type AuthIdentityIntentPurchaseResolutionDto = {
  intentId: string;
  channel: AuthIdentityIntentChannel;
  email: string;
  verifiedAt: string | null;
  expiresAt: string;
};

export type StoredSession = {
  id: string;
  userId: string;
  issuedAt: string;
  lastActivityAt: string;
  expiresAt: string;
  idleExpiresAt: string;
};
