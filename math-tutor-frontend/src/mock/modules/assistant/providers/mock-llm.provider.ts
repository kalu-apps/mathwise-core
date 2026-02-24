import type {
  AssistantResponseBlock,
} from "../../../../shared/api/assistant-contracts";
import type {
  LlmProvider,
  LlmRenderRequest,
  LlmRenderResponse,
} from "./llm-provider.interface";

const decorateTextBlock = (
  block: AssistantResponseBlock,
  request: LlmRenderRequest
): AssistantResponseBlock => {
  if (block.type !== "text") return block;
  if (block.text.trim().length === 0) return block;
  if (request.role === "teacher") {
    return {
      ...block,
      text: `${block.text}\n\nИсточник: детерминированная модель платформы (mock provider).`,
    };
  }
  return block;
};

export class MockLlmProvider implements LlmProvider {
  public readonly id = "mock-llm-v1";

  public async renderStructuredResponse(
    input: LlmRenderRequest
  ): Promise<LlmRenderResponse> {
    const blocks = input.blocks.map((block, index) => {
      if (index !== 0) return block;
      return decorateTextBlock(block, input);
    });
    return { blocks };
  }
}
