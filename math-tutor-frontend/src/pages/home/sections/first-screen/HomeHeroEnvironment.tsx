import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { ACESFilmicToneMapping, SRGBColorSpace, setConsoleFunction } from "three";
import { useThemeMode } from "@/app/theme/themeModeContext";
import { HomeHeroSceneObjects } from "./hero-3d/HomeHeroSceneObjects";

function isWebGlAvailable() {
  if (typeof window === "undefined") return false;

  const canvas = document.createElement("canvas");

  return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
}

let threeConsolePatched = false;

function patchThreeConsoleWarnings() {
  if (threeConsolePatched || typeof setConsoleFunction !== "function") return;

  threeConsolePatched = true;
  setConsoleFunction((level, message, ...args) => {
    if (level === "warn" && typeof message === "string" && message.includes("Clock: This module has been deprecated")) {
      return;
    }

    if (level === "error") {
      console.error(message, ...args);
      return;
    }

    if (level === "warn") {
      console.warn(message, ...args);
      return;
    }

    console.log(message, ...args);
  });
}

export function HomeHeroEnvironment() {
  patchThreeConsoleWarnings();

  const webGlReady = useMemo(() => isWebGlAvailable(), []);
  const { mode } = useThemeMode();

  return (
    <div className="home-first-screen__environment" aria-hidden="true">
      {webGlReady ? (
        <Canvas
          className="home-first-screen__environment-canvas"
          camera={{ position: [0, 0.02, 6.05], fov: 36.5 }}
          dpr={mode === "light" ? [1.1, 1.55] : [0.9, 1.25]}
          frameloop="demand"
          performance={{ min: 0.56, max: 1, debounce: 320 }}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: "high-performance",
            failIfMajorPerformanceCaveat: true,
            precision: "highp",
            stencil: false,
            depth: true,
          }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0);
            gl.toneMapping = ACESFilmicToneMapping;
            gl.toneMappingExposure = mode === "dark" ? 1 : 1.12;
            gl.outputColorSpace = SRGBColorSpace;
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
