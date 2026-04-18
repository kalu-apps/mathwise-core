import { useMemo, useState } from "react";
import { Alert } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useAboutTeacherContent } from "./model/useAboutTeacherContent";
import { useReveal } from "./model/useReveal";
import { AboutTeacherHero } from "./ui/AboutTeacherHero";
import { AboutTeacherProof } from "./ui/AboutTeacherProof";
import { AboutTeacherReviews } from "./ui/AboutTeacherReviews";
import { DiplomaLightbox } from "./ui/DiplomaLightbox";

export default function AboutTeacher() {
  const navigate = useNavigate();
  const { loading, error, avatar, diplomas, reviews } = useAboutTeacherContent();
  const [openDiplomaIndex, setOpenDiplomaIndex] = useState<number | null>(null);

  const { setNode: setHeroRevealNode, visible: isHeroVisible } = useReveal<HTMLDivElement>({
    threshold: 0.1,
    rootMargin: "0px 0px -8% 0px",
  });
  const { setNode: setProofRevealNode, visible: isProofVisible } = useReveal<HTMLDivElement>({
    threshold: 0.16,
    rootMargin: "0px 0px -10% 0px",
  });
  const { setNode: setReviewsRevealNode, visible: isReviewsVisible } = useReveal<HTMLDivElement>({
    threshold: 0.2,
    rootMargin: "0px 0px -12% 0px",
  });

  const heroAvatarUrl = avatar?.url ?? null;

  const pageStateClass = useMemo(() => {
    if (loading) return "is-loading";
    if (error) return "is-error";
    return "is-ready";
  }, [error, loading]);

  return (
    <section className={`about-teacher-page ${pageStateClass}`}>
      {error ? (
        <Alert severity="warning" className="about-teacher-page__alert">
          {error}
        </Alert>
      ) : null}

      <div
        ref={setHeroRevealNode}
        className={`about-teacher-page__reveal about-teacher-page__reveal--hero ${
          isHeroVisible ? "is-visible" : ""
        }`}
      >
        <AboutTeacherHero
          avatarUrl={heroAvatarUrl}
          onPrimaryAction={() => navigate("/courses")}
          onSecondaryAction={() => navigate("/booking")}
          showAvatarFallback={!loading}
        />
      </div>

      <div
        ref={setProofRevealNode}
        className={`about-teacher-page__reveal about-teacher-page__reveal--proof ${
          isProofVisible ? "is-visible" : ""
        }`}
      >
        <AboutTeacherProof diplomas={diplomas} onOpenDiploma={setOpenDiplomaIndex} />
      </div>

      <div
        ref={setReviewsRevealNode}
        className={`about-teacher-page__reveal about-teacher-page__reveal--reviews ${
          isReviewsVisible ? "is-visible" : ""
        }`}
      >
        <AboutTeacherReviews reviews={reviews} />
      </div>

      <DiplomaLightbox
        diplomas={diplomas}
        openIndex={openDiplomaIndex}
        onSetIndex={setOpenDiplomaIndex}
        onClose={() => setOpenDiplomaIndex(null)}
      />
    </section>
  );
}
