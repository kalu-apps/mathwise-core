import type { EmailProvider } from "./types";

type ResendConfig = {
  apiKey: string;
  from: string;
  replyTo?: string;
};

const DEFAULT_ENDPOINT = "https://api.resend.com/emails";

export const createResendEmailProvider = (
  config: ResendConfig
): EmailProvider => ({
  name: "resend",
  async send(input) {
    if (!config.apiKey || !config.from) {
      return {
        ok: false,
        errorCode: "resend_not_configured",
        errorMessage: "Email provider config is incomplete.",
        retryable: false,
      };
    }

    try {
      const response = await fetch(DEFAULT_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: config.from,
          to: [input.to],
          subject: input.subject,
          text: input.text,
          html: input.html,
          reply_to: config.replyTo,
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | { id?: string; error?: { name?: string; message?: string } }
        | null;

      if (!response.ok) {
        return {
          ok: false,
          errorCode: body?.error?.name ?? `http_${response.status}`,
          errorMessage:
            body?.error?.message ??
            `Resend request failed with status ${response.status}.`,
          retryable: response.status >= 500,
        };
      }

      return {
        ok: true,
        providerMessageId: body?.id,
      };
    } catch (error) {
      return {
        ok: false,
        errorCode: "resend_network_error",
        errorMessage:
          error instanceof Error ? error.message : "Network error while sending email.",
        retryable: true,
      };
    }
  },
});
