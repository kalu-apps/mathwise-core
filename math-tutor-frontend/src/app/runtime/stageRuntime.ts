type FrontendAppEnv = "local" | "preview" | "stage" | "prod";

const readNodeEnv = (name: string) => {
  if (typeof process === "undefined") return undefined;
  return process.env?.[name];
};

const parseBoolean = (value: string | undefined, fallback: boolean) => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

export const normalizeFrontendAppEnv = (
  raw: string | undefined
): FrontendAppEnv => {
  const value = (raw ?? "local").trim().toLowerCase();
  if (value === "local") return "local";
  if (value === "preview") return "preview";
  if (value === "stage" || value === "staging") return "stage";
  if (value === "prod" || value === "production") return "prod";
  return "local";
};

export const resolveFrontendAppEnv = (): FrontendAppEnv =>
  normalizeFrontendAppEnv(import.meta.env.VITE_APP_ENV ?? readNodeEnv("APP_ENV"));

export const isStagePaymentConfirmEnabled = () => {
  const appEnv = resolveFrontendAppEnv();
  if (appEnv !== "stage") return false;
  return parseBoolean(
    import.meta.env.VITE_STAGE_PAYMENT_CONFIRM_ENABLED ??
      readNodeEnv("STAGE_PAYMENT_CONFIRM_ENABLED"),
    false
  );
};

