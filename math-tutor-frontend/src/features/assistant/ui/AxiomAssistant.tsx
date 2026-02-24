import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import type {
  AssistantAction,
  AssistantEntityLink,
  AssistantMode,
  AssistantRecommendation,
  AssistantRole,
} from "@/shared/api/assistant-contracts";
import { getDefaultActionsByRole } from "@/features/assistant/model/assistant.constants";
import { useAssistantController } from "@/features/assistant/model/assistant.store";
import { AssistantLauncher } from "@/features/assistant/ui/AssistantLauncher/AssistantLauncher";
import { AssistantPanel } from "@/features/assistant/ui/AssistantPanel/AssistantPanel";
import { trackAssistantEvent } from "@/features/assistant/api/assistant.api";

type AxiomAssistantProps = {
  userId: string;
  role: AssistantRole;
  mode: AssistantMode;
  className?: string;
  floating?: boolean;
};

const resolveEntityNavigation = (
  recommendation: AssistantRecommendation,
  navigate: ReturnType<typeof useNavigate>
) => {
  switch (recommendation.cta.type) {
    case "open_lesson":
    case "continue_lesson":
      if (recommendation.entity?.lessonId) {
        navigate(`/lessons/${recommendation.entity.lessonId}`);
        return;
      }
      break;
    case "open_course":
      if (recommendation.entity?.courseId) {
        navigate(`/courses/${recommendation.entity.courseId}`);
        return;
      }
      break;
    case "open_catalog":
      navigate("/courses");
      return;
    default:
      break;
  }
};

export function AxiomAssistant({
  userId,
  role,
  mode,
  className = "",
  floating = true,
}: AxiomAssistantProps) {
  const navigate = useNavigate();
  const hintStorageKey = `axiom_assistant_hint_seen_v1_${userId}`;
  const [isMinimized, setIsMinimized] = useState(false);
  const [showFirstHint, setShowFirstHint] = useState(() => {
    try {
      if (typeof window === "undefined") return false;
      return !window.localStorage.getItem(hintStorageKey);
    } catch {
      return false;
    }
  });
  const controller = useAssistantController({ userId, role, mode });
  const latest = controller.state.latest;
  const quickActions =
    latest?.quickActions?.length ? latest.quickActions : getDefaultActionsByRole(role);

  useEffect(() => {
    if (!showFirstHint) return;
    try {
      const timer = window.setTimeout(() => {
        setShowFirstHint(false);
        window.localStorage.setItem(hintStorageKey, "1");
      }, 7000);
      return () => window.clearTimeout(timer);
    } catch {
      return undefined;
    }
  }, [hintStorageKey, showFirstHint]);

  const dismissHint = () => {
    setShowFirstHint(false);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(hintStorageKey, "1");
      }
    } catch {
      // ignore storage errors
    }
  };

  const handleAction = async (action: AssistantAction) => {
    void trackAssistantEvent({
      userId,
      type: "assistant_action_clicked",
      payload: {
        actionId: action.id,
        mode,
        role,
      },
    });
    await controller.send({ actionIntent: action.id });
  };

  const handleRecommendation = (item: AssistantRecommendation) => {
    resolveEntityNavigation(item, navigate);
  };

  const handleEntityLink = (link: AssistantEntityLink) => {
    if (link.entity.lessonId) {
      navigate(`/lessons/${link.entity.lessonId}`);
      return;
    }
    if (link.entity.courseId) {
      navigate(`/courses/${link.entity.courseId}`);
      return;
    }
    navigate("/courses");
  };

  return (
    <section className={`axiom-assistant ${floating ? "is-floating" : ""} ${className}`.trim()}>
      <AssistantPanel
        open={controller.state.isPanelOpen}
        state={controller.state.uiState}
        blocks={controller.state.latest?.blocks ?? []}
        history={controller.state.history}
        quickActions={quickActions}
        message={controller.state.pendingMessage}
        loading={controller.state.isLoading}
        error={controller.state.error}
        minimized={isMinimized}
        onClose={() => {
          setIsMinimized(false);
          controller.close();
        }}
        onToggleMinimized={() => setIsMinimized((current) => !current)}
        onRetry={() => void controller.retry()}
        onSubmit={() => void controller.send({ message: controller.state.pendingMessage })}
        onMessageChange={controller.setPendingMessage}
        onAction={(action) => {
          void handleAction(action);
        }}
        onRecommendation={handleRecommendation}
        onEntityLink={handleEntityLink}
      />

      <AssistantLauncher
        state={controller.state.uiState}
        active={controller.state.isPanelOpen}
        hintVisible={showFirstHint}
        onClick={() => {
          dismissHint();
          if (controller.state.isPanelOpen && isMinimized) {
            setIsMinimized(false);
            return;
          }
          if (controller.state.isPanelOpen) {
            setIsMinimized(false);
            controller.close();
            return;
          }
          setIsMinimized(false);
          void controller.open();
        }}
      />
    </section>
  );
}
