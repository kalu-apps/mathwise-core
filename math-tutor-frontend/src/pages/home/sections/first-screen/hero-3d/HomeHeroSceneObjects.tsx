import { useEffect, useMemo } from "react";
import type { BufferAttribute, PlaneGeometry } from "three";
import * as THREE from "three";

function buildCurvedPlane(): PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(9.4, 4.6, 34, 24);
  const position = geometry.attributes.position as BufferAttribute;

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = Math.sin(x * 1.02) * 0.09 + Math.cos(y * 1.84) * 0.08;

    position.setZ(i, z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();

  return geometry;
}

function HeroMathSurface() {
  const geometry = useMemo(() => buildCurvedPlane(), []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh
      geometry={geometry}
      position={[0.38, -1.12, -1.62]}
      rotation={[-1.16, 0.3, -0.08]}
    >
      <meshStandardMaterial
        color="#86a0ff"
        roughness={0.68}
        metalness={0.14}
        transparent
        opacity={0.22}
        wireframe
      />
    </mesh>
  );
}

export function HomeHeroSceneObjects() {
  return (
    <group>
      <ambientLight intensity={0.74} color="#9bb0ff" />
      <directionalLight intensity={0.84} color="#dae2ff" position={[4.2, 5.4, 4.8]} />
      <pointLight intensity={0.48} color="#71d7ff" position={[-3.6, 1.4, 3.2]} />
      <pointLight intensity={0.52} color="#be98ff" position={[3.4, -1.2, 2.5]} />

      <mesh position={[-2.44, 0.88, -0.38]}>
        <sphereGeometry args={[0.98, 58, 58]} />
        <meshPhysicalMaterial
          color="#a3b2ff"
          roughness={0.34}
          metalness={0.12}
          clearcoat={0.74}
          clearcoatRoughness={0.28}
          transmission={0.16}
          transparent
          opacity={0.64}
        />
      </mesh>

      <mesh position={[2.72, 0.44, -0.24]} rotation={[1.2, 0.56, 0.14]}>
        <torusGeometry args={[1.22, 0.16, 46, 180, Math.PI * 1.46]} />
        <meshStandardMaterial
          color="#87a4ff"
          roughness={0.44}
          metalness={0.36}
          transparent
          opacity={0.76}
        />
      </mesh>

      <mesh position={[1.72, -0.98, -0.56]} rotation={[0.22, -0.48, 0.12]}>
        <icosahedronGeometry args={[0.62, 1]} />
        <meshStandardMaterial
          color="#7be4e4"
          roughness={0.46}
          metalness={0.24}
          transparent
          opacity={0.72}
        />
      </mesh>

      <mesh position={[-0.92, 0.18, -1.18]} rotation={[0.34, 0.42, 0]}>
        <torusGeometry args={[0.72, 0.08, 30, 110]} />
        <meshStandardMaterial
          color="#c39cff"
          roughness={0.52}
          metalness={0.24}
          transparent
          opacity={0.58}
        />
      </mesh>

      <HeroMathSurface />
    </group>
  );
}
