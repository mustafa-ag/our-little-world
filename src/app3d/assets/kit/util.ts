// Small geometry helpers shared by the procedural kit. Everything is built
// from boxes / cylinders / spheres / prisms and merged into ONE mesh with a
// MultiMaterial so each piece is a single draw-call source for instancing.

import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import type { Material } from "@babylonjs/core/Materials/material";
import { Vector4 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";

export interface Part {
  mesh: Mesh;
}

let uid = 0;

/** Deterministic 0..1 hash for variant decisions. */
export function hash01(...n: number[]) {
  let h = 2166136261;
  for (const v of n) {
    h ^= Math.floor(v * 1000) & 0xffff;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return ((h >>> 0) % 10000) / 10000;
}

export function strHash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Parse "a=1,b=cream" variant strings. */
export function parseVariant(v: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const kv of v.split(",")) {
    const [k, val] = kv.split("=");
    if (k) out[k.trim()] = (val ?? "").trim();
  }
  return out;
}

export function box(scene: Scene, w: number, h: number, d: number, mat: Material, x = 0, y = 0, z = 0, texRepeat?: number): Mesh {
  let faceUV: Vector4[] | undefined;
  if (texRepeat) {
    // per-face repeat proportional to face size so textures never stretch
    const r = texRepeat;
    faceUV = [
      new Vector4(0, 0, w * r, h * r), // back (+z)
      new Vector4(0, 0, w * r, h * r), // front (-z)
      new Vector4(0, 0, d * r, h * r), // right (+x)
      new Vector4(0, 0, d * r, h * r), // left (-x)
      new Vector4(0, 0, w * r, d * r), // top
      new Vector4(0, 0, w * r, d * r), // bottom
    ];
  }
  const m = CreateBox(`b${uid++}`, { width: w, height: h, depth: d, faceUV }, scene);
  m.material = mat;
  m.position.set(x, y + h / 2, z);
  return m;
}

export function cyl(scene: Scene, dTop: number, dBottom: number, h: number, mat: Material, x = 0, y = 0, z = 0, tess = 10): Mesh {
  const m = CreateCylinder(`c${uid++}`, { diameterTop: dTop, diameterBottom: dBottom, height: h, tessellation: tess }, scene);
  m.material = mat;
  m.position.set(x, y + h / 2, z);
  return m;
}

export function sphere(scene: Scene, d: number, mat: Material, x = 0, y = 0, z = 0, segments = 8): Mesh {
  const m = CreateSphere(`s${uid++}`, { diameter: d, segments }, scene);
  m.material = mat;
  m.position.set(x, y, z);
  return m;
}

/** Flat-shaded sphere squashed into a soft blob (trees, bushes). */
export function blob(scene: Scene, d: number, mat: Material, x = 0, y = 0, z = 0, sy = 0.85, segments = 6): Mesh {
  const m = sphere(scene, d, mat, x, y, z, segments);
  m.scaling.y = sy;
  m.convertToFlatShadedMesh();
  return m;
}

/**
 * Gabled roof: a triangular prism with the ridge along X.
 * width along X, depth along Z, rise = ridge height above the eaves.
 * Base of the prism is at y = 0 (the caller lifts it onto the walls).
 */
export function gable(scene: Scene, width: number, depth: number, rise: number, roofMat: Material, gableMat: Material, texRepeat = 0.5): Mesh {
  const hw = width / 2;
  const hd = depth / 2;
  const positions: number[] = [];
  const indices: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], uvw: number, uvh: number) => {
    const i = positions.length / 3;
    positions.push(...a, ...b, ...c, ...d);
    uvs.push(0, 0, uvw, 0, uvw, uvh, 0, uvh);
    indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  const tri = (a: number[], b: number[], c: number[]) => {
    const i = positions.length / 3;
    positions.push(...a, ...b, ...c);
    uvs.push(0, 0, 1, 0, 0.5, 1);
    indices.push(i, i + 1, i + 2);
  };
  const slope = Math.hypot(hd, rise);
  // south slope (faces -z): eave at z=-hd, ridge at z=0
  quad([-hw, 0, -hd], [hw, 0, -hd], [hw, rise, 0], [-hw, rise, 0], width * texRepeat, slope * texRepeat);
  // north slope (faces +z)
  quad([hw, 0, hd], [-hw, 0, hd], [-hw, rise, 0], [hw, rise, 0], width * texRepeat, slope * texRepeat);
  const slopeEnd = positions.length / 3;
  // gable ends
  tri([-hw, 0, hd], [-hw, 0, -hd], [-hw, rise, 0]); // west (-x)
  tri([hw, 0, -hd], [hw, 0, hd], [hw, rise, 0]); // east (+x)
  VertexData.ComputeNormals(positions, indices, normals);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.normals = normals;
  vd.uvs = uvs;
  const m = new Mesh(`g${uid++}`, scene);
  vd.applyToMesh(m);
  // two submeshes: slopes (roof material) + gable ends (wall material)
  m.subMeshes = [];
  new SubMesh(0, 0, slopeEnd, 0, 12, m);
  new SubMesh(1, slopeEnd, 6, 12, 6, m);
  const mm = new MultiMaterial(`gm${uid++}`, scene);
  mm.subMaterials.push(roofMat, gableMat);
  m.material = mm;
  return m;
}


/** Merge parts into one mesh (multi-material, per-material submeshes). Parts are disposed. */
export function merge(name: string, parts: Mesh[]): Mesh {
  const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, true);
  if (!merged) throw new Error(`merge(${name}) failed`);
  merged.name = name;
  return merged;
}

/** Paint every vertex of a mesh with one colour (lets flat materials be shared while colours differ). */
export function tintVertices(m: Mesh, hex: string) {
  const n = m.getTotalVertices();
  const c = Color4.FromHexString(hex.length === 7 ? hex + "ff" : hex);
  const arr = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    arr[i * 4] = c.r;
    arr[i * 4 + 1] = c.g;
    arr[i * 4 + 2] = c.b;
    arr[i * 4 + 3] = 1;
  }
  m.setVerticesData("color", arr, false, 4);
}
