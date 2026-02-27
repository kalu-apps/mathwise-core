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
  const [isMinimized, setIsMinimized] = useState(false);
  const controller = useAssistantController({ userId, role, mode });
  const latest = controller.state.latest;
  const quickActions =
    latest?.quickActions?.length ? latest.quickActions : getDefaultActionsByRole(role);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleToggle = () => {
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
    };

    window.addEventListener("axiom:toggle", handleToggle);
    return () => window.removeEventListener("axiom:toggle", handleToggle);
  }, [controller, isMinimized]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    window.dispatchEvent(
      new CustomEvent("axiom:state", {
        detail: {
          available: true,
        },
      })
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("axiom:state", {
          detail: {
            available: false,
          },
        })
      );
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("axiom:state", {
        detail: {
          available: true,
          uiState: controller.state.uiState,
          isOpen: controller.state.isPanelOpen,
          isLoading: controller.state.isLoading,
          hasError: Boolean(controller.state.error),
        },
      })
    );
  }, [
    controller.state.error,
    controller.state.isLoading,
    controller.state.isPanelOpen,
    controller.state.uiState,
  ]);

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
    </section>
  );
}
