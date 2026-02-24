import { api, isRecoverableApiError } from "@/shared/api/client";
import type { User } from "@/entities/user/model/types";
import { enqueueOutboxRequest } from "@/shared/lib/outbox";
import { t } from "@/shared/i18n";
import { readStorage } from "@/shared/lib/localDb";
import { AUTH_STORAGE_KEY } from "./constants";

export type RequestMagicCodeResponse = {
  ok: boolean;
  message: string;
  expiresAt?: string | null;
  debugCode?: string | null;
};

export async function requestMagicLink(
  email: string
): Promise<RequestMagicCodeResponse> {
  return api.post<RequestMagicCodeResponse>(
    "/auth/magic-link",
    { email },
    { notifyDataUpdate: false }
  );
}

export async function confirmMagicLink(email: string, code: string): Promise<User> {
  return api.post<User>(
    "/auth/magic-link/confirm",
    { email, code },
    { notifyDataUpdate: false }
  );
}

export async function requestPasswordLogin(
  email: string,
  password: string
): Promise<User> {
  return api.post<User>(
    "/auth/password/login",
    { email, password },
    { notifyDataUpdate: false }
  );
}

export async function getAuthSession(): Promise<User | null> {
  return api.get<User | null>("/auth/session");
}

export async function logoutAuthSession(): Promise<void> {
  await api.post<{ ok: boolean }>(
    "/auth/logout",
    {},
    { notifyDataUpdate: false }
  );
}

export type PasswordStatusResponse = {
  ok: boolean;
  hasPassword: boolean;
  state: "none" | "active" | "reset_pending" | "locked_temp";
  lockedUntil: string | null;
  lastPasswordChangeAt: string | null;
};

export async function getPasswordStatus(): Promise<PasswordStatusResponse> {
  return api.get<PasswordStatusResponse>("/auth/password/status");
}

export type SavePasswordResponse = {
  ok: boolean;
  message: string;
};

export async function setPassword(params: {
  currentPassword?: string;
  newPassword: string;
}): Promise<SavePasswordResponse> {
  return api.post<SavePasswordResponse>(
    "/auth/password/set",
    params,
    { notifyDataUpdate: false }
  );
}

export async function changePassword(params: {
  currentPassword: string;
  newPassword: string;
}): Promise<SavePasswordResponse> {
  return api.post<SavePasswordResponse>(
    "/auth/password/change",
    params,
    { notifyDataUpdate: false }
  );
}

export type RequestPasswordResetResponse = {
  ok: boolean;
  message: string;
  debugToken?: string | null;
};

export async function requestPasswordReset(
  email: string
): Promise<RequestPasswordResetResponse> {
  return api.post<RequestPasswordResetResponse>(
    "/auth/password/reset/request",
    { email },
    { notifyDataUpdate: false }
  );
}

export async function confirmPasswordReset(params: {
  email: string;
  token: string;
  newPassword: string;
}): Promise<SavePasswordResponse> {
  return api.post<SavePasswordResponse>(
    "/auth/password/reset/confirm",
    params,
    { notifyDataUpdate: false }
  );
}

export type ResendVerificationResponse = {
  ok: boolean;
  status: "sent" | "already_verified";
  message: string;
};

export async function resendVerification(
  email: string
): Promise<ResendVerificationResponse> {
  return api.post<ResendVerificationResponse>(
    "/auth/verification/resend",
    {
      email,
    },
    { notifyDataUpdate: false }
  );
}

export type ChangeUnverifiedEmailResponse = {
  ok: boolean;
  user: User;
  message: string;
};

export async function changeUnverifiedEmail(
  email: string,
  newEmail: string
): Promise<ChangeUnverifiedEmailResponse> {
  return api.post<ChangeUnverifiedEmailResponse>(
    "/auth/verification/change-email",
    {
      email,
      newEmail,
    },
    { notifyDataUpdate: false }
  );
}

export type RecoverAccessResponse = {
  ok: boolean;
  email: string;
  user: User | null;
  verified: boolean;
  identityState: "anonymous" | "known_unverified" | "verified" | "restricted";
  checkoutCount: number;
  paidCheckoutCount: number;
  purchaseCount: number;
  hasAnyActiveCourseEntitlement: boolean;
  pendingEntitlements: number;
  recommendation:
    | "complete_profile"
    | "verify_email"
    | "login"
    | "restore_access"
    | "no_access_records";
};

export async function recoverAccess(email: string): Promise<RecoverAccessResponse> {
  return api.post<RecoverAccessResponse>(
    "/auth/recover-access",
    {
      email,
    },
    { notifyDataUpdate: false }
  );
}

export type SelfHealAccessResponse = {
  ok: boolean;
  initialCount: number;
  appliedCount: number;
  skippedCount: number;
  remainingCount: number;
  applied: Array<{
    code: string;
    courseId: string;
    operation: "restore_access_from_paid_checkout" | "dedupe_duplicate_purchases";
    result: "applied" | "skipped";
    details: string;
  }>;
};

export async function selfHealAccess(params?: {
  courseId?: string;
}): Promise<SelfHealAccessResponse> {
  return api.post<SelfHealAccessResponse>(
    "/support/self-heal-access",
    params ?? {}
  );
}

export type UpdateUserPayload = Partial<Pick<User, "firstName" | "lastName" | "phone" | "photo">>;

export async function updateUserProfile(
  userId: string,
  data: UpdateUserPayload
): Promise<User> {
  try {
    return await api.put<User>(`/users/${userId}`, data);
  } catch (error) {
    if (isRecoverableApiError(error)) {
      enqueueOutboxRequest({
        title: t("common.retryUserProfileSaveAction"),
        method: "PUT",
        path: `/users/${userId}`,
        body: data,
        dedupeKey: `user-profile:${userId}`,
      });
      const authUser = readStorage<User | null>(AUTH_STORAGE_KEY, null);
      if (authUser && authUser.id === userId) {
        return {
          ...authUser,
          ...data,
        };
      }
      return {
        id: userId,
        role: "student",
        firstName: data.firstName ?? "",
        lastName: data.lastName ?? "",
        email: "",
        phone: data.phone,
        photo: data.photo,
      } as User;
    }
    throw error;
  }
}

export async function getUsers(
  role?: string,
  options?: { forceFresh?: boolean }
): Promise<User[]> {
  const query = role ? `?role=${encodeURIComponent(role)}` : "";
  return api.get<User[]>(`/users${query}`, {
    dedupe: options?.forceFresh ? false : undefined,
    cacheTtlMs: options?.forceFresh ? 0 : undefined,
  });
}
