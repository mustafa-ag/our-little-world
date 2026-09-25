// Storybook trees and bushes: bent low-poly trunks, crowns made of 3–6
// offset noise-displaced icosphere clusters with a dark-base → light-top
// vertex gradient and a slightly lit "sun side" (+x). All foliage lives in
// the olw_foliage slot and is baked around LEAF_BASE so a variant colour can
// be applied by ratio (retintFoliage) on both the GLB and the procedural build.

import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PALETTE } from "../../rendering/materials";
import { type ColorFn, type Rng, hexToRgb, ico, merge, prng, recolourSlot, tube, v3 } from "./geo";
import type { HeroCtx } from "./slots";

/** Baked foliage base colour (moss). Variants are ratios against this. */
export const LEAF_BASE = PALETTE.moss;
const LEAF_DARK = "#4c6638";
const LEAF_LIGHT = "#a7bd76";
const BARK = "#6e4a30";
const BARK_LIGHT = "#8d6642";

/** Apply a `c=#hex` foliage variant (keeps the baked gradient). */
export function retintFoliage(m: Mesh, hex: string) {
  recolourSlot(m, "olw_foliage", LEAF_BASE, hex);
}

/** Crown colour: vertical gradient + sun side + per-vertex jitter, all relative to LEAF_BASE. */
function crownColor(y0: number, y1: number, rng: Rng, dark = LEAF_DARK, light = LEAF_LIGHT): ColorFn {
  const a = hexToRgb(dark);
  const b = hexToRgb(light);
  return (x, y) => {
    const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
    const sun = 1 + Math.max(0, Math.min(1, x * 0.25)) * 0.12;
    const j = 1 + (rng() - 0.5) * 0.09;
    const k = sun * j;
    return [(a[0] + (b[0] - a[0]) * t) * k, (a[1] + (b[1] - a[1]) * t) * k, (a[2] + (b[2] - a[2]) * t) * k];
  };
}

function barkColor(y0: number, y1: number, rng: Rng, top = BARK_LIGHT): ColorFn {
  const a = hexToRgb(BARK);
  const b = hexToRgb(top);
  return (_x, y) => {
    const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
    const j = 1 + (rng() - 0.5) * 0.1;
    return [(a[0] + (b[0] - a[0]) * t) * j, (a[1] + (b[1] - a[1]) * t) * j, (a[2] + (b[2] - a[2]) * t) * j];
  };
}

interface TrunkSpec {
  h: number;
  r: number;
  lean: [number, number];
  tess?: number;
}

/** Slightly bent tapered trunk with a flared root. Returns the top point too. */
function trunk(ctx: HeroCtx, spec: TrunkSpec, rng: Rng, top = BARK_LIGHT) {
  const { h, r, lean } = spec;
  const path = [v3(0, -0.05, 0), v3(lean[0] * 0.15, h * 0.3, lean[1] * 0.15), v3(lean[0] * 0.55, h * 0.65, lean[1] * 0.55), v3(lean[0], h, lean[1])];
  const m = tube(ctx, "olw_wood", path, (i) => (i === 0 ? r * 1.45 : i === 1 ? r : i === 2 ? r * 0.8 : r * 0.55), barkColor(0, h, rng, top), spec.tess ?? 7);
  return { mesh: m, top: path[3] };
}

function branch(ctx: HeroCtx, from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, r: number, rng: Rng) {
  const mid = v3((from.x + to.x) / 2, (from.y + to.y) / 2 + 0.05, (from.z + to.z) / 2);
  return tube(ctx, "olw_wood", [v3(from.x, from.y, from.z), mid, v3(to.x, to.y, to.z)], (i) => (i === 0 ? r : i === 1 ? r * 0.75 : r * 0.4), barkColor(from.y, to.y, rng), 5);
}

type Cluster = [number, number, number, number, number?]; // x, y, z, radius, yScale

function crown(ctx: HeroCtx, clusters: Cluster[], rng: Rng, noise = 0.075, subdiv = 2, dark = LEAF_DARK, light = LEAF_LIGHT) {
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [, y, , r, sy] of clusters) {
    y0 = Math.min(y0, y - r * (sy ?? 1));
    y1 = Math.max(y1, y + r * (sy ?? 1));
  }
  const col = crownColor(y0 + (y1 - y0) * 0.1, y1, rng, dark, light);
  return clusters.map(([x, y, z, r, sy]) => ico(ctx, "olw_foliage", r, col, x, y, z, { subdiv, noise, scale: [1, sy ?? 0.92, 1], rng }));
}

/** Round oak with a lean to +x and a fuller, taller crown. ~3.3 tall. */
export function buildTreeOakA(ctx: HeroCtx): Mesh {
  const rng = prng(11);
  const t = trunk(ctx, { h: 1.6, r: 0.19, lean: [0.18, 0.05] }, rng);
  const parts: Mesh[] = [t.mesh];
  parts.push(branch(ctx, { x: 0.05, y: 1.1, z: 0.02 }, { x: -0.55, y: 1.75, z: -0.1 }, 0.09, rng));
  parts.push(branch(ctx, { x: 0.12, y: 1.25, z: 0.03 }, { x: 0.6, y: 1.9, z: 0.35 }, 0.08, rng));
  parts.push(
    ...crown(
      ctx,
      [
        [0.2, 2.25, 0.0, 0.95],
        [0.85, 1.95, 0.25, 0.68],
        [-0.6, 2.05, -0.2, 0.72],
        [0.05, 2.9, -0.25, 0.66],
        [-0.2, 1.75, 0.6, 0.55],
        [0.55, 2.7, 0.45, 0.5],
      ],
      rng,
    ),
  );
  return merge("tree-oak-a", parts);
}

/** Broader, slightly squatter oak leaning to -x, with a low side cluster. ~3.0 tall. */
export function buildTreeOakB(ctx: HeroCtx): Mesh {
  const rng = prng(23);
  const t = trunk(ctx, { h: 1.45, r: 0.21, lean: [-0.15, -0.08] }, rng);
  const parts: Mesh[] = [t.mesh];
  parts.push(branch(ctx, { x: -0.05, y: 1.0, z: 0.0 }, { x: 0.7, y: 1.5, z: 0.2 }, 0.09, rng));
  parts.push(branch(ctx, { x: -0.1, y: 1.15, z: -0.03 }, { x: -0.75, y: 1.8, z: -0.3 }, 0.08, rng));
  parts.push(
    ...crown(
      ctx,
      [
        [-0.15, 2.05, 0.0, 0.9, 0.85],
        [0.8, 1.75, 0.1, 0.66, 0.88],
        [-0.85, 1.95, -0.3, 0.6],
        [0.15, 2.55, -0.35, 0.72, 0.9],
        [-0.35, 2.45, 0.5, 0.58],
        [0.5, 2.35, 0.55, 0.48],
      ],
      rng,
      0.085,
    ),
  );
  return merge("tree-oak-b", parts);
}

/** Young tree for gardens and squares. ~2.0 tall. */
export function buildTreeSmall(ctx: HeroCtx): Mesh {
  const rng = prng(37);
  const t = trunk(ctx, { h: 1.0, r: 0.11, lean: [0.08, -0.06], tess: 6 }, rng);
  const parts: Mesh[] = [t.mesh];
  parts.push(
    ...crown(
      ctx,
      [
        [0.08, 1.45, -0.02, 0.58],
        [0.42, 1.25, 0.15, 0.4],
        [-0.35, 1.35, -0.12, 0.42],
        [0.05, 1.9, 0.12, 0.38],
      ],
      rng,
      0.07,
    ),
  );
  return merge("tree-small", parts);
}

/** Storybook Scots pine: tall bare trunk with a warm upper bark, flat umbrella crown of tiered clusters. ~3.9 tall. */
export function buildTreePine(ctx: HeroCtx): Mesh {
  const rng = prng(41);
  const t = trunk(ctx, { h: 2.6, r: 0.17, lean: [0.14, -0.1], tess: 7 }, rng, "#b0704f");
  const parts: Mesh[] = [t.mesh];
  parts.push(branch(ctx, { x: 0.05, y: 1.9, z: 0 }, { x: -0.7, y: 2.45, z: 0.15 }, 0.08, rng));
  parts.push(branch(ctx, { x: 0.1, y: 2.15, z: -0.03 }, { x: 0.75, y: 2.75, z: -0.3 }, 0.07, rng));
  parts.push(
    ...crown(
      ctx,
      [
        [0.15, 2.85, 0.0, 1.05, 0.5],
        [-0.65, 2.6, 0.25, 0.62, 0.5],
        [0.8, 2.95, -0.35, 0.6, 0.48],
        [0.05, 3.3, 0.15, 0.72, 0.5],
        [-0.3, 3.55, -0.2, 0.5, 0.5],
      ],
      rng,
      0.09,
      2,
      "#3f5a3b",
      "#7d9a5c",
    ),
  );
  return merge("tree-pine", parts);
}

/** Round garden bush, a few clusters. ~0.9 tall. */
export function buildBushA(ctx: HeroCtx): Mesh {
  const rng = prng(53);
  const parts = crown(
    ctx,
    [
      [0, 0.42, 0, 0.5, 0.8],
      [0.38, 0.33, 0.12, 0.36, 0.8],
      [-0.33, 0.35, -0.14, 0.38, 0.8],
      [0.05, 0.36, -0.36, 0.33, 0.8],
      [-0.05, 0.62, 0.22, 0.3, 0.8],
    ],
    rng,
    0.07,
    2,
    "#4f6a3d",
    "#9fb56f",
  );
  return merge("bush-a", parts);
}

/** Flowering bush: sage clusters dotted with dusty pink / cream / lavender blooms. */
export function buildBushB(ctx: HeroCtx): Mesh {
  const rng = prng(67);
  const parts = crown(
    ctx,
    [
      [0, 0.4, 0, 0.48, 0.78],
      [0.36, 0.3, -0.1, 0.34, 0.8],
      [-0.3, 0.32, 0.18, 0.36, 0.8],
      [0.1, 0.34, 0.35, 0.3, 0.8],
      [-0.12, 0.6, -0.2, 0.3, 0.8],
    ],
    rng,
    0.07,
    2,
    "#5a7248",
    "#a6b878",
  );
  const blooms = [PALETTE.dustyRose, "#f6ead6", PALETTE.lavender, PALETTE.mutedYellow, PALETTE.dustyRose];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rng();
    const r = 0.22 + rng() * 0.28;
    const y = 0.48 + rng() * 0.35;
    parts.push(ico(ctx, "olw_paint", 0.06 + rng() * 0.025, blooms[i % blooms.length], Math.cos(a) * r, y, Math.sin(a) * r, { subdiv: 1, noise: 0.05, rng }));
  }
  return merge("bush-b", parts);
}
