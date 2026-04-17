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

function resolveEnvironmentProfile(mode: "light" | "dark") {
  if (typeof window === "undefined") {
    return {
      dpr: [1, 1.2] as [number, number],
      antialias: true,
      powerPreference: "default" as const,
    };
  }

  const cores = window.navigator.hardwareConcurrency ?? 4;
  const lowPowerDevice = cores <= 4;

  if (lowPowerDevice) {
    return {
      dpr: [0.78, 1.0] as [number, number],
      antialias: false,
      powerPreference: "low-power" as const,
    };
  }

  return {
    dpr: mode === "light" ? ([0.92, 1.22] as [number, number]) : ([0.86, 1.12] as [number, number]),
    antialias: true,
    powerPreference: "default" as const,
  };
}

export function HomeHeroEnvironment() {
  patchThreeConsoleWarnings();

  const webGlReady = useMemo(() => isWebGlAvailable(), []);
  const { mode } = useThemeMode();
  const profile = useMemo(() => resolveEnvironmentProfile(mode), [mode]);

  return (
    <div className="home-first-screen__environment" aria-hidden="true">
      {webGlReady ? (
        <Canvas
          className="home-first-screen__environment-canvas"
          camera={{ position: [0, 0.02, 6.05], fov: 36.5 }}
          dpr={profile.dpr}
          frameloop="demand"
          performance={{ min: 0.5, max: 1, debounce: 260 }}
          gl={{
            antialias: profile.antialias,
            alpha: true,
            powerPreference: profile.powerPreference,
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
