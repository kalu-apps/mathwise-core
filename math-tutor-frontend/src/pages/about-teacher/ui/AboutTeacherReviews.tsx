import { useMemo, useRef } from "react";
import { IconButton } from "@mui/material";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { ABOUT_TEACHER_REVIEW_FALLBACKS } from "../model/content";
import type { AboutTeacherAsset } from "../model/types";
import { AssetImage } from "./AssetImage";

type AboutTeacherReviewsProps = {
  reviews: AboutTeacherAsset[];
};

export function AboutTeacherReviews({ reviews }: AboutTeacherReviewsProps) {
  const railRef = useRef<HTMLDivElement | null>(null);

  const items = useMemo(() => {
    const max = Math.max(reviews.length, ABOUT_TEACHER_REVIEW_FALLBACKS.length);
    return Array.from({ length: max }, (_, index) => ({
      asset: reviews[index] ?? null,
      fallback:
        ABOUT_TEACHER_REVIEW_FALLBACKS[index % ABOUT_TEACHER_REVIEW_FALLBACKS.length],
    }));
  }, [reviews]);

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

      <div className="about-teacher-reviews__rail" ref={railRef}>
        {items.map((item, index) => (
          <article key={`${item.fallback.author}_${index}`} className="about-teacher-reviews__card">
            <div className="about-teacher-reviews__card-head">
              <AssetImage
                src={item.asset?.url}
                alt={`Отзыв ${item.fallback.author}`}
                ratio="1 / 1"
                className="about-teacher-reviews__avatar"
                showFallback
                fallbackText={item.fallback.author.slice(0, 1)}
              />
              <div>
                <strong>{item.fallback.author}</strong>
                <span>{item.fallback.context}</span>
              </div>
            </div>
            <p>“{item.fallback.quote}”</p>
          </article>
        ))}
      </div>
    </section>
  );
}
