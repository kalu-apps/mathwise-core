import { Button } from "@mui/material";
import { ABOUT_TEACHER_HERO_COPY } from "../model/content";
import { AssetImage } from "./AssetImage";

type AboutTeacherHeroProps = {
  avatarUrl?: string | null;
  onPrimaryAction: () => void;
  onSecondaryAction: () => void;
  showAvatarFallback?: boolean;
};

export function AboutTeacherHero({
  avatarUrl,
  onPrimaryAction,
  onSecondaryAction,
  showAvatarFallback = true,
}: AboutTeacherHeroProps) {
  return (
    <section className="about-teacher-hero" aria-labelledby="about-teacher-hero-title">
      <div className="about-teacher-hero__content">
        <span className="about-teacher-hero__eyebrow">{ABOUT_TEACHER_HERO_COPY.eyebrow}</span>
        <h1 id="about-teacher-hero-title">{ABOUT_TEACHER_HERO_COPY.title}</h1>
        <p>{ABOUT_TEACHER_HERO_COPY.description}</p>
        <div className="about-teacher-hero__actions">
          <Button variant="contained" onClick={onPrimaryAction}>
            {ABOUT_TEACHER_HERO_COPY.primaryCta}
          </Button>
          <Button variant="outlined" onClick={onSecondaryAction}>
            {ABOUT_TEACHER_HERO_COPY.secondaryCta}
          </Button>
        </div>
      </div>

      <div className="about-teacher-hero__visual">
        <AssetImage
          src={avatarUrl}
          alt="Фото преподавателя"
          ratio="5 / 6"
          className="about-teacher-hero__avatar"
          loading="eager"
          showFallback={showAvatarFallback}
        />
      </div>
    </section>
  );
}
