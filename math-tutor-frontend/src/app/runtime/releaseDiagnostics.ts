import { gatewayRuntimeConfig } from "@/shared/gateway";
import { resolveHttpApiBase } from "@/shared/gateway/httpGateway";

type FrontendRuntimeAppEnv = "local" | "preview" | "stage" | "prod";

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
  const payload = {
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
    (window as any).__MW_FRONTEND_RUNTIME__ = payload;
  }

  if (!import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info("[runtime]", payload);
  }
};
