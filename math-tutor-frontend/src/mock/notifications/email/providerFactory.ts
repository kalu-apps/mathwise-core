import { createMockEmailProvider } from "./providerMock";
import { createResendEmailProvider } from "./providerResend";
import type { AppEnv, EmailProvider, EmailTransport } from "./types";

const normalizeAppEnv = (value: string | undefined): AppEnv => {
  const normalized = (value ?? "local").trim().toLowerCase();
  if (normalized === "prod" || normalized === "production") return "prod";
  if (normalized === "stage" || normalized === "staging") return "stage";
  return "local";
};

const normalizeTransport = (
  value: string | undefined,
  appEnv: AppEnv
): EmailTransport => {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "resend") return "resend";
  if (normalized === "mock") return "mock";
  return appEnv === "local" ? "mock" : "resend";
};

export type EmailRuntimeConfig = {
  appEnv: AppEnv;
  transport: EmailTransport;
  allowAuthDebugTokens: boolean;
  provider: EmailProvider;
};

export const createEmailRuntimeConfig = (): EmailRuntimeConfig => {
  const appEnv = normalizeAppEnv(process.env.APP_ENV);
  const transport = normalizeTransport(process.env.EMAIL_TRANSPORT, appEnv);
  const allowAuthDebugTokens =
    appEnv === "local" && process.env.AUTH_DEBUG_TOKENS === "true";

  const provider =
    transport === "resend"
      ? createResendEmailProvider({
          apiKey: process.env.RESEND_API_KEY ?? "",
          from: process.env.EMAIL_FROM ?? "",
          replyTo: process.env.EMAIL_REPLY_TO,
        })
      : createMockEmailProvider();

  return {
    appEnv,
    transport,
    allowAuthDebugTokens,
    provider,
  };
};
