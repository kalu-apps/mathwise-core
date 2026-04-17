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
  supportTorusA: string;
  supportTorusB: string;
  supportTorusC: string;
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
  const geometry = new THREE.PlaneGeometry(9.8, 5.95, 54, 34);
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
  const geometry = new THREE.TorusGeometry(1.04, 0.2, 64, 220, Math.PI * 1.72);

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
  const geometry = new THREE.TorusKnotGeometry(0.5, 0.11, 220, 40, 2, 5);

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
  const geometry = new THREE.SphereGeometry(0.36, 64, 64);

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
  const geometry = new THREE.CapsuleGeometry(0.115, 0.84, 18, 36);

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
  const geometry = new THREE.SphereGeometry(0.46, 62, 62);
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
  const geometry = new THREE.SphereGeometry(0.18, 48, 48);

  applyTriGradient(
    geometry,
    palette.accentA,
    palette.accentB,
    palette.accentC,
    (x, y, z) => x * 0.38 + y * 0.32 + z * 0.22
  );

  return geometry;
}

function buildSupportPointTorusGeometry(palette: ScenePalette): BufferGeometry {
  const majorRadius = 0.8;
  const minorRadius = 0.24;
  const uSegments = 132;
  const vSegments = 72;
  const pointCount = uSegments * vSegments;
  const positions = new Float32Array(pointCount * 3);
  const colors = new Float32Array(pointCount * 3);

  const c1 = new THREE.Color(palette.supportTorusA);
  const c2 = new THREE.Color(palette.supportTorusB);
  const c3 = new THREE.Color(palette.supportTorusC);
  const mixed = new THREE.Color();
  const polished = new THREE.Color();

  let ptr = 0;
  for (let uIndex = 0; uIndex < uSegments; uIndex += 1) {
    const u = (uIndex / uSegments) * Math.PI * 2;
    const cosU = Math.cos(u);
    const sinU = Math.sin(u);

    for (let vIndex = 0; vIndex < vSegments; vIndex += 1) {
      const v = (vIndex / vSegments) * Math.PI * 2;
      const cosV = Math.cos(v);
      const sinV = Math.sin(v);
      const radius = majorRadius + minorRadius * cosV;
      const x = radius * cosU;
      const y = minorRadius * sinV;
      const z = radius * sinU;

      positions[ptr * 3] = x;
      positions[ptr * 3 + 1] = y;
      positions[ptr * 3 + 2] = z;

      const band = (sinV + 1) * 0.5;
      const sweep = (cosU + 1) * 0.5;
      const t = Math.min(1, Math.max(0, band * 0.62 + sweep * 0.38));
      if (t < 0.5) {
        mixed.lerpColors(c1, c2, t / 0.5);
      } else {
        mixed.lerpColors(c2, c3, (t - 0.5) / 0.5);
      }

      const sheen = 0.05 * Math.sin(u * 1.2 + v * 2.3);
      polished.copy(mixed).offsetHSL(0, 0, sheen);
      colors[ptr * 3] = polished.r;
      colors[ptr * 3 + 1] = polished.g;
      colors[ptr * 3 + 2] = polished.b;
      ptr += 1;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

function CoordinatePlane({ mode, palette }: { mode: SceneMode; palette: ScenePalette }) {
  const surfaceGeometry = useDisposableGeometry(
    useMemo(() => buildCoordinatePlaneSurface(mode, palette), [mode, palette])
  );
  const minorGeometry = useDisposableGeometry(useMemo(() => buildCoordinateLineGeometry(9.6, 22, 22, "both"), []));
  const majorXGeometry = useDisposableGeometry(useMemo(() => buildCoordinateLineGeometry(9.6, 12, 26, "x"), []));
  const majorZGeometry = useDisposableGeometry(useMemo(() => buildCoordinateLineGeometry(9.6, 12, 26, "z"), []));

  return (
    <group position={[0.08, -1.2, -2.34]} rotation={[-0.9, 0.14, -0.02]}>
      <mesh geometry={surfaceGeometry}>
        <meshPhysicalMaterial
          vertexColors
          roughness={mode === "dark" ? 0.42 : 0.28}
          metalness={mode === "dark" ? 0.09 : 0.16}
          clearcoat={mode === "dark" ? 0.28 : 0.42}
          clearcoatRoughness={mode === "dark" ? 0.28 : 0.2}
          transparent
          opacity={mode === "dark" ? 0.35 : 0.42}
        />
      </mesh>

      <lineSegments geometry={minorGeometry}>
        <lineBasicMaterial
          color={palette.gridMinor}
          transparent
          opacity={mode === "dark" ? 0.08 : 0.15}
          depthWrite={false}
        />
      </lineSegments>

      <lineSegments geometry={majorXGeometry}>
        <lineBasicMaterial
          color={palette.gridMajorA}
          transparent
          opacity={mode === "dark" ? 0.22 : 0.3}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>

      <lineSegments geometry={majorZGeometry}>
        <lineBasicMaterial
          color={palette.gridMajorB}
          transparent
          opacity={mode === "dark" ? 0.2 : 0.26}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>
    </group>
  );
}

function SupportPointTorusArtifact({ mode, palette }: { mode: SceneMode; palette: ScenePalette }) {
  const geometry = useDisposableGeometry(useMemo(() => buildSupportPointTorusGeometry(palette), [palette]));

  return (
    <points geometry={geometry} position={[-4.55, -2.05, -1.45]} rotation={[-0.34, 0.36, -0.28]} scale={2.6}>
      <pointsMaterial
        vertexColors
        transparent
        opacity={mode === "dark" ? 0.96 : 0.88}
        size={mode === "dark" ? 0.0042 : 0.0038}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
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
      <mesh
        geometry={loopGeometry}
        position={[0.28, 0.16, -0.06]}
        rotation={[0.64, -0.5, 0.86]}
        scale={[2, 2, 2]}
      >
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

      <mesh geometry={orbGeometry} position={[-1.25, 0.92, 0.56]}>
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
      supportTorusA: "#5f52ff",
      supportTorusB: "#ff68bf",
      supportTorusC: "#ffb06f",
    };
  }

  return {
    ambient: "#f3b5ff",
    key: "#ffffff",
    fill: "#ff9ab3",
    rim: "#b29cff",
    planeSurfaceNear: "#a4b8ff",
    planeSurfaceFar: "#819cec",
    gridMajorA: "#6f8fff",
    gridMajorB: "#ff77bf",
    gridMinor: "#64d7ff",
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
    supportTorusA: "#7f7cff",
    supportTorusB: "#ff8ec8",
    supportTorusC: "#ffc48f",
  };
}

export function HomeHeroSceneObjects({ mode }: HomeHeroSceneObjectsProps) {
  const palette = useMemo(() => paletteByMode(mode), [mode]);

  return (
    <group>
      <ambientLight intensity={mode === "dark" ? 0.54 : 0.62} color={palette.ambient} />
      <directionalLight intensity={mode === "dark" ? 0.96 : 1.08} color={palette.key} position={[4.2, 5.2, 4.9]} />
      <pointLight intensity={mode === "dark" ? 0.24 : 0.3} color={palette.fill} position={[2.1, 1.2, 2.4]} />
      <pointLight intensity={mode === "dark" ? 0.21 : 0.26} color={palette.rim} position={[-1.4, -0.8, 2.2]} />

      <CoordinatePlane mode={mode} palette={palette} />
      <SupportPointTorusArtifact mode={mode} palette={palette} />
      <MuseumGeometryCluster mode={mode} palette={palette} />
    </group>
  );
}
