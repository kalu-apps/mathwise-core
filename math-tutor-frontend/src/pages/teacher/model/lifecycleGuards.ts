import { ApiError } from "@/shared/api/client";

export const TEACHER_UNAUTHORIZED_COOLDOWN_MS = 60_000;

export const isTeacherScopeAccessError = (error: unknown): boolean => {
  if (!(error instanceof ApiError)) return false;
  return (
    error.status === 401 ||
    error.status === 403 ||
    error.code === "unauthorized" ||
    error.code === "forbidden"
  );
};

export const shouldRunTeacherScopedRequest = (params: {
  userId?: string;
  isTeacher: boolean;
  blockedUntilTs: number;
  nowTs?: number;
}) => {
  if (!params.userId || !params.isTeacher) return false;
  const nowTs = params.nowTs ?? Date.now();
  return nowTs >= params.blockedUntilTs;
};
