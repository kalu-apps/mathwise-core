import { Button } from "@mui/material";
import { useNavigate } from "react-router-dom";

export function CTASection() {
  const navigate = useNavigate();
  return (
    <section className="cta">
      <div className="cta__container">
        <h2 className="cta__title">Готов начать заниматься?</h2>

        <p className="cta__subtitle">
          Выбери подходящий курс или запишись на первое занятие — мы поможем
          тебе дойти до результата
        </p>

        <Button
          variant="contained"
          size="large"
          className="cta__button"
          onClick={() => navigate("/booking")}
        >
          Записаться
        </Button>
      </div>
    </section>
  );
}
