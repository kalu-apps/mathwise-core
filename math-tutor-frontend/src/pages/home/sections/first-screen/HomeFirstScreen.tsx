import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HOME_GUIDED_PATHS, HOME_PROOF_POINTS } from "./content";
import { HeroCommandDeck } from "./HeroCommandDeck";
import { GuidedPathCards } from "./GuidedPathCards";

let heroEnvironmentImportPromise:
  | Promise<typeof import("./HomeHeroEnvironment")>
  | null = null;

const preloadHomeHeroEnvironment = () => {
  if (!heroEnvironmentImportPromise) {
    heroEnvironmentImportPromise = import("./HomeHeroEnvironment");
  }
  return heroEnvironmentImportPromise;
};

const LazyHomeHeroEnvironment = lazy(() =>
  preloadHomeHeroEnvironment().then((module) => ({
    default: module.HomeHeroEnvironment,
  }))
);

export function HomeFirstScreen() {
  const navigate = useNavigate();
  const [renderEnvironment, setRenderEnvironment] = useState(() => typeof window === "undefined");

  useEffect(() => {
    if (renderEnvironment || typeof window === "undefined") return;

    let cancelled = false;
    const onIdle = () => {
      void preloadHomeHeroEnvironment().finally(() => {
        if (!cancelled) {
          setRenderEnvironment(true);
        }
      });
    };
    const win = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    const idleHandle =
      typeof win.requestIdleCallback === "function"
        ? win.requestIdleCallback(onIdle, { timeout: 1200 })
        : null;
    const timeoutHandle = idleHandle === null ? window.setTimeout(onIdle, 650) : null;

    return () => {
      cancelled = true;

      if (idleHandle !== null && typeof win.cancelIdleCallback === "function") {
        win.cancelIdleCallback(idleHandle);
      }

      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }
    };
  }, [renderEnvironment]);

  return (
    <section className="home-first-screen" aria-labelledby="home-first-screen-title">
      <div className="home-first-screen__scene">
        {renderEnvironment ? (
          <Suspense
            fallback={
              <div className="home-first-screen__environment" aria-hidden="true">
                <div className="home-first-screen__environment-fallback" />
              </div>
            }
          >
            <LazyHomeHeroEnvironment />
          </Suspense>
        ) : (
          <div className="home-first-screen__environment" aria-hidden="true">
            <div className="home-first-screen__environment-fallback" />
          </div>
        )}
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
