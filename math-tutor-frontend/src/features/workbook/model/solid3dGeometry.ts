import type {
  Solid3dSectionPoint,
  Solid3dSectionState,
  Solid3dState,
  Solid3dViewState,
} from "./solid3dState";

export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

export type Solid3dMesh = {
  vertices: Vec3[];
  edges: Array<[number, number]>;
  faces: number[][];
};

export type Solid3dGeometry =
  | {
      kind: "mesh";
      mesh: Solid3dMesh;
    }
  | {
      kind: "round";
      shape: RoundSolidShape;
    };

export type RoundSolidShape =
  | "cylinder"
  | "cone"
  | "truncated_cone"
  | "sphere"
  | "hemisphere"
  | "torus";

export type Plane3 = {
  normal: Vec3;
  d: number;
};

export type SolidSurfacePick = {
  point: Vec3;
  faceIndex: number;
  depth: number;
  triangleVertexIndices: [number, number, number];
  barycentric: [number, number, number];
};

export type ProjectedSolidVertex = {
  index: number;
  source: Vec3;
  x: number;
  y: number;
  depth: number;
};

const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

const add = (a: Vec3, b: Vec3): Vec3 => vec(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a: Vec3, b: Vec3): Vec3 => vec(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a: Vec3, scalar: number): Vec3 => vec(a.x * scalar, a.y * scalar, a.z * scalar);
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 =>
  vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const length = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
const normalize = (a: Vec3): Vec3 => {
  const l = length(a) || 1;
  return vec(a.x / l, a.y / l, a.z / l);
};

const nearlyEqual = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

const regularPolygonXZ = (sides: number, radius: number, y: number) =>
  Array.from({ length: sides }, (_, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / sides;
    return vec(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
  });

const buildPrism = (
  sides: number,
  radiusBottom: number,
  radiusTop: number,
  height: number,
  topOffset: { x: number; z: number } = { x: 0, z: 0 }
): Solid3dMesh => {
  const bottom = regularPolygonXZ(sides, radiusBottom, -height / 2);
  const top = regularPolygonXZ(sides, radiusTop, height / 2).map((point) =>
    vec(point.x + topOffset.x, point.y, point.z + topOffset.z)
  );
  const vertices = [...bottom, ...top];
  const edges: Array<[number, number]> = [];
  const faces: number[][] = [];
  for (let index = 0; index < sides; index += 1) {
    const next = (index + 1) % sides;
    edges.push([index, next]);
    edges.push([index + sides, next + sides]);
    edges.push([index, index + sides]);
    faces.push([index, next, next + sides, index + sides]);
  }
  faces.push(Array.from({ length: sides }, (_, index) => sides - 1 - index));
  faces.push(Array.from({ length: sides }, (_, index) => index + sides));
  return orientFacesOutward({ vertices, edges, faces });
};

const buildPyramid = (
  sides: number,
  radius: number,
  height: number,
  apexOffset: { x: number; z: number } = { x: 0, z: 0 }
): Solid3dMesh => {
  const base = regularPolygonXZ(sides, radius, -height / 2);
  const apex = vec(apexOffset.x, height / 2, apexOffset.z);
  const vertices = [...base, apex];
  const apexIndex = vertices.length - 1;
  const edges: Array<[number, number]> = [];
  const faces: number[][] = [];
  for (let index = 0; index < sides; index += 1) {
    const next = (index + 1) % sides;
    edges.push([index, next]);
    edges.push([index, apexIndex]);
    faces.push([index, next, apexIndex]);
  }
  faces.push(Array.from({ length: sides }, (_, index) => sides - 1 - index));
  return orientFacesOutward({ vertices, edges, faces });
};

const buildTetrahedron = (): Solid3dMesh => {
  const vertices = [
    vec(0, 0.78, 0),
    vec(-0.72, -0.45, -0.42),
    vec(0.72, -0.45, -0.42),
    vec(0, -0.45, 0.72),
  ];
  const faces = [
    [0, 1, 2],
    [0, 2, 3],
    [0, 3, 1],
    [1, 3, 2],
  ];
  const edges: Array<[number, number]> = [
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 2],
    [2, 3],
    [3, 1],
  ];
  return orientFacesOutward({ vertices, edges, faces });
};

const buildTrapezoidPrism = (): Solid3dMesh => {
  const baseBottom = [
    vec(-0.72, -0.5, -0.5),
    vec(0.72, -0.5, -0.5),
    vec(0.44, -0.5, 0.5),
    vec(-0.34, -0.5, 0.5),
  ];
  const baseTop = baseBottom.map((point) => vec(point.x, 0.5, point.z));
  const vertices = [...baseBottom, ...baseTop];
  const edges: Array<[number, number]> = [];
  const faces: number[][] = [];
  for (let index = 0; index < 4; index += 1) {
    const next = (index + 1) % 4;
    edges.push([index, next]);
    edges.push([index + 4, next + 4]);
    edges.push([index, index + 4]);
    faces.push([index, next, next + 4, index + 4]);
  }
  faces.push([3, 2, 1, 0]);
  faces.push([4, 5, 6, 7]);
  return orientFacesOutward({ vertices, edges, faces });
};

const buildCylinderMesh = (segments = 28): Solid3dMesh => {
  const safeSegments = Math.max(12, Math.min(80, Math.floor(segments)));
  return buildPrism(safeSegments, 1, 1, 2);
};

const buildConeMesh = (segments = 28): Solid3dMesh => {
  const safeSegments = Math.max(12, Math.min(80, Math.floor(segments)));
  return buildPyramid(safeSegments, 1, 2);
};

const buildFrustumConeMesh = (segments = 28): Solid3dMesh => {
  const safeSegments = Math.max(12, Math.min(80, Math.floor(segments)));
  return buildPrism(safeSegments, 1, 0.56, 2);
};

const buildSphereMesh = (latSegments = 14, lonSegments = 24): Solid3dMesh => {
  const lat = Math.max(6, Math.min(40, Math.floor(latSegments)));
  const lon = Math.max(10, Math.min(72, Math.floor(lonSegments)));
  const vertices: Vec3[] = [];
  const edges: Array<[number, number]> = [];
  const faces: number[][] = [];
  for (let latIndex = 0; latIndex <= lat; latIndex += 1) {
    const theta = (Math.PI * latIndex) / lat;
    const y = Math.cos(theta);
    const ringR = Math.sin(theta);
    for (let lonIndex = 0; lonIndex < lon; lonIndex += 1) {
      const phi = (Math.PI * 2 * lonIndex) / lon;
      vertices.push(vec(Math.cos(phi) * ringR, y, Math.sin(phi) * ringR));
    }
  }
  const idx = (latIndex: number, lonIndex: number) =>
    latIndex * lon + ((lonIndex % lon) + lon) % lon;
  for (let latIndex = 0; latIndex < lat; latIndex += 1) {
    for (let lonIndex = 0; lonIndex < lon; lonIndex += 1) {
      const a = idx(latIndex, lonIndex);
      const b = idx(latIndex, lonIndex + 1);
      const c = idx(latIndex + 1, lonIndex + 1);
      const d = idx(latIndex + 1, lonIndex);
      if (latIndex === 0) {
        faces.push([a, c, d]);
      } else if (latIndex === lat - 1) {
        faces.push([a, b, d]);
      } else {
        faces.push([a, b, c, d]);
      }
      edges.push([a, b], [a, d]);
    }
  }
  return orientFacesOutward({ vertices, edges, faces });
};

const buildHemisphereMesh = (latSegments = 10, lonSegments = 22): Solid3dMesh => {
  const lat = Math.max(4, Math.min(30, Math.floor(latSegments)));
  const lon = Math.max(10, Math.min(72, Math.floor(lonSegments)));
  const vertices: Vec3[] = [];
  const edges: Array<[number, number]> = [];
  const faces: number[][] = [];
  for (let latIndex = 0; latIndex <= lat; latIndex += 1) {
    const theta = (Math.PI * latIndex) / (2 * lat);
    const y = Math.cos(theta);
    const ringR = Math.sin(theta);
    for (let lonIndex = 0; lonIndex < lon; lonIndex += 1) {
      const phi = (Math.PI * 2 * lonIndex) / lon;
      vertices.push(vec(Math.cos(phi) * ringR, y, Math.sin(phi) * ringR));
    }
  }
  const idx = (latIndex: number, lonIndex: number) =>
    latIndex * lon + ((lonIndex % lon) + lon) % lon;
  for (let latIndex = 0; latIndex < lat; latIndex += 1) {
    for (let lonIndex = 0; lonIndex < lon; lonIndex += 1) {
      const a = idx(latIndex, lonIndex);
      const b = idx(latIndex, lonIndex + 1);
      const c = idx(latIndex + 1, lonIndex + 1);
      const d = idx(latIndex + 1, lonIndex);
      if (latIndex === 0) {
        faces.push([a, c, d]);
      } else {
        faces.push([a, b, c, d]);
      }
      edges.push([a, b], [a, d]);
    }
  }
  const baseOffset = vertices.length;
  for (let lonIndex = 0; lonIndex < lon; lonIndex += 1) {
    const phi = (Math.PI * 2 * lonIndex) / lon;
    vertices.push(vec(Math.cos(phi), 0, Math.sin(phi)));
  }
  faces.push(Array.from({ length: lon }, (_, index) => baseOffset + (lon - 1 - index)));
  for (let lonIndex = 0; lonIndex < lon; lonIndex += 1) {
    edges.push([idx(lat, lonIndex), baseOffset + lonIndex]);
    edges.push([baseOffset + lonIndex, baseOffset + ((lonIndex + 1) % lon)]);
  }
  return orientFacesOutward({ vertices, edges, faces });
};

const buildTorusMesh = (majorSegments = 22, minorSegments = 14): Solid3dMesh => {
  const maj = Math.max(8, Math.min(60, Math.floor(majorSegments)));
  const min = Math.max(6, Math.min(40, Math.floor(minorSegments)));
  const majorR = 1;
  const minorR = 0.38;
  const vertices: Vec3[] = [];
  const edges: Array<[number, number]> = [];
  const faces: number[][] = [];
  for (let majorIndex = 0; majorIndex < maj; majorIndex += 1) {
    const theta = (Math.PI * 2 * majorIndex) / maj;
    const cx = Math.cos(theta) * majorR;
    const cz = Math.sin(theta) * majorR;
    for (let minorIndex = 0; minorIndex < min; minorIndex += 1) {
      const phi = (Math.PI * 2 * minorIndex) / min;
      const dx = Math.cos(theta) * Math.cos(phi) * minorR;
      const dy = Math.sin(phi) * minorR;
      const dz = Math.sin(theta) * Math.cos(phi) * minorR;
      vertices.push(vec(cx + dx, dy, cz + dz));
    }
  }
  const idx = (majorIndex: number, minorIndex: number) =>
    (((majorIndex % maj) + maj) % maj) * min + (((minorIndex % min) + min) % min);
  for (let majorIndex = 0; majorIndex < maj; majorIndex += 1) {
    for (let minorIndex = 0; minorIndex < min; minorIndex += 1) {
      const a = idx(majorIndex, minorIndex);
      const b = idx(majorIndex + 1, minorIndex);
      const c = idx(majorIndex + 1, minorIndex + 1);
      const d = idx(majorIndex, minorIndex + 1);
      faces.push([a, b, c, d]);
      edges.push([a, b], [a, d]);
    }
  }
  return orientFacesOutward({ vertices, edges, faces });
};

const orientFacesOutward = (mesh: Solid3dMesh): Solid3dMesh => {
  const center = mesh.vertices.reduce((acc, point) => add(acc, point), vec(0, 0, 0));
  const centerScaled = mul(center, 1 / Math.max(1, mesh.vertices.length));
  const faces = mesh.faces.map((face) => {
    if (face.length < 3) return face;
    const a = mesh.vertices[face[0]];
    const b = mesh.vertices[face[1]];
    const c = mesh.vertices[face[2]];
    const normal = cross(sub(b, a), sub(c, a));
    const toCenter = sub(centerScaled, a);
    if (dot(normal, toCenter) > 0) {
      return [...face].reverse();
    }
    return face;
  });
  return { ...mesh, faces };
};

const solidMeshByPreset = (presetId: string): Solid3dGeometry => {
  if (
    presetId === "cylinder" ||
    presetId === "cone" ||
    presetId === "truncated_cone" ||
    presetId === "sphere" ||
    presetId === "hemisphere" ||
    presetId === "torus"
  ) {
    return { kind: "round", shape: presetId };
  }
  if (presetId === "cube") return { kind: "mesh", mesh: buildPrism(4, 0.72, 0.72, 1.3) };
  if (presetId === "rectangular_prism")
    return { kind: "mesh", mesh: buildPrism(4, 0.78, 0.78, 1.12) };
  if (presetId === "oblique_parallelepiped")
    return {
      kind: "mesh",
      mesh: buildPrism(4, 0.76, 0.76, 1.08, { x: 0.24, z: -0.08 }),
    };
  if (presetId === "triangular_prism") return { kind: "mesh", mesh: buildPrism(3, 0.78, 0.78, 1.25) };
  if (presetId === "prism_trapezoid") return { kind: "mesh", mesh: buildTrapezoidPrism() };
  if (presetId === "pentagonal_prism") return { kind: "mesh", mesh: buildPrism(5, 0.74, 0.74, 1.22) };
  if (presetId === "hexagonal_prism") return { kind: "mesh", mesh: buildPrism(6, 0.74, 0.74, 1.2) };
  if (presetId === "pyramid_triangular") return { kind: "mesh", mesh: buildPyramid(3, 0.78, 1.36) };
  if (presetId === "pyramid_square") return { kind: "mesh", mesh: buildPyramid(4, 0.78, 1.36) };
  if (presetId === "pyramid_pentagonal") return { kind: "mesh", mesh: buildPyramid(5, 0.76, 1.36) };
  if (presetId === "pyramid_hexagonal") return { kind: "mesh", mesh: buildPyramid(6, 0.74, 1.36) };
  if (presetId === "tetrahedron") return { kind: "mesh", mesh: buildTetrahedron() };
  if (presetId === "frustum_triangular")
    return { kind: "mesh", mesh: buildPrism(3, 0.84, 0.42, 1.2) };
  if (presetId === "frustum_square")
    return { kind: "mesh", mesh: buildPrism(4, 0.84, 0.44, 1.18) };
  if (presetId === "frustum_hexagonal")
    return { kind: "mesh", mesh: buildPrism(6, 0.82, 0.44, 1.16) };
  return { kind: "mesh", mesh: buildPrism(4, 0.72, 0.72, 1.3) };
};

export const getSolid3dGeometry = (presetId: string) => solidMeshByPreset(presetId);

export const getSolid3dMesh = (
  presetId: string,
  width: number,
  height: number
): Solid3dMesh | null => {
  const geometry = getSolid3dGeometry(presetId);
  if (geometry.kind === "mesh") {
    return scaleMesh(geometry.mesh, width, height);
  }
  if (geometry.shape === "cylinder") return scaleMesh(buildCylinderMesh(), width, height);
  if (geometry.shape === "cone") return scaleMesh(buildConeMesh(), width, height);
  if (geometry.shape === "truncated_cone")
    return scaleMesh(buildFrustumConeMesh(), width, height);
  if (geometry.shape === "sphere") return scaleMeshUniform(buildSphereMesh(), width, height, 0.4);
  if (geometry.shape === "hemisphere")
    return scaleMeshUniform(buildHemisphereMesh(), width, height, 0.4);
  if (geometry.shape === "torus") return scaleMesh(buildTorusMesh(), width, height);
  return null;
};

export const scaleMesh = (mesh: Solid3dMesh, width: number, height: number) => {
  const sx = Math.max(1, Math.abs(width)) * 0.42;
  const sy = Math.max(1, Math.abs(height)) * 0.42;
  const sz = Math.max(1, Math.min(Math.abs(width), Math.abs(height))) * 0.34;
  return {
    ...mesh,
    vertices: mesh.vertices.map((point) => vec(point.x * sx, point.y * sy, point.z * sz)),
  };
};

const scaleMeshUniform = (mesh: Solid3dMesh, width: number, height: number, factor = 0.4) => {
  const side = Math.max(1, Math.min(Math.abs(width), Math.abs(height))) * factor;
  return {
    ...mesh,
    vertices: mesh.vertices.map((point) => vec(point.x * side, point.y * side, point.z * side)),
  };
};

const planeFromSection = (
  section: Solid3dSectionState,
  mesh: Solid3dMesh
): Plane3 | null => {
  const sectionPoints = resolveSectionPoints(section.points, mesh);
  if (section.mode === "through_points" && sectionPoints.length >= 3) {
    const fitted = fitPlaneThroughPoints(sectionPoints);
    if (!fitted) return null;
    return fitted;
  }
  if (section.mode === "through_points" && section.pointIndices.length >= 3) {
    const a = mesh.vertices[section.pointIndices[0]];
    const b = mesh.vertices[section.pointIndices[1]];
    const c = mesh.vertices[section.pointIndices[2]];
    const normal = normalize(cross(sub(b, a), sub(c, a)));
    return {
      normal,
      d: -dot(normal, a),
    };
  }
  if (section.mode === "through_points") {
    return null;
  }
  const tiltX = (section.tiltX * Math.PI) / 180;
  const tiltY = (section.tiltY * Math.PI) / 180;
  const normal = normalize(
    vec(
      Math.sin(tiltY),
      Math.sin(tiltX),
      Math.cos(tiltX) * Math.cos(tiltY)
    )
  );
  const center = mul(normal, section.offset * Math.max(8, length(normalize(normal))));
  return {
    normal,
    d: -dot(normal, center),
  };
};

export const resolveSectionPointForMesh = (
  point: Solid3dSectionPoint,
  mesh: Solid3dMesh
): Vec3 => {
  const indices = point.triangleVertexIndices;
  const bary = point.barycentric;
  if (
    Array.isArray(indices) &&
    indices.length === 3 &&
    Array.isArray(bary) &&
    bary.length === 3
  ) {
    const i0 = indices[0] ?? -1;
    const i1 = indices[1] ?? -1;
    const i2 = indices[2] ?? -1;
    if (
      i0 >= 0 &&
      i1 >= 0 &&
      i2 >= 0 &&
      i0 < mesh.vertices.length &&
      i1 < mesh.vertices.length &&
      i2 < mesh.vertices.length
    ) {
      return add(
        add(mul(mesh.vertices[i0], bary[0]), mul(mesh.vertices[i1], bary[1])),
        mul(mesh.vertices[i2], bary[2])
      );
    }
  }
  return vec(point.x, point.y, point.z);
};

const resolveSectionPoints = (points: Solid3dSectionPoint[], mesh: Solid3dMesh): Vec3[] =>
  points.map((point) => resolveSectionPointForMesh(point, mesh));

const fitPlaneThroughPoints = (points: Vec3[]): Plane3 | null => {
  if (points.length < 3) return null;
  const centroid = mul(
    points.reduce((acc, point) => add(acc, point), vec(0, 0, 0)),
    1 / points.length
  );
  let xx = 0;
  let xy = 0;
  let xz = 0;
  let yy = 0;
  let yz = 0;
  let zz = 0;
  points.forEach((point) => {
    const centered = sub(point, centroid);
    xx += centered.x * centered.x;
    xy += centered.x * centered.y;
    xz += centered.x * centered.z;
    yy += centered.y * centered.y;
    yz += centered.y * centered.z;
    zz += centered.z * centered.z;
  });
  const detX = yy * zz - yz * yz;
  const detY = xx * zz - xz * xz;
  const detZ = xx * yy - xy * xy;
  let normal = vec(0, 0, 0);
  if (detX >= detY && detX >= detZ) {
    normal = vec(detX, xz * yz - xy * zz, xy * yz - xz * yy);
  } else if (detY >= detX && detY >= detZ) {
    normal = vec(xz * yz - xy * zz, detY, xy * xz - yz * xx);
  } else {
    normal = vec(xy * yz - xz * yy, xy * xz - yz * xx, detZ);
  }
  if (length(normal) < 1e-6) {
    const a = points[0];
    const b = points[1];
    const c = points[2];
    normal = cross(sub(b, a), sub(c, a));
  }
  if (length(normal) < 1e-6) return null;
  const unit = normalize(normal);
  return {
    normal: unit,
    d: -dot(unit, centroid),
  };
};

const signedDistanceToPlane = (plane: Plane3, point: Vec3) =>
  dot(plane.normal, point) + plane.d;

const linePlaneIntersection = (plane: Plane3, a: Vec3, b: Vec3): Vec3 | null => {
  const ab = sub(b, a);
  const denominator = dot(plane.normal, ab);
  if (Math.abs(denominator) < 1e-9) return null;
  const t = -(dot(plane.normal, a) + plane.d) / denominator;
  if (t < -1e-6 || t > 1 + 1e-6) return null;
  return add(a, mul(ab, t));
};

const uniquePoints = (points: Vec3[]) => {
  const unique: Vec3[] = [];
  points.forEach((point) => {
    const exists = unique.some(
      (candidate) =>
        nearlyEqual(candidate.x, point.x, 1e-4) &&
        nearlyEqual(candidate.y, point.y, 1e-4) &&
        nearlyEqual(candidate.z, point.z, 1e-4)
    );
    if (!exists) unique.push(point);
  });
  return unique;
};

const polygonArea3d = (points: Vec3[]) => {
  if (points.length < 3) return 0;
  const origin = points[0];
  let area = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const a = sub(points[index], origin);
    const b = sub(points[index + 1], origin);
    area += length(cross(a, b)) * 0.5;
  }
  return area;
};

const orderCoplanarPoints = (points: Vec3[], planeNormal: Vec3) => {
  if (points.length < 3) return points;
  const centroid = points.reduce((acc, point) => add(acc, point), vec(0, 0, 0));
  const center = mul(centroid, 1 / points.length);
  const axisCandidate = Math.abs(planeNormal.y) < 0.9 ? vec(0, 1, 0) : vec(1, 0, 0);
  const u = normalize(cross(planeNormal, axisCandidate));
  const v = normalize(cross(planeNormal, u));
  return [...points].sort((left, right) => {
    const l = sub(left, center);
    const r = sub(right, center);
    const leftAngle = Math.atan2(dot(l, v), dot(l, u));
    const rightAngle = Math.atan2(dot(r, v), dot(r, u));
    return leftAngle - rightAngle;
  });
};

export const computeSectionPolygon = (
  mesh: Solid3dMesh,
  section: Solid3dSectionState
) => {
  const plane = planeFromSection(section, mesh);
  if (!plane) return { polygon: [] as Vec3[], area: 0 };
  const intersections: Vec3[] = [];
  mesh.edges.forEach(([fromIndex, toIndex]) => {
    const a = mesh.vertices[fromIndex];
    const b = mesh.vertices[toIndex];
    const da = signedDistanceToPlane(plane, a);
    const db = signedDistanceToPlane(plane, b);
    if (Math.abs(da) <= 1e-6 && Math.abs(db) <= 1e-6) {
      intersections.push(a, b);
      return;
    }
    if (da * db > 0) return;
    const point = linePlaneIntersection(plane, a, b);
    if (point) intersections.push(point);
  });
  const uniq = uniquePoints(intersections);
  if (uniq.length < 3) return { polygon: [] as Vec3[], area: 0 };
  const ordered = orderCoplanarPoints(uniq, plane.normal);
  return {
    polygon: ordered,
    area: polygonArea3d(ordered),
  };
};

export const computeSectionMetrics = (polygon: Vec3[]) => {
  if (polygon.length < 2) {
    return {
      sideLengths: [] as number[],
      angles: [] as number[],
      perimeter: 0,
      area: 0,
    };
  }
  const sideLengths = polygon.map((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return length(sub(next, point));
  });
  const perimeter = sideLengths.reduce((sum, edge) => sum + edge, 0);
  const angles = polygon.map((point, index) => {
    const prev = polygon[(index - 1 + polygon.length) % polygon.length];
    const next = polygon[(index + 1) % polygon.length];
    const a = normalize(sub(prev, point));
    const b = normalize(sub(next, point));
    const cos = Math.max(-1, Math.min(1, dot(a, b)));
    return (Math.acos(cos) * 180) / Math.PI;
  });
  return {
    sideLengths,
    angles,
    perimeter,
    area: polygonArea3d(polygon),
  };
};

export const projectPointForView = (point: Vec3, view: Solid3dViewState) => {
  const rotationX = (view.rotationX * Math.PI) / 180;
  const rotationY = (view.rotationY * Math.PI) / 180;
  const x1 = point.x * Math.cos(rotationY) + point.z * Math.sin(rotationY);
  const z1 = -point.x * Math.sin(rotationY) + point.z * Math.cos(rotationY);
  const y2 = point.y * Math.cos(rotationX) - z1 * Math.sin(rotationX);
  const z2 = point.y * Math.sin(rotationX) + z1 * Math.cos(rotationX);
  // Keep silhouette stable while rotating: avoid depth-based squeeze in lesson mode.
  const perspective = 1;
  const zoom = Math.max(0.4, Math.min(2.4, view.zoom));
  return {
    x: x1 * perspective * zoom + view.panX * 100,
    // Flip Y to keep solids in classic math orientation (base visually downward).
    y: -y2 * perspective * zoom + view.panY * 100,
    depth: z2,
  };
};

export const projectSolidVerticesForObject = (params: {
  mesh: Solid3dMesh;
  view: Solid3dViewState;
  objectRect: { x: number; y: number; width: number; height: number };
}): ProjectedSolidVertex[] => {
  const safeWidth = Math.max(1, Math.abs(params.objectRect.width));
  const safeHeight = Math.max(1, Math.abs(params.objectRect.height));
  const pad = Math.max(6, Math.min(safeWidth, safeHeight) * 0.08);
  const contentWidth = Math.max(1, safeWidth - pad * 2);
  const contentHeight = Math.max(1, safeHeight - pad * 2);
  const centerX = params.objectRect.x + safeWidth / 2;
  const centerY = params.objectRect.y + safeHeight / 2;
  const scaleX = contentWidth / safeWidth;
  const scaleY = contentHeight / safeHeight;
  const projectOne = (point: Vec3) => {
    const projected = projectPointForView(point, params.view);
    return {
      x: centerX + projected.x * scaleX,
      y: centerY + projected.y * scaleY,
      depth: projected.depth,
    };
  };
  return params.mesh.vertices.map((vertex, index) => {
    const projected = projectOne(vertex);
    return {
      index,
      source: vertex,
      x: projected.x,
      y: projected.y,
      depth: projected.depth,
    };
  });
};

export const projectSolidPointForObject = (params: {
  point: Vec3;
  view: Solid3dViewState;
  objectRect: { x: number; y: number; width: number; height: number };
}) => {
  const safeWidth = Math.max(1, Math.abs(params.objectRect.width));
  const safeHeight = Math.max(1, Math.abs(params.objectRect.height));
  const pad = Math.max(6, Math.min(safeWidth, safeHeight) * 0.08);
  const contentWidth = Math.max(1, safeWidth - pad * 2);
  const contentHeight = Math.max(1, safeHeight - pad * 2);
  const centerX = params.objectRect.x + safeWidth / 2;
  const centerY = params.objectRect.y + safeHeight / 2;
  const scaleX = contentWidth / safeWidth;
  const scaleY = contentHeight / safeHeight;
  const projected = projectPointForView(params.point, params.view);
  return {
    x: centerX + projected.x * scaleX,
    y: centerY + projected.y * scaleY,
    depth: projected.depth,
  };
};

export const pickSolidPointOnSurface = (params: {
  mesh: Solid3dMesh;
  view: Solid3dViewState;
  objectRect: { x: number; y: number; width: number; height: number };
  point: { x: number; y: number };
}): SolidSurfacePick | null => {
  const projected = projectSolidVerticesForObject({
    mesh: params.mesh,
    view: params.view,
    objectRect: params.objectRect,
  });
  const findFaceIndexForVertex = (vertexIndex: number) => {
    const faceIndex = params.mesh.faces.findIndex((face) => face.includes(vertexIndex));
    return faceIndex >= 0 ? faceIndex : 0;
  };
  const findFaceIndexForEdge = (fromIndex: number, toIndex: number) => {
    const faceIndex = params.mesh.faces.findIndex(
      (face) => face.includes(fromIndex) && face.includes(toIndex)
    );
    return faceIndex >= 0 ? faceIndex : 0;
  };

  const nearestVertex = projected.reduce(
    (acc, vertex) => {
      const distance = Math.hypot(vertex.x - params.point.x, vertex.y - params.point.y);
      if (distance < acc.distance) {
        return { index: vertex.index, distance };
      }
      return acc;
    },
    { index: -1, distance: Number.POSITIVE_INFINITY }
  );
  if (
    nearestVertex.index >= 0 &&
    nearestVertex.index < params.mesh.vertices.length &&
    nearestVertex.distance <= 16
  ) {
    return {
      point: params.mesh.vertices[nearestVertex.index],
      faceIndex: findFaceIndexForVertex(nearestVertex.index),
      depth: projected[nearestVertex.index]?.depth ?? 0,
      triangleVertexIndices: [
        nearestVertex.index,
        nearestVertex.index,
        nearestVertex.index,
      ],
      barycentric: [1, 0, 0],
    };
  }

  let bestEdge: {
    fromIndex: number;
    toIndex: number;
    t: number;
    distance: number;
  } | null = null;
  for (const [fromIndex, toIndex] of params.mesh.edges) {
    const from = projected[fromIndex];
    const to = projected[toIndex];
    if (!from || !to) continue;
    const vx = to.x - from.x;
    const vy = to.y - from.y;
    const edgeLenSq = vx * vx + vy * vy;
    if (edgeLenSq < 1e-8) continue;
    const px = params.point.x - from.x;
    const py = params.point.y - from.y;
    const rawT = (px * vx + py * vy) / edgeLenSq;
    const t = Math.max(0, Math.min(1, rawT));
    const closest = {
      x: from.x + vx * t,
      y: from.y + vy * t,
    };
    const distance = Math.hypot(params.point.x - closest.x, params.point.y - closest.y);
    if (distance > 10) continue;
    if (!bestEdge || distance < bestEdge.distance) {
      bestEdge = { fromIndex, toIndex, t, distance };
    }
  }

  if (!bestEdge) return null;
  const edgePick = bestEdge;

  const fromVertex = params.mesh.vertices[edgePick.fromIndex];
  const toVertex = params.mesh.vertices[edgePick.toIndex];
  const point = add(mul(fromVertex, 1 - edgePick.t), mul(toVertex, edgePick.t));
  const fromProjected = projected[edgePick.fromIndex];
  const toProjected = projected[edgePick.toIndex];
  const depth = fromProjected.depth * (1 - edgePick.t) + toProjected.depth * edgePick.t;
  return {
    point,
    faceIndex: findFaceIndexForEdge(edgePick.fromIndex, edgePick.toIndex),
    depth,
    triangleVertexIndices: [edgePick.fromIndex, edgePick.toIndex, edgePick.toIndex],
    barycentric: [1 - edgePick.t, edgePick.t, 0],
  };
};

const meshVolume = (mesh: Solid3dMesh) => {
  let volume = 0;
  mesh.faces.forEach((face) => {
    if (face.length < 3) return;
    const a = mesh.vertices[face[0]];
    for (let index = 1; index < face.length - 1; index += 1) {
      const b = mesh.vertices[face[index]];
      const c = mesh.vertices[face[index + 1]];
      volume += dot(a, cross(b, c)) / 6;
    }
  });
  return Math.abs(volume);
};

const largestFaceArea = (mesh: Solid3dMesh) =>
  mesh.faces.reduce((max, face) => {
    const points = face.map((index) => mesh.vertices[index]);
    return Math.max(max, polygonArea3d(points));
  }, 0);

const representativeEdgeLength = (mesh: Solid3dMesh) => {
  if (mesh.edges.length === 0) return 0;
  const lengths = mesh.edges.map(([a, b]) => length(sub(mesh.vertices[a], mesh.vertices[b])));
  lengths.sort((left, right) => left - right);
  return lengths[Math.floor(lengths.length / 2)] ?? lengths[0];
};

const representativeAngle = (mesh: Solid3dMesh) => {
  const adjacency = new Map<number, number[]>();
  mesh.edges.forEach(([a, b]) => {
    adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
    adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
  });
  const vertexIndex = [...adjacency.entries()].find(([, neighbours]) => neighbours.length >= 2)?.[0];
  if (vertexIndex === undefined) return 0;
  const neighbours = adjacency.get(vertexIndex) ?? [];
  const a = mesh.vertices[vertexIndex];
  const b = mesh.vertices[neighbours[0]];
  const c = mesh.vertices[neighbours[1]];
  const ab = normalize(sub(b, a));
  const ac = normalize(sub(c, a));
  const cos = Math.max(-1, Math.min(1, dot(ab, ac)));
  return (Math.acos(cos) * 180) / Math.PI;
};

const roundMetrics = (
  shape: RoundSolidShape,
  width: number,
  height: number
) => {
  const r = Math.max(1, Math.min(Math.abs(width), Math.abs(height)) * 0.32);
  const h = Math.max(1, Math.abs(height) * 0.78);
  if (shape === "cylinder") {
    return { edge: h, angle: 90, area: Math.PI * r * r, sectionArea: Math.PI * r * r, volume: Math.PI * r * r * h };
  }
  if (shape === "cone") {
    return { edge: h, angle: 60, area: Math.PI * r * r, sectionArea: 0.5 * Math.PI * r * r, volume: (Math.PI * r * r * h) / 3 };
  }
  if (shape === "truncated_cone") {
    const r2 = r * 0.55;
    return {
      edge: h,
      angle: 60,
      area: Math.PI * (r * r + r2 * r2),
      sectionArea: Math.PI * ((r + r2) / 2) ** 2,
      volume: (Math.PI * h * (r * r + r * r2 + r2 * r2)) / 3,
    };
  }
  if (shape === "sphere") {
    return { edge: 2 * r, angle: 180, area: 4 * Math.PI * r * r, sectionArea: Math.PI * r * r, volume: (4 / 3) * Math.PI * r ** 3 };
  }
  if (shape === "hemisphere") {
    return { edge: r, angle: 180, area: 3 * Math.PI * r * r, sectionArea: Math.PI * r * r, volume: (2 / 3) * Math.PI * r ** 3 };
  }
  const majorR = r;
  const minorR = r * 0.42;
  return {
    edge: 2 * Math.PI * minorR,
    angle: 180,
    area: 4 * Math.PI * Math.PI * majorR * minorR,
    sectionArea: Math.PI * minorR * minorR,
    volume: 2 * Math.PI * Math.PI * majorR * minorR * minorR,
  };
};

export const computeSolid3dMetrics = (params: {
  presetId: string;
  width: number;
  height: number;
  state: Solid3dState;
  sectionId?: string;
}) => {
  const geometry = getSolid3dGeometry(params.presetId);
  if (geometry.kind === "round") {
    const rounded = roundMetrics(geometry.shape, params.width, params.height);
    const roundedMesh = getSolid3dMesh(params.presetId, params.width, params.height);
    const sectionAreasById: Record<string, number> = {};
    if (roundedMesh) {
      params.state.sections.forEach((section) => {
        const sectionData = computeSectionPolygon(roundedMesh, section);
        sectionAreasById[section.id] = sectionData.area;
      });
    }
    const activeSectionId =
      params.sectionId ??
      params.state.sections.find((section) => section.visible)?.id ??
      null;
    return {
      ...rounded,
      sectionArea: activeSectionId ? sectionAreasById[activeSectionId] ?? 0 : 0,
      sectionAreasById,
    };
  }
  const mesh = scaleMesh(geometry.mesh, params.width, params.height);
  const sectionAreasById: Record<string, number> = {};
  params.state.sections.forEach((section) => {
    const sectionData = computeSectionPolygon(mesh, section);
    sectionAreasById[section.id] = sectionData.area;
  });
  const activeSectionId =
    params.sectionId ??
    params.state.sections.find((section) => section.visible)?.id ??
    null;
  const sectionArea = activeSectionId ? sectionAreasById[activeSectionId] ?? 0 : 0;
  return {
    edge: representativeEdgeLength(mesh),
    angle: representativeAngle(mesh),
    area: largestFaceArea(mesh),
    sectionArea,
    volume: meshVolume(mesh),
    sectionAreasById,
  };
};
