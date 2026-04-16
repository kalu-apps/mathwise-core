import { useEffect, useMemo } from "react";
import type { BufferAttribute, BufferGeometry, PlaneGeometry, TorusGeometry } from "three";
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
  return Math.sin(x * 0.66) * 0.06 + Math.cos(z * 0.46) * 0.05 + Math.sin((x + z) * 0.24) * 0.03;
}

function buildCoordinateFieldSurface(): PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(9.8, 5.2, 40, 24);
  const position = geometry.attributes.position as BufferAttribute;

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    position.setZ(i, sampleFieldHeight(x, y));
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();

  return geometry;
}

function buildCoordinateLineGeometry(size: number, divisions: number, segmentsPerLine: number) {
  const half = size / 2;
  const vertices: number[] = [];

  for (let i = 0; i <= divisions; i += 1) {
    const x = -half + (size * i) / divisions;
    for (let step = 0; step < segmentsPerLine; step += 1) {
      const zA = -half + (size * step) / segmentsPerLine;
      const zB = -half + (size * (step + 1)) / segmentsPerLine;
      vertices.push(x, sampleFieldHeight(x, zA), zA);
      vertices.push(x, sampleFieldHeight(x, zB), zB);
    }
  }

  for (let i = 0; i <= divisions; i += 1) {
    const z = -half + (size * i) / divisions;
    for (let step = 0; step < segmentsPerLine; step += 1) {
      const xA = -half + (size * step) / segmentsPerLine;
      const xB = -half + (size * (step + 1)) / segmentsPerLine;
      vertices.push(xA, sampleFieldHeight(xA, z), z);
      vertices.push(xB, sampleFieldHeight(xB, z), z);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));

  return geometry;
}

function buildMobiusRibbonGeometry() {
  const radius = 1.72;
  const halfWidth = 0.28;
  const geometry = new THREE.PlaneGeometry(1, 1, 140, 16);
  const position = geometry.attributes.position as BufferAttribute;

  for (let i = 0; i < position.count; i += 1) {
    const u = ((position.getX(i) + 0.5) * TAU) % TAU;
    const v = position.getY(i) * halfWidth * 2;

    const radial = radius + v * Math.cos(u * 0.5);
    const x = radial * Math.cos(u);
    const y = v * Math.sin(u * 0.5) + Math.sin(u * 1.4) * 0.08;
    const z = radial * Math.sin(u) * 0.68;

    position.setXYZ(i, x, y, z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();

  return geometry;
}

function buildFacetPolyhedronGeometry() {
  const geometry = new THREE.IcosahedronGeometry(0.78, 2);
  const position = geometry.attributes.position as BufferAttribute;

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);

    const radius = Math.sqrt(x * x + y * y + z * z) || 1;
    const pulse = 1 + 0.1 * Math.sin(x * 3.2 + y * 2.6) + 0.08 * Math.cos(z * 4.1 - x * 1.7);
    const factor = pulse / radius;

    position.setXYZ(i, x * factor * 0.78, y * factor * 0.78, z * factor * 0.78);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();

  return geometry;
}

function buildDistantArcGeometry(): TorusGeometry {
  return new THREE.TorusGeometry(1.28, 0.05, 14, 80, Math.PI * 1.3);
}

function CoordinatePlane({
  surfaceColor,
  majorColor,
  minorColor,
}: {
  surfaceColor: string;
  majorColor: string;
  minorColor: string;
}) {
  const surfaceGeometry = useDisposableGeometry(useMemo(() => buildCoordinateFieldSurface(), []));
  const majorGeometry = useDisposableGeometry(useMemo(() => buildCoordinateLineGeometry(9.7, 14, 36), []));
  const minorGeometry = useDisposableGeometry(useMemo(() => buildCoordinateLineGeometry(9.7, 24, 24), []));

  return (
    <group position={[0.3, -1.12, -1.94]} rotation={[-1.11, 0.35, -0.09]}>
      <mesh geometry={surfaceGeometry}>
        <meshPhysicalMaterial
          color={surfaceColor}
          roughness={0.42}
          metalness={0.12}
          transmission={0.1}
          thickness={1.6}
          clearcoat={0.4}
          clearcoatRoughness={0.2}
          transparent
          opacity={0.28}
        />
      </mesh>

      <lineSegments geometry={minorGeometry}>
        <lineBasicMaterial color={minorColor} transparent opacity={0.16} depthWrite={false} />
      </lineSegments>

      <lineSegments geometry={majorGeometry}>
        <lineBasicMaterial
          color={majorColor}
          transparent
          opacity={0.34}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>
    </group>
  );
}

function PrimaryRibbon({
  color,
  accent,
  iridescence,
}: {
  color: string;
  accent: string;
  iridescence: number;
}) {
  const geometry = useDisposableGeometry(useMemo(() => buildMobiusRibbonGeometry(), []));

  return (
    <mesh geometry={geometry} position={[2.08, 0.2, -0.28]} rotation={[-0.24, 0.74, 0.18]}>
      <meshPhysicalMaterial
        color={color}
        emissive={accent}
        emissiveIntensity={0.14}
        roughness={0.2}
        metalness={0.34}
        clearcoat={0.9}
        clearcoatRoughness={0.1}
        transmission={0.24}
        thickness={1.5}
        iridescence={iridescence}
        iridescenceIOR={1.22}
        iridescenceThicknessRange={[120, 300]}
        sheen={0.24}
        sheenRoughness={0.42}
        side={THREE.DoubleSide}
        transparent
        opacity={0.9}
      />
    </mesh>
  );
}

function SecondaryPolyhedron({ color, glow }: { color: string; glow: string }) {
  const geometry = useDisposableGeometry(useMemo(() => buildFacetPolyhedronGeometry(), []));

  return (
    <group position={[1.45, -0.78, -0.92]} rotation={[0.36, -0.24, 0.34]}>
      <mesh geometry={geometry}>
        <meshPhysicalMaterial
          color={color}
          emissive={glow}
          emissiveIntensity={0.1}
          roughness={0.24}
          metalness={0.18}
          transmission={0.34}
          thickness={1.2}
          clearcoat={0.66}
          clearcoatRoughness={0.2}
          transparent
          opacity={0.84}
        />
      </mesh>
      <mesh geometry={geometry}>
        <meshBasicMaterial color={glow} wireframe transparent opacity={0.16} />
      </mesh>
    </group>
  );
}

function DistantAccent({ color }: { color: string }) {
  const geometry = useDisposableGeometry(useMemo(() => buildDistantArcGeometry(), []));

  return (
    <mesh geometry={geometry} position={[-2.34, -0.9, -1.78]} rotation={[0.26, 0.68, 0.3]}>
      <meshPhysicalMaterial
        color={color}
        roughness={0.26}
        metalness={0.24}
        transmission={0.12}
        clearcoat={0.56}
        clearcoatRoughness={0.2}
        transparent
        opacity={0.36}
      />
    </mesh>
  );
}

export function HomeHeroSceneObjects({ mode }: HomeHeroSceneObjectsProps) {
  const palette =
    mode === "dark"
      ? {
          ambient: "#9cb4ff",
          key: "#eef3ff",
          rim: "#6f8dff",
          fill: "#4eb4ff",
          surface: "#314fb0",
          gridMajor: "#3f63d8",
          gridMinor: "#6c7cff",
          ribbon: "#4b43bc",
          ribbonAccent: "#5f8cff",
          poly: "#5f9fe9",
          polyGlow: "#7ac4ff",
          accent: "#4f57b9",
        }
      : {
          ambient: "#95a9ea",
          key: "#ffffff",
          rim: "#8ea4ff",
          fill: "#7fc5ff",
          surface: "#8ea6ff",
          gridMajor: "#6f8dff",
          gridMinor: "#9ab2ff",
          ribbon: "#95a0ff",
          ribbonAccent: "#c7d6ff",
          poly: "#9fd1ff",
          polyGlow: "#cde6ff",
          accent: "#98a7e5",
        };

  return (
    <group>
      <ambientLight intensity={0.62} color={palette.ambient} />
      <directionalLight intensity={0.92} color={palette.key} position={[4.2, 5.1, 4.8]} />
      <pointLight intensity={0.34} color={palette.fill} position={[2.3, 0.7, 2.8]} />
      <pointLight intensity={0.24} color={palette.rim} position={[-2.8, -0.8, 2.3]} />

      <CoordinatePlane
        surfaceColor={palette.surface}
        majorColor={palette.gridMajor}
        minorColor={palette.gridMinor}
      />
      <PrimaryRibbon
        color={palette.ribbon}
        accent={palette.ribbonAccent}
        iridescence={mode === "dark" ? 0.44 : 0.36}
      />
      <SecondaryPolyhedron color={palette.poly} glow={palette.polyGlow} />
      <DistantAccent color={palette.accent} />
    </group>
  );
}
