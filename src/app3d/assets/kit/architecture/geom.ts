// Geometry primitives for the cottage kit. Everything carries vertex colours
// so merged buildings can share a handful of slot materials.

import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Material } from "@babylonjs/core/Materials/material";
import { box as ubox, cyl as ucyl, sphere as usphere, tintVertices } from "../util";

let uid = 0;

// --------------------------------------------------------------- colours
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r: number, g: number, b: number) {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
/** Mix `a` toward `b` by t (0..1). */
export function mix(a: string, b: string, t: number) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}
/** Lighten (t>0) or darken (t<0). */
export function shade(hex: string, t: number) {
  return mix(hex, t < 0 ? "#000000" : "#ffffff", Math.abs(t));
}

// --------------------------------------------------------------- surfaces
export type V3 = [number, number, number];

/**
 * Accumulates quads / triangles with explicit normals, UVs and one colour per
 * face, then bakes them into a Mesh. Winding is fixed up from the requested
 * normal so callers never think about it.
 */
export class Surface {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];

  constructor(
    private scene: Scene,
    private mat: Material,
  ) {}

  /** Quad a-b-c-d (any consistent order). uvs: 4 pairs. */
  quad(a: V3, b: V3, c: V3, d: V3, normal: V3, hex: string, uvs?: number[]) {
    const [r, g, bl] = hexToRgb(hex).map((v) => v / 255);
    const base = this.pos.length / 3;
    const ab: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross: V3 = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    // Babylon (left-handed): the winding's cross product points AGAINST the visible side
    const flip = cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2] > 0;
    const pts = flip ? [a, d, c, b] : [a, b, c, d];
    const u = uvs ? (flip ? [uvs[0], uvs[1], uvs[6], uvs[7], uvs[4], uvs[5], uvs[2], uvs[3]] : uvs) : [0, 0, 1, 0, 1, 1, 0, 1];
    for (let i = 0; i < 4; i++) {
      this.pos.push(...pts[i]);
      this.nor.push(...normal);
      this.uv.push(u[i * 2], u[i * 2 + 1]);
      this.col.push(r, g, bl, 1);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  tri(a: V3, b: V3, c: V3, normal: V3, hex: string) {
    const [r, g, bl] = hexToRgb(hex).map((v) => v / 255);
    const base = this.pos.length / 3;
    const ab: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross: V3 = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const flip = cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2] > 0;
    const pts = flip ? [a, c, b] : [a, b, c];
    const uvs = [0, 0, 1, 0, 0.5, 1];
    for (let i = 0; i < 3; i++) {
      this.pos.push(...pts[i]);
      this.nor.push(...normal);
      this.uv.push(uvs[i * 2], uvs[i * 2 + 1]);
      this.col.push(r, g, bl, 1);
    }
    this.idx.push(base, base + 1, base + 2);
  }

  /** Axis-aligned rectangle in the z=z0 plane facing -z (the "face space" of a wall), UVs continuous in world units. */
  rectXY(x0: number, x1: number, y0: number, y1: number, z0: number, hex: string, texScale = 1, facing: -1 | 1 = -1) {
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, facing], hex, [x0 * texScale, y0 * texScale, x1 * texScale, y0 * texScale, x1 * texScale, y1 * texScale, x0 * texScale, y1 * texScale]);
  }

  get empty() {
    return this.idx.length === 0;
  }

  bake(name = "surf"): Mesh {
    const vd = new VertexData();
    vd.positions = this.pos;
    vd.normals = this.nor;
    vd.uvs = this.uv;
    vd.colors = this.col;
    vd.indices = this.idx;
    const m = new Mesh(`${name}${uid++}`, this.scene);
    vd.applyToMesh(m);
    m.material = this.mat;
    return m;
  }
}

// --------------------------------------------------------------- solids
/** Tinted box; base at y (not centre). */
export function tbox(scene: Scene, w: number, h: number, d: number, mat: Material, hex: string, x = 0, y = 0, z = 0, texRepeat?: number): Mesh {
  const m = ubox(scene, w, h, d, mat, x, y, z, texRepeat);
  tintVertices(m, hex);
  return m;
}
export function tcyl(scene: Scene, dTop: number, dBottom: number, h: number, mat: Material, hex: string, x = 0, y = 0, z = 0, tess = 8): Mesh {
  const m = ucyl(scene, dTop, dBottom, h, mat, x, y, z, tess);
  tintVertices(m, hex);
  return m;
}
/** Tinted flat-shaded blob (leaf clusters, flowers). */
export function tblob(scene: Scene, d: number, mat: Material, hex: string, x = 0, y = 0, z = 0, sy = 0.8, segments = 4): Mesh {
  const m = usphere(scene, d, mat, x, y, z, segments);
  m.scaling.y = sy;
  m.convertToFlatShadedMesh();
  tintVertices(m, hex);
  return m;
}
