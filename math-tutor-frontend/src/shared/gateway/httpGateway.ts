import { api } from "@/shared/api/client";
import type {
  AuthLogoutResponseContract,
  AuthMagicLinkRequestResponseContract,
  AuthSessionResponseContract,
} from "@/shared/contracts/auth.contract";
import type {
  CourseByIdResponseContract,
  CourseCatalogResponseContract,
} from "@/shared/contracts/course.contract";
import type { Lesson } from "@/entities/lesson/model/types";
import type {
  CourseAccessDecision,
  CourseAccessListResponse,
  LessonAccessDecision,
} from "@/domain/auth-payments/model/access";
import type {
  AccessGateway,
  AuthGateway,
  CoursesGateway,
  LessonsGateway,
} from "./types";

const readNodeEnv = (name: string) => {
  if (typeof process === "undefined") return undefined;
  return process.env?.[name];
};

const getHttpApiBase = () => {
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

const buildHttpApiUrl = (path: string) => `${getHttpApiBase()}${path}`;

const isDefaultApiBase = () => getHttpApiBase() === "/api";

const parseJson = async (response: Response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

const requestHttpJson = async <T>(
  path: string,
  options?: { method?: "GET" | "POST"; body?: unknown; signal?: AbortSignal }
): Promise<T> => {
  const response = await fetch(buildHttpApiUrl(path), {
    method: options?.method ?? "GET",
    credentials: "include",
    headers:
      options?.body !== undefined
        ? {
            "Content-Type": "application/json",
          }
        : undefined,
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options?.signal,
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
};

const buildQuerySuffix = (query: URLSearchParams) => {
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
};

const probeAuthSession = async (signal?: AbortSignal) => {
  const response = await fetch(buildHttpApiUrl("/auth/session"), {
    method: "GET",
    credentials: "include",
    signal,
  });
  return { status: response.status };
};

export const httpGateway: AuthGateway = {
  async requestMagicLink(
    email: string
  ): Promise<AuthMagicLinkRequestResponseContract> {
    return requestHttpJson<AuthMagicLinkRequestResponseContract>("/auth/magic-link", {
      method: "POST",
      body: { email },
    });
  },
  async confirmMagicLink(params): Promise<AuthSessionResponseContract> {
    return requestHttpJson<AuthSessionResponseContract>("/auth/magic-link/confirm", {
      method: "POST",
      body: params,
    });
  },
  async passwordLogin(params): Promise<AuthSessionResponseContract> {
    return requestHttpJson<AuthSessionResponseContract>("/auth/password/login", {
      method: "POST",
      body: params,
    });
  },
  async getSession(): Promise<AuthSessionResponseContract> {
    return requestHttpJson<AuthSessionResponseContract>("/auth/session");
  },
  async logout(): Promise<AuthLogoutResponseContract> {
    return requestHttpJson<AuthLogoutResponseContract>("/auth/logout", {
      method: "POST",
      body: {},
    });
  },
  probeSession: probeAuthSession,
};

export const httpCoursesGateway: CoursesGateway = {
  async getCourses(options): Promise<CourseCatalogResponseContract> {
    if (isDefaultApiBase()) {
      return api.get<CourseCatalogResponseContract>("/courses", {
        dedupe: options?.forceFresh ? false : undefined,
        cacheTtlMs: options?.forceFresh ? 0 : undefined,
      });
    }
    return requestHttpJson<CourseCatalogResponseContract>("/courses");
  },
  async getCourseById(id, options): Promise<CourseByIdResponseContract> {
    if (isDefaultApiBase()) {
      return api.get<CourseByIdResponseContract>(`/courses/${id}`, {
        dedupe: options?.forceFresh ? false : undefined,
        cacheTtlMs: options?.forceFresh ? 0 : undefined,
      });
    }
    const encodedId = encodeURIComponent(id);
    return requestHttpJson<CourseByIdResponseContract>(`/courses/${encodedId}`);
  },
};

export const httpLessonsGateway: LessonsGateway = {
  async getLessons(options): Promise<Lesson[]> {
    if (isDefaultApiBase()) {
      return api.get<Lesson[]>("/lessons", {
        dedupe: options?.forceFresh ? false : undefined,
        cacheTtlMs: options?.forceFresh ? 0 : undefined,
      });
    }
    return requestHttpJson<Lesson[]>("/lessons");
  },
  async getLessonById(id, options): Promise<Lesson | null> {
    if (isDefaultApiBase()) {
      return api.get<Lesson | null>(`/lessons/${id}`, {
        dedupe: options?.forceFresh ? false : undefined,
        cacheTtlMs: options?.forceFresh ? 0 : undefined,
      });
    }
    return requestHttpJson<Lesson | null>(`/lessons/${encodeURIComponent(id)}`);
  },
  async getLessonsByCourse(courseId, options): Promise<Lesson[]> {
    const encodedCourseId = encodeURIComponent(courseId);
    if (isDefaultApiBase()) {
      return api.get<Lesson[]>(`/lessons?courseId=${encodedCourseId}`, {
        dedupe: options?.forceFresh ? false : undefined,
        cacheTtlMs: options?.forceFresh ? 0 : undefined,
      });
    }
    return requestHttpJson<Lesson[]>(`/courses/${encodedCourseId}/lessons`);
  },
};

export const httpAccessGateway: AccessGateway = {
  async getCourseAccessDecision(params): Promise<CourseAccessDecision> {
    const query = new URLSearchParams();
    if (params.userId) {
      query.set("userId", params.userId);
    }
    const suffix = buildQuerySuffix(query);
    if (isDefaultApiBase()) {
      return api.get<CourseAccessDecision>(
        `/access/courses/${encodeURIComponent(params.courseId)}${suffix}`
      );
    }
    return requestHttpJson<CourseAccessDecision>(
      `/access/courses/${encodeURIComponent(params.courseId)}${suffix}`
    );
  },
  async getCourseAccessList(params): Promise<CourseAccessListResponse> {
    const query = new URLSearchParams();
    if (params?.userId) {
      query.set("userId", params.userId);
    }
    const suffix = buildQuerySuffix(query);
    if (isDefaultApiBase()) {
      return api.get<CourseAccessListResponse>(`/access/courses${suffix}`);
    }
    return requestHttpJson<CourseAccessListResponse>(`/access/courses${suffix}`);
  },
  async getLessonAccessDecision(params): Promise<LessonAccessDecision> {
    const query = new URLSearchParams();
    if (params.userId) {
      query.set("userId", params.userId);
    }
    const suffix = buildQuerySuffix(query);
    if (isDefaultApiBase()) {
      return api.get<LessonAccessDecision>(
        `/access/lessons/${encodeURIComponent(params.lessonId)}${suffix}`
      );
    }
    return requestHttpJson<LessonAccessDecision>(
      `/access/lessons/${encodeURIComponent(params.lessonId)}${suffix}`
    );
  },
};
