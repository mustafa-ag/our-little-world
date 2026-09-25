// Foliage: the storybook trees, bushes, flower clusters, heather and ivy are
// hero assets (Blender GLBs from tools/blender/assets/nature, each with a
// procedural fallback: assets/hero/trees.ts for the trees and bushes, this
// file for the cypress, flower clusters and heather). Grass tufts and the
// elongated flower bed stay procedural. Colour variation for trees/bushes
// comes from the `c=#hex` variant (vertex-colour retint of olw_foliage); for
// flower clusters from `c=#hex` (petal retint) plus per-instance tints when
// they are planted with `plantFlowers` (thin instances + colour buffer).

import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { type AssetManager, HERO_ASSETS, type HeroEntry, type KitContext, type PieceFactory, type ThinPlacement, heroFactory } from "../AssetManager";
import { PALETTE } from "../../rendering/materials";
import { blob, box, cyl as kitCyl, merge, parseVariant, tintVertices } from "./util";
import { shade } from "./architecture/geom";
import { type ColorFn, type RGB, cyl, hexToRgb, ico, leaf, merge as heroMerge, prng, retintSlot, tube } from "../hero/geo";
import type { HeroCtx } from "../hero/slots";
import { LEAF_BASE, retintFoliage } from "../hero/trees";

// Ground clutter is vertex-coloured on ONE shared white material, so each
// variant batch is a single draw call (per-part materials interleave into
// dozens of submeshes once merged).

const LEAF_TONES = ["#6f8a4c", "#7f9a58", "#5f7a45", "#88a260"];

function painted<T extends Mesh>(m: T, hex: string): T {
  tintVertices(m, hex);
  return m;
}

const hexOf = (v: string) => /(?:^|,)c=(#[0-9a-fA-F]{6})/.exec(v)?.[1];

/** URL of a Blender GLB: the HERO_ASSETS entry when the registry has one, else the pipeline's convention. */
function glbUrl(key: string) {
  return (HERO_ASSETS as Record<string, HeroEntry | undefined>)[key]?.url ?? `assets/models/${key}.glb`;
}

// ---------------------------------------------------------------- flower clusters

/** The three Blender flower mixes. `base` = the petal colour a `c=#hex` variant is measured against. */
export const FLOWER_MIXES = {
  "flower-cluster-a": { base: PALETTE.dustyRose, petals: ["#d49a9a", "#e7b3ad", "#f1e6cf", "#c9858a"], eye: "#e8cf7a" }, // pinks + cream
  "flower-cluster-b": { base: "#e8cf7a", petals: ["#e8cf7a", "#f1e6cf", "#e3bf5c", "#f0dc96"], eye: "#c98f3e" }, // yellow + cream
  "flower-cluster-c": { base: "#b7a3d0", petals: ["#b7a3d0", "#8c6f9e", "#cbbde0", "#9c7aa6"], eye: "#f1e6cf" }, // lavender + purple
} as const;
export type FlowerClusterKey = keyof typeof FLOWER_MIXES;
export const FLOWER_CLUSTER_KEYS = Object.keys(FLOWER_MIXES) as FlowerClusterKey[];

/** Petal slots (olw_flower; olw_paint kept for older procedural builds). */
const PETAL_SLOTS = ["olw_flower", "olw_paint"];

/**
 * `c=#hex` on a flower cluster: pull the petals toward `hex` by the ratio
 * against the mix's base colour, at 75 % strength so the cream / two-tone mix
 * (and the baked petal shading) survives.
 */
function flowerVariant(key: FlowerClusterKey) {
  const base = hexToRgb(FLOWER_MIXES[key].base);
  return (m: Mesh, v: string) => {
    const c = hexOf(v);
    if (!c) return;
    const t = hexToRgb(c);
    const k: RGB = [0, 1, 2].map((i) => 1 + (t[i] / Math.max(0.05, base[i]) - 1) * 0.75) as RGB;
    for (const slot of PETAL_SLOTS) retintSlot(m, slot, (r, g, b) => [Math.min(1, r * k[0]), Math.min(1, g * k[1]), Math.min(1, b * k[2])]);
  };
}

/** The cluster whose base petal colour is nearest to `hex` (legacy `flower-cluster` + `c=` callers). */
export function nearestFlowerCluster(hex: string | undefined): FlowerClusterKey {
  if (!hex) return "flower-cluster-a";
  const t = hexToRgb(hex);
  let best: FlowerClusterKey = "flower-cluster-a";
  let bd = Infinity;
  for (const key of FLOWER_CLUSTER_KEYS) {
    const b = hexToRgb(FLOWER_MIXES[key].base);
    // cream / white matches every mix; prefer yellow+cream for warm pales
    const d = (t[0] - b[0]) ** 2 + (t[1] - b[1]) ** 2 * 1.2 + (t[2] - b[2]) ** 2;
    if (d < bd) {
      bd = d;
      best = key;
    }
  }
  return best;
}

/**
 * Procedural stand-in for a Blender flower cluster (same silhouette idea at
 * ~300 tris): a rosette of leaves, thin stems, open petal cups at varied
 * heights and a couple of closed buds.
 */
function buildFlowerCluster(key: FlowerClusterKey) {
  return (ctx: HeroCtx): Mesh => {
    const mix = FLOWER_MIXES[key];
    const rng = prng(key.charCodeAt(key.length - 1) * 7 + 3);
    const parts: Mesh[] = [];
    // leaf rosette: diamond blades tipped outward and drooping
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + (rng() - 0.5) * 0.6;
      const l = leaf(ctx, "olw_foliage", 0.055, 0.12 + rng() * 0.04, (_x, y) => mixRgb("#55703f", "#8fa66a", y / 0.08), 0, 0.004, 0);
      l.rotation = new Vector3(Math.PI / 2 - 0.45 - rng() * 0.3, -a + Math.PI / 2, 0);
      parts.push(l);
    }
    // heads: radial offset, height, radius, bud?
    const heads: [number, number, number, number][] = [
      [0.0, 0.27, 0.078, 0],
      [0.09, 0.24, 0.066, 0],
      [0.1, 0.18, 0.058, 0],
      [0.075, 0.27, 0.062, 0],
      [0.115, 0.135, 0.05, 0],
      [0.06, 0.21, 0.07, 0],
      [0.05, 0.285, 0.03, 1],
    ];
    heads.forEach(([rr, h, R, bud], i) => {
      const a = i * 2.39996 + (rng() - 0.5) * 0.8;
      const top = new Vector3(Math.cos(a) * rr, h * (0.92 + rng() * 0.12), Math.sin(a) * rr);
      const base = new Vector3(Math.cos(a) * 0.008, 0, Math.sin(a) * 0.008);
      const mid = Vector3.Lerp(base, top, 0.5).add(new Vector3(Math.cos(a) * 0.012, 0, Math.sin(a) * 0.012));
      parts.push(tube(ctx, "olw_foliage", [base, mid, top], () => 0.0055, (_x, y) => mixRgb("#5f7d45", "#7f9a58", y / 0.3), 3, Mesh.NO_CAP));
      const col = mix.petals[i % mix.petals.length];
      const dark = shade(col, -0.18);
      const tip = shade(col, 0.3);
      // petal cup: a shallow 5-sided cone (tip down), rim lighter than the throat
      const cup = bud ? cyl(ctx, "olw_flower", R * 1.1, R * 0.5, R * 1.6, (_x, y) => mixRgb(dark, col, (y - top.y) / (R * 1.6)), top.x, top.y - R * 0.2, top.z, 4) : cyl(ctx, "olw_flower", R * 2, R * 0.35, R * 0.55, (x, y, z) => mixRgb(dark, tip, Math.hypot(x - top.x, z - top.z) / R), top.x, top.y - R * 0.1, top.z, 5);
      cup.rotation = new Vector3(Math.sin(a) * rr * 2.5, rng() * 1.3, -Math.cos(a) * rr * 2.5);
      parts.push(cup);
      if (!bud) parts.push(cyl(ctx, "olw_flower", R * 0.2, R * 0.45, R * 0.35, mix.eye, top.x, top.y + R * 0.3, top.z, 3));
    });
    return heroMerge(key, parts);
  };
}

function mixRgb(a: string, b: string, t: number): RGB {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const k = Math.min(1, Math.max(0, t));
  return [x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k];
}

// ---------------------------------------------------------------- cypress

/** Procedural stand-in for tree-cypress: a narrow flame of stacked lumpy masses on a short trunk (~4.7 u). */
function buildCypress(ctx: HeroCtx): Mesh {
  const rng = prng(51);
  const parts: Mesh[] = [];
  parts.push(tube(ctx, "olw_bark", [new Vector3(0, 0, 0), new Vector3(0, 0.6, 0), new Vector3(0.02, 1.4, 0)], (i) => [0.1, 0.075, 0.06][i] ?? 0.06, (_x, y) => mixRgb("#4f3424", "#8d6642", y / 1.4), 6));
  const y0 = 0.55;
  const y1 = 4.75;
  const crown: ColorFn = (x, y) => {
    const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
    const sun = 1 + Math.max(0, x) * 0.25;
    const c = mixRgb("#44603a", "#8fa66a", t * 0.8 + 0.1);
    // stored relative to LEAF_BASE like the hero trees so `c=#hex` retints by ratio
    const lb = hexToRgb(LEAF_BASE);
    const ref = hexToRgb("#6b8a4e");
    return [(c[0] * sun * lb[0]) / ref[0], (c[1] * sun * lb[1]) / ref[1], (c[2] * sun * lb[2]) / ref[2]];
  };
  const n = 9;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = 0.12 + 0.46 * Math.pow(Math.sin(Math.min(1, t * 1.2 + 0.12) * Math.PI), 0.8) * Math.pow(1 - t * 0.92, 0.35);
    const y = y0 + 0.35 + t * 3.55;
    parts.push(ico(ctx, "olw_foliage", r, crown, 0.06 * Math.sin(t * 3.2) + 0.1 * t * t, y, 0.03 * Math.sin(t * 2.1), { subdiv: 1, noise: 0.14, scale: [1, 1.7, 1], flat: false, rng }));
  }
  return heroMerge("tree-cypress", parts);
}

// ---------------------------------------------------------------- flower bed / heather / grass (procedural)

/**
 * A dense, elongated flower bed (~1 unit long) for wall bases and façades:
 * a lumpy leaf mound planted with open petal cups on short stalks in two
 * colours plus a few cream heads. Variant c / d = the two petal colours.
 */
function flowerBed(k: KitContext, variant: string): Mesh {
  const v = parseVariant(variant);
  const s = k.scene;
  const white = k.mats.flat("#ffffff");
  const c1 = v.c ?? PALETTE.dustyRose;
  const c2 = v.d ?? "#f1e7d0";
  const parts: Mesh[] = [];
  const mound: [number, number, number, number][] = [
    [-0.36, 0.0, 0.34, 0],
    [-0.1, 0.03, 0.4, 1],
    [0.17, -0.02, 0.36, 2],
    [0.4, 0.02, 0.3, 3],
    [0.02, -0.1, 0.26, 1],
  ];
  for (const [x, z, d, t] of mound) parts.push(painted(blob(s, d, white, x, 0.05, z, 0.62, 4), LEAF_TONES[t]));
  const n = 22;
  for (let i = 0; i < n; i++) {
    const x = -0.47 + (i / (n - 1)) * 0.94 + (((i * 37) % 7) / 7 - 0.5) * 0.08;
    const z = (((i * 53) % 9) / 9 - 0.5) * 0.28;
    const y = 0.13 + ((i * 11) % 5) * 0.024 - Math.abs(x) * 0.08;
    const col = i % 6 === 2 ? "#f4ecdc" : i % 2 ? c1 : c2;
    const R = 0.05 + (i % 3) * 0.01;
    parts.push(painted(kitCyl(s, 0.012, 0.012, y, white, x, 0, z, 3), "#5f7d45"));
    const cup = painted(kitCyl(s, R * 2, R * 0.4, R * 0.6, white, x, y, z, 5), col);
    cup.rotation.y = i * 1.3;
    parts.push(cup);
    parts.push(painted(kitCyl(s, R * 0.35, R * 0.4, R * 0.2, white, x, y + R * 0.3, z, 3), i % 2 ? "#e8cf7a" : "#f1e6cf"));
  }
  return merge("flower-bed", parts);
}

/** Heather fallback: low purple-grey cushions (the GLB has proper flower spikes). */
function heatherFallback(k: KitContext): Mesh {
  const s = k.scene;
  const white = k.mats.flat("#ffffff");
  const parts: Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(painted(blob(s, 0.18, white, Math.cos(a) * 0.1, 0.05, Math.sin(a) * 0.09, 0.55, 4), "#6e7d5a"));
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(painted(blob(s, 0.12, white, Math.cos(a) * 0.1, 0.09, Math.sin(a) * 0.09, 0.8, 4), i % 2 ? PALETTE.heather : shade(PALETTE.heather, -0.08)));
  }
  parts.push(painted(blob(s, 0.14, white, 0, 0.11, 0, 0.8, 4), PALETTE.heather));
  return merge("heather", parts);
}

/** Small grass tuft for the meadow edges. */
function grassTuft(k: KitContext): Mesh {
  const s = k.scene;
  const white = k.mats.flat("#ffffff");
  const parts: Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const b = box(s, 0.035, 0.16 + (i % 3) * 0.05, 0.03, white, -0.12 + i * 0.05, 0, (i % 2) * 0.06 - 0.03);
    b.rotation.z = (i - 2.5) * 0.2;
    parts.push(painted(b, i % 3 === 1 ? "#7a9656" : "#8aa562"));
  }
  return merge("grass-tuft", parts);
}

// ---------------------------------------------------------------- planting helpers

export interface FlowerSpot {
  x: number;
  z: number;
  y?: number;
  /** Which cluster; default: picked per spot from `keys` (or all three). */
  key?: FlowerClusterKey;
  rotationY?: number;
  scale?: number;
  /** Per-instance multiply tint (hex); default white with a small random drift. */
  tint?: string;
}

export interface PlantFlowersOpts {
  /** Deterministic seed for the per-spot choices. */
  seed?: number;
  /** Clusters to choose from when a spot names none (default all three). */
  keys?: FlowerClusterKey[];
  /** Random scale range applied on top of spot.scale (default [0.8, 1.2]). */
  scale?: [number, number];
  /** Brightness / hue drift per instance, 0..1 (default 0.12). */
  tintJitter?: number;
}

/**
 * Plant flower clusters as thin instances (one draw batch per cluster key)
 * with per-instance rotation, scale and a colour-buffer tint, so a bed or a
 * meadow drift of a hundred clusters never repeats visibly. Returns the
 * thin-instance meshes (owned by the AssetManager: disposeInstances clears them).
 */
export function plantFlowers(am: AssetManager, spots: FlowerSpot[], opts: PlantFlowersOpts = {}): Mesh[] {
  const rng = prng((opts.seed ?? 1) * 97 + spots.length);
  const keys = opts.keys?.length ? opts.keys : FLOWER_CLUSTER_KEYS;
  const [s0, s1] = opts.scale ?? [0.8, 1.2];
  const jit = opts.tintJitter ?? 0.12;
  const groups = new Map<FlowerClusterKey, { pl: ThinPlacement[]; col: number[] }>();
  for (const sp of spots) {
    const key = sp.key ?? keys[Math.floor(rng() * keys.length) % keys.length];
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { pl: [], col: [] }));
    g.pl.push({ x: sp.x, y: sp.y, z: sp.z, rotationY: sp.rotationY ?? rng() * Math.PI * 2, scale: (sp.scale ?? 1) * (s0 + rng() * (s1 - s0)) });
    const [r, gg, b] = sp.tint ? hexToRgb(sp.tint) : [1, 1, 1];
    const br = 1 + (rng() - 0.55) * jit; // mostly a touch darker: sunlit vs shaded clumps
    const warm = (rng() - 0.5) * jit * 0.5;
    g.col.push(Math.min(1.1, r * br * (1 + warm)), Math.min(1.1, gg * br), Math.min(1.1, b * br * (1 - warm)), 1);
  }
  const out: Mesh[] = [];
  for (const [key, g] of groups) {
    const mesh = am.thinInstances(key, g.pl);
    if (!mesh) continue;
    mesh.thinInstanceSetBuffer("color", new Float32Array(g.col), 4, true);
    out.push(mesh);
  }
  return out;
}

/**
 * Spots for a flower bed along a wall / path: `length` x `depth` units centred
 * on (x, z), turned by `rotationY`, with jittered (never grid-like) spacing and
 * the taller mixes toward the back (+local z). Feed the result to `plantFlowers`.
 */
export function flowerBedSpots(x: number, z: number, length: number, depth: number, rotationY = 0, density = 7, seed = 1, y = 0): FlowerSpot[] {
  const rng = prng(seed * 31 + 7);
  const n = Math.max(1, Math.round(length * depth * density * 2.2));
  const cs = Math.cos(rotationY);
  const sn = Math.sin(rotationY);
  const out: FlowerSpot[] = [];
  for (let i = 0; i < n; i++) {
    // stratified along the length so gaps stay small, jittered across the depth
    const u = (i + 0.2 + rng() * 0.6) / n - 0.5;
    const lx = u * length;
    const lz = (rng() - 0.5) * depth;
    const back = lz / Math.max(0.01, depth) + 0.5;
    out.push({ x: x + lx * cs + lz * sn, z: z - lx * sn + lz * cs, y, scale: 0.85 + back * 0.3 + rng() * 0.15 });
  }
  return out;
}

// ---------------------------------------------------------------- registration

/** Blender GLBs registered here that are not in HERO_PRELOAD_KEYS (preloaded by registerFoliage itself). */
export const FOLIAGE_EXTRA_GLB_KEYS = ["tree-cypress", "heather"] as const;

export function registerFoliage(am: AssetManager) {
  // hero pieces (GLB + fallback); `c=#hex` variants retint the foliage slot
  am.registerHero("tree-oak-a");
  am.registerHero("tree-oak-b");
  am.registerHero("tree-small");
  am.registerHero("tree-pine");
  am.registerHero("bush-a");
  am.registerHero("bush-b");
  am.registerHero("ivy-card");
  am.registerGlb("tree-cypress", glbUrl("tree-cypress"), { fallback: heroFactory(buildCypress), variant: (m, v) => hexOf(v) && retintFoliage(m, hexOf(v)!) });
  // flower clusters (Blender GLB + procedural twin); `c=#hex` pulls the petals toward a colour
  for (const key of FLOWER_CLUSTER_KEYS) {
    const fallback: PieceFactory = heroFactory(buildFlowerCluster(key));
    am.registerGlb(key, glbUrl(key), { fallback, shadow: false, variant: flowerVariant(key) });
  }
  am.registerGlb("heather", glbUrl("heather"), { fallback: heatherFallback, shadow: false });
  // legacy keys used by dressing/propMap
  am.registerAlias("tree-a", "tree-oak-a");
  am.registerAlias("tree-b", "tree-pine");
  am.registerAlias("tree-c", "tree-cypress");
  am.registerAlias("bush", (v) => (v.includes("flowers=1") ? "bush-b" : "bush-a"));
  // `flower-cluster` + `c=#hex` → the nearest Blender mix, petals pulled toward the colour
  am.registerAlias("flower-cluster", (v) => nearestFlowerCluster(hexOf(v)));
  // procedural ground clutter
  am.register("grass-tuft", grassTuft, { shadow: false });
  am.register("flower-bed", flowerBed, { shadow: false });
  // the extra GLBs are not in HERO_PRELOAD_KEYS: start loading them now (falls back silently)
  void am.preload([...FOLIAGE_EXTRA_GLB_KEYS]);
}
