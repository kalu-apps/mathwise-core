import { useEffect, useState } from "react";
import { Alert, Avatar } from "@mui/material";
import { getUsers } from "@/features/auth/model/api";
import { getTeacherProfile } from "@/features/teacher-profile/api";
import type { User } from "@/entities/user/model/types";
import type { TeacherProfile } from "@/features/teacher-profile/model/types";
import { subscribeAppDataUpdates } from "@/shared/lib/subscribeAppDataUpdates";
import { PageLoader } from "@/shared/ui/loading";

export default function AboutTeacher() {
  const [teacher, setTeacher] = useState<User | null>(null);
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setError(null);
        setLoading(true);
        const teachers = await getUsers("teacher");
        if (!active) return;
        const currentTeacher = teachers[0] ?? null;
        setTeacher(currentTeacher);
        if (!currentTeacher) {
          setProfile(null);
          return;
        }

        try {
          const profileData = await getTeacherProfile(currentTeacher.id);
          if (!active) return;
          setProfile(profileData);
        } catch {
          if (!active) return;
          setProfile({
            firstName: currentTeacher.firstName,
            lastName: currentTeacher.lastName,
            about: "",
            experience: [],
            achievements: [],
            diplomas: [],
            photo: currentTeacher.photo ?? "",
          });
        }
      } catch {
        if (!active) return;
        setError("Не удалось загрузить данные преподавателя.");
        setTeacher(null);
        setProfile(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    const unsubscribe = subscribeAppDataUpdates(() => {
      void load();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const info = profile ?? {
    firstName: teacher?.firstName ?? "",
    lastName: teacher?.lastName ?? "",
    about: "",
    experience: [],
    achievements: [],
    diplomas: [],
    photo: teacher?.photo ?? "",
  };

  const cards = [
    {
      id: "about",
      title: "Обо мне",
      lines: info.about
        ? [info.about]
        : ["Расскажем о методике и подходе чуть позже."],
    },
    {
      id: "experience",
      title: "Опыт",
      lines:
        info.experience.length > 0
          ? info.experience
              .slice(0, 3)
              .map((item) => [item.title, item.place].filter(Boolean).join(" — "))
          : ["Добавим ключевые места работы и роли."],
    },
    {
      id: "achievements",
      title: "Достижения",
      lines:
        info.achievements.length > 0
          ? info.achievements.slice(0, 3)
          : ["Скоро появятся главные результаты и кейсы."],
    },
    {
      id: "diplomas",
      title: "Дипломы",
      lines:
        info.diplomas.length > 0
          ? [
              `Загружено документов: ${info.diplomas.length}`,
              ...info.diplomas.slice(0, 2).map((d) => d.name),
            ]
          : ["Пока без дипломов — но это скоро исправится."],
    },
  ];

  if (loading) {
    return (
      <section className="about-teacher-page">
        <PageLoader
          title="О преподавателе"
          description="Подготавливаем профиль и достижения преподавателя."
          minHeight={380}
        />
      </section>
    );
  }

  if (!teacher) {
    return (
      <section className="about-teacher-page">
        {error && <Alert severity="error">{error}</Alert>}
        <div className="about-teacher-page__empty">Преподаватель пока не найден</div>
      </section>
    );
  }

  return (
    <section className="about-teacher-page">
      {error && <Alert severity="error">{error}</Alert>}

      <div className="about-teacher-page__header">
        <h1>О преподавателе</h1>
        <p>
          Узнайте о подходе, опыте и достижениях до начала занятий.
        </p>
      </div>

      <div className="about-teacher-orbit">
        <div className="about-teacher-orbit__center">
          <Avatar
            src={info.photo || teacher.photo || undefined}
            className="about-teacher-orbit__avatar"
          >
            {(info.firstName || teacher.firstName || "А")[0]}
          </Avatar>
          <div className="about-teacher-orbit__name">
            {info.firstName || teacher.firstName} {info.lastName || teacher.lastName}
          </div>
          <span>Преподаватель математики</span>
        </div>

        {cards.map((card, index) => (
          <div
            key={card.id}
            className={`about-teacher-orbit__card about-teacher-orbit__card--${
              ["top", "right", "bottom", "left"][index]
            }`}
          >
            <h3>{card.title}</h3>
            <ul>
              {card.lines.map((line, idx) => (
                <li key={`${card.id}-${idx}`}>{line}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
