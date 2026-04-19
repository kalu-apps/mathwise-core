import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const reviewPages = useMemo(() => {
    const pageSize = 4;
    const pages: AboutTeacherAsset[][] = [];
    for (let index = 0; index < items.length; index += pageSize) {
      pages.push(items.slice(index, index + pageSize));
    }
    return pages;
  }, [items]);
  const hasMultiplePages = reviewPages.length > 1;
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(hasMultiplePages);

  const updateScrollState = useCallback(() => {
    const node = railRef.current;
    if (!node) return;
    const tolerance = 4;
    const maxScrollLeft = Math.max(0, node.scrollWidth - node.clientWidth);
    setCanScrollPrev(node.scrollLeft > tolerance);
    setCanScrollNext(node.scrollLeft < maxScrollLeft - tolerance);
  }, []);

  useEffect(() => {
    setCanScrollPrev(false);
    setCanScrollNext(hasMultiplePages);
    updateScrollState();
  }, [hasMultiplePages, reviewPages.length, updateScrollState]);

  useEffect(() => {
    const node = railRef.current;
    if (!node) return;

    const onScroll = () => updateScrollState();
    node.addEventListener("scroll", onScroll, { passive: true });

    const observer = new ResizeObserver(() => updateScrollState());
    observer.observe(node);

    return () => {
      node.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [updateScrollState]);

  const scrollRail = (direction: "prev" | "next") => {
    const node = railRef.current;
    if (!node) return;
    const amount = Math.max(320, Math.round(node.clientWidth * 0.92));
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
      </div>

      {items.length > 0 ? (
        <div
          className={`about-teacher-reviews__shelf ${
            hasMultiplePages
              ? "about-teacher-reviews__shelf--with-nav"
              : "about-teacher-reviews__shelf--without-nav"
          }`}
        >
          {hasMultiplePages ? (
            <IconButton
              className={`about-teacher-reviews__shelf-nav about-teacher-reviews__shelf-nav--prev ${
                canScrollPrev ? "" : "is-inactive"
              }`}
              aria-label="Предыдущие отзывы"
              onClick={() => {
                if (!canScrollPrev) return;
                scrollRail("prev");
              }}
              disableRipple
              disableTouchRipple
            >
              <ChevronLeftRoundedIcon />
            </IconButton>
          ) : null}

          <div className="about-teacher-reviews__rail" ref={railRef}>
            {reviewPages.map((page, pageIndex) => (
              <div key={`review-page-${pageIndex}`} className="about-teacher-reviews__page">
                {page.map((item, itemIndex) => (
                  <article key={item.key} className="about-teacher-reviews__card">
                    <AssetImage
                      src={item.url}
                      alt={`Реальный отзыв ученика ${pageIndex * 4 + itemIndex + 1}`}
                      ratio="16 / 10"
                      className="about-teacher-reviews__screenshot"
                      showFallback
                      fallbackText="Отзыв недоступен"
                    />
                  </article>
                ))}
              </div>
            ))}
          </div>

          {hasMultiplePages ? (
            <IconButton
              className={`about-teacher-reviews__shelf-nav about-teacher-reviews__shelf-nav--next ${
                canScrollNext ? "" : "is-inactive"
              }`}
              aria-label="Следующие отзывы"
              onClick={() => {
                if (!canScrollNext) return;
                scrollRail("next");
              }}
              disableRipple
              disableTouchRipple
            >
              <ChevronRightRoundedIcon />
            </IconButton>
          ) : null}
        </div>
      ) : (
        <div className="about-teacher-reviews__empty">
          Отзывы пока загружаются. Скоро здесь появятся реальные скриншоты результатов учеников.
        </div>
      )}
    </section>
  );
}
