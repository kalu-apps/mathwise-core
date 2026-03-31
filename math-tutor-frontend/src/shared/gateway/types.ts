import type {
  AuthLogoutResponseContract,
  AuthSessionProbeResultContract,
  AuthSessionResponseContract,
} from "@/shared/contracts/auth.contract";
import type {
  CourseByIdResponseContract,
  CourseCatalogResponseContract,
} from "@/shared/contracts/course.contract";

export type GatewayMode = "mock" | "http" | "hybrid";
export type GatewayTransport = "mock" | "http";

export type GatewayRuntimeConfig = {
  mode: GatewayMode;
  authTransport: GatewayTransport;
  coursesTransport: GatewayTransport;
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
