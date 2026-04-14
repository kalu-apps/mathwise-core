import { ApiError, api, isRecoverableApiError } from "@/shared/api/client";
import type { User } from "@/entities/user/model/types";
import { enqueueOutboxRequest } from "@/shared/lib/outbox";
import { t } from "@/shared/i18n";
import { readStorage } from "@/shared/lib/localDb";
import { authGateway } from "@/shared/gateway";
import { AUTH_STORAGE_KEY } from "./constants";
import type { TeacherDashboardContextResponseContract } from "@/shared/contracts/profile.contract";

const readNodeEnv = (name: string) => {
  if (typeof process === "undefined") return undefined;
  return process.env?.[name];
};

const getApiBase = () => {
  const raw =
    import.meta.env.VITE_API_BASE_URL?.trim() ??
    readNodeEnv("API_BASE_URL")?.trim();
  if (!raw) return "/api";
  const normalized = raw.endsWith("/") ? raw.slice(0, -1) : raw;
  if (normalized === "/api" || normalized.endsWith("/api")) {
    return normalized;
  }
  if (normalized.includes("/api/")) {
    return normalized;
  }
  return `${normalized}/api`;
};

export type SocialProvider = "google" | "yandex" | "vk";

export type IdentityIntentChannel = "email" | SocialProvider;
export type IdentityIntentState =
  | "pending"
  | "verified"
  | "expired"
  | "consumed"
  | "conflict";
export type IdentityIntentConflictReason =
  | "existing_account"
  | "identity_conflict"
  | "channel_not_supported"
  | "invalid_identity"
  | "too_many_attempts"
  | "unknown";

export type StartIdentityIntentResponse = {
  ok: boolean;
  intentId: string | null;
  state: IdentityIntentState;
  expiresAt: string | null;
  message: string;
  debugCode?: string | null;
};

export type VerifyIdentityIntentResponse = {
  ok: boolean;
  intentId: string | null;
  state: IdentityIntentState;
  expiresAt: string | null;
  message: string;
  conflictReason?: IdentityIntentConflictReason;
  nextAction?: "login" | "restart";
};

export type IdentityIntentStatusResponse = {
  ok: true;
  intentId: string;
  channel: IdentityIntentChannel;
  state: IdentityIntentState;
  expiresAt: string | null;
  verifiedAt: string | null;
  consumedAt: string | null;
  conflictReason?: IdentityIntentConflictReason;
  canConsume: boolean;
};

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

export async function startIdentityIntent(params: {
  channel?: IdentityIntentChannel;
  email?: string;
  metadata?: Record<string, unknown>;
}): Promise<StartIdentityIntentResponse> {
  return authGateway.startIdentityIntent(params);
}

export async function verifyIdentityIntent(params: {
  intentId: string;
  code: string;
}): Promise<VerifyIdentityIntentResponse> {
  return authGateway.verifyIdentityIntent(params);
}

export async function getIdentityIntentStatus(
  intentId: string
): Promise<IdentityIntentStatusResponse> {
  return authGateway.getIdentityIntentStatus(intentId);
}

export type PasswordStatusResponse = {
  ok: boolean;
  hasPassword: boolean;
  state: "none" | "active" | "reset_pending" | "locked_temp";
  lockedUntil: string | null;
  lastPasswordChangeAt: string | null;
};

export type IdentityCompletionStatusResponse = {
  ok: true;
  userId: string;
  identityVerified: boolean;
  accountFinalized: boolean;
  hasPassword: boolean;
  firstPasswordRequired: boolean;
  completionState:
    | "pending_identity_verification"
    | "pending_account_finalization"
    | "pending_first_password"
    | "completed";
  identityVerifiedAt: string | null;
  accountFinalizedAt: string | null;
  firstPasswordSetAt: string | null;
  completedAt: string | null;
  source: string | null;
};

export type FirstPasswordStatusResponse = {
  ok: true;
  userId: string;
  required: boolean;
  hasPassword: boolean;
  completionState:
    | "pending_identity_verification"
    | "pending_account_finalization"
    | "pending_first_password"
    | "completed";
  completed: boolean;
};

export type FirstPasswordCompleteResponse = {
  ok: boolean;
  message: string;
  firstPasswordRequired?: boolean;
  completionState?:
    | "pending_identity_verification"
    | "pending_account_finalization"
    | "pending_first_password"
    | "completed";
  completed?: boolean;
};

export async function getPasswordStatus(): Promise<PasswordStatusResponse> {
  return api.get<PasswordStatusResponse>("/auth/password/status");
}

export async function getIdentityCompletionStatus(): Promise<IdentityCompletionStatusResponse> {
  return api.get<IdentityCompletionStatusResponse>("/auth/identity/completion");
}

export async function getFirstPasswordStatus(): Promise<FirstPasswordStatusResponse> {
  return api.get<FirstPasswordStatusResponse>("/auth/password/first/status");
}

export async function completeFirstPassword(
  newPassword: string
): Promise<FirstPasswordCompleteResponse> {
  return api.post<FirstPasswordCompleteResponse>(
    "/auth/password/first/complete",
    { newPassword },
    { notifyDataUpdate: false }
  );
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

export type VerifyPasswordResetCodeResponse = {
  ok: boolean;
  message: string;
  recoveryToken?: string;
};

export async function verifyPasswordResetCode(params: {
  email: string;
  token: string;
}): Promise<VerifyPasswordResetCodeResponse> {
  return api.post<VerifyPasswordResetCodeResponse>(
    "/auth/recovery/verify",
    {
      email: params.email,
      code: params.token,
    },
    { notifyDataUpdate: false }
  );
}

export async function resetPasswordWithRecoveryToken(params: {
  email: string;
  recoveryToken: string;
  newPassword: string;
}): Promise<SavePasswordResponse> {
  return api.post<SavePasswordResponse>(
    "/auth/password/reset",
    {
      email: params.email,
      recoveryToken: params.recoveryToken,
      newPassword: params.newPassword,
    },
    { notifyDataUpdate: false }
  );
}

export async function confirmPasswordReset(params: {
  email: string;
  token: string;
  newPassword: string;
}): Promise<SavePasswordResponse> {
  const verification = await verifyPasswordResetCode({
    email: params.email,
    token: params.token,
  });
  if (!verification.ok || !verification.recoveryToken) {
    throw new Error(verification.message || "Код восстановления недействителен.");
  }
  const reset = await resetPasswordWithRecoveryToken({
    email: params.email,
    recoveryToken: verification.recoveryToken,
    newPassword: params.newPassword,
  });
  if (!reset.ok) {
    throw new Error(reset.message || "Не удалось обновить пароль.");
  }
  return reset;
}

export function buildSocialLoginStartUrl(
  provider: SocialProvider,
  redirectPath?: string
): string {
  const base = getApiBase();
  const target = new URL(`${base}/auth/oauth/${provider}/start`, window.location.origin);
  const normalizedRedirect = redirectPath?.trim();
  if (normalizedRedirect) {
    target.searchParams.set("redirect", normalizedRedirect);
  }
  return target.toString();
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
    const authUser = readStorage<User | null>(AUTH_STORAGE_KEY, null);
    if (!authUser || authUser.role !== "teacher") {
      return [];
    }
    try {
      const context = await api.get<TeacherDashboardContextResponseContract>(
        "/teacher/context",
        {
          dedupe: options?.forceFresh ? false : undefined,
          cacheTtlMs: options?.forceFresh ? 0 : undefined,
        }
      );
      return context.students;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        return [];
      }
      throw error;
    }
  }
  return [];
}

export async function getPublicTeachers(): Promise<User[]> {
  return api.get<User[]>("/public/teachers", {
    dedupe: false,
    cacheTtlMs: 0,
  });
}
