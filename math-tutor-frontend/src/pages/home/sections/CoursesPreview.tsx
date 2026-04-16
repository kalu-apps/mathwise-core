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
  if (course.priceGuided > course.priceSelf) return "Самостоятельно или с разбором";
  return "Поддержка преподавателя";
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
  const previewCourses = publishedCourses.slice(0, 4);
  const previewCards = useMemo(
    () =>
      previewCourses.map((course, index) => ({
        ...course,
        descriptor: toCompactDescriptor(course.description),
        isFeatured: index === 0,
        formatLabel: toFormatLabel(course),
        supportLabel: toSupportLabel(course),
      })),
    [previewCourses]
  );

  if (!previewCards.length) return null;

  return (
    <section className="courses-preview">
      <div className="courses-preview__header">
        <div className="courses-preview__copy">
          <span className="courses-preview__overline">Preview каталога</span>
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

          <div className="courses-preview__nav" aria-label="Навигация по preview курсов">
            <IconButton
              className="courses-preview__nav-button"
              onClick={() => scrollRailByDirection("prev")}
              disabled={!canScrollPrev}
              aria-label="Прокрутить курсы влево"
              disableRipple
              disableTouchRipple
            >
              <ChevronLeftRoundedIcon />
            </IconButton>
            <IconButton
              className="courses-preview__nav-button"
              onClick={() => scrollRailByDirection("next")}
              disabled={!canScrollNext}
              aria-label="Прокрутить курсы вправо"
              disableRipple
              disableTouchRipple
            >
              <ChevronRightRoundedIcon />
            </IconButton>
          </div>
        </div>
      </div>

      <div className="courses-preview__rail" ref={railRef}>
        {previewCards.map((course) => (
          <Card
            key={course.id}
            className={`courses-preview__card ${course.isFeatured ? "courses-preview__card--featured" : ""}`}
            elevation={0}
          >
            <CourseVisualBackground course={course} mode="featured" />
            <CardContent className="courses-preview__content">
              <span className="courses-preview__type">
                {course.isFeatured ? "Рекомендуемый курс" : "Курс"}
              </span>
              <h3 className="courses-preview__title">{course.title}</h3>
              <p className="courses-preview__descriptor">{course.descriptor}</p>

              <div className="courses-preview__metrics">
                <span className="courses-preview__metric">{course.level}</span>
                <span className="courses-preview__metric">{course.formatLabel}</span>
                <span className="courses-preview__metric">{course.supportLabel}</span>
              </div>

              <Button
                className="courses-preview__button"
                onClick={() => navigate(`/courses/${course.id}`)}
              >
                Открыть курс
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
