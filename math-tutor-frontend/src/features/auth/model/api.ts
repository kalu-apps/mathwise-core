import { api, isRecoverableApiError } from "@/shared/api/client";
import type { User } from "@/entities/user/model/types";
import { enqueueOutboxRequest } from "@/shared/lib/outbox";
import { t } from "@/shared/i18n";
import { readStorage } from "@/shared/lib/localDb";
import { authGateway } from "@/shared/gateway";
import { AUTH_STORAGE_KEY } from "./constants";
import type { TeacherDashboardContextResponseContract } from "@/shared/contracts/profile.contract";

export type RequestMagicCodeResponse = {
  ok: boolean;
  message: string;
  expiresAt?: string | null;
  debugCode?: string | null;
};

export async function requestMagicLink(
  email: string
): Promise<RequestMagicCodeResponse> {
  return authGateway.requestMagicLink(email);
}

export async function confirmMagicLink(email: string, code: string): Promise<User> {
  const user = await authGateway.confirmMagicLink({ email, code });
  if (!user) {
    throw new Error("Не удалось подтвердить вход.");
  }
  return user;
}

export async function requestPasswordLogin(
  email: string,
  password: string
): Promise<User> {
  const user = await authGateway.passwordLogin({ email, password });
  if (!user) {
    throw new Error("Не удалось выполнить вход.");
  }
  return user;
}

export async function getAuthSession(): Promise<User | null> {
  return authGateway.getSession();
}

export async function logoutAuthSession(): Promise<void> {
  await authGateway.logout();
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
  debugCode?: string | null;
};

export async function requestPasswordReset(
  email: string
): Promise<RequestPasswordResetResponse> {
  return api.post<RequestPasswordResetResponse>(
    "/auth/recovery/request",
    { email },
    { notifyDataUpdate: false }
  );
}

export async function confirmPasswordReset(params: {
  email: string;
  token: string;
  newPassword: string;
}): Promise<SavePasswordResponse> {
  const verification = await api.post<{
    ok: boolean;
    message: string;
    recoveryToken?: string;
  }>(
    "/auth/recovery/verify",
    {
      email: params.email,
      code: params.token,
    },
    { notifyDataUpdate: false }
  );
  if (!verification.ok || !verification.recoveryToken) {
    throw new Error(verification.message || "Код восстановления недействителен.");
  }
  const reset = await api.post<SavePasswordResponse>(
    "/auth/password/reset",
    {
      email: params.email,
      recoveryToken: verification.recoveryToken,
      newPassword: params.newPassword,
    },
    { notifyDataUpdate: false }
  );
  if (!reset.ok) {
    throw new Error(reset.message || "Не удалось обновить пароль.");
  }
  return reset;
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
  void params;
  return {
    ok: true,
    initialCount: 0,
    appliedCount: 0,
    skippedCount: 0,
    remainingCount: 0,
    applied: [],
  };
}

export type UpdateUserPayload = Partial<Pick<User, "firstName" | "lastName" | "phone" | "photo">>;

export async function updateUserProfile(
  userId: string,
  data: UpdateUserPayload
): Promise<User> {
  const authUser = readStorage<User | null>(AUTH_STORAGE_KEY, null);
  if (authUser && authUser.id !== userId) {
    throw new Error("Недопустимый контекст обновления профиля.");
  }
  try {
    return await api.put<User>("/profile/me", data);
  } catch (error) {
    if (isRecoverableApiError(error)) {
      enqueueOutboxRequest({
        title: t("common.retryUserProfileSaveAction"),
        method: "PUT",
        path: "/profile/me",
        body: data,
        dedupeKey: `user-profile:${userId}`,
      });
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
  if (role === "teacher") {
    return getPublicTeachers();
  }
  if (role === "student") {
    const context = await api.get<TeacherDashboardContextResponseContract>(
      "/teacher/context",
      {
        dedupe: options?.forceFresh ? false : undefined,
        cacheTtlMs: options?.forceFresh ? 0 : undefined,
      }
    );
    return context.students;
  }
  return [];
}

export async function getPublicTeachers(): Promise<User[]> {
  return api.get<User[]>("/public/teachers", {
    dedupe: false,
    cacheTtlMs: 0,
  });
}
