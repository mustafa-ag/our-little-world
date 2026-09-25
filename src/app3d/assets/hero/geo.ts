// Pure-geometry helpers for hero assets: primitives that carry a material
// slot and per-vertex colours, a deterministic PRNG, colour math, merging
// with slot metadata and slot-aware retinting. Only @babylonjs/core mesh
// builders are used so everything runs in Node (NullEngine) as well as the
// browser.

import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateIcoSphere } from "@babylonjs/core/Meshes/Builders/icoSphereBuilder";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder";
import { CreateRibbon } from "@babylonjs/core/Meshes/Builders/ribbonBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { Vector3, Vector4 } from "@babylonjs/core/Maths/math.vector";
import type { HeroCtx, Slot } from "./slots";

let uid = 0;
const nm = (p: string) => `${p}${uid++}`;

// ---------------------------------------------------------------- random
/** Small deterministic PRNG (mulberry32) so exports are reproducible. */
export function prng(seed: number) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type Rng = ReturnType<typeof prng>;

// ---------------------------------------------------------------- colour
export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export function rgbToHex(c: RGB): string {
  const h = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
}
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}
/** Lighten (t>0, toward white) or darken (t<0, toward a warm shadow) a hex colour. */
export function shade(hex: string, t: number): string {
  return t >= 0 ? mix(hex, "#fff6e6", t) : mix(hex, "#2a1f2e", -t);
}

// ---------------------------------------------------------------- vertex colours
export type ColorFn = (x: number, y: number, z: number, i: number) => RGB;

/** Paint every vertex. `c` is a hex or a function of the local position. */
export function paint(m: Mesh, c: string | ColorFn): Mesh {
  const pos = m.getVerticesData(VertexBuffer.PositionKind);
  const n = m.getTotalVertices();
  const out = new Float32Array(n * 4);
  if (typeof c === "string") {
    const [r, g, b] = hexToRgb(c);
    for (let i = 0; i < n; i++) {
      out[i * 4] = r;
      out[i * 4 + 1] = g;
      out[i * 4 + 2] = b;
      out[i * 4 + 3] = 1;
    }
  } else if (pos) {
    // colour functions see the part's placed position (translation only) so a
    // gradient can span a whole assembled piece
    const { x: ox, y: oy, z: oz } = m.position;
    for (let i = 0; i < n; i++) {
      const [r, g, b] = c(pos[i * 3] + ox, pos[i * 3 + 1] + oy, pos[i * 3 + 2] + oz, i);
      out[i * 4] = r;
      out[i * 4 + 1] = g;
      out[i * 4 + 2] = b;
      out[i * 4 + 3] = 1;
    }
  }
  m.setVerticesData(VertexBuffer.ColorKind, out, true, 4);
  return m;
}

/** Vertical gradient between two hex colours over [y0, y1] (local space), optional per-vertex jitter. */
export function gradientY(dark: string, light: string, y0: number, y1: number, jitter = 0, rng?: Rng): ColorFn {
  const a = hexToRgb(dark);
  const b = hexToRgb(light);
  return (_x, y) => {
    const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
    const j = jitter && rng ? (rng() - 0.5) * jitter : 0;
    return [a[0] + (b[0] - a[0]) * t + j, a[1] + (b[1] - a[1]) * t + j, a[2] + (b[2] - a[2]) * t + j];
  };
}

/** Mild random brightness per vertex (hand-painted irregularity). */
export function jittered(hex: string, amount: number, rng: Rng): ColorFn {
  const c = hexToRgb(hex);
  return () => {
    const j = 1 + (rng() - 0.5) * amount;
    return [c[0] * j, c[1] * j, c[2] * j];
  };
}

// ---------------------------------------------------------------- primitives
function finish(m: Mesh, ctx: HeroCtx, slot: Slot, c: string | ColorFn, x: number, y: number, z: number) {
  m.material = ctx.mat(slot);
  m.position.set(x, y, z);
  paint(m, c);
  return m;
}

/** Box with its base at y. `uv` = texture repeats per unit (proportional per face). */
export function box(ctx: HeroCtx, slot: Slot, w: number, h: number, d: number, c: string | ColorFn, x = 0, y = 0, z = 0, uv = 0): Mesh {
  let faceUV: Vector4[] | undefined;
  if (uv) {
    faceUV = [new Vector4(0, 0, w * uv, h * uv), new Vector4(0, 0, w * uv, h * uv), new Vector4(0, 0, d * uv, h * uv), new Vector4(0, 0, d * uv, h * uv), new Vector4(0, 0, w * uv, d * uv), new Vector4(0, 0, w * uv, d * uv)];
  }
  const m = CreateBox(nm("b"), { width: w, height: h, depth: d, faceUV }, ctx.scene);
  return finish(m, ctx, slot, c, x, y + h / 2, z);
}

/** Cylinder / cone with its base at y. */
export function cyl(ctx: HeroCtx, slot: Slot, dTop: number, dBot: number, h: number, c: string | ColorFn, x = 0, y = 0, z = 0, tess = 10): Mesh {
  const m = CreateCylinder(nm("c"), { diameterTop: dTop, diameterBottom: dBot, height: h, tessellation: tess }, ctx.scene);
  return finish(m, ctx, slot, c, x, y + h / 2, z);
}

/** Smooth sphere centred at (x,y,z). */
export function sphere(ctx: HeroCtx, slot: Slot, d: number, c: string | ColorFn, x = 0, y = 0, z = 0, segments = 8): Mesh {
  const m = CreateSphere(nm("s"), { diameter: d, segments }, ctx.scene);
  return finish(m, ctx, slot, c, x, y, z);
}

export interface IcoOpts {
  /** 0..2 icosphere subdivisions (20 / 80 / 320 tris). */
  subdiv?: number;
  /** Radial noise amplitude as a fraction of the radius. */
  noise?: number;
  /** Non-uniform scale applied before displacement. */
  scale?: [number, number, number];
  flat?: boolean;
  rng?: Rng;
}

/** Noise-displaced, flat-shaded icosphere: the building block for crowns and bushes. */
export function ico(ctx: HeroCtx, slot: Slot, radius: number, c: string | ColorFn, x = 0, y = 0, z = 0, o: IcoOpts = {}): Mesh {
  const m = CreateIcoSphere(nm("i"), { radius, subdivisions: o.subdiv ?? 1, flat: false }, ctx.scene);
  const pos = m.getVerticesData(VertexBuffer.PositionKind)!;
  const sc = o.scale ?? [1, 1, 1];
  const rng = o.rng ?? prng(radius * 100 + x * 17 + y * 31 + z * 13);
  // shared vertices get the same displacement (icosphere builder shares them when flat=false)
  const amp = (o.noise ?? 0.16) * radius;
  for (let i = 0; i < pos.length; i += 3) {
    const px = pos[i] * sc[0];
    const py = pos[i + 1] * sc[1];
    const pz = pos[i + 2] * sc[2];
    const len = Math.hypot(px, py, pz) || 1;
    const k = 1 + ((rng() - 0.5) * 2 * amp) / len;
    pos[i] = px * k;
    pos[i + 1] = py * k;
    pos[i + 2] = pz * k;
  }
  m.updateVerticesData(VertexBuffer.PositionKind, pos);
  if (o.flat !== false) m.convertToFlatShadedMesh();
  else {
    const idx = m.getIndices()!;
    const nrm = m.getVerticesData(VertexBuffer.NormalKind)!;
    VertexData.ComputeNormals(pos, idx, nrm);
    m.updateVerticesData(VertexBuffer.NormalKind, nrm);
  }
  return finish(m, ctx, slot, c, x, y, z);
}

/** Tube along `path` with a radius function (trunks, branches, lamp arms). */
export function tube(ctx: HeroCtx, slot: Slot, path: Vector3[], radius: (i: number, dist: number) => number, c: string | ColorFn, tess = 7, cap = Mesh.CAP_ALL): Mesh {
  const m = CreateTube(nm("t"), { path, radiusFunction: radius, tessellation: tess, cap, sideOrientation: Mesh.FRONTSIDE }, ctx.scene);
  return finish(m, ctx, slot, c, 0, 0, 0);
}

/** Lofted surface through closed cross-sections (car body, barrel). */
export function loft(ctx: HeroCtx, slot: Slot, sections: Vector3[][], c: string | ColorFn, closeArray = false): Mesh {
  const m = CreateRibbon(nm("r"), { pathArray: sections, closePath: true, closeArray, sideOrientation: Mesh.FRONTSIDE }, ctx.scene);
  return finish(m, ctx, slot, c, 0, 0, 0);
}

/** Cheap little ball (20 smooth-shaded faces) for buttons, highlights, finials. */
export function dot(ctx: HeroCtx, slot: Slot, d: number, c: string | ColorFn, x = 0, y = 0, z = 0): Mesh {
  return ico(ctx, slot, d / 2, c, x, y, z, { subdiv: 1, noise: 0, flat: false });
}

export function torus(ctx: HeroCtx, slot: Slot, d: number, thickness: number, c: string | ColorFn, x = 0, y = 0, z = 0, tess = 10): Mesh {
  const m = CreateTorus(nm("o"), { diameter: d, thickness, tessellation: tess }, ctx.scene);
  return finish(m, ctx, slot, c, x, y, z);
}

/** Capsule along Y centred at (x,y,z). */
export function capsule(ctx: HeroCtx, slot: Slot, r: number, h: number, c: string | ColorFn, x = 0, y = 0, z = 0, tess = 8): Mesh {
  const m = CreateCapsule(nm("p"), { radius: r, height: h, tessellation: tess, subdivisions: 1, capSubdivisions: 2 }, ctx.scene);
  return finish(m, ctx, slot, c, x, y, z);
}

/** Rounded cross-section (superellipse) in the XY plane at depth z, for lofts. */
export function roundedSection(w: number, h: number, cy: number, z: number, n = 14, power = 2.6): Vector3[] {
  const out: Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const cs = Math.cos(a);
    const sn = Math.sin(a);
    const x = Math.sign(cs) * Math.pow(Math.abs(cs), 2 / power) * (w / 2);
    const y = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / power) * (h / 2);
    out.push(new Vector3(x, cy + y, z));
  }
  return out;
}

/** A flat diamond leaf (2 triangles), tip pointing +Y, normal +Z. Double sided via two faces. */
export function leaf(ctx: HeroCtx, slot: Slot, w: number, h: number, c: string | ColorFn, x = 0, y = 0, z = 0): Mesh {
  const positions = [0, 0, 0, w / 2, h * 0.45, 0, 0, h, 0, -w / 2, h * 0.45, 0];
  const indices = [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2];
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, [0, 1, 2, 0, 2, 3], normals);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.normals = normals;
  vd.uvs = [0.5, 0, 1, 0.45, 0.5, 1, 0, 0.45];
  const m = new Mesh(nm("l"), ctx.scene);
  vd.applyToMesh(m);
  return finish(m, ctx, slot, c, x, y, z);
}

// ---------------------------------------------------------------- merge / slots
export interface SlotMeta {
  /** Slot name per submesh (same order as MultiMaterial.subMaterials). */
  olwSlots?: string[];
}

/**
 * Merge parts into one mesh with one submesh per slot; records the slot per
 * submesh in `metadata.olwSlots` so materials can be swapped/retinted later.
 * Parts are disposed.
 */
export function merge(name: string, parts: Mesh[]): Mesh {
  // stable-sort by material so Babylon coalesces each slot into ONE submesh
  // (= one draw call per slot for the whole instance batch)
  const order = new Map<string, number>();
  parts.forEach((p) => {
    const n = p.material?.name ?? "";
    if (!order.has(n)) order.set(n, order.size);
  });
  const sorted = parts.map((p, i) => ({ p, i, k: order.get(p.material?.name ?? "")! })).sort((a, b) => a.k - b.k || a.i - b.i).map((e) => e.p);
  for (const p of sorted) p.computeWorldMatrix(true);
  const m = Mesh.MergeMeshes(sorted, true, true, undefined, false, true);
  if (!m) throw new Error(`hero merge(${name}) failed`);
  m.name = name;
  m.id = name;
  tagSlots(m);
  return m;
}

/** Fill `metadata.olwSlots` from the current material names (placeholder or loaded). */
export function tagSlots(m: Mesh) {
  const mat = m.material;
  const slots = mat instanceof MultiMaterial ? mat.subMaterials.map((s) => s?.name ?? "") : [mat?.name ?? ""];
  m.metadata = { ...(m.metadata ?? {}), olwSlots: slots } as SlotMeta;
}

export function slotsOf(m: Mesh): string[] {
  const meta = m.metadata as SlotMeta | null;
  if (meta?.olwSlots) return meta.olwSlots;
  tagSlots(m);
  return (m.metadata as SlotMeta).olwSlots!;
}

/** Vertex ranges [start, count] per submesh whose slot matches. */
function rangesFor(m: Mesh, slot: string): [number, number][] {
  const slots = slotsOf(m);
  const out: [number, number][] = [];
  if (m.subMeshes.length <= 1 || slots.length <= 1) {
    if (slots[0] === slot) out.push([0, m.getTotalVertices()]);
    return out;
  }
  m.subMeshes.forEach((sm) => {
    if (slots[sm.materialIndex] === slot) out.push([sm.verticesStart, sm.verticesCount]);
  });
  return out;
}

/**
 * Re-colour the vertices of one slot: `fn` maps the current colour to a new
 * one (the baked colour carries the shading, so a ratio keeps the gradient).
 */
export function retintSlot(m: Mesh, slot: string, fn: (r: number, g: number, b: number, i: number) => RGB) {
  const col = m.getVerticesData(VertexBuffer.ColorKind);
  if (!col) return;
  const stride = m.getVertexBuffer(VertexBuffer.ColorKind)?.getSize() ?? 4;
  const data = col instanceof Float32Array ? col : new Float32Array(col);
  let touched = false;
  for (const [start, count] of rangesFor(m, slot)) {
    for (let i = start; i < start + count; i++) {
      const o = i * stride;
      const [r, g, b] = fn(data[o], data[o + 1], data[o + 2], i);
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      touched = true;
    }
  }
  if (!touched) return;
  if (m.getVertexBuffer(VertexBuffer.ColorKind)?.isUpdatable()) m.updateVerticesData(VertexBuffer.ColorKind, data);
  else m.setVerticesData(VertexBuffer.ColorKind, data, true, stride);
}

/** Multiply a slot's vertex colours by (to / from): swaps a baked base colour for another, keeping shading. */
export function recolourSlot(m: Mesh, slot: string, from: string, to: string) {
  if (from === to) return;
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const k: RGB = [b[0] / Math.max(0.02, a[0]), b[1] / Math.max(0.02, a[1]), b[2] / Math.max(0.02, a[2])];
  retintSlot(m, slot, (r, g, bl) => [Math.min(1, r * k[0]), Math.min(1, g * k[1]), Math.min(1, bl * k[2])]);
}

export function v3(x: number, y: number, z: number) {
  return new Vector3(x, y, z);
}
