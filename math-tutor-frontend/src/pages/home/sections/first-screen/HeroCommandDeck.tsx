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
      <p className="home-first-screen__eyebrow">
        Mathwise · персональная инженерия прогресса по математике
      </p>

      <h1 className="home-first-screen__title" id="home-first-screen-title">
        Управляйте подготовкой как системой и выходите на устойчивый результат
      </h1>

      <p className="home-first-screen__subtitle">
        Каталог, практика и индивидуальные занятия объединены в единый маршрут:
        вы всегда видите следующий шаг и двигаетесь к цели без хаоса.
      </p>

      <div className="home-first-screen__actions">
        <Button
          variant="contained"
          className="home-first-screen__primary-action"
          onClick={onPrimaryAction}
        >
          Построить маршрут
        </Button>

        <Button
          variant="text"
          className="home-first-screen__secondary-action"
          onClick={onSecondaryAction}
        >
          Индивидуальное занятие
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
