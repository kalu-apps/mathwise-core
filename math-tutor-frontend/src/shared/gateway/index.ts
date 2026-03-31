import {
  createHybridAuthGateway,
  createHybridCoursesGateway,
} from "./hybridGateway";
import { httpCoursesGateway, httpGateway } from "./httpGateway";
import { mockCoursesGateway, mockGateway } from "./mockGateway";
import type {
  AuthGateway,
  CoursesGateway,
  GatewayMode,
  GatewayRuntimeConfig,
  GatewayTransport,
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
    return { mode, authTransport: "mock", coursesTransport: "mock" };
  }
  if (mode === "http") {
    return { mode, authTransport: "http", coursesTransport: "http" };
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

  return { mode: "hybrid", authTransport, coursesTransport };
};

const gatewayRuntimeConfig = resolveGatewayRuntimeConfig();

const hybridAuthGateway = createHybridAuthGateway(
  () => gatewayRuntimeConfig.authTransport
);
const hybridCoursesGateway = createHybridCoursesGateway(
  () => gatewayRuntimeConfig.coursesTransport
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

export const authGateway = selectAuthGateway(gatewayRuntimeConfig);
export const coursesGateway = selectCoursesGateway(gatewayRuntimeConfig);

export { gatewayRuntimeConfig };
export type { GatewayMode, GatewayRuntimeConfig, GatewayTransport } from "./types";
