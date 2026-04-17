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

if (typeof window !== "undefined") {
  void preloadHomeHeroEnvironment();
}

export function HomeFirstScreen() {
  const navigate = useNavigate();
  const [renderEnvironment, setRenderEnvironment] = useState(() => typeof window === "undefined");

  useEffect(() => {
    if (renderEnvironment || typeof window === "undefined") return;

    const onIdle = () => setRenderEnvironment(true);
    const win = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    // Warm up the hero 3D chunk right after first paint so the environment
    // can mount without a visible fetch gap.
    const warmupHandle = window.requestAnimationFrame(() => {
      void preloadHomeHeroEnvironment();
    });

    const idleHandle =
      typeof win.requestIdleCallback === "function"
        ? win.requestIdleCallback(onIdle, { timeout: 260 })
        : null;
    const timeoutHandle = idleHandle === null ? window.setTimeout(onIdle, 110) : null;

    return () => {
      window.cancelAnimationFrame(warmupHandle);

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
