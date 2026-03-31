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

const probeAuthSession = async (signal?: AbortSignal) => {
  const response = await fetch("/api/auth/session", {
    method: "GET",
    credentials: "include",
    signal,
  });
  return { status: response.status };
};

export const mockGateway: AuthGateway = {
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

export const mockCoursesGateway: CoursesGateway = {
  async getCourses(options): Promise<CourseCatalogResponseContract> {
    return api.get<CourseCatalogResponseContract>("/courses", {
      dedupe: options?.forceFresh ? false : undefined,
      cacheTtlMs: options?.forceFresh ? 0 : undefined,
    });
  },
  async getCourseById(id, options): Promise<CourseByIdResponseContract> {
    return api.get<CourseByIdResponseContract>(`/courses/${id}`, {
      dedupe: options?.forceFresh ? false : undefined,
      cacheTtlMs: options?.forceFresh ? 0 : undefined,
    });
  },
};
