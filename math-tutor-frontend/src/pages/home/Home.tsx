import { Fragment } from "react";
import { HeroSection } from "./sections/HeroSection";
import { BenefitsSection } from "./sections/BenefitsSection";
import { CoursesPreview } from "./sections/CoursesPreview";
import { CTASection } from "./sections/CTASection";

export default function Home() {
  return (
    <Fragment>
      <HeroSection />
      <BenefitsSection />
      <CoursesPreview />
      <CTASection />
    </Fragment>
  );
}
