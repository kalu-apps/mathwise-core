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
  gridMajorA: string;
  gridMajorB: string;
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
  const dome = Math.exp(-(x * x * 0.07 + z * z * 0.04)) * 0.22;
  const saddle = (x * x - z * z) * 0.0045;
  const ripple = Math.sin(x * 0.45 + z * 0.2) * 0.026 + Math.cos(z * 0.34) * 0.018;
  const perspectiveTilt = z * 0.015;

  return dome + saddle + ripple - perspectiveTilt;
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
  const mixed = new THREE.Color();
  const shimmered = new THREE.Color();
  const colors = new Float32Array(position.count * 3);

  for (let i = 0; i < position.count; i += 1) {
    const t = (values[i] - min) / range;

    if (t < 0.5) {
      mixed.lerpColors(c1, c2, t / 0.5);
    } else {
      mixed.lerpColors(c2, c3, (t - 0.5) / 0.5);
    }

    const sparkle = 0.05 + 0.04 * Math.sin(position.getX(i) * 1.22 + position.getZ(i) * 0.84);
    shimmered.copy(mixed).offsetHSL(0, 0, sparkle);

    colors[i * 3] = shimmered.r;
    colors[i * 3 + 1] = shimmered.g;
    colors[i * 3 + 2] = shimmered.b;
  }

  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
}

function buildCoordinatePlaneSurface(mode: SceneMode, palette: ScenePalette): PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(9.6, 5.7, 32, 20);
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
    mode === "dark" ? "#253f83" : "#90a5ff",
    palette.planeSurfaceFar,
    (x, y, z) => y * 0.72 - z * 0.34 + x * 0.1
  );

  return geometry;
}

function buildCoordinateLineGeometry(
  size: number,
  divisions: number,
  slicesPerLine: number,
  axis: "x" | "z" | "both"
) {
  const half = size / 2;
  const vertices: number[] = [];

  if (axis === "x" || axis === "both") {
    for (let i = 0; i <= divisions; i += 1) {
      const x = -half + (size * i) / divisions;

      for (let step = 0; step < slicesPerLine; step += 1) {
        const zA = -half + (size * step) / slicesPerLine;
        const zB = -half + (size * (step + 1)) / slicesPerLine;
        vertices.push(x, sampleFieldHeight(x, zA), zA);
        vertices.push(x, sampleFieldHeight(x, zB), zB);
      }
    }
  }

  if (axis === "z" || axis === "both") {
    for (let i = 0; i <= divisions; i += 1) {
      const z = -half + (size * i) / divisions;

      for (let step = 0; step < slicesPerLine; step += 1) {
        const xA = -half + (size * step) / slicesPerLine;
        const xB = -half + (size * (step + 1)) / slicesPerLine;
        vertices.push(xA, sampleFieldHeight(xA, z), z);
        vertices.push(xB, sampleFieldHeight(xB, z), z);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));

  return geometry;
}

function buildMobiusRibbonGeometry(palette: ScenePalette) {
  const radius = 1.72;
  const width = 0.34;
  const geometry = new THREE.PlaneGeometry(1, 1, 96, 14);
  const position = geometry.attributes.position as BufferAttribute;

  for (let i = 0; i < position.count; i += 1) {
    const u = ((position.getX(i) + 0.5) * TAU) % TAU;
    const v = position.getY(i) * width;

    const radial = radius + v * Math.cos(u * 0.5);
    const x = radial * Math.cos(u);
    const y = radial * Math.sin(u) * 0.62;
    const z = v * Math.sin(u * 0.5) + Math.sin(u * 1.18) * 0.05;

    position.setXYZ(i, x, y, z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();

  applyTriGradient(
    geometry,
    palette.ribbonA,
    palette.ribbonB,
    palette.ribbonC,
    (x, y, z) => x * 0.46 + y * 0.2 + z * 0.4
  );

  return geometry;
}

function buildTorusKnotGeometry(palette: ScenePalette) {
  const geometry = new THREE.TorusKnotGeometry(0.52, 0.115, 96, 16, 2, 3);

  applyTriGradient(
    geometry,
    palette.knotA,
    palette.knotB,
    palette.knotC,
    (x, y, z) => y * 0.56 - x * 0.18 + z * 0.26
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
    const pulse = 1 + 0.07 * Math.sin(x * 2.9 + z * 2.2) + 0.06 * Math.cos(y * 3.2 - x * 1.6);
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
    (x, y, z) => z * 0.54 + y * 0.28 + x * 0.18
  );

  return geometry;
}

function buildDistantArcGeometry(): TorusGeometry {
  return new THREE.TorusGeometry(1.18, 0.035, 10, 54, Math.PI * 1.16);
}

function CoordinatePlane({ mode, palette }: { mode: SceneMode; palette: ScenePalette }) {
  const surfaceGeometry = useDisposableGeometry(
    useMemo(() => buildCoordinatePlaneSurface(mode, palette), [mode, palette])
  );
  const minorGeometry = useDisposableGeometry(useMemo(() => buildCoordinateLineGeometry(9.5, 18, 16, "both"), []));
  const majorXGeometry = useDisposableGeometry(useMemo(() => buildCoordinateLineGeometry(9.5, 12, 20, "x"), []));
  const majorZGeometry = useDisposableGeometry(useMemo(() => buildCoordinateLineGeometry(9.5, 10, 20, "z"), []));

  return (
    <group position={[0.1, -1.24, -2.24]} rotation={[-0.93, 0.16, -0.03]}>
      <mesh geometry={surfaceGeometry}>
        <meshPhysicalMaterial
          vertexColors
          roughness={0.46}
          metalness={0.08}
          clearcoat={0.32}
          clearcoatRoughness={0.28}
          transparent
          opacity={mode === "dark" ? 0.34 : 0.3}
        />
      </mesh>

      <lineSegments geometry={minorGeometry}>
        <lineBasicMaterial
          color={palette.gridMinor}
          transparent
          opacity={mode === "dark" ? 0.08 : 0.07}
          depthWrite={false}
        />
      </lineSegments>

      <lineSegments geometry={majorXGeometry}>
        <lineBasicMaterial
          color={palette.gridMajorA}
          transparent
          opacity={mode === "dark" ? 0.22 : 0.18}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>

      <lineSegments geometry={majorZGeometry}>
        <lineBasicMaterial
          color={palette.gridMajorB}
          transparent
          opacity={mode === "dark" ? 0.18 : 0.14}
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
    <mesh geometry={geometry} position={[1.88, 0.22, -0.24]} rotation={[-0.14, 0.5, 0.27]}>
      <meshPhysicalMaterial
        vertexColors
        emissive={palette.ribbonGlow}
        emissiveIntensity={mode === "dark" ? 0.13 : 0.11}
        roughness={0.2}
        metalness={0.2}
        clearcoat={0.88}
        clearcoatRoughness={0.1}
        iridescence={mode === "dark" ? 0.4 : 0.3}
        iridescenceIOR={1.2}
        iridescenceThicknessRange={[110, 250]}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function SecondaryKnot({ mode, palette }: { mode: SceneMode; palette: ScenePalette }) {
  const geometry = useDisposableGeometry(useMemo(() => buildTorusKnotGeometry(palette), [palette]));

  return (
    <mesh geometry={geometry} position={[0.58, 0.78, -1.74]} rotation={[0.34, -0.22, 0.18]}>
      <meshPhysicalMaterial
        vertexColors
        roughness={0.24}
        metalness={0.18}
        clearcoat={0.76}
        clearcoatRoughness={0.14}
        emissive={palette.knotB}
        emissiveIntensity={mode === "dark" ? 0.08 : 0.07}
      />
    </mesh>
  );
}

function SecondaryPolyhedron({ mode, palette }: { mode: SceneMode; palette: ScenePalette }) {
  const geometry = useDisposableGeometry(useMemo(() => buildPolyhedronGeometry(palette), [palette]));

  return (
    <group position={[-2.14, -0.72, -1.52]} rotation={[0.36, 0.24, -0.18]}>
      <mesh geometry={geometry}>
        <meshPhysicalMaterial
          vertexColors
          roughness={0.24}
          metalness={0.15}
          clearcoat={0.76}
          clearcoatRoughness={0.16}
          transparent
          opacity={mode === "dark" ? 0.9 : 0.88}
          emissive={palette.polyGlow}
          emissiveIntensity={mode === "dark" ? 0.12 : 0.1}
        />
      </mesh>
    </group>
  );
}

function DistantAccent({ palette }: { palette: ScenePalette }) {
  const geometry = useDisposableGeometry(useMemo(() => buildDistantArcGeometry(), []));

  return (
    <mesh geometry={geometry} position={[2.82, 1.08, -2.82]} rotation={[0.22, 0.56, 0.2]}>
      <meshPhysicalMaterial
        color={palette.accent}
        roughness={0.34}
        metalness={0.12}
        clearcoat={0.44}
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
      ambient: "#90a9ff",
      key: "#f5f7ff",
      fill: "#4cb0ff",
      rim: "#6ee7ff",
      planeSurfaceNear: "#203568",
      planeSurfaceFar: "#121f45",
      gridMajorA: "#3f63ff",
      gridMajorB: "#cf59ff",
      gridMinor: "#55cbff",
      ribbonA: "#2c2f9c",
      ribbonB: "#7a47ff",
      ribbonC: "#4ce1ff",
      ribbonGlow: "#8aa2ff",
      knotA: "#3158e6",
      knotB: "#9c4dff",
      knotC: "#4df2ff",
      polyA: "#3ea8ff",
      polyB: "#6acfff",
      polyC: "#ff7bcd",
      polyGlow: "#75ccff",
      accent: "#6b76ff",
    };
  }

  return {
    ambient: "#93a6ed",
    key: "#ffffff",
    fill: "#6bc8ff",
    rim: "#75dcff",
    planeSurfaceNear: "#93acff",
    planeSurfaceFar: "#7895ef",
    gridMajorA: "#6d89ff",
    gridMajorB: "#c87dff",
    gridMinor: "#8fd7ff",
    ribbonA: "#8797ff",
    ribbonB: "#b08eff",
    ribbonC: "#98e8ff",
    ribbonGlow: "#b2b6ff",
    knotA: "#6e92ff",
    knotB: "#c188ff",
    knotC: "#90eaff",
    polyA: "#7ec1ff",
    polyB: "#a8ddff",
    polyC: "#ff9fd8",
    polyGlow: "#b0e2ff",
    accent: "#9eaef3",
  };
}

export function HomeHeroSceneObjects({ mode }: HomeHeroSceneObjectsProps) {
  const palette = useMemo(() => paletteByMode(mode), [mode]);

  return (
    <group>
      <ambientLight intensity={0.56} color={palette.ambient} />
      <directionalLight intensity={0.94} color={palette.key} position={[4.2, 5.4, 4.7]} />
      <pointLight intensity={0.24} color={palette.fill} position={[1.8, 1.1, 2.5]} />
      <pointLight intensity={0.2} color={palette.rim} position={[-1.6, -0.6, 2.1]} />

      <CoordinatePlane mode={mode} palette={palette} />
      <PrimaryRibbon mode={mode} palette={palette} />
      <SecondaryKnot mode={mode} palette={palette} />
      <SecondaryPolyhedron mode={mode} palette={palette} />
      <DistantAccent palette={palette} />
    </group>
  );
}
