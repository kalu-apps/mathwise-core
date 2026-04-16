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
    <div className="home-first-screen__hero-shell">
      <p className="home-first-screen__eyebrow">
        Mathwise · персональная система подготовки по математике
      </p>

      <h1 className="home-first-screen__title" id="home-first-screen-title">
        Выйдите на уверенный результат с персональной траекторией обучения
      </h1>

      <p className="home-first-screen__subtitle">
        Мы объединяем курсы, практику и индивидуальные занятия в единый маршрут,
        чтобы вы знали следующий шаг и не теряли темп.
      </p>

      <div className="home-first-screen__actions">
        <Button
          variant="contained"
          className="home-first-screen__primary-action"
          onClick={onPrimaryAction}
        >
          Перейти в каталог
        </Button>

        <Button
          variant="text"
          className="home-first-screen__secondary-action"
          onClick={onSecondaryAction}
        >
          Записаться на занятие
        </Button>
      </div>

      <dl className="home-first-screen__proof-list">
        {proofPoints.map((point) => (
          <div key={point.label} className="home-first-screen__proof-item">
            <dt>{point.label}</dt>
            <dd>{point.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
