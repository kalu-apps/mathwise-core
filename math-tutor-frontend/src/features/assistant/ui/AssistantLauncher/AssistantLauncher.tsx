import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import type { AssistantUiState } from "@/shared/api/assistant-contracts";

type AssistantLauncherProps = {
  state: AssistantUiState;
  active: boolean;
  hintVisible?: boolean;
  hintText?: string;
  onClick: () => void;
  ariaLabel?: string;
};

export function AssistantLauncher({
  state,
  active,
  hintVisible = false,
  hintText = "Аксиом помогает в обучении и работе на платформе.",
  onClick,
  ariaLabel = "Открыть ассистента Аксиом",
}: AssistantLauncherProps) {
  return (
    <>
      {hintVisible ? (
        <span className="assistant-launcher__hint" aria-hidden="true">
          {hintText}
        </span>
      ) : null}
      <button
        type="button"
        className={`assistant-launcher ${active ? "is-active" : ""} is-${state}`}
        onClick={onClick}
        aria-label={ariaLabel}
      >
        <span className="assistant-launcher__pulse" aria-hidden="true">
          <AutoAwesomeRoundedIcon className="assistant-launcher__icon" />
        </span>
      </button>
    </>
  );
}
