import { useEffect, useMemo } from "react";
import type {
  BufferAttribute,
  BufferGeometry,
  BufferGeometry as ThreeBufferGeometry,
  PlaneGeometry,
  TubeGeometry,
} from "three";
import * as THREE from "three";

type SceneMode = "light" | "dark";

type HomeHeroSceneObjectsProps = {
  mode: SceneMode;
};

const TAU = Math.PI * 2;

function useDisposableGeometry<TGeometry extends BufferGeometry>(geometry: TGeometry): TGeometry {
  useEffect(() => () => geometry.dispose(), [geometry]);

  return geometry;
}

function sampleFieldHeight(x: number, z: number) {
  return (
    Math.sin(x * 0.72) * 0.12 +
    Math.cos(z * 0.58) * 0.1 +
    Math.sin((x + z) * 0.46) * 0.07 +
    Math.cos((x - z) * 0.24) * 0.05
  );
}

function buildCoordinateFieldSurface(): PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(10.8, 5.8, 72, 44);
  const position = geometry.attributes.position as BufferAttribute;

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = sampleFieldHeight(x, y);

    position.setZ(i, z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();

  return geometry;
}

function buildMobiusRibbon(): PlaneGeometry {
  const radius = 1.84;
  const halfWidth = 0.32;
  const geometry = new THREE.PlaneGeometry(1, 1, 190, 24);
  const position = geometry.attributes.position as BufferAttribute;

  for (let i = 0; i < position.count; i += 1) {
    const u = ((position.getX(i) + 0.5) * TAU) % TAU;
    const v = position.getY(i) * halfWidth * 2;
    const edgeShift = Math.sin(u * 2.2) * 0.052;

    const radial = radius + (v + edgeShift) * Math.cos(u * 0.5) + Math.sin(u * 3.4) * 0.02;
    const x = radial * Math.cos(u);
    const y = (v + edgeShift) * Math.sin(u * 0.5) + Math.sin(u * 1.7) * 0.13;
    const z = radial * Math.sin(u) * 0.7;

    position.setXYZ(i, x, y, z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();

  return geometry;
}

function buildLemniscateTube(): TubeGeometry {
  const points: THREE.Vector3[] = [];
  const segments = 220;

  for (let i = 0; i <= segments; i += 1) {
    const t = (i / segments) * TAU;
    const sinT = Math.sin(t);
    const denom = 1 + sinT * sinT;

    const x = (1.62 * Math.cos(t)) / denom;
    const y = (0.64 * Math.sin(2 * t)) / denom + Math.cos(t * 1.4) * 0.06;
    const z = 0.48 * sinT + 0.14 * Math.sin(t * 3.4);

    points.push(new THREE.Vector3(x, y, z));
  }

  const curve = new THREE.CatmullRomCurve3(points, true, "centripetal", 0.64);

  return new THREE.TubeGeometry(curve, 280, 0.09, 28, true);
}

function buildParametricGeometry(
  segmentsU: number,
  segmentsV: number,
  sample: (u: number, v: number) => THREE.Vector3
): ThreeBufferGeometry {
  const vertices = new Float32Array((segmentsU + 1) * (segmentsV + 1) * 3);
  const indices: number[] = [];

  let vertexOffset = 0;
  for (let iy = 0; iy <= segmentsV; iy += 1) {
    for (let ix = 0; ix <= segmentsU; ix += 1) {
      const u = ix / segmentsU;
      const v = iy / segmentsV;
      const point = sample(u, v);

      vertices[vertexOffset] = point.x;
      vertices[vertexOffset + 1] = point.y;
      vertices[vertexOffset + 2] = point.z;
      vertexOffset += 3;
    }
  }

  for (let iy = 0; iy < segmentsV; iy += 1) {
    for (let ix = 0; ix < segmentsU; ix += 1) {
      const a = iy * (segmentsU + 1) + ix;
      const b = a + 1;
      const c = a + (segmentsU + 1);
      const d = c + 1;

      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

function buildKleinInspiredShell(): ThreeBufferGeometry {
  return buildParametricGeometry(120, 54, (uNorm, vNorm) => {
    const u = uNorm * TAU;
    const v = vNorm * TAU;

    let x: number;
    let z: number;

    if (u < Math.PI) {
      x =
        3 * Math.cos(u) * (1 + Math.sin(u)) +
        2 * (1 - Math.cos(u) / 2) * Math.cos(u) * Math.cos(v);
      z =
        -8 * Math.sin(u) -
        2 * (1 - Math.cos(u) / 2) * Math.sin(u) * Math.cos(v);
    } else {
      x = 3 * Math.cos(u) * (1 + Math.sin(u)) + 2 * (1 - Math.cos(u) / 2) * Math.cos(v + Math.PI);
      z = -8 * Math.sin(u);
    }

    const y = -2 * (1 - Math.cos(u) / 2) * Math.sin(v);

    return new THREE.Vector3(x * 0.18, y * 0.18, z * 0.12);
  });
}

function buildHyperShell(): ThreeBufferGeometry {
  return buildParametricGeometry(104, 44, (uNorm, vNorm) => {
    const u = -Math.PI + uNorm * TAU;
    const v = -Math.PI * 0.5 + vNorm * Math.PI;

    const radial = 1 + 0.28 * Math.cos(3 * u) * Math.cos(2.2 * v) + 0.12 * Math.sin(4 * u + v);

    const x = radial * Math.cos(v) * Math.cos(u);
    const y = (0.78 + 0.24 * Math.cos(2 * u)) * Math.sin(v);
    const z = radial * Math.cos(v) * Math.sin(u);

    return new THREE.Vector3(x * 0.84, y * 0.84, z * 0.84);
  });
}

function buildRiemannRibbonShell(): ThreeBufferGeometry {
  return buildParametricGeometry(116, 56, (uNorm, vNorm) => {
    const u = -1.9 + uNorm * 3.8;
    const v = vNorm * TAU;
    const radial = 0.68 + 0.17 * Math.sin(v * 2 + u * 1.4);
    const x = u * Math.cos(v) * radial;
    const y = Math.sin(v * 0.5 + u * 1.2) * 0.42 + u * 0.04;
    const z = u * Math.sin(v) * radial;

    return new THREE.Vector3(x, y, z);
  });
}

function buildQuasiCrystal(): THREE.IcosahedronGeometry {
  const geometry = new THREE.IcosahedronGeometry(0.82, 3);
  const position = geometry.attributes.position as BufferAttribute;

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);

    const radius = Math.sqrt(x * x + y * y + z * z);
    const wave =
      1 +
      0.12 * Math.sin(x * 4.4 + y * 2.6) +
      0.11 * Math.cos(y * 4.1 - z * 3.5) +
      0.08 * Math.sin(z * 5.4 + x * 1.8);

    const factor = (radius > 0 ? wave / radius : 1) * 0.82;
    position.setXYZ(i, x * factor, y * factor, z * factor);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();

  return geometry;
}

function buildCoordinateLineGeometry(size: number, divisions: number, segmentsPerLine: number): ThreeBufferGeometry {
  const half = size / 2;
  const vertices: number[] = [];

  for (let i = 0; i <= divisions; i += 1) {
    const x = -half + (size * i) / divisions;

    for (let step = 0; step < segmentsPerLine; step += 1) {
      const zA = -half + (size * step) / segmentsPerLine;
      const zB = -half + (size * (step + 1)) / segmentsPerLine;
      vertices.push(x, sampleFieldHeight(x * 0.92, zA * 0.92), zA);
      vertices.push(x, sampleFieldHeight(x * 0.92, zB * 0.92), zB);
    }
  }

  for (let i = 0; i <= divisions; i += 1) {
    const z = -half + (size * i) / divisions;

    for (let step = 0; step < segmentsPerLine; step += 1) {
      const xA = -half + (size * step) / segmentsPerLine;
      const xB = -half + (size * (step + 1)) / segmentsPerLine;
      vertices.push(xA, sampleFieldHeight(xA * 0.92, z * 0.92), z);
      vertices.push(xB, sampleFieldHeight(xB * 0.92, z * 0.92), z);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));

  return geometry;
}

function buildPolarContourGeometry(radius: number, rings: number, segments = 200): ThreeBufferGeometry {
  const vertices: number[] = [];

  for (let ring = 1; ring <= rings; ring += 1) {
    const currentRadius = (radius * ring) / rings;

    for (let step = 0; step < segments; step += 1) {
      const a = (step / segments) * TAU;
      const b = ((step + 1) / segments) * TAU;
      const xA = Math.cos(a) * currentRadius;
      const zA = Math.sin(a) * currentRadius;
      const xB = Math.cos(b) * currentRadius;
      const zB = Math.sin(b) * currentRadius;
      vertices.push(xA, sampleFieldHeight(xA * 0.92, zA * 0.92), zA);
      vertices.push(xB, sampleFieldHeight(xB * 0.92, zB * 0.92), zB);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));

  return geometry;
}

function HeroCoordinateField({
  planeColor,
  majorColor,
  minorColor,
}: {
  planeColor: string;
  majorColor: string;
  minorColor: string;
}) {
  const surfaceGeometry = useDisposableGeometry(useMemo(() => buildCoordinateFieldSurface(), []));
  const majorGeometry = useDisposableGeometry(
    useMemo(() => buildCoordinateLineGeometry(10.6, 14, 72), [])
  );
  const minorGeometry = useDisposableGeometry(
    useMemo(() => buildCoordinateLineGeometry(10.6, 26, 44), [])
  );
  const contourGeometry = useDisposableGeometry(useMemo(() => buildPolarContourGeometry(4.7, 7), []));

  return (
    <group position={[0.16, -1.18, -1.9]} rotation={[-1.12, 0.32, -0.08]}>
      <mesh geometry={surfaceGeometry}>
        <meshPhysicalMaterial
          color={planeColor}
          roughness={0.34}
          metalness={0.2}
          transmission={0.22}
          thickness={2.5}
          clearcoat={0.7}
          clearcoatRoughness={0.14}
          emissive={majorColor}
          emissiveIntensity={0.05}
          transparent
          opacity={0.34}
        />
      </mesh>

      <lineSegments geometry={minorGeometry}>
        <lineBasicMaterial
          color={minorColor}
          transparent
          opacity={0.24}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>

      <lineSegments geometry={majorGeometry}>
        <lineBasicMaterial
          color={majorColor}
          transparent
          opacity={0.58}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>

      <lineSegments geometry={contourGeometry}>
        <lineBasicMaterial
          color={majorColor}
          transparent
          opacity={0.28}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>
    </group>
  );
}

function HeroMobiusRibbon({
  color,
  glow,
  iridescence,
}: {
  color: string;
  glow: string;
  iridescence: number;
}) {
  const geometry = useDisposableGeometry(useMemo(() => buildMobiusRibbon(), []));

  return (
    <mesh geometry={geometry} position={[1.42, 0.06, -0.06]} rotation={[-0.3, 0.82, 0.22]}>
      <meshPhysicalMaterial
        color={color}
        emissive={glow}
        emissiveIntensity={0.2}
        roughness={0.14}
        metalness={0.42}
        clearcoat={1}
        clearcoatRoughness={0.08}
        transmission={0.44}
        thickness={2.2}
        ior={1.22}
        iridescence={iridescence}
        iridescenceIOR={1.3}
        iridescenceThicknessRange={[100, 420]}
        sheen={0.28}
        sheenRoughness={0.36}
        side={THREE.DoubleSide}
        transparent
        opacity={0.9}
      />
    </mesh>
  );
}

function HeroLemniscateLoop({ color, glow }: { color: string; glow: string }) {
  const geometry = useDisposableGeometry(useMemo(() => buildLemniscateTube(), []));

  return (
    <mesh geometry={geometry} position={[-1.52, 0.08, -0.54]} rotation={[0.42, -0.42, 0.16]}>
      <meshPhysicalMaterial
        color={color}
        emissive={glow}
        emissiveIntensity={0.14}
        roughness={0.18}
        metalness={0.56}
        clearcoat={0.88}
        clearcoatRoughness={0.14}
        transmission={0.12}
        thickness={1.2}
        transparent
        opacity={0.86}
      />
    </mesh>
  );
}

function HeroKleinShell({ color, glow }: { color: string; glow: string }) {
  const geometry = useDisposableGeometry(useMemo(() => buildKleinInspiredShell(), []));

  return (
    <mesh geometry={geometry} position={[-2.08, 0.54, -0.88]} rotation={[0.24, 0.84, -0.14]}>
      <meshPhysicalMaterial
        color={color}
        emissive={glow}
        emissiveIntensity={0.16}
        roughness={0.16}
        metalness={0.38}
        transmission={0.3}
        thickness={1.8}
        clearcoat={0.94}
        clearcoatRoughness={0.14}
        iridescence={0.35}
        iridescenceIOR={1.22}
        iridescenceThicknessRange={[120, 340]}
        side={THREE.DoubleSide}
        transparent
        opacity={0.84}
      />
    </mesh>
  );
}

function HeroHyperShell({ color }: { color: string }) {
  const geometry = useDisposableGeometry(useMemo(() => buildHyperShell(), []));

  return (
    <mesh geometry={geometry} position={[0.16, -0.06, -1.24]} rotation={[0.2, 0.46, -0.12]}>
      <meshPhysicalMaterial
        color={color}
        roughness={0.2}
        metalness={0.3}
        transmission={0.2}
        thickness={1.1}
        clearcoat={0.8}
        clearcoatRoughness={0.18}
        side={THREE.DoubleSide}
        transparent
        opacity={0.52}
      />
    </mesh>
  );
}

function HeroQuasiCrystal({ bodyColor, edgeColor }: { bodyColor: string; edgeColor: string }) {
  const geometry = useDisposableGeometry(useMemo(() => buildQuasiCrystal(), []));

  return (
    <group position={[-2.76, -0.5, -0.2]} rotation={[0.34, 0.36, 0.12]}>
      <mesh geometry={geometry}>
        <meshPhysicalMaterial
          color={bodyColor}
          roughness={0.24}
          metalness={0.22}
          transmission={0.3}
          thickness={1.6}
          clearcoat={0.86}
          clearcoatRoughness={0.16}
          emissive={edgeColor}
          emissiveIntensity={0.06}
          transparent
          opacity={0.78}
        />
      </mesh>
      <mesh geometry={geometry}>
        <meshBasicMaterial color={edgeColor} wireframe transparent opacity={0.28} />
      </mesh>
    </group>
  );
}

function HeroKnotAccent({ color, glow }: { color: string; glow: string }) {
  return (
    <mesh position={[2.8, 0.86, -0.62]} rotation={[0.54, -0.16, 0.62]}>
      <torusKnotGeometry args={[0.58, 0.13, 240, 32, 2, 5]} />
      <meshPhysicalMaterial
        color={color}
        emissive={glow}
        emissiveIntensity={0.14}
        roughness={0.15}
        metalness={0.54}
        clearcoat={0.96}
        clearcoatRoughness={0.1}
        transmission={0.24}
        thickness={1.1}
        transparent
        opacity={0.86}
      />
    </mesh>
  );
}

function HeroRiemannShell({ color, glow }: { color: string; glow: string }) {
  const geometry = useDisposableGeometry(useMemo(() => buildRiemannRibbonShell(), []));

  return (
    <mesh geometry={geometry} position={[2.06, -0.5, -1.06]} rotation={[0.18, -0.72, 0.08]}>
      <meshPhysicalMaterial
        color={color}
        emissive={glow}
        emissiveIntensity={0.11}
        roughness={0.2}
        metalness={0.24}
        transmission={0.34}
        thickness={1.7}
        clearcoat={0.88}
        clearcoatRoughness={0.16}
        side={THREE.DoubleSide}
        transparent
        opacity={0.64}
      />
    </mesh>
  );
}

export function HomeHeroSceneObjects({ mode }: HomeHeroSceneObjectsProps) {
  const palette =
    mode === "dark"
      ? {
          ambient: "#8ea7ff",
          key: "#ecf1ff",
          cyan: "#44cbff",
          violet: "#b18eff",
          magenta: "#d27fff",
          coral: "#ff9f84",
          mobius: "#8ea0ff",
          mobiusGlow: "#48d0ff",
          loop: "#48dfff",
          loopGlow: "#63c8ff",
          klein: "#8f73ff",
          kleinGlow: "#c088ff",
          shell: "#9c8eff",
          knot: "#70d2ff",
          knotGlow: "#ff8ea4",
          crystalBody: "#98b0ff",
          crystalEdge: "#ffa78f",
          plane: "#6f87ff",
          gridMajor: "#75ddff",
          gridMinor: "#7384ff",
          riemann: "#7fd4ff",
          riemannGlow: "#a78fff",
        }
      : {
          ambient: "#6f89eb",
          key: "#ffffff",
          cyan: "#21c1ff",
          violet: "#725de0",
          magenta: "#a35bff",
          coral: "#ff8f72",
          mobius: "#6780f6",
          mobiusGlow: "#2bc4ff",
          loop: "#24b4f4",
          loopGlow: "#41beff",
          klein: "#6b58e2",
          kleinGlow: "#8d6df8",
          shell: "#7665e5",
          knot: "#2c9bf5",
          knotGlow: "#ff8c9d",
          crystalBody: "#6a91f2",
          crystalEdge: "#ff8e78",
          plane: "#5e7de5",
          gridMajor: "#22baef",
          gridMinor: "#5f78de",
          riemann: "#2fb5ff",
          riemannGlow: "#8f72ff",
        };

  const iridescence = mode === "dark" ? 0.55 : 0.48;
  const ambientIntensity = mode === "dark" ? 0.76 : 0.82;

  return (
    <group>
      <ambientLight intensity={ambientIntensity} color={palette.ambient} />
      <directionalLight intensity={1.08} color={palette.key} position={[4.8, 5.2, 4.7]} />
      <pointLight intensity={0.68} color={palette.cyan} position={[-3.2, 1.9, 3.1]} />
      <pointLight intensity={0.62} color={palette.violet} position={[3, -1.3, 2.5]} />
      <pointLight intensity={0.4} color={palette.magenta} position={[0.8, 1.2, 2.8]} />
      <pointLight intensity={0.3} color={palette.coral} position={[-0.4, 1.3, 2.5]} />
      <pointLight intensity={0.22} color={palette.key} position={[0.2, -2.8, 2.1]} />

      <HeroCoordinateField
        planeColor={palette.plane}
        majorColor={palette.gridMajor}
        minorColor={palette.gridMinor}
      />
      <HeroMobiusRibbon
        color={palette.mobius}
        glow={palette.mobiusGlow}
        iridescence={iridescence}
      />
      <HeroLemniscateLoop color={palette.loop} glow={palette.loopGlow} />
      <HeroKleinShell color={palette.klein} glow={palette.kleinGlow} />
      <HeroHyperShell color={palette.shell} />
      <HeroRiemannShell color={palette.riemann} glow={palette.riemannGlow} />
      <HeroQuasiCrystal bodyColor={palette.crystalBody} edgeColor={palette.crystalEdge} />
      <HeroKnotAccent color={palette.knot} glow={palette.knotGlow} />
    </group>
  );
}
