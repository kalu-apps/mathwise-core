import {
  createHybridAccessGateway,
  createHybridAuthGateway,
  createHybridBookingsGateway,
  createHybridCoursesGateway,
  createHybridLessonsGateway,
  createHybridProfileGateway,
  createHybridPurchasesGateway,
} from "./hybridGateway";
import {
  httpAccessGateway,
  httpBookingsGateway,
  httpCoursesGateway,
  httpGateway,
  httpLessonsGateway,
  httpProfileGateway,
  httpPurchasesGateway,
} from "./httpGateway";
import {
  mockAccessGateway,
  mockBookingsGateway,
  mockCoursesGateway,
  mockGateway,
  mockLessonsGateway,
  mockProfileGateway,
  mockPurchasesGateway,
} from "./mockGateway";
import type {
  AccessGateway,
  AuthGateway,
  BookingsGateway,
  CoursesGateway,
  GatewayMode,
  GatewayRuntimeConfig,
  GatewayTransport,
  LessonsGateway,
  ProfileGateway,
  PurchasesGateway,
} from "./types";

type FrontendAppEnv = "local" | "preview" | "stage" | "prod";

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

const normalizeFrontendAppEnv = (
  raw: string | undefined
): FrontendAppEnv => {
  const value = (raw ?? "local").trim().toLowerCase();
  if (value === "local") return "local";
  if (value === "preview") return "preview";
  if (value === "stage" || value === "staging") return "stage";
  if (value === "prod" || value === "production") return "prod";
  return "local";
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
      profileTransport: "mock",
      purchasesTransport: "mock",
      bookingsTransport: "mock",
    };
  }
  if (mode === "http") {
    return {
      mode,
      authTransport: "http",
      coursesTransport: "http",
      lessonsTransport: "http",
      accessTransport: "http",
      profileTransport: "http",
      purchasesTransport: "http",
      bookingsTransport: "http",
    };
  }

  const isDev = Boolean(import.meta.env.DEV);
  const authTransport = normalizeTransport(
    import.meta.env.VITE_GATEWAY_AUTH_MODE ??
      import.meta.env.VITE_GATEWAY_AUTH_TRANSPORT ??
      readNodeEnv("GATEWAY_AUTH_MODE") ??
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
  const profileTransport = normalizeTransport(
    import.meta.env.VITE_GATEWAY_PROFILE_MODE ??
      readNodeEnv("GATEWAY_PROFILE_MODE"),
    authTransport
  );
  const purchasesTransport = normalizeTransport(
    import.meta.env.VITE_GATEWAY_PURCHASES_MODE ??
      readNodeEnv("GATEWAY_PURCHASES_MODE"),
    coursesTransport
  );
  const bookingsTransport = normalizeTransport(
    import.meta.env.VITE_GATEWAY_BOOKINGS_MODE ??
      readNodeEnv("GATEWAY_BOOKINGS_MODE"),
    profileTransport
  );

  return {
    mode: "hybrid",
    authTransport,
    coursesTransport,
    lessonsTransport,
    accessTransport,
    profileTransport,
    purchasesTransport,
    bookingsTransport,
  };
};

const gatewayRuntimeConfig = resolveGatewayRuntimeConfig();
const frontendAppEnv = normalizeFrontendAppEnv(
  import.meta.env.VITE_APP_ENV ?? readNodeEnv("APP_ENV")
);

const hasMockTransportInRuntime = (config: GatewayRuntimeConfig) =>
  [
    config.authTransport,
    config.coursesTransport,
    config.lessonsTransport,
    config.accessTransport,
    config.profileTransport,
    config.purchasesTransport,
    config.bookingsTransport,
  ].some((transport) => transport === "mock");

if (
  (frontendAppEnv === "stage" || frontendAppEnv === "prod") &&
  hasMockTransportInRuntime(gatewayRuntimeConfig)
) {
  // eslint-disable-next-line no-console
  console.warn(
    "[gateway-runtime] mock transport active in non-local app env",
    {
      appEnv: frontendAppEnv,
      mode: gatewayRuntimeConfig.mode,
    }
  );
}

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
const hybridProfileGateway = createHybridProfileGateway(
  () => gatewayRuntimeConfig.profileTransport
);
const hybridPurchasesGateway = createHybridPurchasesGateway(
  () => gatewayRuntimeConfig.purchasesTransport
);
const hybridBookingsGateway = createHybridBookingsGateway(
  () => gatewayRuntimeConfig.bookingsTransport
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

const selectProfileGateway = (config: GatewayRuntimeConfig): ProfileGateway => {
  if (config.mode === "mock") return mockProfileGateway;
  if (config.mode === "http") return httpProfileGateway;
  return hybridProfileGateway;
};

const selectPurchasesGateway = (
  config: GatewayRuntimeConfig
): PurchasesGateway => {
  if (config.mode === "mock") return mockPurchasesGateway;
  if (config.mode === "http") return httpPurchasesGateway;
  return hybridPurchasesGateway;
};

const selectBookingsGateway = (
  config: GatewayRuntimeConfig
): BookingsGateway => {
  if (config.mode === "mock") return mockBookingsGateway;
  if (config.mode === "http") return httpBookingsGateway;
  return hybridBookingsGateway;
};

export const authGateway = selectAuthGateway(gatewayRuntimeConfig);
export const coursesGateway = selectCoursesGateway(gatewayRuntimeConfig);
export const lessonsGateway = selectLessonsGateway(gatewayRuntimeConfig);
export const accessGateway = selectAccessGateway(gatewayRuntimeConfig);
export const profileGateway = selectProfileGateway(gatewayRuntimeConfig);
export const purchaseGateway = selectPurchasesGateway(gatewayRuntimeConfig);
export const bookingGateway = selectBookingsGateway(gatewayRuntimeConfig);

export { gatewayRuntimeConfig };
export type { GatewayMode, GatewayRuntimeConfig, GatewayTransport } from "./types";
