import { useEffect, useMemo } from "react";
import type { BufferAttribute, BufferGeometry, PlaneGeometry, TubeGeometry } from "three";
import * as THREE from "three";

type SceneMode = "light" | "dark";

type HomeHeroSceneObjectsProps = {
  mode: SceneMode;
};

const TAU = Math.PI * 2;

function useDisposableGeometry<TGeometry extends BufferGeometry>(factory: () => TGeometry): TGeometry {
  const geometry = useMemo(() => factory(), [factory]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return geometry;
}

function buildWaveGridSurface(): PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(10.2, 5.4, 34, 22);
  const position = geometry.attributes.position as BufferAttribute;

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z =
      Math.sin(x * 0.84) * 0.09 +
      Math.cos(y * 1.34) * 0.12 +
      Math.sin((x + y) * 1.12) * 0.05;

    position.setZ(i, z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();

  return geometry;
}

function buildMobiusRibbon(): PlaneGeometry {
  const radius = 1.74;
  const halfWidth = 0.26;
  const geometry = new THREE.PlaneGeometry(1, 1, 120, 14);
  const position = geometry.attributes.position as BufferAttribute;

  for (let i = 0; i < position.count; i += 1) {
    const u = ((position.getX(i) + 0.5) * TAU) % TAU;
    const v = position.getY(i) * halfWidth * 2;
    const edgeDrift = Math.sin(u * 2.1) * 0.04;

    const radial = radius + (v + edgeDrift) * Math.cos(u * 0.5);
    const x = radial * Math.cos(u);
    const y = (v + edgeDrift) * Math.sin(u * 0.5) + Math.sin(u * 1.7) * 0.09;
    const z = radial * Math.sin(u) * 0.62;

    position.setXYZ(i, x, y, z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();

  return geometry;
}

function buildLemniscateTube(): TubeGeometry {
  const points: THREE.Vector3[] = [];
  const segments = 150;

  for (let i = 0; i <= segments; i += 1) {
    const t = (i / segments) * TAU;
    const sinT = Math.sin(t);
    const denom = 1 + sinT * sinT;

    const x = (1.44 * Math.cos(t)) / denom;
    const y = (0.54 * Math.sin(2 * t)) / denom;
    const z = 0.42 * sinT + 0.1 * Math.sin(t * 3.2);

    points.push(new THREE.Vector3(x, y, z));
  }

  const curve = new THREE.CatmullRomCurve3(points, true, "centripetal", 0.6);

  return new THREE.TubeGeometry(curve, 180, 0.08, 18, true);
}

function buildHyperCrystal(): THREE.IcosahedronGeometry {
  const geometry = new THREE.IcosahedronGeometry(0.8, 2);
  const position = geometry.attributes.position as BufferAttribute;

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);

    const radius = Math.sqrt(x * x + y * y + z * z);
    const pulse =
      1 +
      0.14 * Math.sin(x * 4.2) * Math.cos(y * 3.5) +
      0.1 * Math.sin(z * 5.1);

    const factor = (radius > 0 ? pulse / radius : 1) * 0.8;
    position.setXYZ(i, x * factor, y * factor, z * factor);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();

  return geometry;
}

function HeroWaveGrid({ color }: { color: string }) {
  const geometry = useDisposableGeometry(buildWaveGridSurface);

  return (
    <mesh
      geometry={geometry}
      position={[0.38, -1.16, -1.84]}
      rotation={[-1.14, 0.3, -0.08]}
    >
      <meshStandardMaterial
        color={color}
        roughness={0.72}
        metalness={0.1}
        transparent
        opacity={0.21}
        wireframe
      />
    </mesh>
  );
}

function HeroMobiusRibbon({ color, glow }: { color: string; glow: string }) {
  const geometry = useDisposableGeometry(buildMobiusRibbon);

  return (
    <mesh geometry={geometry} position={[1.46, 0.06, -0.08]} rotation={[-0.32, 0.84, 0.26]}>
      <meshPhysicalMaterial
        color={color}
        emissive={glow}
        emissiveIntensity={0.14}
        roughness={0.36}
        metalness={0.24}
        clearcoat={0.88}
        clearcoatRoughness={0.2}
        transmission={0.18}
        transparent
        opacity={0.82}
      />
    </mesh>
  );
}

function HeroLemniscateLoop({ color }: { color: string }) {
  const geometry = useDisposableGeometry(buildLemniscateTube);

  return (
    <mesh geometry={geometry} position={[-1.52, 0.12, -0.58]} rotation={[0.36, -0.42, 0.18]}>
      <meshStandardMaterial
        color={color}
        roughness={0.3}
        metalness={0.42}
        transparent
        opacity={0.72}
      />
    </mesh>
  );
}

function HeroHyperCrystal({ bodyColor, edgeColor }: { bodyColor: string; edgeColor: string }) {
  const geometry = useDisposableGeometry(buildHyperCrystal);

  return (
    <group position={[-2.68, -0.56, -0.3]} rotation={[0.34, 0.32, 0.12]}>
      <mesh geometry={geometry}>
        <meshPhysicalMaterial
          color={bodyColor}
          roughness={0.42}
          metalness={0.14}
          transmission={0.18}
          transparent
          opacity={0.66}
          clearcoat={0.74}
          clearcoatRoughness={0.26}
        />
      </mesh>
      <mesh geometry={geometry}>
        <meshBasicMaterial color={edgeColor} wireframe transparent opacity={0.16} />
      </mesh>
    </group>
  );
}

function HeroKnotAccent({ color }: { color: string }) {
  return (
    <mesh position={[2.9, 0.88, -0.72]} rotation={[0.54, -0.24, 0.62]}>
      <torusKnotGeometry args={[0.54, 0.12, 120, 20, 2, 5]} />
      <meshPhysicalMaterial
        color={color}
        roughness={0.34}
        metalness={0.38}
        clearcoat={0.74}
        clearcoatRoughness={0.22}
        transparent
        opacity={0.74}
      />
    </mesh>
  );
}

export function HomeHeroSceneObjects({ mode }: HomeHeroSceneObjectsProps) {
  const palette =
    mode === "dark"
      ? {
          ambient: "#8ea6ff",
          key: "#e3ecff",
          cyan: "#74dfff",
          violet: "#b995ff",
          warm: "#ffb39d",
          mobius: "#9da8ff",
          mobiusGlow: "#8cc8ff",
          loop: "#77e8ff",
          knot: "#b28dff",
          crystalBody: "#9eb6ff",
          crystalEdge: "#f8b5b2",
          grid: "#8fa8ff",
        }
      : {
          ambient: "#6d81e4",
          key: "#ffffff",
          cyan: "#2fb5ff",
          violet: "#7a63dd",
          warm: "#ff8d73",
          mobius: "#6f7cf0",
          mobiusGlow: "#58c9ff",
          loop: "#2ea7ea",
          knot: "#7a66db",
          crystalBody: "#7f9ff0",
          crystalEdge: "#ff9b89",
          grid: "#6f88e3",
        };

  const lightIntensity = mode === "dark" ? 0.84 : 0.92;

  return (
    <group>
      <ambientLight intensity={lightIntensity} color={palette.ambient} />
      <directionalLight intensity={0.9} color={palette.key} position={[4.3, 5.2, 4.9]} />
      <pointLight intensity={0.58} color={palette.cyan} position={[-3.2, 1.8, 2.9]} />
      <pointLight intensity={0.56} color={palette.violet} position={[2.8, -1.2, 2.4]} />
      <pointLight intensity={0.38} color={palette.warm} position={[0.4, 1.2, 2.6]} />

      <HeroMobiusRibbon color={palette.mobius} glow={palette.mobiusGlow} />
      <HeroLemniscateLoop color={palette.loop} />
      <HeroKnotAccent color={palette.knot} />
      <HeroHyperCrystal bodyColor={palette.crystalBody} edgeColor={palette.crystalEdge} />
      <HeroWaveGrid color={palette.grid} />
    </group>
  );
}
