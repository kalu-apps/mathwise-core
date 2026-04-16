import { Fragment } from "react";
import { HomeFirstScreen } from "./sections/first-screen/HomeFirstScreen";
import { CoursesPreview } from "./sections/CoursesPreview";
import { CTASection } from "./sections/CTASection";

export default function Home() {
  return (
    <Fragment>
      <HomeFirstScreen />
      <CoursesPreview />
      <CTASection />
    </Fragment>
  );
}
