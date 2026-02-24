export type EmailSendInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  template: string;
  metadata?: Record<string, unknown>;
};

export type EmailSendResult =
  | {
      ok: true;
      providerMessageId?: string;
    }
  | {
      ok: false;
      errorCode: string;
      errorMessage: string;
      retryable: boolean;
    };

export type EmailProvider = {
  name: "mock" | "resend";
  send: (input: EmailSendInput) => Promise<EmailSendResult>;
};

export type AppEnv = "local" | "stage" | "prod";

export type EmailTransport = "mock" | "resend";
