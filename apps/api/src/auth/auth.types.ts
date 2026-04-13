export type AuthUserRole = "student" | "teacher";
export type AuthSocialProvider = "google" | "yandex" | "vk";

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

export type AuthPasswordSaveResponseDto = {
  ok: boolean;
  message: string;
};

export type StoredSession = {
  id: string;
  userId: string;
  issuedAt: string;
  expiresAt: string;
};

export type AuthSocialProfile = {
  provider: AuthSocialProvider;
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
  photo?: string;
};
