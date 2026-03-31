import {
  createHybridAccessGateway,
  createHybridAuthGateway,
  createHybridCoursesGateway,
  createHybridLessonsGateway,
} from "./hybridGateway";
import {
  httpAccessGateway,
  httpCoursesGateway,
  httpGateway,
  httpLessonsGateway,
} from "./httpGateway";
import {
  mockAccessGateway,
  mockCoursesGateway,
  mockGateway,
  mockLessonsGateway,
} from "./mockGateway";
import type {
  AccessGateway,
  AuthGateway,
  CoursesGateway,
  GatewayMode,
  GatewayRuntimeConfig,
  GatewayTransport,
  LessonsGateway,
} from "./types";

const normalizeMode = (
  value: string | undefined,
  fallback: GatewayMode
): GatewayMode => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "mock" || normalized === "http" || normalized === "hybrid") {
    return normalized;
  }
  return fallback;
};

const normalizeTransport = (
  value: string | undefined,
  fallback: GatewayTransport
): GatewayTransport => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "mock" || normalized === "http") {
    return normalized;
  }
  return fallback;
};

const readNodeEnv = (name: string) => {
  if (typeof process === "undefined") return undefined;
  return process.env?.[name];
};

export const resolveGatewayRuntimeConfig = (): GatewayRuntimeConfig => {
  const mode = normalizeMode(
    import.meta.env.VITE_GATEWAY_MODE ?? readNodeEnv("GATEWAY_MODE"),
    "hybrid"
  );

  if (mode === "mock") {
    return {
      mode,
      authTransport: "mock",
      coursesTransport: "mock",
      lessonsTransport: "mock",
      accessTransport: "mock",
    };
  }
  if (mode === "http") {
    return {
      mode,
      authTransport: "http",
      coursesTransport: "http",
      lessonsTransport: "http",
      accessTransport: "http",
    };
  }

  const isDev = Boolean(import.meta.env.DEV);
  const authTransport = normalizeTransport(
    import.meta.env.VITE_GATEWAY_AUTH_TRANSPORT ??
      readNodeEnv("GATEWAY_AUTH_TRANSPORT"),
    isDev ? "mock" : "http"
  );
  const coursesTransport = normalizeTransport(
    import.meta.env.VITE_GATEWAY_COURSES_MODE ??
      readNodeEnv("GATEWAY_COURSES_MODE"),
    "http"
  );
  const lessonsTransport = normalizeTransport(
    import.meta.env.VITE_GATEWAY_LESSONS_MODE ??
      readNodeEnv("GATEWAY_LESSONS_MODE"),
    coursesTransport
  );
  const accessTransport = normalizeTransport(
    import.meta.env.VITE_GATEWAY_ACCESS_MODE ??
      readNodeEnv("GATEWAY_ACCESS_MODE"),
    coursesTransport
  );

  return {
    mode: "hybrid",
    authTransport,
    coursesTransport,
    lessonsTransport,
    accessTransport,
  };
};

const gatewayRuntimeConfig = resolveGatewayRuntimeConfig();

const hybridAuthGateway = createHybridAuthGateway(
  () => gatewayRuntimeConfig.authTransport
);
const hybridCoursesGateway = createHybridCoursesGateway(
  () => gatewayRuntimeConfig.coursesTransport
);
const hybridLessonsGateway = createHybridLessonsGateway(
  () => gatewayRuntimeConfig.lessonsTransport
);
const hybridAccessGateway = createHybridAccessGateway(
  () => gatewayRuntimeConfig.accessTransport
);

const selectAuthGateway = (config: GatewayRuntimeConfig): AuthGateway => {
  if (config.mode === "mock") return mockGateway;
  if (config.mode === "http") return httpGateway;
  return hybridAuthGateway;
};

const selectCoursesGateway = (config: GatewayRuntimeConfig): CoursesGateway => {
  if (config.mode === "mock") return mockCoursesGateway;
  if (config.mode === "http") return httpCoursesGateway;
  return hybridCoursesGateway;
};

const selectLessonsGateway = (config: GatewayRuntimeConfig): LessonsGateway => {
  if (config.mode === "mock") return mockLessonsGateway;
  if (config.mode === "http") return httpLessonsGateway;
  return hybridLessonsGateway;
};

const selectAccessGateway = (config: GatewayRuntimeConfig): AccessGateway => {
  if (config.mode === "mock") return mockAccessGateway;
  if (config.mode === "http") return httpAccessGateway;
  return hybridAccessGateway;
};

export const authGateway = selectAuthGateway(gatewayRuntimeConfig);
export const coursesGateway = selectCoursesGateway(gatewayRuntimeConfig);
export const lessonsGateway = selectLessonsGateway(gatewayRuntimeConfig);
export const accessGateway = selectAccessGateway(gatewayRuntimeConfig);

export { gatewayRuntimeConfig };
export type { GatewayMode, GatewayRuntimeConfig, GatewayTransport } from "./types";
