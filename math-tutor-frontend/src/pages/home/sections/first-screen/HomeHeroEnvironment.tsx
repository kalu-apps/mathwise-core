import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { useThemeMode } from "@/app/theme/themeModeContext";
import { HomeHeroSceneObjects } from "./hero-3d/HomeHeroSceneObjects";

function isWebGlAvailable() {
  if (typeof window === "undefined") return false;

  const canvas = document.createElement("canvas");

  return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
}

let threeConsolePatched = false;

function patchThreeConsoleWarnings() {
  if (threeConsolePatched || typeof THREE.setConsoleFunction !== "function") return;

  threeConsolePatched = true;
  THREE.setConsoleFunction((level, message, ...args) => {
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
          camera={{ position: [0, 0.04, 6.1], fov: 37 }}
          dpr={[0.8, 1]}
          frameloop="demand"
          performance={{ min: 0.6 }}
          gl={{
            antialias: false,
            alpha: true,
            powerPreference: "low-power",
            failIfMajorPerformanceCaveat: true,
            precision: "mediump",
            stencil: false,
          }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0);
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = mode === "dark" ? 1 : 1.02;
            gl.outputColorSpace = THREE.SRGBColorSpace;
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
