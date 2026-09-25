// Foliage: the storybook trees, bushes and ivy are hero assets (GLB with a
// procedural fallback, see assets/hero/trees.ts); the little ground clutter
// (flower clusters, heather, grass tufts) stays procedural. Colour variation
// for trees/bushes comes from the `c=#hex` variant (vertex-colour retint).

import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AssetManager, KitContext } from "../AssetManager";
import { PALETTE } from "../../rendering/materials";
import { blob, box, merge, parseVariant, sphere, tintVertices } from "./util";
import { shade } from "./architecture/geom";

// Ground clutter is vertex-coloured on ONE shared white material, so each
// variant batch is a single draw call (per-part materials interleave into
// dozens of submeshes once merged).

const LEAF_TONES = ["#6f8a4c", "#7f9a58", "#5f7a45", "#88a260"];

function painted<T extends Mesh>(m: T, hex: string): T {
  tintVertices(m, hex);
  return m;
}

/** A low cluster of small flowers on a leafy cushion. Variant c = petal colour. */
function flowerCluster(k: KitContext, variant: string): Mesh {
  const v = parseVariant(variant);
  const s = k.scene;
  const white = k.mats.flat("#ffffff");
  const petal = v.c ?? PALETTE.dustyRose;
  const parts: Mesh[] = [];
  parts.push(painted(blob(s, 0.44, white, 0, 0.04, 0, 0.36, 4), LEAF_TONES[0]));
  parts.push(painted(blob(s, 0.3, white, 0.12, 0.05, 0.08, 0.45, 4), LEAF_TONES[1]));
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 * 1.7 + 0.4;
    const r = i === 0 ? 0 : 0.07 + ((i * 7) % 5) * 0.03;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = 0.1 + ((i * 3) % 4) * 0.03;
    parts.push(painted(sphere(s, 0.07 + (i % 3) * 0.012, white, x, h, z, 3), i % 4 === 3 ? shade(petal, 0.12) : petal));
  }
  return merge("flower-cluster", parts);
}

/**
 * A dense, elongated flower bed (~1 unit long) for wall bases and façades:
 * a lumpy leaf mound dotted with two petal colours and a few cream heads.
 * Variant c / d = the two petal colours.
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
  const n = 24;
  for (let i = 0; i < n; i++) {
    const x = -0.47 + (i / (n - 1)) * 0.94 + (((i * 37) % 7) / 7 - 0.5) * 0.08;
    const z = (((i * 53) % 9) / 9 - 0.5) * 0.28;
    const y = 0.14 + ((i * 11) % 5) * 0.022 - Math.abs(x) * 0.08;
    const col = i % 6 === 2 ? "#f4ecdc" : i % 2 ? c1 : c2;
    parts.push(painted(sphere(s, 0.075 + (i % 3) * 0.014, white, x, y, z, 3), col));
  }
  return merge("flower-bed", parts);
}

/** Heather: low purple-grey cushions. */
function heather(k: KitContext): Mesh {
  const s = k.scene;
  const white = k.mats.flat("#ffffff");
  const parts: Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = Math.cos(a) * 0.2;
    const z = Math.sin(a) * 0.2;
    parts.push(painted(blob(s, 0.3, white, x, 0.08, z, 0.55, 4), "#6e7d5a"));
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(painted(blob(s, 0.2, white, Math.cos(a) * 0.2, 0.2, Math.sin(a) * 0.2, 0.7, 4), i % 2 ? PALETTE.heather : shade(PALETTE.heather, -0.08)));
  }
  parts.push(painted(blob(s, 0.22, white, 0, 0.24, 0, 0.7, 4), PALETTE.heather));
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

export function registerFoliage(am: AssetManager) {
  // hero pieces (GLB + fallback); `c=#hex` variants retint the foliage slot
  am.registerHero("tree-oak-a");
  am.registerHero("tree-oak-b");
  am.registerHero("tree-small");
  am.registerHero("tree-pine");
  am.registerHero("bush-a");
  am.registerHero("bush-b");
  am.registerHero("ivy-card");
  // legacy keys used by dressing/propMap
  am.registerAlias("tree-a", "tree-oak-a");
  am.registerAlias("tree-b", "tree-pine");
  am.registerAlias("bush", (v) => (v.includes("flowers=1") ? "bush-b" : "bush-a"));
  // ground clutter stays procedural
  am.register("flower-cluster", flowerCluster, { shadow: false });
  am.register("heather", heather, { shadow: false });
  am.register("grass-tuft", grassTuft, { shadow: false });
  am.register("flower-bed", flowerBed, { shadow: false });
}
