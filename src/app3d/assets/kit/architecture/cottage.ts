// Modular Scottish cottage kit. One call builds a whole building (walls with
// real window/door recesses, gable roof, chimneys, dormers, ivy, planters…)
// from boxes / cylinders / custom quads, tinted with vertex colours and
// merged into ONE multi-material mesh whose submeshes are the named slots
// (see slots.ts). Built at the origin, base at y=0, front (door) facing -Z.
//
// Face space: for each wall face, x runs across the face (left→right seen
// from outside), y up, z into the wall (z = 0 is the outer surface).

import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { hash01, merge } from "../util";
import { Surface, shade, mix, tblob, tbox, tcyl } from "./geom";
import type { Slots } from "./slots";
import { TINTS, type CottageSpec } from "./presets";

export const STOREY = 1.45;
/** wall inset from the tile footprint so eaves stay inside the tile */
const INSET = 0.22;
const WALL_T = 0.24;
const RECESS = 0.12;
const STONE_UV = 0.9;

type FaceName = "front" | "back" | "east" | "west";

interface Opening {
  x: number; // centre
  y: number; // bottom
  w: number;
  h: number;
  kind: "window" | "door" | "shop";
  floor: number;
}

interface Ctx {
  scene: Scene;
  sl: Slots;
  sp: CottageSpec;
  parts: Mesh[];
  nodes: TransformNode[];
  hw: number;
  hd: number;
  wallH: number;
  seed: number;
  root: TransformNode;
}

const rnd = (c: Ctx, ...n: number[]) => hash01(c.seed, ...n);

// ----------------------------------------------------------------- faces
function faceNode(c: Ctx, face: FaceName): TransformNode {
  const n = new TransformNode(`face-${face}`, c.scene);
  n.parent = c.root;
  switch (face) {
    case "front":
      n.position.set(0, 0, -c.hd);
      break;
    case "back":
      n.position.set(0, 0, c.hd);
      n.rotation.y = Math.PI;
      break;
    case "east":
      n.position.set(c.hw, 0, 0);
      n.rotation.y = -Math.PI / 2;
      break;
    case "west":
      n.position.set(-c.hw, 0, 0);
      n.rotation.y = Math.PI / 2;
      break;
  }
  c.nodes.push(n);
  return n;
}

function add(c: Ctx, node: TransformNode | null, m: Mesh) {
  if (node) m.parent = node;
  c.parts.push(m);
  return m;
}

/** Outer wall surface of one face with openings cut out; reveals go WALL_T deep. */
function wallSurface(c: Ctx, node: TransformNode, width: number, height: number, openings: Opening[], hex: string) {
  const sf = new Surface(c.scene, c.sl.stone);
  const x0 = -width / 2;
  const x1 = width / 2;
  const ys = new Set<number>([0, height]);
  for (const o of openings) {
    ys.add(o.y);
    ys.add(o.y + o.h);
  }
  const bands = [...ys].filter((y) => y >= 0 && y <= height).sort((a, b) => a - b);
  for (let i = 0; i + 1 < bands.length; i++) {
    const y0 = bands[i];
    const y1 = bands[i + 1];
    if (y1 - y0 < 1e-4) continue;
    const cuts = openings.filter((o) => o.y < y1 - 1e-4 && o.y + o.h > y0 + 1e-4).sort((a, b) => a.x - b.x);
    let x = x0;
    for (const o of cuts) {
      const ox0 = o.x - o.w / 2;
      const ox1 = o.x + o.w / 2;
      if (ox0 > x + 1e-4) sf.rectXY(x, ox0, y0, y1, 0, hex, STONE_UV);
      x = Math.max(x, ox1);
    }
    if (x1 > x + 1e-4) sf.rectXY(x, x1, y0, y1, 0, hex, STONE_UV);
  }
  // reveals (dressed stone, a touch lighter)
  const rev = shade(hex, 0.1);
  const T = WALL_T;
  for (const o of openings) {
    const ox0 = o.x - o.w / 2;
    const ox1 = o.x + o.w / 2;
    const oy0 = o.y;
    const oy1 = o.y + o.h;
    const uv = [0, 0, T * STONE_UV, 0, T * STONE_UV, o.h * STONE_UV, 0, o.h * STONE_UV];
    sf.quad([ox0, oy0, 0], [ox0, oy0, T], [ox0, oy1, T], [ox0, oy1, 0], [1, 0, 0], rev, uv);
    sf.quad([ox1, oy0, 0], [ox1, oy0, T], [ox1, oy1, T], [ox1, oy1, 0], [-1, 0, 0], rev, uv);
    sf.quad([ox0, oy1, 0], [ox1, oy1, 0], [ox1, oy1, T], [ox0, oy1, T], [0, -1, 0], shade(hex, -0.05));
    if (o.kind !== "door") sf.quad([ox0, oy0, 0], [ox1, oy0, 0], [ox1, oy0, T], [ox0, oy0, T], [0, 1, 0], rev);
  }
  add(c, node, sf.bake("wall"));
}

// ----------------------------------------------------------------- windows
function windowParts(c: Ctx, node: TransformNode, o: Opening, opts: { flowers: boolean; warm: boolean; shutters: string | null; curtains: string | null; sillStone: boolean }) {
  const s = c.scene;
  const { sl, sp } = c;
  const ox0 = o.x - o.w / 2;
  const ox1 = o.x + o.w / 2;
  const oy1 = o.y + o.h;
  const trim = sp.trim;
  const stoneL = shade(sp.wall, 0.14);
  const stoneD = shade(sp.wall, -0.2);
  // lintel + sill
  add(c, node, tbox(s, o.w + 0.22, 0.11, 0.1, sl.paint, stoneD, o.x, oy1, -0.02));
  if (opts.sillStone) add(c, node, tbox(s, o.w + 0.18, 0.07, 0.15, sl.paint, stoneL, o.x, o.y - 0.07, -0.045));
  // frame lining the reveal, set into the recess
  const fz = 0.07;
  const fd = 0.05;
  add(c, node, tbox(s, 0.05, o.h, fd, sl.paint, trim, ox0 + 0.025, o.y, fz));
  add(c, node, tbox(s, 0.05, o.h, fd, sl.paint, trim, ox1 - 0.025, o.y, fz));
  add(c, node, tbox(s, o.w, 0.05, fd, sl.paint, trim, o.x, oy1 - 0.05, fz));
  add(c, node, tbox(s, o.w, 0.05, fd, sl.paint, trim, o.x, o.y, fz));
  // mullions
  add(c, node, tbox(s, 0.035, o.h - 0.1, 0.03, sl.paint, trim, o.x, o.y + 0.05, fz + 0.02));
  add(c, node, tbox(s, o.w - 0.1, 0.035, 0.03, sl.paint, trim, o.x, o.y + o.h * 0.58, fz + 0.02));
  // glass, recessed
  add(c, node, tbox(s, o.w - 0.06, o.h - 0.06, 0.02, sl.glass, opts.warm ? "#f2d9a6" : "#ffffff", o.x, o.y + 0.03, RECESS));
  // curtains
  if (opts.curtains) {
    const cw = Math.min(0.16, o.w * 0.3);
    add(c, node, tbox(s, cw, o.h - 0.12, 0.012, sl.paint, opts.curtains, ox0 + 0.05 + cw / 2, o.y + 0.06, RECESS - 0.012));
    add(c, node, tbox(s, cw, o.h - 0.12, 0.012, sl.paint, opts.curtains, ox1 - 0.05 - cw / 2, o.y + 0.06, RECESS - 0.012));
  }
  // shutters
  if (opts.shutters) {
    const sw = Math.min(0.18, o.w * 0.38);
    for (const sx of [ox0 - 0.02 - sw / 2, ox1 + 0.02 + sw / 2]) {
      add(c, node, tbox(s, sw, o.h + 0.05, 0.035, sl.wood, opts.shutters, sx, o.y - 0.02, -0.02));
      // two slats
      add(c, node, tbox(s, sw - 0.06, 0.03, 0.01, sl.wood, shade(opts.shutters, 0.18), sx, o.y + o.h * 0.3, -0.04));
      add(c, node, tbox(s, sw - 0.06, 0.03, 0.01, sl.wood, shade(opts.shutters, 0.18), sx, o.y + o.h * 0.7, -0.04));
    }
  }
  // flower box
  if (opts.flowers) {
    const by = o.y - 0.24;
    add(c, node, tbox(s, o.w + 0.08, 0.15, 0.18, sl.wood, shade(TINTS.wood, 0.05), o.x, by, -0.125));
    const greens = [TINTS.moss, TINTS.olive, TINTS.sage];
    const cols = [TINTS.dustyRose, TINTS.mutedYellow, TINTS.lavender, "#f2e8d6", "#c98f96"];
    const n = Math.max(2, Math.round(o.w / 0.17));
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * (o.w - 0.1);
      const g = tblob(s, 0.2, sl.foliage, greens[Math.floor(rnd(c, o.x, i, 1) * 3)], o.x + t, by + 0.16, -0.16, 0.75, 4);
      add(c, node, g);
      const f = tblob(s, 0.1, sl.paint, cols[Math.floor(rnd(c, o.x, i, 2) * cols.length)], o.x + t + (rnd(c, o.x, i, 3) - 0.5) * 0.08, by + 0.25, -0.2, 0.9, 3);
      add(c, node, f);
    }
  }
}

// ----------------------------------------------------------------- doors
function doorParts(c: Ctx, node: TransformNode, o: Opening, arch: boolean, fanlight: boolean) {
  const s = c.scene;
  const { sl, sp } = c;
  const ox0 = o.x - o.w / 2;
  const ox1 = o.x + o.w / 2;
  const oy1 = o.y + o.h;
  const door = sp.door;
  const stoneL = shade(sp.wall, 0.14);
  // the door itself, recessed, with two panels and a brass knob
  add(c, node, tbox(s, o.w - 0.02, o.h - 0.02, 0.05, sl.wood, door, o.x, 0, RECESS - 0.02));
  add(c, node, tbox(s, o.w * 0.34, o.h * 0.3, 0.02, sl.wood, shade(door, -0.16), o.x - o.w * 0.2, o.h * 0.1, RECESS - 0.03));
  add(c, node, tbox(s, o.w * 0.34, o.h * 0.3, 0.02, sl.wood, shade(door, -0.16), o.x + o.w * 0.2, o.h * 0.1, RECESS - 0.03));
  add(c, node, tbox(s, o.w * 0.34, o.h * 0.3, 0.02, sl.wood, shade(door, -0.16), o.x - o.w * 0.2, o.h * 0.55, RECESS - 0.03));
  add(c, node, tbox(s, o.w * 0.34, o.h * 0.3, 0.02, sl.wood, shade(door, -0.16), o.x + o.w * 0.2, o.h * 0.55, RECESS - 0.03));
  add(c, node, tblob(s, 0.06, sl.metal, "#d9b262", o.x + o.w * 0.3, o.h * 0.48, RECESS - 0.05, 1, 3));
  // frame
  add(c, node, tbox(s, 0.05, o.h, 0.05, sl.paint, sp.trim, ox0 + 0.025, 0, 0.04));
  add(c, node, tbox(s, 0.05, o.h, 0.05, sl.paint, sp.trim, ox1 - 0.025, 0, 0.04));
  add(c, node, tbox(s, o.w, 0.05, 0.05, sl.paint, sp.trim, o.x, oy1 - 0.05, 0.04));
  // step
  add(c, node, tbox(s, o.w + 0.34, 0.07, 0.4, sl.paint, stoneL, o.x, 0, -0.2));
  if (arch) {
    // stone voussoirs over the door + a fanlight in the tympanum
    const R = o.w / 2 + 0.1;
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / (n - 1)) * Math.PI;
      const key = i === Math.floor(n / 2);
      const b = tbox(s, 0.17, key ? 0.22 : 0.18, 0.1, sl.paint, key ? shade(sp.wall, 0.2) : stoneL, 0, 0, 0);
      b.position.set(o.x + Math.cos(a) * R, oy1 + Math.sin(a) * R, -0.03);
      b.rotation.z = a - Math.PI / 2;
      add(c, node, b);
    }
    if (fanlight) add(c, node, tbox(s, o.w - 0.08, 0.2, 0.02, sl.glass, "#f2d9a6", o.x, oy1 + 0.02, 0.0));
  } else {
    add(c, node, tbox(s, o.w + 0.24, 0.12, 0.1, sl.paint, shade(sp.wall, -0.2), o.x, oy1, -0.02));
  }
}

function lantern(c: Ctx, node: TransformNode, x: number, y: number) {
  const s = c.scene;
  const { sl } = c;
  add(c, node, tbox(s, 0.04, 0.04, 0.16, sl.metal, TINTS.slateDark, x, y + 0.2, -0.08));
  add(c, node, tbox(s, 0.14, 0.2, 0.14, sl.glass, "#f6dfa8", x, y, -0.16));
  add(c, node, tbox(s, 0.18, 0.03, 0.18, sl.metal, "#2d2b2e", x, y + 0.2, -0.16));
  add(c, node, tbox(s, 0.18, 0.02, 0.18, sl.metal, "#2d2b2e", x, y - 0.02, -0.16));
}

function wallPlanter(c: Ctx, node: TransformNode, x: number, y: number) {
  const s = c.scene;
  const { sl } = c;
  add(c, node, tbox(s, 0.5, 0.16, 0.18, sl.wood, shade(TINTS.wood, -0.05), x, y, -0.1));
  add(c, node, tbox(s, 0.04, 0.05, 0.03, sl.metal, "#2d2b2e", x - 0.2, y + 0.11, -0.015));
  add(c, node, tbox(s, 0.04, 0.05, 0.03, sl.metal, "#2d2b2e", x + 0.2, y + 0.11, -0.015));
  const cols = [TINTS.dustyRose, "#f2e8d6", TINTS.lavender, TINTS.mutedYellow];
  for (let i = 0; i < 3; i++) {
    add(c, node, tblob(s, 0.2, sl.foliage, i === 1 ? TINTS.olive : TINTS.moss, x - 0.15 + i * 0.15, y + 0.18, -0.12, 0.7, 4));
    add(c, node, tblob(s, 0.09, sl.paint, cols[(i + Math.floor(rnd(c, x, 7) * 4)) % 4], x - 0.15 + i * 0.15, y + 0.27, -0.15, 0.9, 3));
  }
}

// ----------------------------------------------------------------- façade detail
function quoins(c: Ctx, node: TransformNode, width: number, height: number) {
  const s = c.scene;
  const hex = shade(c.sp.wall, c.sp.kind === "tenement" ? 0.04 : 0.07);
  const hex2 = shade(c.sp.wall, -0.02);
  for (const side of [-1, 1]) {
    let y = 0.24;
    let i = 0;
    while (y + 0.26 < height - 0.05) {
      const long = i % 2 === 0;
      const w = long ? 0.38 : 0.24;
      add(c, node, tbox(s, w, 0.24, 0.05, c.sl.paint, long ? hex : hex2, side * (width / 2 - w / 2 + 0.01), y, -0.018));
      y += 0.3;
      i++;
    }
  }
}

function mossBand(c: Ctx, node: TransformNode, width: number) {
  const s = c.scene;
  const n = 2 + Math.floor(rnd(c, width, 11) * 3);
  for (let i = 0; i < n; i++) {
    const len = 0.35 + rnd(c, i, 12) * 0.6;
    const x = -width / 2 + 0.3 + rnd(c, i, 13) * (width - 0.6);
    const h = 0.07 + rnd(c, i, 14) * 0.1;
    add(c, node, tbox(s, len, h, 0.025, c.sl.foliage, mix(TINTS.mossDark, TINTS.olive, rnd(c, i, 15)), x, 0.22, -0.012));
  }
}

/**
 * Ivy climbing a front corner (side = -1 west, +1 east): a dense mass of small
 * leaf blobs, wide and dark at the base, thinning to a tendril near the eaves,
 * wrapping onto the side face, with a short run draped under the eave.
 */
function ivy(c: Ctx, front: TransformNode, sideNode: TransformNode, side: -1 | 1) {
  const s = c.scene;
  const greens = ["#4f6a3d", "#5d7a45", "#6f8c4f", "#809c5a", "#8fa865"];
  const top = c.wallH * (0.7 + rnd(c, 21) * 0.28);
  const leaf = (node: TransformNode, x: number, y: number, d: number, t: number, k: number) => {
    // darker, bigger leaves low down; fresher, lighter tips
    const gi = Math.min(greens.length - 1, Math.max(0, Math.floor(t * 3 + rnd(c, k, 22) * 2.2)));
    const b = tblob(s, d, c.sl.foliage, greens[gi], x, y, -0.035 - rnd(c, k, 29) * 0.03, 0.8, d > 0.15 ? 3 : 2);
    b.scaling.z = 0.4;
    b.rotation.z = (rnd(c, k, 30) - 0.5) * 1.2;
    add(c, node, b);
  };
  let k = 0;
  for (let y = 0.08; y < top; y += 0.1) {
    const t = y / top;
    const w = 0.12 + 0.78 * Math.pow(1 - t, 0.9) * (0.75 + rnd(c, y, 23) * 0.5);
    const n = Math.max(1, Math.round(w / 0.12));
    for (let j = 0; j < n; j++) {
      const u = (j + rnd(c, k, 24) * 0.8) / n;
      const x = side * (c.hw - 0.03 - u * w);
      leaf(front, x, y + (rnd(c, k, 26) - 0.5) * 0.06, 0.12 + rnd(c, k, 25) * 0.08 * (1.2 - t), t, k);
      k++;
    }
    // wrap round onto the side face (corner is at local x = -hd on east, +hd on west)
    const sw = w * 0.55;
    const ns = Math.max(1, Math.round(sw / 0.13));
    if (t < 0.85)
      for (let j = 0; j < ns; j++) {
        const u = (j + rnd(c, k, 27) * 0.8) / ns;
        const sx = side > 0 ? -c.hd + 0.03 + u * sw : c.hd - 0.03 - u * sw;
        leaf(sideNode, sx, y + (rnd(c, k, 28) - 0.5) * 0.06, 0.12 + rnd(c, k, 25) * 0.07, t, k);
        k++;
      }
  }
  // a short run draped along under the eave
  const run = 0.6 + rnd(c, 31) * 0.8;
  for (let x = 0; x < run; x += 0.1) {
    const hang = 0.05 + rnd(c, x, 32) * 0.18 * (1 - x / run);
    const px = side * (c.hw - 0.08 - x);
    leaf(front, px, c.wallH - 0.1 - hang, 0.11 + rnd(c, x, 33) * 0.06, 0.6, k++);
    if (rnd(c, x, 34) > 0.55) leaf(front, px, c.wallH - 0.25 - hang * 1.6, 0.1, 0.8, k++);
  }
}

// ----------------------------------------------------------------- roof
interface RoofDims {
  hwR: number;
  hdR: number;
  rise: number;
  sag: number;
}

function roofPoint(c: Ctx, r: RoofDims, x: number, t: number, south: boolean): [number, number, number] {
  // t: 0 at eave → 1 at ridge; sag lowers the ridge in the middle
  const ridge = r.rise - r.sag * (1 - Math.abs(x) / r.hwR);
  return [x, c.wallH + t * ridge, south ? -r.hdR + t * r.hdR : r.hdR - t * r.hdR];
}

function roof(c: Ctx, r: RoofDims) {
  const s = c.scene;
  const { sl, sp } = c;
  const roofMat = sp.roof === "slate" ? sl.slate : sl.roofTile;
  const sf = new Surface(s, roofMat);
  const uvS = 0.55;
  const slopeLen = Math.hypot(r.hdR, r.rise);
  for (const south of [true, false]) {
    const n: [number, number, number] = south ? [0, r.hdR, -r.rise] : [0, r.hdR, r.rise];
    const len = Math.hypot(n[1], n[2]);
    n[1] /= len;
    n[2] /= len;
    for (const [x0, x1] of [
      [-r.hwR, 0],
      [0, r.hwR],
    ]) {
      sf.quad(roofPoint(c, r, x0, 0, south), roofPoint(c, r, x1, 0, south), roofPoint(c, r, x1, 1, south), roofPoint(c, r, x0, 1, south), n, sp.roofTint, [x0 * uvS, 0, x1 * uvS, 0, x1 * uvS, slopeLen * uvS, x0 * uvS, slopeLen * uvS]);
    }
  }
  add(c, c.root, sf.bake("roof"));

  // moss / lichen patches lying on the slopes
  if (sp.moss) {
    const ms = new Surface(s, sl.foliage);
    const n = 2 + Math.floor(rnd(c, 31) * 3);
    for (let i = 0; i < n; i++) {
      const south = rnd(c, i, 32) > 0.4;
      const x = (rnd(c, i, 33) - 0.5) * (r.hwR * 2 - 0.8);
      const t0 = 0.1 + rnd(c, i, 34) * 0.55;
      const w = 0.18 + rnd(c, i, 35) * 0.22;
      const dt = (0.12 + rnd(c, i, 36) * 0.12) * (1 / Math.max(0.6, r.hdR));
      const lift = (p: [number, number, number]): [number, number, number] => [p[0], p[1] + 0.02, p[2] + (south ? -0.012 : 0.012)];
      const col = mix(mix(TINTS.olive, TINTS.mossDark, rnd(c, i, 37)), sp.roofTint, 0.45);
      ms.quad(lift(roofPoint(c, r, x - w / 2, t0, south)), lift(roofPoint(c, r, x + w / 2, t0, south)), lift(roofPoint(c, r, x + w * 0.35, t0 + dt, south)), lift(roofPoint(c, r, x - w * 0.4, t0 + dt, south)), south ? [0, 1, -0.5] : [0, 1, 0.5], col);
    }
    add(c, c.root, ms.bake("moss"));
  }

  // eaves boards (front / back) + ridge tiles
  const eaveHex = shade(TINTS.wood, -0.15);
  add(c, c.root, tbox(s, r.hwR * 2 + 0.02, 0.09, 0.06, sl.wood, eaveHex, 0, c.wallH - 0.06, -r.hdR + 0.02));
  add(c, c.root, tbox(s, r.hwR * 2 + 0.02, 0.09, 0.06, sl.wood, eaveHex, 0, c.wallH - 0.06, r.hdR - 0.02));
  const ridgeHex = shade(sp.roofTint, -0.18);
  const nr = Math.max(4, Math.round((r.hwR * 2) / 0.24));
  for (let i = 0; i < nr; i++) {
    const x = -r.hwR + 0.12 + i * ((r.hwR * 2 - 0.24) / (nr - 1));
    const p = roofPoint(c, r, x, 1, true);
    add(c, c.root, tbox(s, 0.2, 0.08, 0.22, sl.paint, ridgeHex, x, p[1] - 0.02, 0));
  }

  if (sp.crow) {
    // crow-stepped gable parapets at both ends, plus a capstone at the apex
    const steps = Math.max(3, Math.round(r.hdR / 0.36));
    const dz = r.hdR / steps;
    const hex = shade(sp.wall, 0.06);
    for (const side of [-1, 1]) {
      const x = side * (r.hwR - 0.02);
      for (let i = 0; i < steps; i++) {
        const t1 = (i + 1) / steps;
        const top = c.wallH + t1 * r.rise + 0.2;
        for (const south of [true, false]) {
          const z0 = south ? -r.hdR + i * dz : r.hdR - (i + 1) * dz;
          add(c, c.root, tbox(s, 0.34, top - (c.wallH - 0.15), dz + 0.01, sl.stone, hex, x, c.wallH - 0.15, z0 + dz / 2, 1));
          add(c, c.root, tbox(s, 0.4, 0.06, dz + 0.04, sl.paint, shade(sp.wall, 0.18), x, top, z0 + dz / 2));
        }
      }
      add(c, c.root, tbox(s, 0.42, 0.12, 0.42, sl.paint, shade(sp.wall, 0.2), x, c.wallH + r.rise + 0.2, 0));
    }
  } else {
    // gable-end triangles in wall stone + barge boards
    const gs = new Surface(s, sl.stone);
    for (const side of [-1, 1]) {
      const x = side * r.hwR;
      gs.tri([x, c.wallH, -r.hdR], [x, c.wallH, r.hdR], [x, c.wallH + r.rise, 0], [side, 0, 0], sp.wall);
    }
    add(c, c.root, gs.bake("gable"));
    const ang = Math.atan2(r.rise, r.hdR);
    for (const side of [-1, 1]) {
      for (const south of [true, false]) {
        const b = tbox(s, 0.07, 0.11, slopeLen + 0.1, sl.wood, eaveHex, 0, 0, 0);
        b.position.set(side * (r.hwR + 0.01), c.wallH + r.rise / 2 - 0.03, south ? -r.hdR / 2 : r.hdR / 2);
        b.rotation.x = south ? -ang : ang;
        add(c, c.root, b);
      }
    }
  }
}

function chimney(c: Ctx, r: RoofDims, x: number, style: 1 | 2, pots: number) {
  const s = c.scene;
  const { sl, sp } = c;
  const hex = shade(sp.wall, -0.08);
  const cap = shade(sp.wall, 0.12);
  const potHex = "#a8705a";
  const top = c.wallH + r.rise + (style === 1 ? 0.55 : 0.4);
  if (style === 1) {
    add(c, c.root, tbox(s, 0.44, top - (c.wallH - 0.4), 0.44, sl.stone, hex, x, c.wallH - 0.4, 0, 1));
    add(c, c.root, tbox(s, 0.54, 0.1, 0.54, sl.paint, cap, x, top, 0));
    for (let i = 0; i < pots; i++) {
      const px = x + (pots === 1 ? 0 : (i / (pots - 1) - 0.5) * 0.26);
      add(c, c.root, tcyl(s, 0.12, 0.15, 0.24, sl.paint, potHex, px, top + 0.1, 0, 7));
      add(c, c.root, tcyl(s, 0.15, 0.15, 0.04, sl.paint, shade(potHex, -0.2), px, top + 0.32, 0, 7));
    }
  } else {
    add(c, c.root, tbox(s, 0.72, top - (c.wallH - 0.2), 0.4, sl.stone, hex, x, c.wallH - 0.2, 0.05, 1));
    add(c, c.root, tbox(s, 0.8, 0.07, 0.48, sl.paint, cap, x, top - 0.35, 0.05));
    add(c, c.root, tbox(s, 0.8, 0.09, 0.48, sl.paint, cap, x, top, 0.05));
    for (let i = 0; i < Math.max(2, pots); i++) {
      const px = x + (i / (Math.max(2, pots) - 1) - 0.5) * 0.42;
      add(c, c.root, tcyl(s, 0.13, 0.16, 0.3, sl.paint, potHex, px, top + 0.09, 0.05, 7));
    }
  }
}

function dormer(c: Ctx, r: RoofDims, x: number) {
  const s = c.scene;
  const { sl, sp } = c;
  const t0 = 0.28;
  const base = roofPoint(c, r, x, t0, true);
  const w = 0.78;
  const h = 0.72;
  const depth = 0.72;
  const zf = base[2] - 0.22; // front face
  const y0 = base[1] - 0.12;
  add(c, c.root, tbox(s, w, h, depth, sl.stone, sp.wall, x, y0, zf + depth / 2, 1));
  // window on the dormer front
  add(c, c.root, tbox(s, 0.46, 0.44, 0.05, sl.paint, sp.trim, x, y0 + 0.16, zf - 0.02));
  add(c, c.root, tbox(s, 0.38, 0.36, 0.02, sl.glass, "#ffffff", x, y0 + 0.2, zf - 0.03));
  add(c, c.root, tbox(s, 0.03, 0.36, 0.02, sl.paint, sp.trim, x, y0 + 0.2, zf - 0.045));
  add(c, c.root, tbox(s, 0.38, 0.03, 0.02, sl.paint, sp.trim, x, y0 + 0.4, zf - 0.045));
  // little gable roof
  const rw = w / 2 + 0.08;
  const rise = 0.34;
  const top = y0 + h;
  const sf = new Surface(s, sp.roof === "slate" ? sl.slate : sl.roofTile);
  const zb = zf + depth;
  const a: [number, number, number] = [x - rw, top - 0.02, zf - 0.08];
  const b: [number, number, number] = [x - rw, top - 0.02, zb];
  const ridgeF: [number, number, number] = [x, top + rise, zf - 0.08];
  const ridgeB: [number, number, number] = [x, top + rise, zb];
  const a2: [number, number, number] = [x + rw, top - 0.02, zf - 0.08];
  const b2: [number, number, number] = [x + rw, top - 0.02, zb];
  sf.quad(a, b, ridgeB, ridgeF, [-rise, rw, 0], sp.roofTint, [0, 0, depth * 0.55, 0, depth * 0.55, 0.45, 0, 0.45]);
  sf.quad(a2, b2, ridgeB, ridgeF, [rise, rw, 0], sp.roofTint, [0, 0, depth * 0.55, 0, depth * 0.55, 0.45, 0, 0.45]);
  add(c, c.root, sf.bake("dormerRoof"));
  const gs = new Surface(s, sl.stone);
  gs.tri([x - rw + 0.06, top - 0.02, zf - 0.02], [x + rw - 0.06, top - 0.02, zf - 0.02], [x, top + rise - 0.04, zf - 0.02], [0, 0, -1], sp.wall);
  add(c, c.root, gs.bake("dormerGable"));
}

// ----------------------------------------------------------------- shop / café front
function shopFront(c: Ctx, front: TransformNode, bw: number, doorX: number) {
  const s = c.scene;
  const { sl, sp } = c;
  const bandY = c.wallH - (sp.kind === "cafe" ? 0.5 : STOREY * (sp.storeys - 1) + 0.5);
  // fascia board with a lighter frame and "lettering"
  add(c, front, tbox(s, bw - 0.3, 0.36, 0.08, sl.wood, sp.sign, 0, bandY, -0.03));
  add(c, front, tbox(s, bw - 0.24, 0.04, 0.1, sl.paint, sp.trim, 0, bandY + 0.36, -0.04));
  add(c, front, tbox(s, bw - 0.24, 0.04, 0.1, sl.paint, sp.trim, 0, bandY - 0.04, -0.04));
  const letters = Math.max(3, Math.floor((bw - 1.2) / 0.28));
  for (let i = 0; i < letters; i++) {
    const lw = 0.1 + rnd(c, i, 41) * 0.1;
    add(c, front, tbox(s, lw, 0.12 + rnd(c, i, 42) * 0.06, 0.02, sl.paint, "#f1e6c8", -(letters - 1) * 0.14 + i * 0.28, bandY + 0.12, -0.075));
  }
  // hanging bracket sign on the right corner
  const bx = bw / 2 - 0.35;
  add(c, front, tbox(s, 0.6, 0.035, 0.035, sl.metal, "#2d2b2e", bx - 0.25 + 0.3, bandY + 0.62, -0.3));
  add(c, front, tbox(s, 0.035, 0.035, 0.3, sl.metal, "#2d2b2e", bx - 0.25, bandY + 0.35, -0.3));
  add(c, front, tbox(s, 0.02, 0.14, 0.02, sl.metal, "#2d2b2e", bx - 0.05, bandY + 0.48, -0.5));
  add(c, front, tbox(s, 0.02, 0.14, 0.02, sl.metal, "#2d2b2e", bx + 0.2, bandY + 0.48, -0.5));
  add(c, front, tbox(s, 0.42, 0.34, 0.03, sl.wood, sp.kind === "cafe" ? "#f1e6c8" : sp.sign, bx + 0.08, bandY + 0.14, -0.5));
  add(c, front, tbox(s, 0.28, 0.16, 0.01, sl.paint, sp.kind === "cafe" ? sp.sign : "#f1e6c8", bx + 0.08, bandY + 0.23, -0.52));
  if (sp.kind === "cafe") {
    // striped awning: geometry stripes, scalloped valance, two slim poles
    const aw = bw - 0.2;
    const n = Math.max(6, Math.round(aw / 0.24));
    const sw = aw / n;
    const depth = 0.95;
    const tilt = -0.36;
    const y = bandY + 0.42;
    for (let i = 0; i < n; i++) {
      const hex = i % 2 ? "#f4ecd8" : TINTS.awning;
      const st = tbox(s, sw + 0.005, 0.03, depth, sl.paint, hex, 0, 0, 0);
      st.position.set(-aw / 2 + sw / 2 + i * sw, y, -depth / 2 + 0.02);
      st.rotation.x = tilt;
      add(c, front, st);
      const v = tbox(s, sw - 0.02, 0.14, 0.02, sl.paint, hex, -aw / 2 + sw / 2 + i * sw, y + Math.sin(tilt) * depth - 0.13 - (i % 2) * 0.03, -depth + 0.02);
      add(c, front, v);
    }
    const yEdge = y + Math.sin(tilt) * depth;
    add(c, front, tbox(s, aw, 0.04, 0.04, sl.metal, "#2d2b2e", 0, yEdge - 0.02, -depth + 0.02));
    for (const px of [-aw / 2 + 0.06, aw / 2 - 0.06]) add(c, front, tcyl(s, 0.035, 0.04, yEdge, sl.metal, "#2d2b2e", px, 0, -depth + 0.04, 6));
    void doorX;
  }
}

// ----------------------------------------------------------------- the building
export function buildCottage(scene: Scene, sl: Slots, sp: CottageSpec): Mesh {
  const bw = sp.w - INSET * 2;
  const bd = sp.d - INSET * 2;
  const wallH = sp.kind === "cafe" ? 2.05 : STOREY * sp.storeys + 0.2;
  const root = new TransformNode("cottage-root", scene);
  root.rotation.z = sp.lean;
  const c: Ctx = { scene, sl, sp, parts: [], nodes: [root], hw: bw / 2, hd: bd / 2, wallH, seed: sp.seed, root };
  const wallHex = sp.wall;

  // plinth (unleaned, hides the lean's base offset) + moss band
  c.parts.push(tbox(scene, bw + 0.1, 0.24, bd + 0.1, sl.stone, shade(wallHex, -0.22), 0, 0, 0, 1));

  // ---- layout
  const frontSlots = Math.max(1, Math.floor(bw / 0.95));
  const slotW = bw / frontSlots;
  const x0 = -bw / 2 + slotW / 2;
  const doorIdx = frontSlots === 1 ? 0 : sp.doorSide ? (rnd(c, 1) > 0.5 ? 0 : frontSlots - 1) : Math.floor(frontSlots / 2);
  const doorX = x0 + doorIdx * slotW;
  const doorW = sp.kind === "tenement" ? 0.7 : 0.64;
  const doorH = sp.kind === "tenement" ? 1.2 : 1.1;
  const isShop = sp.kind === "shop" || sp.kind === "cafe";

  const faces: Record<FaceName, Opening[]> = { front: [], back: [], east: [], west: [] };
  faces.front.push({ x: doorX, y: 0, w: doorW, h: doorH, kind: "door", floor: 0 });
  for (let f = 0; f < sp.storeys; f++) {
    const wy = f === 0 ? (isShop ? 0.45 : 0.62) : f * STOREY + 0.5;
    const wh = f === 0 ? (isShop ? 0.95 : 0.64) : 0.6;
    const ww = f === 0 ? (isShop ? Math.min(1.2, slotW - 0.3) : 0.5) : 0.48;
    for (let i = 0; i < frontSlots; i++) {
      if (f === 0 && i === doorIdx) continue;
      if (f > 0 && sp.kind === "cottage" && sp.dormers > 0 && sp.storeys === 2 && rnd(c, f, i, 3) > 0.85) continue;
      faces.front.push({ x: x0 + i * slotW, y: wy, w: ww, h: wh, kind: f === 0 && isShop ? "shop" : "window", floor: f });
    }
  }
  const sideSlots = Math.max(1, Math.floor(bd / 1.1));
  const sw = bd / sideSlots;
  for (const face of ["east", "west", "back"] as FaceName[]) {
    const width = face === "back" ? bw : bd;
    const slots = face === "back" ? frontSlots : sideSlots;
    const w0 = -width / 2 + (width / slots) / 2;
    for (let f = 0; f < sp.storeys; f++) {
      for (let i = 0; i < slots; i++) {
        if (rnd(c, f, i, face === "east" ? 1 : face === "west" ? 2 : 4) > (face === "back" ? 0.6 : 0.72)) continue;
        faces[face].push({ x: w0 + i * (width / slots), y: f * STOREY + 0.55, w: 0.46, h: 0.58, kind: "window", floor: f });
      }
    }
  }

  // ---- walls, one face at a time
  const nodes: Record<FaceName, TransformNode> = { front: faceNode(c, "front"), back: faceNode(c, "back"), east: faceNode(c, "east"), west: faceNode(c, "west") };
  for (const face of Object.keys(faces) as FaceName[]) {
    const node = nodes[face];
    const width = face === "front" || face === "back" ? bw : bd;
    wallSurface(c, node, width, wallH, faces[face], wallHex);
    quoins(c, node, width, wallH);
    if (face !== "back") mossBand(c, node, width);
    for (const o of faces[face]) {
      if (o.kind === "door") {
        doorParts(c, node, o, sp.arch, sp.kind === "tenement" || sp.arch);
        continue;
      }
      const ground = o.floor === 0;
      const flowers = ground && o.kind === "window" && rnd(c, o.x, o.y, 5) < sp.flowerBoxes;
      windowParts(c, node, o, {
        flowers,
        warm: o.kind === "shop",
        shutters: o.kind === "shop" ? null : sp.shutters,
        curtains: o.kind === "shop" ? null : sp.curtains && rnd(c, o.x, o.y, 6) > 0.3 ? sp.curtains : null,
        sillStone: true,
      });
    }
  }
  // string courses between tenement floors
  if (sp.kind === "tenement") {
    for (let f = 1; f < sp.storeys; f++) add(c, root, tbox(scene, bw + 0.08, 0.08, bd + 0.08, sl.paint, shade(wallHex, 0.1), 0, f * STOREY + 0.32, 0));
  }
  if (sp.lantern) lantern(c, nodes.front, doorX + doorW / 2 + 0.22, 1.35);
  if (sp.wallPlanter) wallPlanter(c, nodes.front, doorX - doorW / 2 - 0.42, 0.95);
  if (isShop) shopFront(c, nodes.front, bw, doorX);
  if (sp.ivy) {
    const side: -1 | 1 = rnd(c, 8) > 0.5 ? 1 : -1;
    ivy(c, nodes.front, side > 0 ? nodes.east : nodes.west, side);
  }

  // ---- roof
  const crowInset = sp.crow ? 0.06 : 0.25;
  const r: RoofDims = { hwR: bw / 2 + crowInset, hdR: bd / 2 + 0.25, rise: sp.kind === "tenement" ? 0.95 : Math.min(1.35, 0.5 + bd * 0.3), sag: sp.sag };
  roof(c, r);
  const chimneyPots = sp.kind === "tenement" ? 3 : 2;
  const cx1 = (rnd(c, 2) > 0.5 ? 1 : -1) * (bw / 2 - 0.3);
  chimney(c, r, sp.chimney === 2 && sp.chimneys === 1 ? cx1 * 0.5 : cx1, sp.chimney, chimneyPots);
  if (sp.chimneys === 2) chimney(c, r, -cx1, 1, chimneyPots);
  if (sp.dormers > 0 && sp.storeys >= 2) {
    const n = Math.min(sp.dormers, frontSlots);
    for (let i = 0; i < n; i++) {
      const slot = n === 1 ? (doorIdx + 1) % frontSlots : i === 0 ? 0 : frontSlots - 1;
      dormer(c, r, x0 + slot * slotW);
    }
  }

  const mesh = merge("building", c.parts);
  for (const n of c.nodes) n.dispose();
  return mesh;
}
