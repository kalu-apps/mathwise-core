import { Card, CardContent, Button } from "@mui/material";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCourses } from "@/entities/course/model/storage";
import type { Course } from "@/entities/course/model/types";
export function CoursesPreview() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);

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

  const publishedCourses = courses.filter(
    (course) => course.status === "published"
  );
  const previewCourses = publishedCourses.slice(0, 4);

  if (!previewCourses.length) return null;

  return (
    <section className="courses-preview">
      <div className="courses-preview__header">
        <div>
          <span className="courses-preview__kicker">Подборка преподавателя</span>
          <h2 className="courses-preview__heading">Курсы, которые дают результат</h2>
          <p className="courses-preview__subtitle">
            Чёткая методика, структурированные уроки и поддержка, чтобы уверенно
            выйти на высокий балл.
          </p>
        </div>
        <Button
          className="courses-preview__cta"
          onClick={() => navigate("/courses")}
        >
          Увидеть больше курсов
        </Button>
      </div>

      <div className="courses-preview__grid">
        {previewCourses.map((course) => (
          <Card key={course.id} className="courses-preview__card" elevation={0}>
            <CardContent className="courses-preview__content">
              <span className="courses-preview__tag">Курс</span>
              <h3 className="courses-preview__title">{course.title}</h3>
              <div className="courses-preview__meta">
                <div className="courses-preview__level-row">
                  <span className="courses-preview__level-label">Уровень:</span>
                  <span className="courses-preview__level">{course.level}</span>
                </div>
                <span className="courses-preview__meta-text">
                  Видео + материалы
                </span>
              </div>

              <Button
                className="courses-preview__button"
                onClick={() => navigate(`/courses/${course.id}`)}
              >
                Подробнее
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
