import { useMemo, useRef } from "react";
import { IconButton } from "@mui/material";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import type { AboutTeacherAsset } from "../model/types";
import { AssetImage } from "./AssetImage";

type AboutTeacherReviewsProps = {
  reviews: AboutTeacherAsset[];
};

export function AboutTeacherReviews({ reviews }: AboutTeacherReviewsProps) {
  const railRef = useRef<HTMLDivElement | null>(null);

  const items = useMemo(() => reviews, [reviews]);

  const scrollRail = (direction: "prev" | "next") => {
    const node = railRef.current;
    if (!node) return;
    const amount = Math.max(280, Math.round(node.clientWidth * 0.85));
    node.scrollBy({
      left: direction === "next" ? amount : -amount,
      behavior: "smooth",
    });
  };

  return (
    <section className="about-teacher-reviews" aria-labelledby="about-teacher-reviews-title">
      <div className="about-teacher-reviews__head">
        <div>
          <span className="about-teacher-reviews__eyebrow">Отзывы учеников</span>
          <h2 id="about-teacher-reviews-title">Говорят результатом, а не обещаниями</h2>
          <p>Реальные впечатления учеников после системной работы по программе.</p>
        </div>
        <div className="about-teacher-reviews__controls">
          <IconButton
            aria-label="Предыдущие отзывы"
            onClick={() => scrollRail("prev")}
            disabled={items.length <= 1}
          >
            <ChevronLeftRoundedIcon />
          </IconButton>
          <IconButton
            aria-label="Следующие отзывы"
            onClick={() => scrollRail("next")}
            disabled={items.length <= 1}
          >
            <ChevronRightRoundedIcon />
          </IconButton>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="about-teacher-reviews__rail" ref={railRef}>
          {items.map((item, index) => (
            <article key={item.key} className="about-teacher-reviews__card">
              <AssetImage
                src={item.url}
                alt={`Реальный отзыв ученика ${index + 1}`}
                ratio="16 / 10"
                className="about-teacher-reviews__screenshot"
                showFallback
                fallbackText="Отзыв недоступен"
              />
            </article>
          ))}
        </div>
      ) : (
        <div className="about-teacher-reviews__empty">
          Отзывы пока загружаются. Скоро здесь появятся реальные скриншоты результатов учеников.
        </div>
      )}
    </section>
  );
}
