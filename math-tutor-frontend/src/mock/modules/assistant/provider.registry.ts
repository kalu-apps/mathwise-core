import type { ModerationProvider } from "./providers/moderation-provider.interface";
import { MockLlmProvider } from "./providers/mock-llm.provider";
import type { LlmProvider } from "./providers/llm-provider.interface";

class MockModerationProvider implements ModerationProvider {
  public readonly id = "mock-moderation-v1";

  public async moderate(input: { text: string }) {
    const normalized = input.text.toLowerCase();
    if (normalized.includes("drop table")) {
      return {
        allowed: false,
        reason: "Запрос отклонен политикой безопасности mock-провайдера.",
      };
    }
    return { allowed: true };
  }
}

export type AssistantProviderRegistry = {
  llm: LlmProvider;
  moderation: ModerationProvider;
};

const registry: AssistantProviderRegistry = {
  llm: new MockLlmProvider(),
  moderation: new MockModerationProvider(),
};

export const getAssistantProviderRegistry = (): AssistantProviderRegistry => registry;
