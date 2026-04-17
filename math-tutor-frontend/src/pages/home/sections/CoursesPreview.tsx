import { Card, CardContent, Button, IconButton } from "@mui/material";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCourses } from "@/entities/course/model/storage";
import type { Course } from "@/entities/course/model/types";
import { CourseVisualBackground } from "@/entities/course/ui/CourseVisualBackground";

function toCompactDescriptor(description: string) {
  const normalized = description.replace(/\s+/g, " ").trim();
  if (!normalized) return "Маршрут с практикой, материалами и понятной структурой.";
  const sentence = normalized.split(/[.!?]/, 1)[0]?.trim() ?? normalized;
  if (sentence.length <= 108) return sentence;
  return `${sentence.slice(0, 105).trimEnd()}…`;
}

function toFormatLabel(course: Course) {
  if (course.priceGuided > course.priceSelf) return "2 формата обучения";
  return "Формат с практикой";
}

function toSupportLabel(course: Course) {
  if (course.priceGuided > course.priceSelf) return "С поддержкой";
  return "Самостоятельно";
}

function getSecondarySticker(index: number) {
  if (index % 2 === 0) {
    return {
      label: "Больше возможностей",
      variant: "extended",
    } as const;
  }

  return {
    label: "Закрепить тему",
    variant: "reinforce",
  } as const;
}

export function CoursesPreview() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const railRef = useRef<HTMLDivElement | null>(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const items = await getCourses();
        if (!active) return;
        setCourses(items);
      } catch {
        if (!active) return;
        setCourses([]);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const updateRailScrollState = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;

    const maxScrollLeft = Math.max(0, rail.scrollWidth - rail.clientWidth);
    const tolerance = 2;
    setCanScrollPrev(rail.scrollLeft > tolerance);
    setCanScrollNext(rail.scrollLeft < maxScrollLeft - tolerance);
  }, []);

  useEffect(() => {
    updateRailScrollState();
    const rail = railRef.current;
    if (!rail) return;

    const onScroll = () => updateRailScrollState();
    const onResize = () => updateRailScrollState();

    rail.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      rail.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [updateRailScrollState, courses.length]);

  const scrollRailByDirection = useCallback(
    (direction: "prev" | "next") => {
      const rail = railRef.current;
      if (!rail) return;
      const amount = Math.max(rail.clientWidth * 0.78, 280);
      rail.scrollBy({
        left: direction === "next" ? amount : -amount,
        behavior: "smooth",
      });
    },
    []
  );

  const publishedCourses = courses.filter(
    (course) => course.status === "published"
  );
  const previewCourses = publishedCourses.slice(0, 9);
  const previewCards = useMemo(
    () =>
      previewCourses.map((course) => ({
        ...course,
        descriptor: toCompactDescriptor(course.description),
        formatLabel: toFormatLabel(course),
        supportLabel: toSupportLabel(course),
      })),
    [previewCourses]
  );
  const previewPages = useMemo(() => {
    const pages: Array<{
      featured: (typeof previewCards)[number];
      secondary: Array<(typeof previewCards)[number]>;
    }> = [];

    for (let index = 0; index < previewCards.length; index += 3) {
      const chunk = previewCards.slice(index, index + 3);
      if (!chunk.length) continue;
      pages.push({
        featured: chunk[0],
        secondary: chunk.slice(1, 3),
      });
    }

    return pages;
  }, [previewCards]);

  if (!previewPages.length) return null;

  return (
    <section className="courses-preview">
      <div className="courses-preview__header">
        <div className="courses-preview__copy">
          <h2 className="courses-preview__heading">Выберите курс и двигайтесь по плану</h2>
          <p className="courses-preview__subtitle">
            Компактный обзор каталога: уровни, формат и быстрый переход в нужный курс.
          </p>
        </div>

        <div className="courses-preview__actions">
          <Button
            className="courses-preview__cta"
            onClick={() => navigate("/courses")}
          >
            Открыть каталог
          </Button>
        </div>
      </div>

      <div className="courses-preview__shelf">
        <IconButton
          className="courses-preview__shelf-nav courses-preview__shelf-nav--prev"
          onClick={() => scrollRailByDirection("prev")}
          disabled={!canScrollPrev}
          aria-label="Прокрутить курсы влево"
          disableRipple
          disableTouchRipple
        >
          <ChevronLeftRoundedIcon />
        </IconButton>

        <div className="courses-preview__rail" ref={railRef}>
          {previewPages.map((page, pageIndex) => (
            <div
              key={`${page.featured.id}-${pageIndex}`}
              className={`courses-preview__page ${page.secondary.length ? "" : "courses-preview__page--single"}`}
            >
              <Card
                className="courses-preview__card courses-preview__card--featured"
                elevation={0}
              >
                <CourseVisualBackground course={page.featured} mode="featured" />
                <CardContent className="courses-preview__content courses-preview__content--featured">
                  <div className="courses-preview__featured-zone courses-preview__featured-zone--sticker">
                    <span className="courses-preview__sticker" aria-hidden="true">
                      <span className="courses-preview__sticker-label">Можно частями</span>
                    </span>
                  </div>

                  <div className="courses-preview__featured-zone courses-preview__featured-zone--title">
                    <h3 className="courses-preview__title">{page.featured.title}</h3>
                  </div>

                  <div className="courses-preview__featured-zone courses-preview__featured-zone--description">
                    <p className="courses-preview__descriptor courses-preview__descriptor--featured">
                      {page.featured.descriptor}
                    </p>
                  </div>

                  <div className="courses-preview__featured-zone courses-preview__featured-zone--meta">
                    <div className="courses-preview__metrics">
                      <span className="courses-preview__metric">{page.featured.level}</span>
                      <span className="courses-preview__metric">{page.featured.formatLabel}</span>
                      <span className="courses-preview__metric courses-preview__metric--support">
                        {page.featured.supportLabel}
                      </span>
                    </div>
                  </div>

                  <div className="courses-preview__featured-zone courses-preview__featured-zone--cta">
                    <div className="courses-preview__cta-row courses-preview__cta-row--featured">
                      <Button
                        className="courses-preview__button"
                        onClick={() => navigate(`/courses/${page.featured.id}`)}
                      >
                        Открыть курс
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {!!page.secondary.length && (
                <div className="courses-preview__stack">
                  {page.secondary.map((course, secondaryIndex) => {
                    const secondarySticker = getSecondarySticker(secondaryIndex);

                    return (
                      <Card
                        key={course.id}
                        className="courses-preview__card courses-preview__card--secondary"
                        elevation={0}
                      >
                        <CourseVisualBackground course={course} mode="card" />
                        <CardContent className="courses-preview__content courses-preview__content--secondary">
                          <div
                            className={`courses-preview__secondary-sticker courses-preview__secondary-sticker--${secondarySticker.variant}`}
                          >
                            <span className="courses-preview__secondary-sticker-label">
                              {secondarySticker.label}
                            </span>
                          </div>

                          <div className="courses-preview__secondary-main">
                            <h3 className="courses-preview__title courses-preview__title--secondary">{course.title}</h3>
                          </div>

                          <div className="courses-preview__secondary-footer">
                            <div className="courses-preview__metrics courses-preview__metrics--compact">
                              <span className="courses-preview__metric">{course.level}</span>
                              <span className="courses-preview__metric">{course.formatLabel}</span>
                            </div>

                            <div className="courses-preview__cta-row courses-preview__cta-row--secondary">
                              <Button
                                className="courses-preview__button courses-preview__button--secondary"
                                onClick={() => navigate(`/courses/${course.id}`)}
                              >
                                Открыть курс
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        <IconButton
          className="courses-preview__shelf-nav courses-preview__shelf-nav--next"
          onClick={() => scrollRailByDirection("next")}
          disabled={!canScrollNext}
          aria-label="Прокрутить курсы вправо"
          disableRipple
          disableTouchRipple
        >
          <ChevronRightRoundedIcon />
        </IconButton>
      </div>
    </section>
  );
}
