// Distant Edinburgh skyline beyond the playable map (the camera always looks
// north, so it is a wide northern panorama). Painted-cardboard layers, far to
// near, each lighter / cooler / softer than the one in front (atmospheric
// perspective):
//   1. far blue Highland-ish ridges
//   2. rolling green hills with an Arthur's-Seat-like crag (lion's haunch + cliff)
//   3. the old-town skyline: tenement gables, chimney stacks, spires, the St
//      Giles crown, and (optionally) the castle on its rock
//   4. a near fringe of dark tree-tops / fields
// plus two soft mist ribbons in the valleys between layers.
//
// Each layer is one unlit vertex-coloured ribbon (a height profile swept to
// below the horizon), coloured per time of day from the lighting Atmosphere
// (mix(base * farLight, haze, depth)). Layers ride with the camera with a
// small parallax so they never run out and always stay beyond the map.
// ~6 draw calls, no lights, no fog, no collision.

import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Atmosphere } from "./lighting";
import { meshFromArrays, unlitMaterial } from "./sky";
import type { BackdropStyle } from "../world/artProfile";

export interface BackdropOptions {
  /** Map size in tiles (x east, -z south). */
  mapW: number;
  mapH: number;
  /** Draw the castle-on-its-rock silhouette in the skyline. */
  castle?: boolean;
  seed?: number;
  /**
   * Regional panorama (from the art profile). "edinburgh" (default) is the
   * hand-built Old Town skyline; the others are simple placeholder horizons.
   */
  style?: BackdropStyle;
}

export interface Backdrop {
  setAtmosphere(a: Atmosphere): void;
  update(cam: Vector3): void;
  dispose(): void;
}

interface Layer {
  mesh: Mesh;
  mat: StandardMaterial;
  base: Color3;
  /** 0 = crisp, 1 = fully hazed. */
  haze: number;
  dist: number;
  /** How much the layer rides with the camera (1 = skybox-like). */
  follow: number;
  /** Mist layers: alpha-blended haze ribbons. */
  mist?: boolean;
  /** Mist only: a colour blended into the haze (warm horizon glow). */
  tint?: Color3;
  tintAmt?: number;
}

function hash(i: number, s: number) {
  const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
function vnoise(x: number, s: number) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i, s) * (1 - u) + hash(i + 1, s) * u;
}
/** Soft fractal ridge in [0,1]. */
function fbm(x: number, s: number, oct = 4) {
  let a = 0.5;
  let t = 0;
  let n = 0;
  for (let o = 0; o < oct; o++) {
    t += vnoise(x, s + o * 17) * a;
    n += a;
    x *= 2.03;
    a *= 0.5;
  }
  return t / n;
}

const HALF = 520; // half-width of every ribbon (covers the widest frame + parallax)
const BOTTOM = -30;

/**
 * Sweep a silhouette y(x) (a polyline, x ascending, vertical steps allowed) down
 * to BOTTOM as a vertical ribbon at z = 0, with a top->bottom colour ramp.
 */
function ribbon(scene: Scene, name: string, pts: [number, number][], topShade: number, bottomShade: number, mist = false) {
  const bottom = mist ? -1 : BOTTOM;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    // slight bow toward the camera at the ends so wide frames don't see the edge on
    const z = (x / HALF) ** 2 * -40;
    pos.push(x, y, z, x, bottom, z);
    if (mist) col.push(1, 1, 1, 0, 1, 1, 1, 0.85);
    else col.push(topShade, topShade, topShade, 1, bottomShade, bottomShade, bottomShade, 1);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  }
  return meshFromArrays(scene, name, pos, idx, col);
}

/** Height profile sampler -> points. */
function sample(fn: (x: number) => number, step: number): [number, number][] {
  const out: [number, number][] = [];
  for (let x = -HALF; x <= HALF + 0.01; x += step) out.push([x, fn(x)]);
  return out;
}

/** The old-town skyline: stepped gables, chimneys, spires, optional castle rock. */
function skyline(seed: number, castle: boolean): [number, number][] {
  const pts: [number, number][] = [];
  const castleX0 = -150;
  const castleX1 = -60;
  // the rock under the castle: steep cliff faces west/north, a long tail east (the Royal Mile ridge)
  const rock = (x: number) => {
    if (!castle) return 0;
    if (x < castleX0 - 25 || x > castleX1 + 110) return 0;
    if (x < castleX0) return ((x - (castleX0 - 25)) / 25) ** 0.6 * 22; // western cliff
    if (x < castleX1) return 22 + Math.sin((x - castleX0) * 0.12) * 1.2;
    return 22 * (1 - (x - castleX1) / 110) ** 1.4; // eastern tail down the ridge
  };
  const push = (x: number, y: number) => pts.push([x, y]);
  let x = -HALF;
  let i = 0;
  push(x, 3);
  while (x < HALF) {
    const r = hash(i, seed);
    const r2 = hash(i, seed + 3);
    const base = rock(x);
    // the castle itself on the rock
    if (castle && x >= castleX0 && x < castleX1) {
      const parts: [number, number][] = [
        [7, 9], // gatehouse
        [4, 14], // half-moon battery tower
        [12, 8],
        [3, 12],
        [14, 10], // palace block
        [3, 15], // flag tower
        [16, 9], // great hall
        [5, 13],
        [12, 7.5],
      ];
      let cx = castleX0 + 4;
      for (const [w, h] of parts) {
        const yb = rock(cx) + 0.5;
        push(cx, yb);
        push(cx, yb + h);
        // battlements on the wider blocks
        if (w > 6) {
          for (let b = 1; b < w; b += 2) {
            push(cx + b, yb + h);
            push(cx + b, yb + h + 0.9);
            push(cx + b + 1, yb + h + 0.9);
            push(cx + b + 1, yb + h);
          }
        }
        push(cx + w, yb + h);
        push(cx + w, yb);
        cx += w;
      }
      x = castleX1;
      continue;
    }
    // a spire every so often (St Giles' crown near the middle-right)
    if (Math.abs(x - 40) < 6 && !pts.some((p) => p[1] > 30 + base)) {
      const h = base + 13;
      push(x, base + 2);
      push(x, h);
      push(x + 1.5, h + 2.5);
      push(x + 3, h + 1.2);
      push(x + 4.5, h + 3.4); // crown
      push(x + 6, h + 1.2);
      push(x + 7.5, h + 2.5);
      push(x + 9, h);
      push(x + 9, base + 2);
      x += 9;
      i++;
      continue;
    }
    if (r > 0.93) {
      const h = base + 10 + r2 * 6;
      push(x, base + 4);
      push(x, h);
      push(x + 1.6, h + 9 + r2 * 5);
      push(x + 3.2, h);
      push(x + 3.2, base + 4);
      x += 3.2;
      i++;
      continue;
    }
    // a tenement / terrace block with a gable or a flat top and chimney stacks
    const w = 5 + r * 9;
    const h = base + 4 + r2 * 6 + (Math.abs(x) < 160 ? 3 : 0);
    push(x, h);
    if (r2 > 0.55) {
      // crow-stepped gable
      const st = w / 6;
      push(x + st, h);
      push(x + st, h + 1);
      push(x + st * 2, h + 1);
      push(x + st * 2, h + 2);
      push(x + st * 4, h + 2);
      push(x + st * 4, h + 1);
      push(x + st * 5, h + 1);
      push(x + st * 5, h);
    } else if (r2 > 0.25) {
      push(x + w / 2, h + 2.8); // pitched roof
    } else {
      // flat top with two chimney stacks
      for (const f of [0.22, 0.7]) {
        push(x + w * f, h);
        push(x + w * f, h + 2.2);
        push(x + w * f + 1.2, h + 2.2);
        push(x + w * f + 1.2, h);
      }
    }
    push(x + w, h);
    x += w;
    i++;
  }
  return pts;
}

/** Generic block skyline (towers / terraces), optionally with a clock tower. */
function cityBlocks(seed: number, o: { minH: number; maxH: number; minW: number; maxW: number; towerChance: number; towerH: number; centreBoost: number; clockTowerX?: number }): [number, number][] {
  const pts: [number, number][] = [];
  let x = -HALF;
  let i = 0;
  pts.push([x, 2]);
  while (x < HALF) {
    const r = hash(i, seed);
    const r2 = hash(i, seed + 3);
    if (o.clockTowerX !== undefined && Math.abs(x - o.clockTowerX) < 8) {
      // a Big-Ben-like clock tower with a spire
      const b = o.minH + 2;
      pts.push([x, b], [x, 26], [x - 0.6, 26], [x - 0.6, 29], [x + 2, 36], [x + 4.6, 29], [x + 4, 29], [x + 4, 26], [x + 4, b]);
      x += 4;
      i++;
      continue;
    }
    const centre = Math.max(0, 1 - Math.abs(x) / 200) * o.centreBoost;
    const w = o.minW + r * (o.maxW - o.minW);
    const h = r > 1 - o.towerChance ? o.maxH + r2 * o.towerH + centre : o.minH + r2 * (o.maxH - o.minH) + centre * 0.4;
    pts.push([x, h], [x + w, h]);
    x += w;
    i++;
  }
  return pts;
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Below the sea / ground band: where a silhouette has nothing to show. */
const SUNK = -3;

/**
 * Houses sitting on a terrain profile: flat-topped boxes `top(x) + h` wherever
 * `where(x)`, sunk out of sight elsewhere. `extra` may add a feature (dome,
 * minaret) at a box and return its points; otherwise the box is plain.
 */
function blocksOn(
  seed: number,
  top: (x: number) => number,
  where: (x: number) => boolean,
  o: { minW: number; maxW: number; minH: number; maxH: number; gapChance?: number },
  extra?: (x: number, w: number, y: number, r: number) => [number, number][] | null,
): [number, number][] {
  const pts: [number, number][] = [[-HALF, SUNK]];
  let x = -HALF;
  let i = 0;
  while (x < HALF) {
    const r = hash(i, seed);
    const r2 = hash(i, seed + 3);
    const w = o.minW + r * (o.maxW - o.minW);
    if (!where(x) || !where(x + w) || r2 < (o.gapChance ?? 0)) {
      pts.push([x, SUNK], [x + w, SUNK]);
    } else {
      const y = top(x + w / 2) + o.minH + r2 * (o.maxH - o.minH);
      const feat = extra?.(x, w, y, hash(i, seed + 7));
      if (feat) pts.push(...feat);
      else pts.push([x, y], [x + w, y]);
    }
    x += w;
    i++;
  }
  return pts;
}

/** Layer recipe for the non-Edinburgh backdrop styles. */
interface RegionalLayer {
  name: string;
  pts: [number, number][];
  base: string;
  haze: number;
  dist: number;
  follow: number;
  /** alpha-ramped haze ribbon (pts are ignored except for height) */
  mist?: boolean;
  /** mist only: colour blended into the haze (e.g. a warm amber horizon) */
  tint?: string;
  tintAmt?: number;
}

/** Placeholder layer recipes for the non-Edinburgh backdrop styles. */
function regionalLayers(style: Exclude<BackdropStyle, "edinburgh">, seed: number) {
  const out: RegionalLayer[] = [];
  switch (style) {
    case "amman": {
      // Amman: rolling bare limestone hills (jabals) carpeted in pale cube
      // houses with the odd minaret, under a warm amber horizon haze
      out.push({ name: "bdFar", pts: sample((x) => 12 + fbm(x / 110, seed) * 14 + Math.sin(x / 70) * 3, 8), base: "#c7a47a", haze: 0.58, dist: 400, follow: 0.93 });
      out.push({ name: "bdGlow", pts: sample(() => 22, 40), base: "#ffffff", haze: 1, dist: 380, follow: 0.92, mist: true, tint: "#f2a760", tintAmt: 0.55 });
      const jabal = (x: number) => 6 + fbm(x / 55, seed + 5) * 13 + Math.max(0, Math.sin(x / 95 + 1.3)) * 5;
      out.push({ name: "bdHills", pts: sample(jabal, 5), base: "#c6ad86", haze: 0.44, dist: 322, follow: 0.87 });
      // the town rides the same hill profile, a little in front, so the houses climb the jabals
      out.push({
        name: "bdTown",
        pts: blocksOn(seed + 11, (x) => jabal(x) * 0.78, () => true, { minW: 2, maxW: 5, minH: 0.5, maxH: 3, gapChance: 0.08 }, (x, w, y, r) =>
          r > 0.95 ? [[x, y], [x + w * 0.4, y], [x + w * 0.4, y + 8], [x + w * 0.5, y + 9.5], [x + w * 0.6, y + 8], [x + w * 0.6, y], [x + w, y]] : null,
        ),
        base: "#e0d0ac",
        haze: 0.34,
        dist: 312,
        follow: 0.87,
      });
      // sparse olive / pine scrub in the near fringe
      out.push({ name: "bdTrees", pts: sample((x) => 0.8 + fbm(x / 10, seed + 9, 3) * 2 + (hash(Math.floor(x / 7), seed + 2) > 0.75 ? 2.5 : 0), 2.5), base: "#7f7d52", haze: 0.28, dist: 185, follow: 0.72 });
      break;
    }
    case "santorini": {
      // Santorini: the caldera. Dark volcanic cliffs wrap round both sides,
      // crowned with whitewashed cubes and blue domes, over deep blue water
      // with Therasia low on the horizon through the gap
      out.push({ name: "bdFar", pts: sample((x) => 2 + fbm(x / 50, seed) * 7 * Math.max(0, 1 - Math.abs(x - 10) / 150), 6), base: "#8e9aae", haze: 0.66, dist: 400, follow: 0.93 });
      out.push({ name: "bdSea", pts: sample(() => 1.4, 40), base: "#1d5796", haze: 0.22, dist: 300, follow: 0.86 });
      const rim = (x: number) => smoothstep(60, 120, Math.abs(x - 10));
      const cliff = (x: number) => {
        const e = rim(x);
        return e < 0.02 ? SUNK : e * (16 + fbm(x / 38, seed + 5) * 11);
      };
      const crowned = (x: number) => rim(x) > 0.85;
      // behind the cliff (so only what rises above the rim shows): white village, then blue domes in front of it
      out.push({ name: "bdVillage", pts: blocksOn(seed + 21, (x) => cliff(x) - 1.2, crowned, { minW: 1.6, maxW: 3.8, minH: 1.4, maxH: 4, gapChance: 0.12 }), base: "#f4f1ea", haze: 0.2, dist: 276, follow: 0.84 });
      out.push({
        name: "bdDomes",
        pts: blocksOn(seed + 31, (x) => cliff(x) - 3, crowned, { minW: 3, maxW: 9, minH: 0, maxH: 0 }, (x, w, y, r) => {
          if (r < 0.72) return [[x, y], [x + w, y]];
          // a small blue dome on a drum
          const cx = x + w / 2;
          const pts: [number, number][] = [[x, y], [cx - 1.2, y], [cx - 1.2, y + 5]];
          for (let a = 1; a < 8; a++) pts.push([cx - 1.2 * Math.cos((a / 8) * Math.PI), y + 5 + Math.sin((a / 8) * Math.PI) * 1.2]);
          pts.push([cx + 1.2, y + 5], [cx + 1.2, y], [x + w, y]);
          return pts;
        }),
        base: "#2f64b0",
        haze: 0.24,
        dist: 273,
        follow: 0.84,
      });
      out.push({ name: "bdCliffs", pts: sample(cliff, 3), base: "#6e554a", haze: 0.3, dist: 270, follow: 0.84 });
      break;
    }
    case "positano": {
      // Positano / Amalfi: steep Lattari mountains, a warm turquoise sea with
      // rock stacks (faraglioni), and a pastel town cascading down the headland
      out.push({ name: "bdFar", pts: sample((x) => 22 + fbm(x / 55, seed) * 30 + Math.max(0, 1 - Math.abs(x + 180) / 140) * 12, 6), base: "#948b80", haze: 0.6, dist: 400, follow: 0.93 });
      out.push({ name: "bdGlow", pts: sample(() => 14, 40), base: "#ffffff", haze: 1, dist: 385, follow: 0.92, mist: true, tint: "#f3c08a", tintAmt: 0.3 });
      out.push({ name: "bdSea", pts: sample(() => 1.2, 40), base: "#2f93b4", haze: 0.24, dist: 300, follow: 0.86 });
      // faraglioni: a few steep rock stacks standing in the sea through the bay
      const stacks: [number, number, number][] = [
        [-10, 5, 13],
        [8, 3.5, 9],
        [22, 2.5, 6],
        [118, 4, 10],
      ];
      out.push({
        name: "bdStacks",
        pts: sample((x) => {
          let h = SUNK;
          for (const [sx, hw, sh] of stacks) {
            const u = Math.abs(x - sx) / hw;
            if (u < 1) h = Math.max(h, sh * (1 - u ** 6) + fbm(x / 3, seed + 3) * 1.5);
          }
          return h;
        }, 1),
        base: "#86705c",
        haze: 0.34,
        dist: 282,
        follow: 0.85,
      });
      // headlands: a big one west (the town slope) and a lower one east
      const slope = (x: number) => {
        const west = x < -40 ? 30 * smoothstep(-40, -250, x) + fbm(x / 30, seed + 5) * 6 : 0;
        const east = x > 150 ? 22 * smoothstep(150, 330, x) + fbm(x / 30, seed + 6) * 5 : 0;
        const h = Math.max(west, east);
        return h < 0.5 ? SUNK : h;
      };
      // pastel houses stacked down the west slope: each colour is its own
      // ribbon in front of the headland, each house a tall strip from its roof
      // down to the sea so the town reads as a cascade
      const town = (x: number) => x > -230 && x < -55;
      ["#e7a98c", "#e8bf66", "#f1e4c8"].forEach((c, k) =>
        out.push({
          name: `bdTown${k}`,
          pts: blocksOn(seed + 41 + k * 5, (x) => slope(x) * (0.3 + hash(Math.floor(x / 3), seed + k) * 0.7), town, { minW: 1.8, maxW: 3.2, minH: 0, maxH: 1, gapChance: 0.62 }),
          base: c,
          haze: 0.3,
          dist: 258 - k * 2,
          follow: 0.8,
        }),
      );
      out.push({ name: "bdHeadland", pts: sample(slope, 3), base: "#5d6f45", haze: 0.34, dist: 262, follow: 0.8 });
      break;
    }
    case "uae_skyline":
      out.push({ name: "bdFar", pts: sample((x) => 3 + fbm(x / 120, seed) * 5, 10), base: "#c9b48e", haze: 0.7, dist: 400, follow: 0.93 });
      out.push({ name: "bdTown", pts: cityBlocks(seed, { minH: 4, maxH: 14, minW: 6, maxW: 14, towerChance: 0.28, towerH: 26, centreBoost: 10 }), base: "#8e9aa6", haze: 0.42, dist: 280, follow: 0.82 });
      out.push({ name: "bdTrees", pts: sample((x) => 1.5 + fbm(x / 14, seed + 9, 3) * 3 + (hash(Math.floor(x / 9), seed) > 0.8 ? 4 : 0), 3), base: "#b09a72", haze: 0.3, dist: 185, follow: 0.72 });
      break;
    case "london":
      out.push({ name: "bdFar", pts: sample((x) => 6 + fbm(x / 80, seed) * 8, 8), base: "#7f8a96", haze: 0.62, dist: 400, follow: 0.93 });
      out.push({ name: "bdTown", pts: cityBlocks(seed, { minH: 5, maxH: 11, minW: 5, maxW: 12, towerChance: 0.08, towerH: 12, centreBoost: 3, clockTowerX: -90 }), base: "#7a7672", haze: 0.36, dist: 260, follow: 0.8 });
      // the river: a flat low band in front of the town
      out.push({ name: "bdRiver", pts: sample(() => 0.8, 40), base: "#6f8594", haze: 0.3, dist: 205, follow: 0.76 });
      out.push({ name: "bdTrees", pts: sample((x) => 2 + fbm(x / 9, seed + 9, 3) * 5, 2.5), base: "#56704a", haze: 0.26, dist: 185, follow: 0.72 });
      break;
    case "coastal":
      out.push({ name: "bdFar", pts: sample((x) => 4 + fbm(x / 60, seed) * 16 * Math.max(0, Math.sin(x / 160 + 0.8)), 8), base: "#8a9aa2", haze: 0.66, dist: 400, follow: 0.93 });
      out.push({ name: "bdSea", pts: sample(() => 1.2, 40), base: "#4f8fb8", haze: 0.3, dist: 260, follow: 0.85 });
      out.push({ name: "bdTrees", pts: sample((x) => 1 + fbm(x / 12, seed + 9, 3) * 3, 3), base: "#b8a47e", haze: 0.26, dist: 190, follow: 0.74 });
      break;
    case "hills":
      out.push({ name: "bdFar", pts: sample((x) => 14 + fbm(x / 70, seed) * 22, 8), base: "#a4957a", haze: 0.6, dist: 400, follow: 0.93 });
      out.push({ name: "bdHills", pts: sample((x) => 8 + fbm(x / 40, seed + 5) * 14, 5), base: "#b8a584", haze: 0.42, dist: 320, follow: 0.88 });
      out.push({ name: "bdTown", pts: cityBlocks(seed, { minH: 5, maxH: 9, minW: 3, maxW: 7, towerChance: 0.04, towerH: 6, centreBoost: 2 }), base: "#cdbf9f", haze: 0.34, dist: 250, follow: 0.8 });
      out.push({ name: "bdTrees", pts: sample((x) => 2 + fbm(x / 9, seed + 9, 3) * 4, 2.5), base: "#6f7a4c", haze: 0.26, dist: 185, follow: 0.72 });
      break;
    default:
      // city_generic
      out.push({ name: "bdFar", pts: sample((x) => 12 + fbm(x / 70, seed) * 18, 8), base: "#7488a0", haze: 0.62, dist: 400, follow: 0.93 });
      out.push({ name: "bdHills", pts: sample((x) => 6 + fbm(x / 45, seed + 5) * 10, 5), base: "#6d8a66", haze: 0.44, dist: 330, follow: 0.88 });
      out.push({ name: "bdTown", pts: cityBlocks(seed, { minH: 5, maxH: 12, minW: 5, maxW: 11, towerChance: 0.1, towerH: 14, centreBoost: 4 }), base: "#7d7a80", haze: 0.34, dist: 250, follow: 0.8 });
      out.push({ name: "bdTrees", pts: sample((x) => 2 + fbm(x / 9, seed + 9, 3) * 6, 2.5), base: "#56704a", haze: 0.26, dist: 185, follow: 0.72 });
  }
  return out;
}

export function createBackdrop(scene: Scene, opts: BackdropOptions): Backdrop {
  const seed = opts.seed ?? 7;
  const layers: Layer[] = [];
  const style = opts.style ?? "edinburgh";
  const add = (mesh: Mesh, base: string, haze: number, dist: number, follow: number, mist = false, tint?: string, tintAmt = 0) => {
    const mat = unlitMaterial(scene, `${mesh.name}Mat`);
    if (mist) {
      mat.alpha = 0.999; // force the alpha pass (vertex alpha ramps the ribbon out)
      mat.disableDepthWrite = true;
      mesh.hasVertexAlpha = true;
    }
    mat.backFaceCulling = false;
    mesh.material = mat;
    mesh.alwaysSelectAsActiveMesh = true;
    layers.push({ mesh, mat, base: Color3.FromHexString(base), haze, dist, follow, mist, tint: tint ? Color3.FromHexString(tint) : undefined, tintAmt });
  };

  if (style !== "edinburgh") {
    for (const l of regionalLayers(style, seed)) {
      if (l.mist) add(ribbon(scene, l.name, l.pts, 1, 1, true), l.base, l.haze, l.dist, l.follow, true, l.tint, l.tintAmt);
      else add(ribbon(scene, l.name, l.pts, 1, 0.94), l.base, l.haze, l.dist, l.follow);
    }
    add(ribbon(scene, "bdMist1", sample(() => 8, 40), 1, 1, true), "#ffffff", 1, 245, 0.8, true);
  } else {
  // 1. far ridges (Highlands / Pentlands, blue and soft)
  add(
    ribbon(
      scene,
      "bdFar",
      sample((x) => 20 + fbm(x / 70, seed) * 34 + Math.max(0, 1 - Math.abs(x + 230) / 120) * 14, 8),
      1,
      1.0,
    ),
    "#6f86a0",
    0.62,
    400,
    0.93,
  );
  // 2. rolling hills + Arthur's Seat (east / right of frame)
  const seat = (x: number) => {
    const u = (x - 170) / 95; // -1..1 across the hill
    if (u < -1.2 || u > 1.3) return 0;
    // long lion's back rising to the head, then a steep drop (Salisbury crags on the flank)
    const back = Math.max(0, 1 - Math.abs(u + 0.1) / 1.2) ** 1.2 * 26;
    const head = Math.max(0, 1 - Math.abs(u - 0.35) / 0.22) * 12;
    const crags = u > -0.9 && u < -0.45 ? 4 : 0;
    return back + head + crags;
  };
  add(ribbon(scene, "bdHills", sample((x) => 9 + fbm(x / 45, seed + 5) * 18 + seat(x), 5), 1, 0.96), "#6d8a66", 0.44, 330, 0.88);
  // 3. old-town skyline (+ castle rock)
  add(ribbon(scene, "bdTown", skyline(seed, opts.castle ?? true), 1, 0.9), "#7d7a80", 0.34, 250, 0.8);
  // 4. near fringe of trees / fields
  add(
    ribbon(
      scene,
      "bdTrees",
      sample((x) => 2 + fbm(x / 9, seed + 9, 3) * 7 + Math.max(0, Math.sin(x / 23 + 1)) * 2, 2.5),
      1,
      0.92,
    ),
    "#56704a",
    0.26,
    185,
    0.72,
  );
  // mist ribbons in front of the town and the near fringe
  add(ribbon(scene, "bdMist1", sample(() => 10, 40), 1, 1, true), "#ffffff", 1, 245, 0.8, true);
  add(ribbon(scene, "bdMist2", sample(() => 5, 40), 1, 1, true), "#ffffff", 1, 180, 0.72, true);
  }

  // anchor: the map's north edge (z = 0) and its centre x
  const anchorX = opts.mapW / 2;
  const northZ = 0;

  const c = new Color3();
  return {
    setAtmosphere(a) {
      for (const l of layers) {
        if (l.mist) {
          if (l.tint) {
            // tinted haze follows the time of day: the tint is lit like the layers
            c.copyFrom(l.tint).multiplyToRef(a.light, c);
            Color3.LerpToRef(a.haze, c, l.tintAmt ?? 0, c);
            l.mat.emissiveColor = c.clone();
          } else l.mat.emissiveColor = a.haze.clone();
          continue;
        }
        c.copyFrom(l.base).multiplyToRef(a.light, c);
        Color3.LerpToRef(c, a.haze, l.haze, c);
        l.mat.emissiveColor = c.clone();
      }
    },
    update(cam) {
      for (const l of layers) {
        // x rides with the camera (a little parallax against the anchor);
        // z: pushed beyond the map's north edge whatever the camera does
        const x = anchorX + (cam.x - anchorX) * l.follow;
        const zCam = cam.z + l.dist;
        const zMin = northZ + l.dist * 0.45; // never inside the map
        const z = Math.max(zMin, zCam * l.follow + (northZ + l.dist) * (1 - l.follow));
        l.mesh.position.set(x, 0, z);
      }
    },
    dispose() {
      for (const l of layers) {
        l.mesh.dispose();
        l.mat.dispose();
      }
      layers.length = 0;
    },
  };
}
