import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, IconButton } from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
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
  const [activePage, setActivePage] = useState(0);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(hasMultiplePages);
  const [openReviewIndex, setOpenReviewIndex] = useState<number | null>(null);
  const [previewErroredUrl, setPreviewErroredUrl] = useState<string | null>(null);

  const isPreviewOpen =
    openReviewIndex !== null && openReviewIndex >= 0 && openReviewIndex < items.length;
  const currentReview = isPreviewOpen && openReviewIndex !== null ? items[openReviewIndex] : null;
  const isCurrentReviewErrored =
    Boolean(currentReview?.url) && currentReview?.url === previewErroredUrl;

  const updateScrollState = useCallback(() => {
    const node = railRef.current;
    if (!node) return;
    const pageWidth = node.clientWidth;
    const maxPageIndex = Math.max(0, reviewPages.length - 1);
    const currentPage =
      pageWidth > 0
        ? Math.min(maxPageIndex, Math.max(0, Math.round(node.scrollLeft / pageWidth)))
        : 0;

    setActivePage(currentPage);
    setCanScrollPrev(currentPage > 0);
    setCanScrollNext(currentPage < maxPageIndex);
  }, [reviewPages.length]);

  useEffect(() => {
    const node = railRef.current;
    if (node) {
      node.scrollLeft = 0;
    }
    const frame = window.requestAnimationFrame(() => {
      updateScrollState();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
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
    const maxPageIndex = Math.max(0, reviewPages.length - 1);
    const targetPage = Math.min(
      maxPageIndex,
      Math.max(0, activePage + (direction === "next" ? 1 : -1))
    );
    setActivePage(targetPage);
    setCanScrollPrev(targetPage > 0);
    setCanScrollNext(targetPage < maxPageIndex);
    node.scrollTo({
      left: targetPage * node.clientWidth,
      behavior: "smooth",
    });
  };

  const movePreview = (direction: "prev" | "next") => {
    if (!items.length || openReviewIndex === null) return;
    const delta = direction === "next" ? 1 : -1;
    const target = (openReviewIndex + delta + items.length) % items.length;
    setOpenReviewIndex(target);
  };

  return (
    <>
      <section className="about-teacher-reviews" aria-labelledby="about-teacher-reviews-title">
        <div className="about-teacher-reviews__head">
          <div>
            <h2 id="about-teacher-reviews-title">
              Впечатления учеников после системной работы по программе
            </h2>
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
                  {page.map((item, itemIndex) => {
                    const absoluteIndex = pageIndex * 4 + itemIndex;
                    return (
                      <article key={item.key} className="about-teacher-reviews__card">
                        <AssetImage
                          src={item.url}
                          alt={`Реальный отзыв ученика ${absoluteIndex + 1}`}
                          ratio="16 / 10"
                          fit="contain"
                          className="about-teacher-reviews__screenshot"
                          onClick={() => setOpenReviewIndex(absoluteIndex)}
                          showFallback
                          fallbackText="Отзыв недоступен"
                        />
                      </article>
                    );
                  })}
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

      <Dialog
        open={isPreviewOpen}
        onClose={() => setOpenReviewIndex(null)}
        maxWidth="xl"
        fullWidth
        className="about-teacher-reviews-lightbox"
      >
        <div className="about-teacher-reviews-lightbox__stage">
          <IconButton
            className="about-teacher-reviews-lightbox__close"
            aria-label="Закрыть предпросмотр отзыва"
            onClick={() => setOpenReviewIndex(null)}
          >
            <CloseRoundedIcon />
          </IconButton>
          {items.length > 1 ? (
            <IconButton
              className="about-teacher-reviews-lightbox__nav"
              aria-label="Предыдущий отзыв"
              onClick={() => movePreview("prev")}
            >
              <ChevronLeftRoundedIcon />
            </IconButton>
          ) : null}
          <div className="about-teacher-reviews-lightbox__canvas">
            {currentReview?.url && !isCurrentReviewErrored ? (
              <img
                src={currentReview.url}
                alt="Предпросмотр отзыва ученика"
                onLoad={() => {
                  if (currentReview.url === previewErroredUrl) {
                    setPreviewErroredUrl(null);
                  }
                }}
                onError={() => setPreviewErroredUrl(currentReview.url)}
              />
            ) : (
              <div className="about-teacher-reviews-lightbox__fallback">
                Не удалось загрузить изображение отзыва.
              </div>
            )}
          </div>

          {items.length > 1 ? (
            <IconButton
              className="about-teacher-reviews-lightbox__nav"
              aria-label="Следующий отзыв"
              onClick={() => movePreview("next")}
            >
              <ChevronRightRoundedIcon />
            </IconButton>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
