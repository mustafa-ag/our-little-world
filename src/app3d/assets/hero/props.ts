// Street furniture and garden props for the storybook village. Each builder
// returns ONE merged mesh at the origin, base at y = 0, front facing -Z.
// Material slots: olw_wood / olw_stone are textured at runtime (vertex colour
// modulates), olw_paint / olw_metal / olw_foliage are flat × vertex colour.

import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PALETTE } from "../../rendering/materials";
import { type ColorFn, box, cyl, dot, hexToRgb, ico, jittered, leaf, loft, merge, prng, shade, sphere, torus, tube, v3 } from "./geo";
import type { HeroCtx } from "./slots";

const IRON = "#2e2c30";
const IRON_LIGHT = "#4a474d";
const WOOD_TINT = "#ffffff"; // texture carries the wood colour; tints lighten/darken it
const WOOD_DARK = "#b9a08a";
const CREAM = "#f4e9d2";
const INK = "#4a3a30";

/** Park bench: five wooden seat slats, two back slats, cast-iron scroll ends. 1.2 wide. */
export function buildBench(ctx: HeroCtx): Mesh {
  const rng = prng(101);
  const p: Mesh[] = [];
  const wood = jittered(WOOD_TINT, 0.12, rng);
  for (let i = 0; i < 5; i++) p.push(box(ctx, "olw_wood", 1.2, 0.045, 0.085, wood, 0, 0.44, -0.2 + i * 0.1, 1.5));
  for (let i = 0; i < 2; i++) {
    const b = box(ctx, "olw_wood", 1.2, 0.1, 0.04, wood, 0, 0.58 + i * 0.16, 0.22, 1.5);
    b.rotation.x = -0.18;
    b.position.z += i * 0.03;
    p.push(b);
  }
  for (const x of [-0.5, 0.5]) {
    p.push(box(ctx, "olw_metal", 0.05, 0.42, 0.48, IRON, x, 0, 0));
    p.push(box(ctx, "olw_metal", 0.05, 0.05, 0.5, IRON, x, 0.44, 0));
    const back = box(ctx, "olw_metal", 0.05, 0.5, 0.05, IRON, x, 0.42, 0.24);
    back.rotation.x = -0.18;
    p.push(back);
    // armrest scroll
    p.push(box(ctx, "olw_metal", 0.05, 0.05, 0.36, IRON, x, 0.68, 0.02));
    p.push(dot(ctx, "olw_metal", 0.08, IRON_LIGHT, x, 0.7, -0.16));
    // little feet
    p.push(box(ctx, "olw_metal", 0.09, 0.05, 0.14, IRON, x, 0, -0.2));
    p.push(box(ctx, "olw_metal", 0.09, 0.05, 0.14, IRON, x, 0, 0.2));
  }
  return merge("bench", p);
}

/** Victorian cast-iron lamp post with a warm lantern (olw_glass_emissive). 2.9 tall. */
export function buildLampPost(ctx: HeroCtx): Mesh {
  const p: Mesh[] = [];
  p.push(cyl(ctx, "olw_metal", 0.26, 0.34, 0.12, IRON, 0, 0, 0, 8));
  p.push(cyl(ctx, "olw_metal", 0.16, 0.24, 0.3, IRON, 0, 0.12, 0, 8));
  p.push(cyl(ctx, "olw_metal", 0.08, 0.12, 1.85, IRON, 0, 0.42, 0, 8));
  p.push(cyl(ctx, "olw_metal", 0.14, 0.1, 0.08, IRON_LIGHT, 0, 1.55, 0, 8)); // collar
  p.push(cyl(ctx, "olw_metal", 0.18, 0.09, 0.1, IRON, 0, 2.27, 0, 8)); // lantern base
  // ladder bar (the little cross arm)
  p.push(box(ctx, "olw_metal", 0.42, 0.035, 0.035, IRON, 0, 2.12, 0));
  // lantern
  const g = box(ctx, "olw_glass_emissive", 0.24, 0.34, 0.24, "#ffe6b0", 0, 2.37, 0);
  g.scaling.set(1, 1, 1);
  p.push(g);
  for (let i = 0; i < 4; i++) {
    const r = box(ctx, "olw_metal", 0.035, 0.36, 0.035, IRON, i % 2 ? 0.125 : -0.125, 2.36, i < 2 ? 0.125 : -0.125);
    p.push(r);
  }
  p.push(box(ctx, "olw_metal", 0.3, 0.03, 0.3, IRON, 0, 2.35, 0));
  p.push(cyl(ctx, "olw_metal", 0.05, 0.36, 0.14, IRON, 0, 2.72, 0, 4)); // pyramid cap
  p.push(cyl(ctx, "olw_metal", 0.02, 0.05, 0.08, IRON, 0, 2.86, 0, 5));
  p.push(dot(ctx, "olw_metal", 0.07, IRON_LIGHT, 0, 2.95, 0));
  return merge("lamp-post", p);
}

// ---------------------------------------------------------------- regional lamp / bench variants
// Procedural only (no GLB): kit/props.ts registers them with heroFactory, so the
// slots (olw_light_emissive glows at night) remap like the hero lamp's. Heights
// are normalised to LAMP_H at placement, so only the proportions matter here.

const STEEL = "#8090a0";
const STEEL_LIGHT = "#c0c8d0";
const BRASS = "#8a7040";
const BRASS_LIGHT = "#b09058";

/** Modern steel street lamp (UAE / Dubai): slim tapered pole, flat LED head cantilevered to the front. ~2.3 tall. */
export function buildLampModern(ctx: HeroCtx): Mesh {
  const p: Mesh[] = [];
  p.push(cyl(ctx, "olw_metal", 0.15, 0.17, 0.04, shade(STEEL, -0.2), 0, 0, 0, 12)); // base plate
  p.push(cyl(ctx, "olw_metal", 0.07, 0.09, 0.22, STEEL, 0, 0.04, 0, 12)); // foot sleeve
  p.push(cyl(ctx, "olw_metal", 0.045, 0.06, 2.0, STEEL, 0, 0.26, 0, 10)); // pole
  // short horizontal arm and the LED head, both toward the front (-Z)
  p.push(box(ctx, "olw_metal", 0.035, 0.035, 0.14, STEEL, 0, 2.23, -0.05));
  p.push(box(ctx, "olw_metal", 0.15, 0.06, 0.25, STEEL_LIGHT, 0, 2.2, -0.2));
  // the LED panel: a thin glowing strip set into the head's underside
  p.push(box(ctx, "olw_light_emissive", 0.12, 0.012, 0.21, "#fff8e8", 0, 2.192, -0.2));
  return merge("lamp-modern", p);
}

/** Ornate brass lamp (Italy / Greece): fluted plinth, a scrolled arm from ~70 % up carrying a glowing globe. ~2.2 tall. */
export function buildLampOrnate(ctx: HeroCtx): Mesh {
  const p: Mesh[] = [];
  p.push(cyl(ctx, "olw_metal", 0.22, 0.28, 0.1, shade(BRASS, -0.15), 0, 0, 0, 10));
  p.push(cyl(ctx, "olw_metal", 0.1, 0.18, 0.3, BRASS, 0, 0.1, 0, 10));
  p.push(cyl(ctx, "olw_metal", 0.14, 0.14, 0.04, BRASS_LIGHT, 0, 0.4, 0, 10)); // collar
  p.push(cyl(ctx, "olw_metal", 0.05, 0.07, 1.62, BRASS, 0, 0.44, 0, 8)); // pole to ~2.06
  p.push(cyl(ctx, "olw_metal", 0.1, 0.1, 0.035, BRASS_LIGHT, 0, 1.5, 0, 8)); // ring at the arm root
  // curving arm from ~70 % up, out to +X and gently up, ending in a hook
  const arm = [v3(0, 1.52, 0), v3(0.12, 1.66, 0), v3(0.26, 1.78, 0), v3(0.38, 1.82, 0), v3(0.44, 1.79, 0)];
  p.push(tube(ctx, "olw_metal", arm, (i) => 0.022 - i * 0.002, BRASS, 6));
  // decorative scroll under the arm (a small vertical ring)
  const scroll = torus(ctx, "olw_metal", 0.13, 0.016, BRASS_LIGHT, 0.13, 1.58, 0, 12);
  scroll.rotation.x = Math.PI / 2;
  p.push(scroll);
  // lantern: cap, glowing globe, drip finial
  p.push(cyl(ctx, "olw_metal", 0.04, 0.12, 0.05, BRASS, 0.44, 1.74, 0, 8));
  p.push(sphere(ctx, "olw_light_emissive", 0.24, "#fff3c0", 0.44, 1.62, 0, 12));
  p.push(dot(ctx, "olw_metal", 0.04, BRASS_LIGHT, 0.44, 1.49, 0));
  // pole finial
  p.push(cyl(ctx, "olw_metal", 0.02, 0.08, 0.06, BRASS, 0, 2.06, 0, 8));
  p.push(dot(ctx, "olw_metal", 0.07, BRASS_LIGHT, 0, 2.14, 0));
  return merge("lamp-ornate", p);
}

/** Minimal stone-coloured lamp (Amman / Jordan): square post, flat rectangular head, cool white glow. ~2.1 tall. */
export function buildLampMinimal(ctx: HeroCtx): Mesh {
  const p: Mesh[] = [];
  p.push(box(ctx, "olw_paint", 0.11, 0.08, 0.11, shade("#b0a888", -0.12), 0, 0, 0)); // footing
  p.push(box(ctx, "olw_paint", 0.05, 2.0, 0.05, "#b0a888", 0, 0.08, 0)); // post
  p.push(box(ctx, "olw_paint", 0.2, 0.04, 0.1, "#c8c0a0", 0, 2.08, 0)); // head
  p.push(box(ctx, "olw_light_emissive", 0.17, 0.01, 0.07, "#eef3ff", 0, 2.072, 0)); // cool lens
  return merge("lamp-minimal", p);
}

/** Solid stone bench (Scotland / UK): a slab seat on two block legs. 1.0 wide, 0.4 tall. */
export function buildBenchStone(ctx: HeroCtx): Mesh {
  const rng = prng(211);
  const p: Mesh[] = [];
  for (const x of [-0.36, 0.36]) p.push(box(ctx, "olw_paint", 0.12, 0.28, 0.38, jittered("#8a8070", 0.04, rng), x, 0, 0, 1.4));
  p.push(box(ctx, "olw_paint", 1.0, 0.12, 0.38, jittered("#9a9080", 0.03, rng), 0, 0.28, 0, 1.4));
  // softened front edge: a slightly lighter lip so the slab reads as dressed stone
  p.push(box(ctx, "olw_paint", 1.0, 0.02, 0.02, shade("#9a9080", 0.08), 0, 0.38, -0.185));
  return merge("bench-stone", p);
}

/** Modern bench (UAE / Dubai): two slim steel frames under three warm wooden slats. 1.2 wide. */
export function buildBenchModern(ctx: HeroCtx): Mesh {
  const p: Mesh[] = [];
  const frame = "#7080a0";
  for (const x of [-0.5, 0.5]) {
    // a flat "table-leg" frame: two uprights and a top rail
    p.push(box(ctx, "olw_metal", 0.04, 0.4, 0.04, frame, x, 0, -0.17));
    p.push(box(ctx, "olw_metal", 0.04, 0.4, 0.04, frame, x, 0, 0.17));
    p.push(box(ctx, "olw_metal", 0.04, 0.03, 0.4, frame, x, 0.4, 0));
  }
  p.push(box(ctx, "olw_metal", 1.04, 0.025, 0.03, frame, 0, 0.4, 0)); // stretcher under the slats
  for (let i = 0; i < 3; i++) p.push(box(ctx, "olw_paint", 1.2, 0.035, 0.12, i % 2 ? shade("#c8b880", -0.06) : "#c8b880", 0, 0.43, -0.135 + i * 0.135));
  return merge("bench-modern", p);
}

/** Wooden fingerpost with four painted arrow boards. 2.2 tall. */
export function buildSignpost(ctx: HeroCtx): Mesh {
  const rng = prng(131);
  const p: Mesh[] = [];
  p.push(cyl(ctx, "olw_wood", 0.11, 0.15, 2.05, jittered(WOOD_DARK, 0.1, rng), 0, 0, 0, 6));
  p.push(cyl(ctx, "olw_wood", 0.2, 0.14, 0.06, WOOD_DARK, 0, 2.05, 0, 6));
  p.push(sphere(ctx, "olw_paint", 0.14, PALETTE.terracottaMuted, 0, 2.15, 0, 3));
  // warm wooden arrow boards with cream lettering (reads as a fingerpost, not planks)
  const boards: [number, number, number, string][] = [
    [1.78, 1, 0, "#a88a6c"],
    [1.52, -1, 0.35, "#b39274"],
    [1.26, 1, -0.5, "#a08466"],
    [1.0, -1, 0.9, "#ad8d6e"],
  ];
  for (const [y, dir, yaw, col] of boards) {
    const b = box(ctx, "olw_wood", 0.66, 0.15, 0.045, jittered(col, 0.05, rng), dir * 0.33, y, 0, 2);
    const tip = box(ctx, "olw_wood", 0.107, 0.107, 0.045, col, dir * 0.66, y + 0.0215, 0, 2);
    tip.rotation.z = Math.PI / 4;
    tip.position.y = y + 0.075;
    // text as short cream strokes
    const l1 = box(ctx, "olw_paint", 0.32 + rng() * 0.08, 0.03, 0.012, CREAM, dir * 0.3, y + 0.085, -0.028);
    const l2 = box(ctx, "olw_paint", 0.2 + rng() * 0.08, 0.02, 0.012, CREAM, dir * 0.28, y + 0.045, -0.028);
    const l3 = box(ctx, "olw_paint", 0.32 + rng() * 0.08, 0.03, 0.012, CREAM, dir * 0.3, y + 0.085, 0.017);
    for (const m of [b, tip, l1, l2, l3]) {
      m.rotation.y += yaw;
      // rotate around the post the same way rotation.y turns the board
      // (Babylon, left-handed: x' = x cos + z sin, z' = -x sin + z cos), so
      // each board's butt stays on the post instead of drifting off it
      const px = m.position.x;
      const pz = m.position.z;
      m.position.x = px * Math.cos(yaw) + pz * Math.sin(yaw);
      m.position.z = -px * Math.sin(yaw) + pz * Math.cos(yaw);
      p.push(m);
    }
  }
  return merge("signpost", p);
}

/** Irregular dry-stone wall segment, 1 unit along X, ~0.55 tall, capstones on edge. Painted stones in warm greys. */
export function buildStoneWall(ctx: HeroCtx): Mesh {
  const rng = prng(151);
  const p: Mesh[] = [];
  // warm cream / sandstone blocks in three uneven courses under a flat coping,
  // like the reference's garden walls: few, chunky, softly varied stones read
  // as hand-built; many thin courses read as brickwork
  const tones = ["#d9cbad", "#cfc0a2", "#e1d4b8", "#c6b797", "#d4c6a6", "#bfb192", "#dccfb3"];
  const stone = () => jittered(tones[Math.floor(rng() * tones.length)], 0.04, rng);
  // core (keeps gaps closed, reads as soft shadowed mortar)
  p.push(box(ctx, "olw_paint", 1.0, 0.4, 0.25, "#9d917c", 0, 0.0, 0, 1.4));
  const courses = [
    [0.0, 0.15],
    [0.145, 0.13],
    [0.265, 0.12],
  ];
  let ci = 0;
  for (const [y, h] of courses) {
    let x = -0.5 + (ci % 2 ? 0.08 : 0) * rng();
    if (ci % 2) {
      // stagger joints: a half stone at the start of odd courses
      const w = 0.1 + rng() * 0.06;
      p.push(box(ctx, "olw_paint", w, h * 0.96, 0.29, stone(), -0.5 + w / 2, y, 0, 1.4));
      x = -0.5 + w + 0.012;
    }
    while (x < 0.49) {
      const w = Math.min(0.2 + rng() * 0.16, 0.5 - x);
      if (w < 0.05) break;
      const d = 0.28 + rng() * 0.04;
      const b = box(ctx, "olw_paint", w, h * (0.92 + rng() * 0.1), d, stone(), x + w / 2, y, (rng() - 0.5) * 0.02, 1.4);
      b.rotation.y = (rng() - 0.5) * 0.04;
      b.rotation.z = (rng() - 0.5) * 0.05;
      p.push(b);
      x += w + 0.014;
    }
    ci++;
  }
  // flat coping slabs with a small overhang, a shade lighter than the wall
  let x = -0.5;
  while (x < 0.49) {
    const w = Math.min(0.24 + rng() * 0.12, 0.5 - x);
    if (w < 0.05) break;
    const c = box(ctx, "olw_paint", w, 0.075, 0.34, jittered("#e3d7bd", 0.04, rng), x + w / 2, 0.385, 0, 1.4);
    c.rotation.z = (rng() - 0.5) * 0.05;
    p.push(c);
    x += w + 0.012;
  }
  return merge("stone-wall", p);
}

function picket(ctx: HeroCtx, x: number, h: number, wood: ColorFn, z = 0.03) {
  const b = box(ctx, "olw_wood", 0.085, h, 0.03, wood, x, 0.05, z, 2);
  const tip = cyl(ctx, "olw_wood", 0, 0.12, 0.07, wood, x, 0.05 + h, z, 4);
  tip.rotation.y = Math.PI / 4;
  return [b, tip];
}

/** Painted picket fence, 1 unit along X. */
export function buildFence(ctx: HeroCtx): Mesh {
  const rng = prng(171);
  const wood = jittered("#f0e8d8", 0.1, rng);
  const p: Mesh[] = [];
  for (const x of [-0.5, 0.5]) {
    p.push(box(ctx, "olw_wood", 0.09, 0.7, 0.09, jittered(WOOD_DARK, 0.1, rng), x, 0, 0, 2));
    p.push(cyl(ctx, "olw_wood", 0, 0.13, 0.08, WOOD_DARK, x, 0.7, 0, 4));
  }
  p.push(box(ctx, "olw_wood", 1.0, 0.05, 0.035, wood, 0, 0.46, 0, 2));
  p.push(box(ctx, "olw_wood", 1.0, 0.05, 0.035, wood, 0, 0.18, 0, 2));
  for (let i = 0; i < 5; i++) p.push(...picket(ctx, -0.4 + i * 0.2, 0.5 + (rng() - 0.5) * 0.05, wood));
  return merge("fence", p);
}

/** Garden gate: arched picket top, diagonal brace, iron hinges. 1 unit along X. */
export function buildFenceGate(ctx: HeroCtx): Mesh {
  const rng = prng(181);
  const wood = jittered("#efe6d3", 0.1, rng);
  const p: Mesh[] = [];
  for (const x of [-0.5, 0.5]) {
    p.push(box(ctx, "olw_wood", 0.1, 0.85, 0.1, jittered(WOOD_DARK, 0.1, rng), x, 0, 0, 2));
    p.push(sphere(ctx, "olw_wood", 0.14, WOOD_DARK, x, 0.88, 0, 3));
  }
  const heights = [0.5, 0.58, 0.64, 0.68, 0.64, 0.58, 0.5];
  for (let i = 0; i < 7; i++) p.push(...picket(ctx, -0.36 + i * 0.12, heights[i], wood));
  p.push(box(ctx, "olw_wood", 0.82, 0.05, 0.035, wood, 0, 0.14, 0.05, 2));
  p.push(box(ctx, "olw_wood", 0.82, 0.05, 0.035, wood, 0, 0.42, 0.05, 2));
  const brace = box(ctx, "olw_wood", 0.85, 0.05, 0.03, wood, 0, 0.28, 0.06, 2);
  brace.rotation.z = 0.37;
  p.push(brace);
  p.push(box(ctx, "olw_metal", 0.16, 0.04, 0.05, IRON, -0.36, 0.44, 0.06));
  p.push(box(ctx, "olw_metal", 0.16, 0.04, 0.05, IRON, -0.36, 0.16, 0.06));
  p.push(box(ctx, "olw_metal", 0.06, 0.06, 0.05, IRON, 0.36, 0.3, 0.06)); // latch
  return merge("fence-gate", p);
}

const BLOOMS = [PALETTE.dustyRose, "#f6ead6", PALETTE.mutedYellow, PALETTE.lavender, "#e9a3a3"];

function flowers(ctx: HeroCtx, n: number, cx: number, cy: number, cz: number, rx: number, rz: number, rng: ReturnType<typeof prng>, out: Mesh[]) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.8;
    const x = cx + Math.cos(a) * rx * (0.4 + rng() * 0.6);
    const z = cz + Math.sin(a) * rz * (0.4 + rng() * 0.6);
    const h = cy + 0.08 + rng() * 0.12;
    out.push(cyl(ctx, "olw_foliage", 0.02, 0.02, h - cy + 0.02, "#5f7f4a", x, cy - 0.02, z, 4));
    out.push(ico(ctx, "olw_paint", 0.055 + rng() * 0.02, BLOOMS[i % BLOOMS.length], x, h + 0.03, z, { subdiv: 1, noise: 0.08, rng }));
    const lf = leaf(ctx, "olw_foliage", 0.07, 0.12, "#6f8a4c", x + 0.03, cy, z);
    lf.rotation.y = rng() * Math.PI * 2;
    lf.rotation.x = -0.6;
    out.push(lf);
  }
}

/** Wooden flower box with corner posts, soil and a cheerful cluster of blooms. 0.8 × 0.45. */
export function buildPlanter(ctx: HeroCtx): Mesh {
  const rng = prng(191);
  const p: Mesh[] = [];
  const wood = jittered(WOOD_TINT, 0.12, rng);
  p.push(box(ctx, "olw_wood", 0.76, 0.34, 0.42, wood, 0, 0.03, 0, 2));
  for (const [x, z] of [
    [-0.37, -0.2],
    [0.37, -0.2],
    [-0.37, 0.2],
    [0.37, 0.2],
  ])
    p.push(box(ctx, "olw_wood", 0.08, 0.42, 0.08, jittered(WOOD_DARK, 0.1, rng), x, 0, z, 2));
  p.push(box(ctx, "olw_wood", 0.8, 0.035, 0.46, WOOD_DARK, 0, 0.35, 0, 2)); // rim
  p.push(box(ctx, "olw_paint", 0.7, 0.03, 0.36, "#4a3a2e", 0, 0.36, 0)); // soil
  // leafy mass
  p.push(ico(ctx, "olw_foliage", 0.26, "#6b8a4e", -0.14, 0.44, 0, { subdiv: 2, noise: 0.2, scale: [1.2, 0.6, 1], rng }));
  p.push(ico(ctx, "olw_foliage", 0.22, "#7a9a56", 0.17, 0.44, 0.04, { subdiv: 2, noise: 0.2, scale: [1.2, 0.6, 1], rng }));
  flowers(ctx, 8, 0, 0.5, 0, 0.3, 0.15, rng, p);
  return merge("planter", p);
}

/** Scottish pillar box in a muted red. 1.15 tall. */
export function buildPostBox(ctx: HeroCtx): Mesh {
  const rng = prng(211);
  const red = jittered("#b0413e", 0.06, rng);
  const p: Mesh[] = [];
  p.push(cyl(ctx, "olw_metal", 0.42, 0.44, 0.08, IRON, 0, 0, 0, 12));
  p.push(cyl(ctx, "olw_paint", 0.36, 0.36, 0.9, red, 0, 0.08, 0, 12));
  p.push(cyl(ctx, "olw_paint", 0.42, 0.42, 0.05, red, 0, 0.98, 0, 12)); // cap lip
  const dome = sphere(ctx, "olw_paint", 0.42, red, 0, 1.03, 0, 5);
  dome.scaling.y = 0.55;
  p.push(dome);
  p.push(dot(ctx, "olw_metal", 0.07, IRON, 0, 1.15, 0));
  p.push(box(ctx, "olw_metal", 0.2, 0.035, 0.06, IRON, 0, 0.74, -0.19)); // slot
  p.push(box(ctx, "olw_paint", 0.22, 0.05, 0.03, "#8f302e", 0, 0.7, -0.18)); // slot lip shadow
  p.push(box(ctx, "olw_paint", 0.22, 0.2, 0.015, CREAM, 0, 0.4, -0.185)); // collection plate
  p.push(box(ctx, "olw_paint", 0.14, 0.02, 0.012, INK, 0, 0.53, -0.19));
  p.push(box(ctx, "olw_paint", 0.1, 0.02, 0.012, INK, 0, 0.48, -0.19));
  p.push(box(ctx, "olw_metal", 0.28, 0.02, 0.02, IRON, 0, 0.22, -0.18)); // door seam
  return merge("post-box", p);
}

/** Round café table with an iron pedestal and a cup. */
export function buildCafeTable(ctx: HeroCtx): Mesh {
  const rng = prng(221);
  const p: Mesh[] = [];
  p.push(cyl(ctx, "olw_metal", 0.42, 0.5, 0.04, IRON, 0, 0, 0, 12));
  p.push(cyl(ctx, "olw_metal", 0.06, 0.09, 0.66, IRON, 0, 0.04, 0, 6));
  p.push(cyl(ctx, "olw_metal", 0.16, 0.06, 0.05, IRON, 0, 0.66, 0, 8));
  p.push(cyl(ctx, "olw_wood", 0.8, 0.8, 0.05, jittered(WOOD_TINT, 0.1, rng), 0, 0.7, 0, 14));
  p.push(torus(ctx, "olw_wood", 0.8, 0.035, WOOD_DARK, 0, 0.745, 0, 12));
  // cup and saucer
  p.push(cyl(ctx, "olw_paint", 0.16, 0.16, 0.012, CREAM, 0.18, 0.75, -0.08, 10));
  p.push(cyl(ctx, "olw_paint", 0.1, 0.075, 0.09, CREAM, 0.18, 0.76, -0.08, 10));
  p.push(torus(ctx, "olw_paint", 0.07, 0.02, CREAM, 0.25, 0.81, -0.08, 5));
  p.push(cyl(ctx, "olw_paint", 0.08, 0.08, 0.01, "#6a4a36", 0.18, 0.845, -0.08, 8));
  return merge("cafe-table", p);
}

/** Bistro chair: wooden seat, slim iron legs, hooped back. */
export function buildCafeChair(ctx: HeroCtx): Mesh {
  const rng = prng(231);
  const p: Mesh[] = [];
  p.push(cyl(ctx, "olw_wood", 0.42, 0.42, 0.04, jittered(WOOD_TINT, 0.1, rng), 0, 0.44, 0, 10));
  for (const [x, z] of [
    [-0.15, -0.15],
    [0.15, -0.15],
    [-0.15, 0.15],
    [0.15, 0.15],
  ]) {
    const l = cyl(ctx, "olw_metal", 0.025, 0.03, 0.45, IRON, x, 0, z, 5);
    l.rotation.z = -x * 0.35;
    l.rotation.x = z * 0.35;
    p.push(l);
  }
  p.push(torus(ctx, "olw_metal", 0.3, 0.02, IRON, 0, 0.3, 0, 6));
  // hoop back
  const arc = [];
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * (i / 8);
    arc.push(v3(Math.cos(a) * 0.17, 0.46 + Math.sin(a) * 0.4, 0.18));
  }
  p.push(tube(ctx, "olw_metal", arc, () => 0.018, IRON, 5));
  p.push(box(ctx, "olw_wood", 0.3, 0.07, 0.03, WOOD_DARK, 0, 0.66, 0.18, 2));
  return merge("cafe-chair", p);
}

/** Small flat ivy strip for wall corners: a stem with a dozen leaves. 0.8 wide × 1.3 tall, in the XY plane. */
export function buildIvyCard(ctx: HeroCtx): Mesh {
  const rng = prng(241);
  const p: Mesh[] = [];
  const stem = [v3(-0.05, 0, 0.02), v3(0.12, 0.35, 0.03), v3(-0.08, 0.75, 0.03), v3(0.1, 1.15, 0.03)];
  p.push(tube(ctx, "olw_foliage", stem, (i) => 0.02 - i * 0.004, "#5a6f3d", 4));
  const greens = ["#4f6a3d", "#6b8a4e", "#7fa05a", "#5f7f4a", "#8aa862"];
  for (let i = 0; i < 16; i++) {
    const t = i / 16;
    const y = 0.02 + t * 1.2;
    const x = (i % 2 ? 1 : -1) * (0.12 + rng() * 0.22) + Math.sin(t * 6) * 0.05;
    const l = leaf(ctx, "olw_foliage", 0.16 + rng() * 0.08, 0.2 + rng() * 0.08, greens[i % greens.length], x, y, 0.03 + rng() * 0.03);
    l.rotation.z = (rng() - 0.5) * 1.4 + (i % 2 ? -0.6 : 0.6);
    l.rotation.x = (rng() - 0.5) * 0.6;
    p.push(l);
  }
  return merge("ivy-card", p);
}

/** Oak barrel with iron hoops. 0.75 tall. */
export function buildBarrel(ctx: HeroCtx): Mesh {
  const rng = prng(251);
  const p: Mesh[] = [];
  const prof = [0.25, 0.29, 0.31, 0.29, 0.25];
  const sections = prof.map((r, i) => {
    const y = (i / (prof.length - 1)) * 0.75;
    const ring = [];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      ring.push(v3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    return ring;
  });
  const stave: ColorFn = (x, _y, z) => {
    const k = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 12);
    const j = 0.85 + ((k * 7919) % 13) / 13 * 0.3;
    const c = hexToRgb(WOOD_TINT);
    return [c[0] * j, c[1] * j, c[2] * j];
  };
  const body = loft(ctx, "olw_wood", sections, stave);
  p.push(body);
  p.push(cyl(ctx, "olw_wood", 0.5, 0.5, 0.03, WOOD_DARK, 0, 0.735, 0, 12));
  p.push(cyl(ctx, "olw_wood", 0.5, 0.5, 0.03, WOOD_DARK, 0, 0.0, 0, 12));
  for (const y of [0.14, 0.6]) p.push(torus(ctx, "olw_metal", 0.6, 0.035, IRON, 0, y, 0, 12));
  void rng;
  return merge("barrel", p);
}

/** Wooden crate with edge slats. 0.6 cube-ish. */
export function buildCrate(ctx: HeroCtx): Mesh {
  const rng = prng(261);
  const p: Mesh[] = [];
  p.push(box(ctx, "olw_wood", 0.56, 0.46, 0.56, jittered("#e8dcc8", 0.1, rng), 0, 0.02, 0, 2));
  const dark = jittered(WOOD_DARK, 0.08, rng);
  for (const [x, z] of [
    [-0.28, -0.28],
    [0.28, -0.28],
    [-0.28, 0.28],
    [0.28, 0.28],
  ])
    p.push(box(ctx, "olw_wood", 0.06, 0.5, 0.06, dark, x, 0, z, 2));
  for (const y of [0.0, 0.44]) {
    p.push(box(ctx, "olw_wood", 0.6, 0.06, 0.06, dark, 0, y, -0.28, 2));
    p.push(box(ctx, "olw_wood", 0.6, 0.06, 0.06, dark, 0, y, 0.28, 2));
    p.push(box(ctx, "olw_wood", 0.06, 0.06, 0.6, dark, -0.28, y, 0, 2));
    p.push(box(ctx, "olw_wood", 0.06, 0.06, 0.6, dark, 0.28, y, 0, 2));
  }
  const brace = box(ctx, "olw_wood", 0.62, 0.06, 0.03, dark, 0, 0.22, -0.29, 2);
  brace.rotation.z = 0.68;
  p.push(brace);
  return merge("crate", p);
}
