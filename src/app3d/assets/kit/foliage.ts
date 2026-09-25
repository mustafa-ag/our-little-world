// Foliage: the storybook trees, bushes and ivy are hero assets (GLB with a
// procedural fallback, see assets/hero/trees.ts); the little ground clutter
// (flower clusters, heather, grass tufts) stays procedural. Colour variation
// for trees/bushes comes from the `c=#hex` variant (vertex-colour retint).

import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AssetManager, KitContext } from "../AssetManager";
import { PALETTE } from "../../rendering/materials";
import { blob, box, cyl, merge, parseVariant, sphere } from "./util";

/** A little cluster of 5-7 flowers with leaves. Variant c = petal colour. */
function flowerCluster(k: KitContext, variant: string): Mesh {
  const v = parseVariant(variant);
  const s = k.scene;
  const petal = k.mats.flat(v.c ?? PALETTE.dustyRose);
  const leaf = k.mats.flat(PALETTE.moss);
  const stem = k.mats.flat("#5f7f4a");
  const parts: Mesh[] = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.4;
    const r = i === 0 ? 0 : 0.18 + (i % 2) * 0.08;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = 0.22 + (i % 3) * 0.06;
    parts.push(cyl(s, 0.025, 0.025, h, stem, x, 0, z, 4));
    parts.push(sphere(s, 0.13 + (i % 2) * 0.03, petal, x, h + 0.04, z, 3));
    parts.push(sphere(s, 0.05, k.mats.flat(PALETTE.mutedYellow), x, h + 0.09, z, 2));
  }
  parts.push(blob(s, 0.5, leaf, 0, 0.05, 0, 0.35, 4));
  return merge("flower-cluster", parts);
}

/** Low purple heather patch (Scottish touch). */
function heather(k: KitContext): Mesh {
  const s = k.scene;
  const leaf = k.mats.flat("#6e7d5a");
  const bloom = k.mats.flat(PALETTE.heather);
  const parts: Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const x = Math.cos(a) * 0.3;
    const z = Math.sin(a) * 0.3;
    parts.push(blob(s, 0.42, leaf, x, 0.12, z, 0.6, 4));
    parts.push(blob(s, 0.3, bloom, x, 0.3, z, 0.7, 4));
  }
  return merge("heather", parts);
}

/** Small grass tuft for the meadow edges. */
function grassTuft(k: KitContext): Mesh {
  const s = k.scene;
  const g = k.mats.flat(PALETTE.grassLight);
  const parts: Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const b = box(s, 0.05, 0.25 + i * 0.05, 0.05, g, -0.08 + i * 0.08, 0, 0);
    b.rotation.z = (i - 1) * 0.25;
    parts.push(b);
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
}
