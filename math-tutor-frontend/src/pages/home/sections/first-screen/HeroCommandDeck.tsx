import { Button } from "@mui/material";
import type { HomeProofPoint } from "./content";

type HeroCommandDeckProps = {
  proofPoints: HomeProofPoint[];
  onPrimaryAction: () => void;
  onSecondaryAction: () => void;
};

export function HeroCommandDeck({
  proofPoints,
  onPrimaryAction,
  onSecondaryAction,
}: HeroCommandDeckProps) {
  return (
    <div className="home-first-screen__hero-command">
      <h1 className="home-first-screen__title" id="home-first-screen-title">
        Соберите маршрут и держите математику в фокусе
      </h1>

      <p className="home-first-screen__subtitle">
        Курсы, практика и разборы в едином контуре. Видно, что делать дальше и
        где ускорить прогресс.
      </p>

      <div className="home-first-screen__actions">
        <Button
          variant="contained"
          className="home-first-screen__primary-action"
          onClick={onPrimaryAction}
        >
          Собрать маршрут
        </Button>

        <Button
          variant="text"
          className="home-first-screen__secondary-action"
          onClick={onSecondaryAction}
        >
          Разбор с преподавателем
        </Button>
      </div>

      <dl className="home-first-screen__proof-stream" aria-label="Ключевые преимущества">
        {proofPoints.map((point) => (
          <div key={point.label} className="home-first-screen__proof-chip">
            <dt>{point.label}</dt>
            <dd>{point.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
