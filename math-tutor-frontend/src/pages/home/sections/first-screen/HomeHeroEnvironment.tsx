import { useMemo, useState } from "react";
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
    if (typeof message === "string" && message.includes("THREE.WebGLRenderer: Context Lost.")) {
      return;
    }

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
      dpr: [0.78, 1.0] as [number, number],
      antialias: false,
      powerPreference: "default" as const,
      precision: "highp" as const,
    };
  }

  const cores = window.navigator.hardwareConcurrency ?? 4;
  const navigatorWithMemory = window.navigator as Navigator & { deviceMemory?: number };
  const memory = navigatorWithMemory.deviceMemory ?? 8;
  const lowPowerDevice = cores <= 4 || memory <= 4;

  if (lowPowerDevice) {
    return {
      dpr: [0.66, 0.9] as [number, number],
      antialias: false,
      powerPreference: "low-power" as const,
      precision: "mediump" as const,
    };
  }

  return {
    dpr: mode === "light" ? ([0.78, 1.0] as [number, number]) : ([0.74, 0.96] as [number, number]),
    antialias: false,
    powerPreference: "default" as const,
    precision: "highp" as const,
  };
}

export function HomeHeroEnvironment() {
  patchThreeConsoleWarnings();

  const [contextLost, setContextLost] = useState(false);
  const webGlReady = useMemo(() => isWebGlAvailable(), []);
  const { mode } = useThemeMode();
  const profile = useMemo(() => resolveEnvironmentProfile(mode), [mode]);

  return (
    <div className="home-first-screen__environment" aria-hidden="true">
      {webGlReady && !contextLost ? (
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
            precision: profile.precision,
            stencil: false,
            depth: true,
          }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0);
            gl.toneMapping = ACESFilmicToneMapping;
            gl.toneMappingExposure = mode === "dark" ? 1 : 1.12;
            gl.outputColorSpace = SRGBColorSpace;

            gl.domElement.addEventListener(
              "webglcontextlost",
              (event) => {
                event.preventDefault();
                setContextLost(true);
              },
              { passive: false }
            );
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
