import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { useThemeMode } from "@/app/theme/themeModeContext";
import { HomeHeroSceneObjects } from "./hero-3d/HomeHeroSceneObjects";
import { ensureThreeClockCompat } from "./hero-3d/ensureThreeClockCompat";

function isWebGlAvailable() {
  if (typeof window === "undefined") return false;

  const canvas = document.createElement("canvas");

  return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
}

export function HomeHeroEnvironment() {
  const webGlReady = useMemo(() => {
    ensureThreeClockCompat();
    return isWebGlAvailable();
  }, []);
  const { mode } = useThemeMode();

  return (
    <div className="home-first-screen__environment" aria-hidden="true">
      {webGlReady ? (
        <Canvas
          className="home-first-screen__environment-canvas"
          camera={{ position: [0, 0.08, 6], fov: 38 }}
          dpr={[1, 1.2]}
          frameloop="demand"
          performance={{ min: 0.7 }}
          gl={{
            antialias: false,
            alpha: true,
            powerPreference: "low-power",
            failIfMajorPerformanceCaveat: true,
          }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0);
          }}
        >
          <HomeHeroSceneObjects mode={mode} />
        </Canvas>
      ) : (
        <div className="home-first-screen__environment-fallback" />
      )}
    </div>
  );
}
