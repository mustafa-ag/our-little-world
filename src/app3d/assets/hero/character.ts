// Storybook character: slightly oversized head, big dark eyes with
// highlights, button nose, soft smile and blush, long hair with a fringe and
// real volume (offset cap + fringe locks + side locks + back mass), rounded
// cardigan body, A-line skirt or jeans, rounded hands and boots.
//
// Hierarchy (all names are stable so the GLB and the procedural build are
// interchangeable; pivots are TransformNodes, geometry lives in *_geo meshes):
//   <name>            root (placed/rotated by the view)
//     body            bob / breathing pivot
//       torso_geo
//       head          neck pivot  → head_geo, hair
//       armL / armR   shoulder pivots → armL_geo / armR_geo
//       legL / legR   hip pivots → legL_geo / legR_geo
//
// Colours are baked from DEFAULT_COLORS into the role slots (olw_skin,
// olw_hair, olw_top, olw_bottom, olw_shoes); retintCharacter() recolours by
// ratio from a pristine copy, so any CharColors can be applied repeatedly to
// either build without drift.

import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { type ColorFn, box, capsule, cyl, dot, hexToRgb, ico, merge, prng, retintSlot, shade, sphere, torus, tube, v3 } from "./geo";
import type { HeroCtx, RoleSlot } from "./slots";

export interface CharacterColors {
  skin: string;
  hair: string;
  top: string;
  bottom: string;
  shoes: string;
}

/** The colours baked into the player GLB (Juju: warm brown hair, dusty-pink cardigan, dusty-blue skirt). */
export const DEFAULT_COLORS: CharacterColors = {
  skin: "#f2c9a2",
  hair: "#5a3a26",
  top: "#d4989a",
  bottom: "#6f7fa3",
  shoes: "#5a3a2e",
};

export type HairStyle = "long" | "bob" | "ponytail" | "short" | "bun" | "curly";
export const HAIR_STYLES: HairStyle[] = ["long", "bob", "ponytail", "short", "bun", "curly"];

export interface CharacterOpts {
  name?: string;
  hair?: HairStyle;
  /** A-line skirt with tights (true) or jeans (false). */
  skirt?: boolean;
  scarf?: boolean;
}

export const CHAR_HEIGHT = 1.5;
export const HEAD_Y = 1.06;
const HEAD_R = 0.31;
const NECK_Y = 0.78;
const SHOULDER_Y = 0.73;
const HIP_Y = 0.42;

export interface CharacterBuild {
  root: TransformNode;
  body: TransformNode;
  head: TransformNode;
  armL: TransformNode;
  armR: TransformNode;
  legL: TransformNode;
  legR: TransformNode;
  meshes: Mesh[];
}

const ROLES: RoleSlot[] = ["olw_skin", "olw_hair", "olw_top", "olw_bottom", "olw_shoes"];
const ROLE_KEY: Record<RoleSlot, keyof CharacterColors> = { olw_skin: "skin", olw_hair: "hair", olw_top: "top", olw_bottom: "bottom", olw_shoes: "shoes" };

/** Vertical soft shading for a body part. */
function lit(hex: string, y0: number, y1: number, dark = -0.18, light = 0.06): ColorFn {
  const a = hexToRgb(shade(hex, dark));
  const b = hexToRgb(shade(hex, light));
  return (_x, y) => {
    const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };
}

function pivot(name: string, parent: TransformNode, x: number, y: number, z: number) {
  const t = new TransformNode(name, parent.getScene());
  t.parent = parent;
  t.position.set(x, y, z);
  return t;
}

function hair(ctx: HeroCtx, style: HairStyle, c: CharacterColors, rng: () => number): Mesh[] {
  const p: Mesh[] = [];
  const col = lit(c.hair, HEAD_Y - 0.5, HEAD_Y + 0.35, -0.06, 0.28);
  // cap: an offset sphere that hugs the top/back and leaves the face clear
  const cap = sphere(ctx, "olw_hair", HEAD_R * 2 + 0.09, col, 0, HEAD_Y + 0.045, -0.075, 10);
  cap.scaling.set(1.04, 0.98, 1);
  p.push(cap);
  // fringe: rounded locks sweeping across the forehead
  const locks: [number, number, number, number][] = [
    [-0.21, 0.08, 0.19, 0.4],
    [-0.11, 0.115, 0.24, 0.2],
    [0.0, 0.13, 0.255, 0.0],
    [0.11, 0.12, 0.24, -0.25],
    [0.21, 0.09, 0.2, -0.45],
  ];
  for (const [x, y, z, rz] of locks) {
    const l = sphere(ctx, "olw_hair", 0.22, col, x, HEAD_Y + y, z, 5);
    l.scaling.set(0.66, 1.05, 0.55);
    l.rotation.z = rz;
    l.rotation.x = -0.25;
    p.push(l);
  }
  const sideLock = (x: number, len: number, flare: number) => {
    const s = capsule(ctx, "olw_hair", 0.075, len, col, x, HEAD_Y - len / 2 + 0.05, 0.02, 6);
    s.rotation.z = -Math.sign(x) * flare;
    return s;
  };
  switch (style) {
    case "long": {
      p.push(sideLock(-0.285, 0.62, 0.1), sideLock(0.285, 0.62, 0.1));
      const back = capsule(ctx, "olw_hair", 0.2, 0.7, col, 0, HEAD_Y - 0.22, -0.2, 7);
      back.scaling.set(1.35, 1, 0.7);
      p.push(back);
      // flicked ends
      for (const x of [-0.2, 0.2]) {
        const e = sphere(ctx, "olw_hair", 0.16, col, x, HEAD_Y - 0.6, -0.16, 3);
        e.scaling.set(1, 0.7, 0.8);
        p.push(e);
      }
      break;
    }
    case "bob": {
      p.push(sideLock(-0.28, 0.36, 0.02), sideLock(0.28, 0.36, 0.02));
      const back = capsule(ctx, "olw_hair", 0.22, 0.4, col, 0, HEAD_Y - 0.06, -0.14, 7);
      back.scaling.set(1.4, 1, 0.8);
      p.push(back);
      break;
    }
    case "ponytail": {
      p.push(sideLock(-0.27, 0.22, 0.05), sideLock(0.27, 0.22, 0.05));
      const tie = sphere(ctx, "olw_hair", 0.14, col, 0, HEAD_Y + 0.12, -0.32, 3);
      p.push(tie);
      const tail = capsule(ctx, "olw_hair", 0.09, 0.5, col, 0, HEAD_Y - 0.12, -0.4, 6);
      tail.rotation.x = -0.35;
      p.push(tail);
      const tip = sphere(ctx, "olw_hair", 0.15, col, 0, HEAD_Y - 0.38, -0.32, 3);
      tip.scaling.set(1, 0.7, 0.9);
      p.push(tip);
      break;
    }
    case "short": {
      for (let i = 0; i < 5; i++) {
        const a = -0.9 + i * 0.45;
        const t = sphere(ctx, "olw_hair", 0.18, col, Math.sin(a) * 0.24, HEAD_Y + 0.24 + rng() * 0.04, -0.06 - Math.cos(a) * 0.12, 3);
        t.scaling.set(1, 0.8, 1);
        p.push(t);
      }
      break;
    }
    case "bun": {
      p.push(sideLock(-0.27, 0.2, 0.04), sideLock(0.27, 0.2, 0.04));
      p.push(sphere(ctx, "olw_hair", 0.24, col, 0, HEAD_Y + 0.28, -0.2, 4));
      break;
    }
    case "curly": {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const r = 0.28 + rng() * 0.05;
        const y = HEAD_Y + 0.02 - (i % 3) * 0.13;
        p.push(ico(ctx, "olw_hair", 0.13 + rng() * 0.03, col, Math.cos(a) * r, y, Math.sin(a) * r * 0.85 - 0.12, { subdiv: 1, noise: 0.15, rng }));
      }
      break;
    }
  }
  return p;
}

function face(ctx: HeroCtx, c: CharacterColors): Mesh[] {
  const p: Mesh[] = [];
  const z = HEAD_R - 0.045;
  for (const s of [-1, 1]) {
    const eye = sphere(ctx, "olw_face", 0.105, "#2a1c1c", s * 0.115, HEAD_Y + 0.015, z, 6);
    eye.scaling.set(1, 1.35, 0.55);
    p.push(eye);
    p.push(dot(ctx, "olw_face", 0.04, "#ffffff", s * 0.115 + 0.028, HEAD_Y + 0.05, z + 0.05));
    p.push(dot(ctx, "olw_face", 0.02, "#ffffff", s * 0.115 - 0.02, HEAD_Y - 0.02, z + 0.05));
    const blush = sphere(ctx, "olw_face", 0.1, "#f1a3a8", s * 0.2, HEAD_Y - 0.075, z - 0.04, 4);
    blush.scaling.set(1.1, 0.6, 0.35);
    p.push(blush);
    const brow = box(ctx, "olw_hair", 0.085, 0.016, 0.02, shade(c.hair, -0.1), s * 0.115, HEAD_Y + 0.125, z + 0.02);
    brow.rotation.z = -s * 0.15;
    p.push(brow);
  }
  p.push(dot(ctx, "olw_skin", 0.028, shade(c.skin, -0.16), 0, HEAD_Y - 0.045, z + 0.055));
  // soft smile
  const smile = [v3(-0.05, HEAD_Y - 0.105, z + 0.03), v3(0, HEAD_Y - 0.125, z + 0.04), v3(0.05, HEAD_Y - 0.105, z + 0.03)];
  p.push(tube(ctx, "olw_face", smile, () => 0.012, "#b8575f", 4));
  return p;
}

/** Build the character. Base at y = 0, facing +Z. */
export function buildCharacter(ctx: HeroCtx, opts: CharacterOpts = {}, c: CharacterColors = DEFAULT_COLORS): CharacterBuild {
  const name = opts.name ?? "player";
  const style = opts.hair ?? "long";
  const skirt = opts.skirt ?? true;
  const rng = prng(name.length * 31 + style.length);
  const s = ctx.scene;
  const root = new TransformNode(name, s);
  const body = pivot("body", root, 0, 0, 0);
  const meshes: Mesh[] = [];

  // ---- head ----
  const head = pivot("head", body, 0, NECK_Y, 0);
  const headParts: Mesh[] = [];
  const hd = sphere(ctx, "olw_skin", HEAD_R * 2, lit(c.skin, HEAD_Y - 0.3, HEAD_Y + 0.3, -0.14, 0.05), 0, HEAD_Y, 0, 12);
  hd.scaling.set(1.03, 0.97, 1);
  headParts.push(hd);
  headParts.push(cyl(ctx, "olw_skin", 0.15, 0.17, 0.12, shade(c.skin, -0.25), 0, NECK_Y - 0.02, 0, 6));
  headParts.push(...face(ctx, c));
  const headGeo = merge("head_geo", headParts);
  headGeo.parent = head;
  headGeo.position.y = -NECK_Y;
  meshes.push(headGeo);
  const hairGeo = merge("hair", hair(ctx, style, c, rng));
  hairGeo.parent = head;
  hairGeo.position.y = -NECK_Y;
  meshes.push(hairGeo);

  // ---- torso ----
  const tp: Mesh[] = [];
  const topCol = lit(c.top, HIP_Y, NECK_Y, -0.2, 0.05);
  const torso = sphere(ctx, "olw_top", 0.46, topCol, 0, 0.6, 0, 8);
  torso.scaling.set(1.0, 0.86, 0.72);
  tp.push(torso);
  // cardigan opening + inner top + buttons
  tp.push(box(ctx, "olw_paint", 0.13, 0.26, 0.05, "#f6efe0", 0, 0.5, 0.135));
  for (const x of [-0.075, 0.075]) tp.push(box(ctx, "olw_top", 0.018, 0.3, 0.02, shade(c.top, -0.16), x, 0.48, 0.155));
  for (let i = 0; i < 3; i++) tp.push(dot(ctx, "olw_paint", 0.03, "#f6efe0", -0.075, 0.5 + i * 0.09, 0.17));
  // shoulders / collar
  tp.push(torus(ctx, "olw_top", 0.26, 0.06, shade(c.top, -0.05), 0, 0.75, 0, 6));
  if (skirt) {
    const sk = cyl(ctx, "olw_bottom", 0.36, 0.56, 0.24, lit(c.bottom, 0.28, 0.52, -0.22, 0.04), 0, 0.28, 0, 10);
    tp.push(sk);
    tp.push(torus(ctx, "olw_bottom", 0.55, 0.035, shade(c.bottom, -0.15), 0, 0.29, 0, 6)); // hem
  } else {
    tp.push(cyl(ctx, "olw_bottom", 0.36, 0.38, 0.16, lit(c.bottom, 0.3, 0.5, -0.2, 0.04), 0, 0.32, 0, 10));
  }
  if (opts.scarf) {
    const sc = torus(ctx, "olw_paint", 0.34, 0.085, "#d9b25c", 0, 0.76, 0.02, 6);
    sc.scaling.set(1, 0.85, 1);
    tp.push(sc);
    const tail = box(ctx, "olw_paint", 0.1, 0.22, 0.05, "#c9a24e", -0.1, 0.55, 0.19);
    tail.rotation.z = 0.15;
    tp.push(tail);
    tp.push(box(ctx, "olw_paint", 0.1, 0.03, 0.05, "#b34d47", -0.1, 0.63, 0.19));
  }
  const torsoGeo = merge("torso_geo", tp);
  torsoGeo.parent = body;
  meshes.push(torsoGeo);

  // ---- arms (pivot at shoulder; geometry hangs down) ----
  const arm = (side: -1 | 1) => {
    const pv = pivot(side < 0 ? "armL" : "armR", body, side * 0.235, SHOULDER_Y, 0);
    const parts: Mesh[] = [];
    parts.push(capsule(ctx, "olw_top", 0.07, 0.3, lit(c.top, -0.3, 0, -0.22, 0.02), 0, -0.13, 0, 6));
    parts.push(sphere(ctx, "olw_skin", 0.12, shade(c.skin, -0.04), 0, -0.3, 0.01, 4));
    const g = merge(side < 0 ? "armL_geo" : "armR_geo", parts);
    g.parent = pv;
    meshes.push(g);
    return pv;
  };
  const armL = arm(-1);
  const armR = arm(1);

  // ---- legs (pivot at hip) ----
  const leg = (side: -1 | 1) => {
    const pv = pivot(side < 0 ? "legL" : "legR", body, side * 0.1, HIP_Y, 0);
    const parts: Mesh[] = [];
    if (skirt) parts.push(capsule(ctx, "olw_paint", 0.075, 0.34, lit("#4a4150", -0.36, -0.05, -0.15, 0.05), 0, -0.19, 0, 6));
    else parts.push(capsule(ctx, "olw_bottom", 0.085, 0.34, lit(c.bottom, -0.36, -0.05, -0.2, 0.02), 0, -0.19, 0, 6));
    const shoe = sphere(ctx, "olw_shoes", 0.2, lit(c.shoes, -0.42, -0.3, -0.2, 0.08), 0, -0.36, 0.035, 4);
    shoe.scaling.set(0.85, 0.55, 1.15);
    parts.push(shoe);
    parts.push(cyl(ctx, "olw_shoes", 0.17, 0.19, 0.05, shade(c.shoes, -0.35), 0, -HIP_Y, 0.03, 6));
    const g = merge(side < 0 ? "legL_geo" : "legR_geo", parts);
    g.parent = pv;
    meshes.push(g);
    return pv;
  };
  const legL = leg(-1);
  const legR = leg(1);

  for (const m of meshes) m.isPickable = false;
  return { root, body, head, armL, armR, legL, legR, meshes };
}

/** Find the rig pivots by name under any root (procedural build or GLB clone). */
export function rigFromRoot(root: TransformNode): CharacterBuild | null {
  const find = (n: string) => root.getDescendants(false, (d) => d.name === n)[0] as TransformNode | undefined;
  const body = find("body");
  const head = find("head");
  const armL = find("armL");
  const armR = find("armR");
  const legL = find("legL");
  const legR = find("legR");
  if (!body || !head || !armL || !armR || !legL || !legR) return null;
  // glTF nodes come with a rotationQuaternion, which makes Babylon ignore Euler
  // `rotation`; the rig animates pivots through `rotation`, so convert once.
  for (const n of [body, head, armL, armR, legL, legR]) {
    if (n.rotationQuaternion) {
      n.rotation = n.rotationQuaternion.toEulerAngles();
      n.rotationQuaternion = null;
    }
  }
  const meshes = root.getChildMeshes(false).filter((m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0);
  return { root, body, head, armL, armR, legL, legR, meshes };
}

interface Pristine {
  olwColor0?: Float32Array;
}

/**
 * Apply colours to every role slot under `root`. Works repeatedly: the first
 * call stores a pristine copy of each mesh's baked colours (from `baked`).
 */
export function retintCharacter(root: TransformNode, colors: CharacterColors, baked: CharacterColors = DEFAULT_COLORS) {
  for (const m of root.getChildMeshes(false)) {
    if (!(m instanceof Mesh)) continue;
    const live = m.getVerticesData(VertexBuffer.ColorKind);
    if (!live) continue;
    const meta = (m.metadata ?? (m.metadata = {})) as Pristine;
    if (!meta.olwColor0) meta.olwColor0 = new Float32Array(live);
    const base = meta.olwColor0;
    const stride = m.getVertexBuffer(VertexBuffer.ColorKind)?.getSize() ?? 4;
    for (const role of ROLES) {
      const from = hexToRgb(baked[ROLE_KEY[role]]);
      const to = hexToRgb(colors[ROLE_KEY[role]]);
      const k = [to[0] / Math.max(0.02, from[0]), to[1] / Math.max(0.02, from[1]), to[2] / Math.max(0.02, from[2])];
      retintSlot(m, role, (_r, _g, _b, i) => {
        const o = i * stride;
        return [Math.min(1, base[o] * k[0]), Math.min(1, base[o + 1] * k[1]), Math.min(1, base[o + 2] * k[2])];
      });
    }
  }
}
