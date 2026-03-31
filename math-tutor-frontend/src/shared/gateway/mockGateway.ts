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

const probeAuthSession = async (signal?: AbortSignal) => {
  const response = await fetch("/api/auth/session", {
    method: "GET",
    credentials: "include",
    signal,
  });
  return { status: response.status };
};

export const mockGateway: AuthGateway = {
  async requestMagicLink(
    email: string
  ): Promise<AuthMagicLinkRequestResponseContract> {
    return api.post<AuthMagicLinkRequestResponseContract>(
      "/auth/magic-link",
      { email },
      { notifyDataUpdate: false }
    );
  },
  async confirmMagicLink(params): Promise<AuthSessionResponseContract> {
    return api.post<AuthSessionResponseContract>(
      "/auth/magic-link/confirm",
      params,
      { notifyDataUpdate: false }
    );
  },
  async passwordLogin(params): Promise<AuthSessionResponseContract> {
    return api.post<AuthSessionResponseContract>(
      "/auth/password/login",
      params,
      { notifyDataUpdate: false }
    );
  },
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

export const mockLessonsGateway: LessonsGateway = {
  async getLessons(options): Promise<Lesson[]> {
    return api.get<Lesson[]>("/lessons", {
      dedupe: options?.forceFresh ? false : undefined,
      cacheTtlMs: options?.forceFresh ? 0 : undefined,
    });
  },
  async getLessonById(id, options): Promise<Lesson | null> {
    return api.get<Lesson | null>(`/lessons/${id}`, {
      dedupe: options?.forceFresh ? false : undefined,
      cacheTtlMs: options?.forceFresh ? 0 : undefined,
    });
  },
  async getLessonsByCourse(courseId, options): Promise<Lesson[]> {
    return api.get<Lesson[]>(`/lessons?courseId=${encodeURIComponent(courseId)}`, {
      dedupe: options?.forceFresh ? false : undefined,
      cacheTtlMs: options?.forceFresh ? 0 : undefined,
    });
  },
};

export const mockAccessGateway: AccessGateway = {
  async getCourseAccessDecision(params): Promise<CourseAccessDecision> {
    const query = new URLSearchParams();
    if (params.userId) {
      query.set("userId", params.userId);
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return api.get<CourseAccessDecision>(
      `/access/courses/${encodeURIComponent(params.courseId)}${suffix}`
    );
  },
  async getCourseAccessList(params): Promise<CourseAccessListResponse> {
    const query = new URLSearchParams();
    if (params?.userId) {
      query.set("userId", params.userId);
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return api.get<CourseAccessListResponse>(`/access/courses${suffix}`);
  },
  async getLessonAccessDecision(params): Promise<LessonAccessDecision> {
    const query = new URLSearchParams();
    if (params.userId) {
      query.set("userId", params.userId);
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return api.get<LessonAccessDecision>(
      `/access/lessons/${encodeURIComponent(params.lessonId)}${suffix}`
    );
  },
};
