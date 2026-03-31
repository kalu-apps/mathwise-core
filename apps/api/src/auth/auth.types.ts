export type AuthUserRole = "student" | "teacher";

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

export type StoredSession = {
  id: string;
  userId: string;
  issuedAt: string;
  expiresAt: string;
};
