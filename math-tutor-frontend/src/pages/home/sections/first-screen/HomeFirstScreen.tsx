import { useNavigate } from "react-router-dom";
import { HOME_GUIDED_PATHS, HOME_PROOF_POINTS } from "./content";
import { HeroCommandDeck } from "./HeroCommandDeck";
import { GuidedPathCards } from "./GuidedPathCards";
import { HomeHeroEnvironment } from "./HomeHeroEnvironment";

export function HomeFirstScreen() {
  const navigate = useNavigate();

  return (
    <section className="home-first-screen" aria-labelledby="home-first-screen-title">
      <div className="home-first-screen__scene">
        <HomeHeroEnvironment />
        <span className="home-first-screen__ambient-veil" aria-hidden="true" />

        <div className="home-first-screen__layout">
          <HeroCommandDeck
            proofPoints={HOME_PROOF_POINTS}
            onPrimaryAction={() => navigate("/courses")}
            onSecondaryAction={() => navigate("/booking")}
          />

          <GuidedPathCards
            paths={HOME_GUIDED_PATHS}
            onSelectPath={(route) => navigate(route)}
          />
        </div>
      </div>
    </section>
  );
}
