import type {
  AuthLogoutResponseContract,
  AuthSessionProbeResultContract,
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

export type GatewayMode = "mock" | "http" | "hybrid";
export type GatewayTransport = "mock" | "http";

export type GatewayRuntimeConfig = {
  mode: GatewayMode;
  authTransport: GatewayTransport;
  coursesTransport: GatewayTransport;
  lessonsTransport: GatewayTransport;
  accessTransport: GatewayTransport;
};

export type AuthGateway = {
  getSession: () => Promise<AuthSessionResponseContract>;
  logout: () => Promise<AuthLogoutResponseContract>;
  probeSession: (signal?: AbortSignal) => Promise<AuthSessionProbeResultContract>;
};

export type CoursesGateway = {
  getCourses: (options?: { forceFresh?: boolean }) => Promise<CourseCatalogResponseContract>;
  getCourseById: (
    id: string,
    options?: { forceFresh?: boolean }
  ) => Promise<CourseByIdResponseContract>;
};

export type LessonsGateway = {
  getLessons: (options?: { forceFresh?: boolean }) => Promise<Lesson[]>;
  getLessonById: (
    id: string,
    options?: { forceFresh?: boolean }
  ) => Promise<Lesson | null>;
  getLessonsByCourse: (
    courseId: string,
    options?: { forceFresh?: boolean }
  ) => Promise<Lesson[]>;
};

export type AccessGateway = {
  getCourseAccessDecision: (params: {
    courseId: string;
    userId?: string;
  }) => Promise<CourseAccessDecision>;
  getCourseAccessList: (params?: {
    userId?: string;
  }) => Promise<CourseAccessListResponse>;
  getLessonAccessDecision: (params: {
    lessonId: string;
    userId?: string;
  }) => Promise<LessonAccessDecision>;
};
