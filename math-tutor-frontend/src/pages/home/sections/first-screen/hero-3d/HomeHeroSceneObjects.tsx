import { useEffect, useMemo } from "react";
import type {
  BufferAttribute,
  BufferGeometry,
  ColorRepresentation,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  TorusKnotGeometry,
  CapsuleGeometry,
} from "three";
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
  loopA: string;
  loopB: string;
  loopC: string;
  loopGlow: string;
  knotA: string;
  knotB: string;
  knotC: string;
  orbA: string;
  orbB: string;
  orbC: string;
  rodA: string;
  rodB: string;
  rodC: string;
  solidA: string;
  solidB: string;
  solidC: string;
  accentA: string;
  accentB: string;
  accentC: string;
};

function useDisposableGeometry<TGeometry extends BufferGeometry>(geometry: TGeometry): TGeometry {
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

function sampleFieldHeight(x: number, z: number) {
  const dome = Math.exp(-(x * x * 0.062 + z * z * 0.05)) * 0.19;
  const sweep = Math.sin(x * 0.52 + z * 0.22) * 0.026 + Math.cos(z * 0.32 - x * 0.18) * 0.02;
  const fold = (x * x - z * z) * 0.0041;
  const perspectiveTilt = z * 0.014;

  return dome + sweep + fold - perspectiveTilt;
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
  const luminance = new THREE.Color();
  const colors = new Float32Array(position.count * 3);

  for (let i = 0; i < position.count; i += 1) {
    const t = (values[i] - min) / range;

    if (t < 0.5) {
      mixed.lerpColors(c1, c2, t / 0.5);
    } else {
      mixed.lerpColors(c2, c3, (t - 0.5) / 0.5);
    }

    const polish = 0.038 * Math.sin(position.getX(i) * 1.2 + position.getY(i) * 1.8 + position.getZ(i) * 0.9);
    luminance.copy(mixed).offsetHSL(0, 0, polish);
    colors[i * 3] = luminance.r;
    colors[i * 3 + 1] = luminance.g;
    colors[i * 3 + 2] = luminance.b;
  }

  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
}

function buildCoordinatePlaneSurface(mode: SceneMode, palette: ScenePalette): PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(9.8, 5.95, 38, 24);
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
    mode === "dark" ? "#273c87" : "#9eaef8",
    palette.planeSurfaceFar,
    (x, y, z) => y * 0.7 - z * 0.3 + x * 0.08
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

function buildMainLoopGeometry(palette: ScenePalette): TorusGeometry {
  const geometry = new THREE.TorusGeometry(1.04, 0.2, 46, 170, Math.PI * 1.72);

  applyTriGradient(
    geometry,
    palette.loopA,
    palette.loopB,
    palette.loopC,
    (x, y, z) => x * 0.42 + y * 0.22 - z * 0.34
  );

  return geometry;
}

function buildKnotGeometry(palette: ScenePalette): TorusKnotGeometry {
  const geometry = new THREE.TorusKnotGeometry(0.5, 0.11, 170, 26, 2, 5);

  applyTriGradient(
    geometry,
    palette.knotA,
    palette.knotB,
    palette.knotC,
    (x, y, z) => y * 0.58 + z * 0.2 - x * 0.24
  );

  return geometry;
}

function buildOrbGeometry(palette: ScenePalette): SphereGeometry {
  const geometry = new THREE.SphereGeometry(0.36, 52, 52);

  applyTriGradient(
    geometry,
    palette.orbA,
    palette.orbB,
    palette.orbC,
    (x, y, z) => y * 0.58 + x * 0.16 + z * 0.26
  );

  return geometry;
}

function buildRodGeometry(palette: ScenePalette): CapsuleGeometry {
  const geometry = new THREE.CapsuleGeometry(0.115, 0.84, 14, 28);

  applyTriGradient(
    geometry,
    palette.rodA,
    palette.rodB,
    palette.rodC,
    (x, y, z) => y * 0.76 + z * 0.22 - x * 0.1
  );

  return geometry;
}

function buildRoundedSolidGeometry(palette: ScenePalette): SphereGeometry {
  const geometry = new THREE.SphereGeometry(0.46, 48, 48);
  const position = geometry.attributes.position as BufferAttribute;

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const nx = x / 0.46;
    const ny = y / 0.46;
    const nz = z / 0.46;
    const exponent = 0.68;
    const sx = Math.sign(nx) * Math.pow(Math.abs(nx), exponent);
    const sy = Math.sign(ny) * Math.pow(Math.abs(ny), exponent);
    const sz = Math.sign(nz) * Math.pow(Math.abs(nz), exponent);
    const length = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
    position.setXYZ(i, (sx * 0.54) / length, (sy * 0.5) / length, (sz * 0.56) / length);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();

  applyTriGradient(
    geometry,
    palette.solidA,
    palette.solidB,
    palette.solidC,
    (x, y, z) => z * 0.5 + y * 0.2 - x * 0.25
  );

  return geometry;
}

function buildAccentOrbGeometry(palette: ScenePalette): SphereGeometry {
  const geometry = new THREE.SphereGeometry(0.18, 40, 40);

  applyTriGradient(
    geometry,
    palette.accentA,
    palette.accentB,
    palette.accentC,
    (x, y, z) => x * 0.38 + y * 0.32 + z * 0.22
  );

  return geometry;
}

function CoordinatePlane({ mode, palette }: { mode: SceneMode; palette: ScenePalette }) {
  const surfaceGeometry = useDisposableGeometry(
    useMemo(() => buildCoordinatePlaneSurface(mode, palette), [mode, palette])
  );
  const minorGeometry = useDisposableGeometry(useMemo(() => buildCoordinateLineGeometry(9.6, 18, 18, "both"), []));
  const majorXGeometry = useDisposableGeometry(useMemo(() => buildCoordinateLineGeometry(9.6, 10, 22, "x"), []));
  const majorZGeometry = useDisposableGeometry(useMemo(() => buildCoordinateLineGeometry(9.6, 10, 22, "z"), []));

  return (
    <group position={[0.08, -1.2, -2.34]} rotation={[-0.9, 0.14, -0.02]}>
      <mesh geometry={surfaceGeometry}>
        <meshPhysicalMaterial
          vertexColors
          roughness={0.44}
          metalness={0.09}
          clearcoat={0.28}
          clearcoatRoughness={0.28}
          transparent
          opacity={mode === "dark" ? 0.35 : 0.28}
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
          opacity={mode === "dark" ? 0.2 : 0.16}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>
    </group>
  );
}

function MuseumGeometryCluster({ mode, palette }: { mode: SceneMode; palette: ScenePalette }) {
  const loopGeometry = useDisposableGeometry(useMemo(() => buildMainLoopGeometry(palette), [palette]));
  const knotGeometry = useDisposableGeometry(useMemo(() => buildKnotGeometry(palette), [palette]));
  const orbGeometry = useDisposableGeometry(useMemo(() => buildOrbGeometry(palette), [palette]));
  const rodGeometry = useDisposableGeometry(useMemo(() => buildRodGeometry(palette), [palette]));
  const solidGeometry = useDisposableGeometry(useMemo(() => buildRoundedSolidGeometry(palette), [palette]));
  const accentGeometry = useDisposableGeometry(useMemo(() => buildAccentOrbGeometry(palette), [palette]));

  return (
    <group position={[1.7, 0.06, -1.22]} rotation={[0.04, -0.24, 0.03]}>
      <mesh geometry={loopGeometry} position={[0.28, 0.16, -0.06]} rotation={[0.64, -0.5, 0.86]}>
        <meshPhysicalMaterial
          vertexColors
          roughness={0.2}
          metalness={0.2}
          clearcoat={0.92}
          clearcoatRoughness={0.11}
          emissive={palette.loopGlow}
          emissiveIntensity={mode === "dark" ? 0.16 : 0.12}
        />
      </mesh>

      <mesh geometry={knotGeometry} position={[-2.92, -1.16, -0.52]} rotation={[0.32, -0.26, 0.44]}>
        <meshPhysicalMaterial
          vertexColors
          roughness={0.22}
          metalness={0.16}
          clearcoat={0.82}
          clearcoatRoughness={0.14}
        />
      </mesh>

      <mesh geometry={orbGeometry} position={[0.85, 0.38, 0.16]}>
        <meshPhysicalMaterial
          vertexColors
          roughness={0.16}
          metalness={0.14}
          clearcoat={1}
          clearcoatRoughness={0.08}
          emissive={palette.orbB}
          emissiveIntensity={mode === "dark" ? 0.08 : 0.06}
        />
      </mesh>

      <mesh geometry={solidGeometry} position={[-0.58, -0.02, 0.08]} rotation={[0.22, -0.28, 0.1]}>
        <meshPhysicalMaterial
          vertexColors
          roughness={0.24}
          metalness={0.18}
          clearcoat={0.78}
          clearcoatRoughness={0.16}
        />
      </mesh>

      <mesh geometry={rodGeometry} position={[-3.06, 1.16, 0.18]} rotation={[-0.28, 0.34, 0.9]}>
        <meshPhysicalMaterial
          vertexColors
          roughness={0.22}
          metalness={0.2}
          clearcoat={0.9}
          clearcoatRoughness={0.14}
        />
      </mesh>

      <mesh geometry={accentGeometry} position={[-3.25, -0.92, 0.08]}>
        <meshPhysicalMaterial
          vertexColors
          roughness={0.16}
          metalness={0.14}
          clearcoat={0.98}
          clearcoatRoughness={0.12}
          transparent
          opacity={mode === "dark" ? 0.92 : 0.88}
        />
      </mesh>

      <mesh geometry={accentGeometry} position={[-2.48, -1.28, -0.38]} scale={0.74}>
        <meshPhysicalMaterial
          vertexColors
          roughness={0.18}
          metalness={0.12}
          clearcoat={0.94}
          clearcoatRoughness={0.12}
          transparent
          opacity={mode === "dark" ? 0.82 : 0.78}
        />
      </mesh>
    </group>
  );
}

function paletteByMode(mode: SceneMode): ScenePalette {
  if (mode === "dark") {
    return {
      ambient: "#f1a8ff",
      key: "#fff6ff",
      fill: "#ff6fa6",
      rim: "#8c7bff",
      planeSurfaceNear: "#1f2f61",
      planeSurfaceFar: "#101e43",
      gridMajorA: "#5f7dff",
      gridMajorB: "#ff67c8",
      gridMinor: "#72e4ff",
      loopA: "#4b3cff",
      loopB: "#ff4f9f",
      loopC: "#ff8b5f",
      loopGlow: "#ff8ad8",
      knotA: "#6a52ff",
      knotB: "#ff5fbe",
      knotC: "#ff9961",
      orbA: "#5a4fff",
      orbB: "#ff5fa8",
      orbC: "#ffb46a",
      rodA: "#7d5bff",
      rodB: "#ff5f93",
      rodC: "#ff9b73",
      solidA: "#5f55ff",
      solidB: "#ff6cbc",
      solidC: "#ffad6e",
      accentA: "#7b66ff",
      accentB: "#ff61b2",
      accentC: "#ffb46f",
    };
  }

  return {
    ambient: "#f3b5ff",
    key: "#ffffff",
    fill: "#ff9ab3",
    rim: "#b29cff",
    planeSurfaceNear: "#9ab0ff",
    planeSurfaceFar: "#7f9af0",
    gridMajorA: "#7d95ff",
    gridMajorB: "#ff8dcf",
    gridMinor: "#8ee3ff",
    loopA: "#8f82ff",
    loopB: "#ff8cc8",
    loopC: "#ffb188",
    loopGlow: "#ffc0e7",
    knotA: "#9d8fff",
    knotB: "#ff8fc9",
    knotC: "#ffbf8f",
    orbA: "#9a90ff",
    orbB: "#ff93bf",
    orbC: "#ffc999",
    rodA: "#ac97ff",
    rodB: "#ff97b9",
    rodC: "#ffbf98",
    solidA: "#9c92ff",
    solidB: "#ff9bd0",
    solidC: "#ffc997",
    accentA: "#ad98ff",
    accentB: "#ffa1d4",
    accentC: "#ffd0a8",
  };
}

export function HomeHeroSceneObjects({ mode }: HomeHeroSceneObjectsProps) {
  const palette = useMemo(() => paletteByMode(mode), [mode]);

  return (
    <group>
      <ambientLight intensity={0.54} color={palette.ambient} />
      <directionalLight intensity={0.96} color={palette.key} position={[4.2, 5.2, 4.9]} />
      <pointLight intensity={0.24} color={palette.fill} position={[2.1, 1.2, 2.4]} />
      <pointLight intensity={0.21} color={palette.rim} position={[-1.4, -0.8, 2.2]} />

      <CoordinatePlane mode={mode} palette={palette} />
      <MuseumGeometryCluster mode={mode} palette={palette} />
    </group>
  );
}
