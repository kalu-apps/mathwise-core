import { gatewayRuntimeConfig } from "@/shared/gateway";
import { resolveHttpApiBase } from "@/shared/gateway/httpGateway";

type FrontendRuntimeAppEnv = "local" | "preview" | "stage" | "prod";
type FrontendRuntimeDiagnostics = {
  event: "frontend_runtime";
  appEnv: FrontendRuntimeAppEnv;
  releaseVersion: string;
  gatewayMode: (typeof gatewayRuntimeConfig)["mode"];
  transports: {
    auth: (typeof gatewayRuntimeConfig)["authTransport"];
    courses: (typeof gatewayRuntimeConfig)["coursesTransport"];
    lessons: (typeof gatewayRuntimeConfig)["lessonsTransport"];
    access: (typeof gatewayRuntimeConfig)["accessTransport"];
    profile: (typeof gatewayRuntimeConfig)["profileTransport"];
    purchases: (typeof gatewayRuntimeConfig)["purchasesTransport"];
    bookings: (typeof gatewayRuntimeConfig)["bookingsTransport"];
  };
  apiBaseUrl: string;
  timestamp: string;
};

type WindowWithDiagnostics = Window & {
  __MW_FRONTEND_RUNTIME__?: FrontendRuntimeDiagnostics;
};

const normalizeAppEnv = (raw: string | undefined): FrontendRuntimeAppEnv => {
  const value = (raw ?? "local").trim().toLowerCase();
  if (value === "local") return "local";
  if (value === "preview") return "preview";
  if (value === "stage" || value === "staging") return "stage";
  if (value === "prod" || value === "production") return "prod";
  return "local";
};

export const reportFrontendRuntimeDiagnostics = () => {
  const appEnv = normalizeAppEnv(import.meta.env.VITE_APP_ENV);
  const payload: FrontendRuntimeDiagnostics = {
    event: "frontend_runtime",
    appEnv,
    releaseVersion: import.meta.env.VITE_RELEASE_VERSION || "dev",
    gatewayMode: gatewayRuntimeConfig.mode,
    transports: {
      auth: gatewayRuntimeConfig.authTransport,
      courses: gatewayRuntimeConfig.coursesTransport,
      lessons: gatewayRuntimeConfig.lessonsTransport,
      access: gatewayRuntimeConfig.accessTransport,
      profile: gatewayRuntimeConfig.profileTransport,
      purchases: gatewayRuntimeConfig.purchasesTransport,
      bookings: gatewayRuntimeConfig.bookingsTransport,
    },
    apiBaseUrl: resolveHttpApiBase(),
    timestamp: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    (window as WindowWithDiagnostics).__MW_FRONTEND_RUNTIME__ = payload;
  }

  if (!import.meta.env.DEV) {
    console.info("[runtime]", payload);
  }
};
