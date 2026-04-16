import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { HomeHeroSceneObjects } from "./hero-3d/HomeHeroSceneObjects";

function isWebGlAvailable() {
  if (typeof window === "undefined") return false;

  const canvas = document.createElement("canvas");

  return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
}

export function HomeHeroEnvironment() {
  const webGlReady = useMemo(() => isWebGlAvailable(), []);

  return (
    <div className="home-first-screen__environment" aria-hidden="true">
      {webGlReady ? (
        <Canvas
          className="home-first-screen__environment-canvas"
          camera={{ position: [0, 0.08, 6], fov: 38 }}
          dpr={[1, 1.5]}
          frameloop="demand"
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: "low-power",
          }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0);
          }}
        >
          <HomeHeroSceneObjects />
        </Canvas>
      ) : (
        <div className="home-first-screen__environment-fallback" />
      )}
    </div>
  );
}
