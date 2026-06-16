import type { User } from "@/entities/user/model/types";

export type AuthSessionResponseContract = User | null;

export type AuthLogoutResponseContract = {
  ok: boolean;
};

export type AuthMagicLinkRequestResponseContract = {
  ok: boolean;
  message: string;
  expiresAt?: string | null;
  debugCode?: string | null;
};

export type AuthSessionProbeResultContract = {
  status: number;
};

export type AuthIdentityIntentChannelContract = "email";

export type AuthIdentityIntentStateContract =
  | "pending"
  | "verified"
  | "expired"
  | "consumed"
  | "conflict";

export type AuthIdentityIntentConflictReasonContract =
  | "existing_account"
  | "identity_conflict"
  | "channel_not_supported"
  | "invalid_identity"
  | "too_many_attempts"
  | "unknown";

export type AuthIdentityIntentStartResponseContract = {
  ok: boolean;
  intentId: string | null;
  state: AuthIdentityIntentStateContract;
  expiresAt: string | null;
  message: string;
  debugCode?: string | null;
};

export type AuthIdentityIntentVerifyResponseContract = {
  ok: boolean;
  intentId: string | null;
  state: AuthIdentityIntentStateContract;
  expiresAt: string | null;
  message: string;
  conflictReason?: AuthIdentityIntentConflictReasonContract;
  nextAction?: "login" | "restart";
};

export type AuthIdentityIntentStatusResponseContract = {
  ok: true;
  intentId: string;
  channel: AuthIdentityIntentChannelContract;
  state: AuthIdentityIntentStateContract;
  expiresAt: string | null;
  verifiedAt: string | null;
  consumedAt: string | null;
  conflictReason?: AuthIdentityIntentConflictReasonContract;
  canConsume: boolean;
};

export type AuthIdentityCompletionStateContract =
  | "pending_identity_verification"
  | "pending_account_finalization"
  | "pending_first_password"
  | "completed";

export type AuthPasswordStatusResponseContract = {
  ok: boolean;
  hasPassword: boolean;
  state: "none" | "active" | "reset_pending" | "locked_temp";
  lockedUntil: string | null;
  lastPasswordChangeAt: string | null;
};

export type AuthIdentityCompletionStatusResponseContract = {
  ok: true;
  userId: string;
  identityVerified: boolean;
  accountFinalized: boolean;
  hasPassword: boolean;
  firstPasswordRequired: boolean;
  completionState: AuthIdentityCompletionStateContract;
  identityVerifiedAt: string | null;
  accountFinalizedAt: string | null;
  firstPasswordSetAt: string | null;
  completedAt: string | null;
  source: string | null;
};

export type AuthFirstPasswordStatusResponseContract = {
  ok: true;
  userId: string;
  required: boolean;
  hasPassword: boolean;
  completionState: AuthIdentityCompletionStateContract;
  completed: boolean;
};

export type AuthFirstPasswordCompleteResponseContract = {
  ok: boolean;
  message: string;
  firstPasswordRequired?: boolean;
  completionState?: AuthIdentityCompletionStateContract;
  completed?: boolean;
};

export type AuthPasswordSaveResponseContract = {
  ok: boolean;
  message: string;
};
