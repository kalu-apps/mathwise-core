import { useEffect, useMemo } from "react";
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  TorusGeometry,
  TorusKnotGeometry,
  type BufferAttribute,
  type ColorRepresentation,
} from "three";

type SceneMode = "light" | "dark";

type HomeHeroSceneObjectsProps = {
  mode: SceneMode;
};

type ScenePalette = {
  ambient: string;
  key: string;
  fill: string;
  rim: string;
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
  solidA: string;
  solidB: string;
  solidC: string;
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
  const c1 = new Color(first);
  const c2 = new Color(middle);
  const c3 = new Color(last);
  const mixed = new Color();
  const luminance = new Color();
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

  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
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

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  return geometry;
}

function buildMainLoopGeometry(palette: ScenePalette): TorusGeometry {
  const geometry = new TorusGeometry(0.96, 0.24, 72, 256, Math.PI * 2);

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
  const geometry = new TorusKnotGeometry(0.5, 0.115, 240, 52, 2, 5);

  applyTriGradient(
    geometry,
    palette.knotA,
    palette.knotB,
    palette.knotC,
    (x, y, z) => y * 0.56 + z * 0.26 - x * 0.22
  );

  return geometry;
}

function buildRoundedSolidGeometry(palette: ScenePalette): TorusKnotGeometry {
  const geometry = new TorusKnotGeometry(0.44, 0.17, 190, 38, 2, 3);
  const position = geometry.attributes.position as BufferAttribute;

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i) * 1.08;
    const y = position.getY(i) * 0.92;
    const z = position.getZ(i) * 1.14;
    const bend = Math.sin(x * 1.35 + z * 0.42) * 0.02;
    position.setXYZ(i, x + bend * 0.38, y + bend * 0.14, z - bend * 0.18);
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

function buildSupportPointTorusGeometry(palette: ScenePalette): BufferGeometry {
  const majorRadius = 0.8;
  const minorRadius = 0.24;
  const uSegments = 132;
  const vSegments = 74;
  const pointCount = uSegments * vSegments;
  const positions = new Float32Array(pointCount * 3);
  const colors = new Float32Array(pointCount * 3);

  const c1 = new Color(palette.supportTorusA);
  const c2 = new Color(palette.supportTorusB);
  const c3 = new Color(palette.supportTorusC);
  const mixed = new Color();
  const polished = new Color();

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

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return geometry;
}

function CoordinatePlane({ mode, palette }: { mode: SceneMode; palette: ScenePalette }) {
  const minorGeometry = useDisposableGeometry(useMemo(() => buildCoordinateLineGeometry(9.6, 18, 18, "both"), []));
  const majorXGeometry = useDisposableGeometry(useMemo(() => buildCoordinateLineGeometry(9.6, 10, 20, "x"), []));
  const majorZGeometry = useDisposableGeometry(useMemo(() => buildCoordinateLineGeometry(9.6, 10, 20, "z"), []));

  return (
    <group position={[0.08, -1.2, -2.34]} rotation={[-0.9, 0.14, -0.02]}>
      <lineSegments geometry={minorGeometry}>
        <lineBasicMaterial
          color={palette.gridMinor}
          transparent
          opacity={mode === "dark" ? 0.1 : 0.2}
          depthWrite={false}
        />
      </lineSegments>

      <lineSegments geometry={majorXGeometry}>
        <lineBasicMaterial
          color={palette.gridMajorA}
          transparent
          opacity={mode === "dark" ? 0.24 : 0.36}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </lineSegments>

      <lineSegments geometry={majorZGeometry}>
        <lineBasicMaterial
          color={palette.gridMajorB}
          transparent
          opacity={mode === "dark" ? 0.2 : 0.32}
          depthWrite={false}
          blending={AdditiveBlending}
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
        opacity={mode === "dark" ? 0.96 : 0.94}
        size={mode === "dark" ? 0.0042 : 0.0044}
        sizeAttenuation
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  );
}

function MuseumGeometryCluster({ mode, palette }: { mode: SceneMode; palette: ScenePalette }) {
  const loopGeometry = useDisposableGeometry(useMemo(() => buildMainLoopGeometry(palette), [palette]));
  const knotGeometry = useDisposableGeometry(useMemo(() => buildKnotGeometry(palette), [palette]));
  const solidGeometry = useDisposableGeometry(useMemo(() => buildRoundedSolidGeometry(palette), [palette]));

  return (
    <group position={[1.7, 0.06, -1.22]} rotation={[0.04, -0.24, 0.03]}>
      <mesh
        geometry={loopGeometry}
        position={[0.82, 1.08, -0.02]}
        rotation={[0.58, 1.18, -0.12]}
        scale={[0.6, 0.6, 0.6]}
      >
        <meshPhysicalMaterial
          vertexColors
          roughness={mode === "dark" ? 0.1 : 0.07}
          metalness={mode === "dark" ? 0.42 : 0.5}
          clearcoat={1}
          clearcoatRoughness={mode === "dark" ? 0.05 : 0.03}
          emissive={palette.loopGlow}
          emissiveIntensity={mode === "dark" ? 0.18 : 0.24}
        />
      </mesh>

      <mesh
        geometry={knotGeometry}
        position={[-3.78, -1.16, -0.52]}
        rotation={[0.28, -0.22, 0.52]}
        scale={[1.92, 1.92, 1.92]}
      >
        <meshPhysicalMaterial
          vertexColors
          roughness={mode === "dark" ? 0.18 : 0.12}
          metalness={mode === "dark" ? 0.24 : 0.36}
          clearcoat={0.94}
          clearcoatRoughness={mode === "dark" ? 0.1 : 0.06}
          emissive={palette.knotB}
          emissiveIntensity={mode === "dark" ? 0.12 : 0.16}
        />
      </mesh>

      <mesh geometry={solidGeometry} position={[-0.58, -0.02, 0.08]} rotation={[0.22, -0.28, 0.1]}>
        <meshPhysicalMaterial
          vertexColors
          roughness={mode === "dark" ? 0.2 : 0.15}
          metalness={mode === "dark" ? 0.22 : 0.3}
          clearcoat={0.92}
          clearcoatRoughness={mode === "dark" ? 0.13 : 0.09}
          emissive={palette.solidB}
          emissiveIntensity={mode === "dark" ? 0.05 : 0.08}
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
      fill: "#ff8f67",
      rim: "#b07bff",
      gridMajorA: "#5f7dff",
      gridMajorB: "#ff86bf",
      gridMinor: "#72e4ff",
      loopA: "#6a4dff",
      loopB: "#8f5dff",
      loopC: "#ff9f5d",
      loopGlow: "#ff9b74",
      knotA: "#7b63ff",
      knotB: "#ff80c7",
      knotC: "#ffb36a",
      orbA: "#806fff",
      orbB: "#ff8abb",
      orbC: "#ffcb7c",
      solidA: "#7d6bff",
      solidB: "#ff89c8",
      solidC: "#ffc181",
      supportTorusA: "#7a6cff",
      supportTorusB: "#ff84cc",
      supportTorusC: "#ffc178",
    };
  }

  return {
    ambient: "#ffd1f0",
    key: "#ffffff",
    fill: "#ffae84",
    rim: "#c58cff",
    gridMajorA: "#4e80ff",
    gridMajorB: "#ff87c5",
    gridMinor: "#3ddfff",
    loopA: "#9a86ff",
    loopB: "#b58dff",
    loopC: "#ffb26a",
    loopGlow: "#ffb08f",
    knotA: "#a08fff",
    knotB: "#ff96c9",
    knotC: "#ffc979",
    orbA: "#a69bff",
    orbB: "#ffa3cc",
    orbC: "#ffd58a",
    solidA: "#a598ff",
    solidB: "#ff9ed3",
    solidC: "#ffd48f",
    supportTorusA: "#9a8eff",
    supportTorusB: "#ff98d6",
    supportTorusC: "#ffd08a",
  };
}

export function HomeHeroSceneObjects({ mode }: HomeHeroSceneObjectsProps) {
  const palette = useMemo(() => paletteByMode(mode), [mode]);

  return (
    <group>
      <ambientLight intensity={mode === "dark" ? 0.54 : 0.66} color={palette.ambient} />
      <directionalLight intensity={mode === "dark" ? 0.96 : 1.14} color={palette.key} position={[4.2, 5.2, 4.9]} />
      <pointLight intensity={mode === "dark" ? 0.24 : 0.34} color={palette.fill} position={[2.1, 1.2, 2.4]} />
      <pointLight intensity={mode === "dark" ? 0.21 : 0.29} color={palette.rim} position={[-1.4, -0.8, 2.2]} />
      <pointLight
        intensity={mode === "dark" ? 0.34 : 0.42}
        color={mode === "dark" ? "#ff8a5c" : "#ff9f78"}
        position={[1.8, 0.92, 1.8]}
      />
      <pointLight
        intensity={mode === "dark" ? 0.28 : 0.36}
        color={mode === "dark" ? "#d07bff" : "#c38dff"}
        position={[-1.9, 0.28, 1.9]}
      />

      <CoordinatePlane mode={mode} palette={palette} />
      <SupportPointTorusArtifact mode={mode} palette={palette} />
      <MuseumGeometryCluster mode={mode} palette={palette} />
    </group>
  );
}
