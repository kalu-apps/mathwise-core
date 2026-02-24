import type {
  AssistantResponseBlock,
  AssistantUiState,
} from "@/shared/api/assistant-contracts";

export const hasRenderableBlocks = (blocks: AssistantResponseBlock[]) => blocks.length > 0;

export const getUiStateLabel = (state: AssistantUiState) => {
  switch (state) {
    case "thinking":
      return "Аксиом анализирует";
    case "streaming":
      return "Формируем ответ";
    case "success":
      return "Готово";
    case "warning":
      return "Есть ограничения";
    case "error":
      return "Ошибка запроса";
    case "disabled":
      return "Недоступно";
    case "active":
      return "Готов к диалогу";
    case "hover":
      return "Выберите действие";
    case "idle":
    default:
      return "Ожидает команду";
  }
};

export const flattenBlocksToText = (blocks: AssistantResponseBlock[]): string => {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "text":
          return block.text;
        case "warning_banner":
          return block.message;
        case "recommendation_list":
          return block.items.map((item) => `${item.title}: ${item.reason}`).join("\n");
        case "kpi_cards":
          return block.items.map((item) => `${item.label}: ${item.value}`).join("\n");
        case "insight_list":
          return block.items.map((item) => `${item.problem} — ${item.action}`).join("\n");
        case "checklist":
          return block.items.map((item) => `${item.checked ? "✓" : "•"} ${item.label}`).join("\n");
        case "quick_actions":
          return block.actions.map((item) => item.label).join(", ");
        case "entity_links":
          return block.links.map((item) => item.label).join(", ");
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join("\n");
};
