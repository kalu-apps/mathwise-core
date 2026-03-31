import {
  httpAccessGateway,
  httpBookingsGateway,
  httpCoursesGateway,
  httpGateway,
  httpLessonsGateway,
  httpProfileGateway,
  httpPurchasesGateway,
} from "./httpGateway";
import type {
  AccessGateway,
  AuthGateway,
  BookingsGateway,
  CoursesGateway,
  GatewayRuntimeConfig,
  LessonsGateway,
  ProfileGateway,
  PurchasesGateway,
} from "./types";

type FrontendAppEnv = "local" | "preview" | "stage" | "prod";

const HTTP_ONLY_RUNTIME_CONFIG: GatewayRuntimeConfig = {
  mode: "http",
  authTransport: "http",
  coursesTransport: "http",
  lessonsTransport: "http",
  accessTransport: "http",
  profileTransport: "http",
  purchasesTransport: "http",
  bookingsTransport: "http",
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

const warnOnLegacyGatewayMode = (mode: string | undefined, appEnv: FrontendAppEnv) => {
  const normalized = mode?.trim().toLowerCase();
  if (!normalized || normalized === "http") return;
  console.warn("[gateway-runtime] legacy gateway mode is ignored; backend http transport is always used", {
    appEnv,
    requestedMode: normalized,
  });
};

export const resolveGatewayRuntimeConfig = (): GatewayRuntimeConfig => {
  const appEnv = normalizeFrontendAppEnv(
    import.meta.env.VITE_APP_ENV ?? readNodeEnv("APP_ENV")
  );
  const requestedMode =
    import.meta.env.VITE_GATEWAY_MODE ?? readNodeEnv("GATEWAY_MODE");

  warnOnLegacyGatewayMode(requestedMode, appEnv);
  return HTTP_ONLY_RUNTIME_CONFIG;
};

const gatewayRuntimeConfig = resolveGatewayRuntimeConfig();

const authGateway: AuthGateway = httpGateway;
const coursesGateway: CoursesGateway = httpCoursesGateway;
const lessonsGateway: LessonsGateway = httpLessonsGateway;
const accessGateway: AccessGateway = httpAccessGateway;
const profileGateway: ProfileGateway = httpProfileGateway;
const purchaseGateway: PurchasesGateway = httpPurchasesGateway;
const bookingGateway: BookingsGateway = httpBookingsGateway;

export {
  authGateway,
  coursesGateway,
  lessonsGateway,
  accessGateway,
  profileGateway,
  purchaseGateway,
  bookingGateway,
  gatewayRuntimeConfig,
};

export type { GatewayMode, GatewayRuntimeConfig, GatewayTransport } from "./types";
