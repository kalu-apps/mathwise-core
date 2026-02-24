import type { AssistantResponseBlock } from "../../../../shared/api/assistant-contracts";

export type LlmRenderRequest = {
  role: "student" | "teacher";
  mode: import("../../../../shared/api/assistant-contracts").AssistantMode;
  message?: string;
  blocks: AssistantResponseBlock[];
};

export type LlmRenderResponse = {
  blocks: AssistantResponseBlock[];
};

export interface LlmProvider {
  readonly id: string;
  renderStructuredResponse(input: LlmRenderRequest): Promise<LlmRenderResponse>;
}
