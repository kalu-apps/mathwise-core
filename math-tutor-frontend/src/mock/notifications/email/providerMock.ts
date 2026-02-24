import type { EmailProvider } from "./types";

export const createMockEmailProvider = (): EmailProvider => ({
  name: "mock",
  async send() {
    return {
      ok: true,
      providerMessageId: `mock_${Date.now().toString(36)}`,
    };
  },
});
