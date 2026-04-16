import { useEffect, useMemo } from "react";
import type { BufferAttribute, BufferGeometry, ColorRepresentation, PlaneGeometry, TorusGeometry } from "three";
import * as THREE from "three";

type SceneMode = "light" | "dark";

type HomeHeroSceneObjectsProps = {
  mode: SceneMode;
};

type ScenePalette = {
  ambient: string;
  key: string;
  fill: string;
  rim: string;
  planeSurfaceNear: string;
  planeSurfaceFar: string;
  gridMajor: string;
  gridMinor: string;
  ribbonA: string;
  ribbonB: string;
  ribbonC: string;
  ribbonGlow: string;
  knotA: string;
  knotB: string;
  knotC: string;
  polyA: string;
  polyB: string;
  polyC: string;
  polyGlow: string;
  accent: string;
};

const TAU = Math.PI * 2;

function useDisposableGeometry<TGeometry extends BufferGeometry>(geometry: TGeometry): TGeometry {
  useEffect(() => () => geometry.dispose(), [geometry]);

  return geometry;
}

function sampleFieldHeight(x: number, z: number) {
  const gaussian = Math.exp(-(x * x * 0.08 + z * z * 0.04)) * 0.2;
  const wave = Math.sin(x * 0.46) * 0.035 + Math.cos(z * 0.34) * 0.028;
  const perspectiveTilt = z * 0.018;

  return gaussian + wave - perspectiveTilt;
}

function applyTriGradient(
  geometry: BufferGeometry,
  first: ColorRepresentation,
  middle: ColorRepresentation,
  last: ColorRepresentation,
  mapFn: (x: number, y: number, z: number) => number
) {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const values = new Float32Array(position.count);

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < position.count; i += 1) {
    const value = mapFn(position.getX(i), position.getY(i), position.getZ(i));
    values[i] = value;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  const range = Math.max(1e-5, max - min);
  const c1 = new THREE.Color(first);
  const c2 = new THREE.Color(middle);
  const c3 = new THREE.Color(last);
  const mixedA = new THREE.Color();
  const mixedB = new THREE.Color();
  const colors = new Float32Array(position.count * 3);

  for (let i = 0; i < position.count; i += 1) {
    const t = (values[i] - min) / range;

    if (t < 0.5) {
      mixedA.lerpColors(c1, c2, t / 0.5);
    } else {
      mixedA.lerpColors(c2, c3, (t - 0.5) / 0.5);
    }

    const shimmer = 0.06 + 0.05 * Math.sin(position.getX(i) * 1.35 + position.getZ(i) * 0.78);
    mixedB.copy(mixedA).offsetHSL(0, 0, shimmer);

    colors[i * 3] = mixedB.r;
    colors[i * 3 + 1] = mixedB.g;
    colors[i * 3 + 2] = mixedB.b;
  }

  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
}

function buildCoordinatePlaneSurface(mode: SceneMode, palette: ScenePalette): PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(9.8, 5.8, 30, 20);
  const position = geometry.attributes.position as BufferAttribute;

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    position.setZ(i, sampleFieldHeight(x, y));
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();

  applyTriGradient(
    geometry,
    palette.planeSurfaceNear,
    mode === "dark" ? "#27386f" : "#9aafff",
    palette.planeSurfaceFar,
    (x, y, z) => y * 0.74 - z * 0.32 + x * 0.08
  );

  return geometry;
}

function buildCoordinateLineGeometry(size: number, divisions: number, slicesPerLine: number) {
  const half = size / 2;
  const vertices: number[] = [];

  for (let i = 0; i <= divisions; i += 1) {
    const x = -half + (size * i) / divisions;

    for (let step = 0; step < slicesPerLine; step += 1) {
      const zA = -half + (size * step) / slicesPerLine;
      const zB = -half + (size * (step + 1)) / slicesPerLine;
      vertices.push(x, sampleFieldHeight(x, zA), zA);
      vertices.push(x, sampleFieldHeight(x, zB), zB);
    }
  }

  for (let i = 0; i <= divisions; i += 1) {
    const z = -half + (size * i) / divisions;

    for (let step = 0; step < slicesPerLine; step += 1) {
      const xA = -half + (size * step) / slicesPerLine;
      const xB = -half + (size * (step + 1)) / slicesPerLine;
      vertices.push(xA, sampleFieldHeight(xA, z), z);
      vertices.push(xB, sampleFieldHeight(xB, z), z);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));

  return geometry;
}

function buildMobiusRibbonGeometry(palette: ScenePalette) {
  const radius = 1.74;
  const width = 0.34;
  const geometry = new THREE.PlaneGeometry(1, 1, 108, 14);
  const position = geometry.attributes.position as BufferAttribute;

  for (let i = 0; i < position.count; i += 1) {
    const u = ((position.getX(i) + 0.5) * TAU) % TAU;
    const v = position.getY(i) * width;

    const radial = radius + v * Math.cos(u * 0.5);
    const x = radial * Math.cos(u);
    const y = radial * Math.sin(u) * 0.64;
    const z = v * Math.sin(u * 0.5) + Math.sin(u * 1.28) * 0.06;

    position.setXYZ(i, x, y, z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();

  applyTriGradient(
    geometry,
    palette.ribbonA,
    palette.ribbonB,
    palette.ribbonC,
    (x, y, z) => x * 0.44 + y * 0.14 + z * 0.46
  );

  return geometry;
}

function buildTorusKnotGeometry(palette: ScenePalette) {
  const geometry = new THREE.TorusKnotGeometry(0.54, 0.12, 112, 18, 2, 3);

  applyTriGradient(
    geometry,
    palette.knotA,
    palette.knotB,
    palette.knotC,
    (x, y, z) => y * 0.58 - x * 0.18 + z * 0.24
  );

  return geometry;
}

function buildPolyhedronGeometry(palette: ScenePalette) {
  const geometry = new THREE.IcosahedronGeometry(0.62, 1);
  const position = geometry.attributes.position as BufferAttribute;

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);

    const radius = Math.sqrt(x * x + y * y + z * z) || 1;
    const pulse = 1 + 0.075 * Math.sin(x * 3.1 + z * 2.3) + 0.06 * Math.cos(y * 3.4 - x * 1.4);
    const factor = pulse / radius;

    position.setXYZ(i, x * factor * 0.62, y * factor * 0.62, z * factor * 0.62);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();

  applyTriGradient(
    geometry,
    palette.polyA,
    palette.polyB,
    palette.polyC,
    (x, y, z) => z * 0.52 + y * 0.3 + x * 0.18
  );

  return geometry;
}

function buildDistantArcGeometry(): TorusGeometry {
  return new THREE.TorusGeometry(1.24, 0.04, 10, 64, Math.PI * 1.2);
}

function CoordinatePlane({ mode, palette }: { mode: SceneMode; palette: ScenePalette }) {
  const surfaceGeometry = useDisposableGeometry(
    useMemo(() => buildCoordinatePlaneSurface(mode, palette), [mode, palette])
  );
  const majorGeometry = useDisposableGeometry(useMemo(() => buildCoordinateLineGeometry(9.7, 12, 24), []));
  const minorGeometry = useDisposableGeometry(useMemo(() => buildCoordinateLineGeometry(9.7, 18, 18), []));

  return (
    <group position={[0.48, -1.22, -2.22]} rotation={[-1.02, 0.24, -0.05]}>
      <mesh geometry={surfaceGeometry}>
        <meshPhysicalMaterial
          vertexColors
          roughness={0.48}
          metalness={0.08}
          clearcoat={0.34}
          clearcoatRoughness={0.3}
          transparent
          opacity={mode === "dark" ? 0.34 : 0.3}
        />
      </mesh>

      <lineSegments geometry={minorGeometry}>
        <lineBasicMaterial
          color={palette.gridMinor}
          transparent
          opacity={mode === "dark" ? 0.1 : 0.08}
          depthWrite={false}
        />
      </lineSegments>

      <lineSegments geometry={majorGeometry}>
        <lineBasicMaterial
          color={palette.gridMajor}
          transparent
          opacity={mode === "dark" ? 0.22 : 0.18}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>
    </group>
  );
}

function PrimaryRibbon({ mode, palette }: { mode: SceneMode; palette: ScenePalette }) {
  const geometry = useDisposableGeometry(useMemo(() => buildMobiusRibbonGeometry(palette), [palette]));

  return (
    <mesh geometry={geometry} position={[2.22, 0.38, -0.16]} rotation={[-0.2, 0.72, 0.2]}>
      <meshPhysicalMaterial
        vertexColors
        emissive={palette.ribbonGlow}
        emissiveIntensity={mode === "dark" ? 0.12 : 0.09}
        roughness={0.21}
        metalness={0.2}
        clearcoat={0.86}
        clearcoatRoughness={0.11}
        iridescence={mode === "dark" ? 0.36 : 0.26}
        iridescenceIOR={1.19}
        iridescenceThicknessRange={[120, 260]}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function SecondaryKnot({ mode, palette }: { mode: SceneMode; palette: ScenePalette }) {
  const geometry = useDisposableGeometry(useMemo(() => buildTorusKnotGeometry(palette), [palette]));

  return (
    <mesh geometry={geometry} position={[2.58, -0.06, -1.46]} rotation={[0.26, -0.24, 0.11]}>
      <meshPhysicalMaterial
        vertexColors
        roughness={0.24}
        metalness={0.18}
        clearcoat={0.74}
        clearcoatRoughness={0.14}
        emissive={palette.knotB}
        emissiveIntensity={mode === "dark" ? 0.08 : 0.06}
      />
    </mesh>
  );
}

function SecondaryPolyhedron({ mode, palette }: { mode: SceneMode; palette: ScenePalette }) {
  const geometry = useDisposableGeometry(useMemo(() => buildPolyhedronGeometry(palette), [palette]));

  return (
    <group position={[1.78, -0.98, -0.9]} rotation={[0.34, -0.22, 0.3]}>
      <mesh geometry={geometry}>
        <meshPhysicalMaterial
          vertexColors
          roughness={0.26}
          metalness={0.14}
          clearcoat={0.72}
          clearcoatRoughness={0.16}
          transparent
          opacity={mode === "dark" ? 0.9 : 0.86}
          emissive={palette.polyGlow}
          emissiveIntensity={mode === "dark" ? 0.11 : 0.08}
        />
      </mesh>
    </group>
  );
}

function DistantAccent({ palette }: { palette: ScenePalette }) {
  const geometry = useDisposableGeometry(useMemo(() => buildDistantArcGeometry(), []));

  return (
    <mesh geometry={geometry} position={[-2.56, -1.02, -2.42]} rotation={[0.22, 0.66, 0.24]}>
      <meshPhysicalMaterial
        color={palette.accent}
        roughness={0.35}
        metalness={0.12}
        clearcoat={0.45}
        clearcoatRoughness={0.24}
        transparent
        opacity={0.24}
      />
    </mesh>
  );
}

function paletteByMode(mode: SceneMode): ScenePalette {
  if (mode === "dark") {
    return {
      ambient: "#8ea8ff",
      key: "#f3f6ff",
      fill: "#4f95ff",
      rim: "#59b8ff",
      planeSurfaceNear: "#213568",
      planeSurfaceFar: "#152243",
      gridMajor: "#3f63d8",
      gridMinor: "#6c7cff",
      ribbonA: "#2c2f8f",
      ribbonB: "#5c49d8",
      ribbonC: "#5f8cff",
      ribbonGlow: "#6e8fff",
      knotA: "#3243af",
      knotB: "#5670ff",
      knotC: "#63cbff",
      polyA: "#4c86d9",
      polyB: "#6bb7ff",
      polyC: "#80d5ff",
      polyGlow: "#75c4ff",
      accent: "#4758b3",
    };
  }

  return {
    ambient: "#8fa5e6",
    key: "#ffffff",
    fill: "#6fb9ff",
    rim: "#8dd8ff",
    planeSurfaceNear: "#9ab3ff",
    planeSurfaceFar: "#7e97ec",
    gridMajor: "#6f8dff",
    gridMinor: "#9ab2ff",
    ribbonA: "#8694ff",
    ribbonB: "#a79dff",
    ribbonC: "#c7d6ff",
    ribbonGlow: "#aebdff",
    knotA: "#8b9dff",
    knotB: "#86a9ff",
    knotC: "#8edaff",
    polyA: "#8dc7ff",
    polyB: "#b7daff",
    polyC: "#d4ecff",
    polyGlow: "#badfff",
    accent: "#a4b2ea",
  };
}

export function HomeHeroSceneObjects({ mode }: HomeHeroSceneObjectsProps) {
  const palette = useMemo(() => paletteByMode(mode), [mode]);

  return (
    <group>
      <ambientLight intensity={0.54} color={palette.ambient} />
      <directionalLight intensity={0.9} color={palette.key} position={[4.1, 5.2, 4.6]} />
      <pointLight intensity={0.24} color={palette.fill} position={[2.4, 0.8, 2.6]} />
      <pointLight intensity={0.2} color={palette.rim} position={[1.2, -0.7, 2.2]} />

      <CoordinatePlane mode={mode} palette={palette} />
      <PrimaryRibbon mode={mode} palette={palette} />
      <SecondaryKnot mode={mode} palette={palette} />
      <SecondaryPolyhedron mode={mode} palette={palette} />
      <DistantAccent palette={palette} />
    </group>
  );
}
