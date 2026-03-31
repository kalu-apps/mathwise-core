import { api } from "@/shared/api/client";
import type {
  AuthLogoutResponseContract,
  AuthSessionResponseContract,
} from "@/shared/contracts/auth.contract";
import type {
  CourseByIdResponseContract,
  CourseCatalogResponseContract,
} from "@/shared/contracts/course.contract";
import type { AuthGateway, CoursesGateway } from "./types";

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

const requestHttpJson = async <T>(path: string): Promise<T> => {
  const response = await fetch(buildHttpApiUrl(path), {
    method: "GET",
    credentials: "include",
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

const probeAuthSession = async (signal?: AbortSignal) => {
  const response = await fetch(buildHttpApiUrl("/auth/session"), {
    method: "GET",
    credentials: "include",
    signal,
  });
  return { status: response.status };
};

export const httpGateway: AuthGateway = {
  async getSession(): Promise<AuthSessionResponseContract> {
    return api.get<AuthSessionResponseContract>("/auth/session");
  },
  async logout(): Promise<AuthLogoutResponseContract> {
    return api.post<AuthLogoutResponseContract>(
      "/auth/logout",
      {},
      { notifyDataUpdate: false }
    );
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
