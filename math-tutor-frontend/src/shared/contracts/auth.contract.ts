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

export type AuthIdentityIntentChannelContract =
  | "email"
  | "google"
  | "yandex"
  | "vk";

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
