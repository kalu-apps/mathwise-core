import { Fragment } from "react";
import { HomeFirstScreen } from "./sections/first-screen/HomeFirstScreen";
import { CoursesPreview } from "./sections/CoursesPreview";
import { CTASection } from "./sections/CTASection";

export default function Home() {
  const currentYear = new Date().getFullYear();

  return (
    <Fragment>
      <HomeFirstScreen />
      <CoursesPreview />
      <CTASection />
      <footer className="home-footer" aria-label="Footer">
        <div className="home-footer__inner">
          <span className="home-footer__copyright">© {currentYear}</span>
        </div>
      </footer>
    </Fragment>
  );
}
