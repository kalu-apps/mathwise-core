import { cn } from "@/shared/lib/cn";

export type OnboardingFlowStepState = "done" | "current" | "pending" | "blocked";

export type OnboardingFlowStep = {
  key: string;
  title: string;
  description: string;
  state: OnboardingFlowStepState;
};

type OnboardingFlowPanelProps = {
  kicker?: string;
  title: string;
  description?: string;
  steps: readonly OnboardingFlowStep[];
  compact?: boolean;
  className?: string;
};

const stepStateLabel: Record<OnboardingFlowStepState, string> = {
  done: "Завершено",
  current: "Текущий шаг",
  pending: "Ожидает",
  blocked: "Требует действия",
};

export function OnboardingFlowPanel({
  kicker,
  title,
  description,
  steps,
  compact = false,
  className,
}: OnboardingFlowPanelProps) {
  return (
    <section className={cn("onboarding-flow", compact && "onboarding-flow--compact", className)}>
      <header className="onboarding-flow__head">
        <div>
          {kicker ? <span className="onboarding-flow__kicker">{kicker}</span> : null}
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
      </header>

      <div className="onboarding-flow__steps">
        {steps.map((step) => (
          <article
            key={step.key}
            className={cn("onboarding-flow__step", `is-${step.state}`)}
            aria-live={step.state === "current" || step.state === "blocked" ? "polite" : undefined}
          >
            <div className="onboarding-flow__step-top">
              <strong>{step.title}</strong>
              <span>{stepStateLabel[step.state]}</span>
            </div>
            <p>{step.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
