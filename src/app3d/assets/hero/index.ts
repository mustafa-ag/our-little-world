// The hero asset table: one entry per reusable GLB, with its code-authored
// builder (used by scripts/build-hero-assets.mjs to export the GLB and by
// AssetManager as the procedural fallback) and how AssetManager should treat
// it. Track C references these keys through AssetManager (thinInstances /
// instantiate); 'cottage-1s', 'cottage-2s' and 'cafe' have no builder here:
// game3d.ts registers Track C's buildCottageHero / buildCafeHero for them.
//
// Blender-authored GLBs (tools/blender/, `npm run assets:blender`) use the same
// table: the GLB at `url` wins, `build` is only the procedural fallback. Keys
// listed in tools/blender/manifest.json are never re-exported by
// scripts/build-hero-assets.mjs. A key may have no `build` here and get its
// fallback at registration time instead (`am.registerHero(key, fallback)`,
// e.g. the flower clusters from kit/foliage.ts); with neither, a missing GLB
// just leaves the key without a prototype (AssetManager logs and moves on).

import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { HeroCtx } from "./slots";
import { buildBushA, buildBushB, buildTreeOakA, buildTreeOakB, buildTreePine, buildTreeSmall, retintFoliage } from "./trees";
import { buildBarrel, buildBench, buildCafeChair, buildCafeTable, buildCrate, buildFence, buildFenceGate, buildIvyCard, buildLampPost, buildPlanter, buildPostBox, buildSignpost, buildStoneWall } from "./props";
import { buildCar, retintCar } from "./car";
import { buildCharacter } from "./character";
import { buildCafeHero, buildCottageHero } from "../kit/architecture";

export type HeroBuild = (ctx: HeroCtx) => Mesh | TransformNode;

export interface HeroEntry {
  /** GLB path relative to the site base (public/assets/models/<key>.glb). */
  url: string;
  /** Pure-geometry builder; absent for Track C's architecture heroes (registered from game3d). */
  build?: HeroBuild;
  /** Casts shadows (default true). */
  shadow?: boolean;
  /** Merge into one prototype mesh (default true); false keeps the node hierarchy (player). */
  merge?: boolean;
  /** Applies a variant string ("c=#hex", …) to a fresh prototype clone. */
  variant?: (mesh: Mesh, variant: string) => void;
  /** Where the shipped GLB comes from: "blender" (tools/blender) or "code" (default, build-hero-assets). */
  source?: "blender" | "code";
  /** Footprint in tiles (x width, z depth) for placement code; buildings only. */
  footprint?: [number, number];
  /** Door centre relative to the origin, in world units ({x, z}; front faces -Z); buildings only. */
  door?: { x: number; z: number };
  /**
   * false = export-only: `npm run assets:build` skips it unless asked by name,
   * the game never fetches it (runtime buildings come from the procedural
   * architecture kit; these GLBs exist for external tools / previews).
   */
  preload?: boolean;
}

const glb = (key: string) => `assets/models/${key}.glb`;

const hexOf = (v: string) => /(?:^|,)c=(#[0-9a-fA-F]{6})/.exec(v)?.[1];
const foliageVariant = (m: Mesh, v: string) => {
  const c = hexOf(v);
  if (c) retintFoliage(m, c);
};
const carVariant = (m: Mesh, v: string) => {
  const c = hexOf(v);
  if (c) retintCar(m, c);
};

export const HERO_ASSETS = {
  player: { url: glb("player"), build: (ctx: HeroCtx) => buildCharacter(ctx, { name: "player", hair: "long", skirt: true, scarf: true }).root, merge: false },
  "tree-oak-a": { url: glb("tree-oak-a"), build: buildTreeOakA, variant: foliageVariant },
  "tree-oak-b": { url: glb("tree-oak-b"), build: buildTreeOakB, variant: foliageVariant },
  "tree-small": { url: glb("tree-small"), build: buildTreeSmall, variant: foliageVariant },
  "tree-pine": { url: glb("tree-pine"), build: buildTreePine, variant: foliageVariant },
  "bush-a": { url: glb("bush-a"), build: buildBushA, shadow: false, variant: foliageVariant },
  "bush-b": { url: glb("bush-b"), build: buildBushB, shadow: false, variant: foliageVariant },
  bench: { url: glb("bench"), build: buildBench, source: "blender" },
  "lamp-post": { url: glb("lamp-post"), build: buildLampPost, source: "blender" },
  signpost: { url: glb("signpost"), build: buildSignpost, source: "blender" },
  "stone-wall": { url: glb("stone-wall"), build: buildStoneWall, source: "blender" },
  fence: { url: glb("fence"), build: buildFence, source: "blender", shadow: false },
  "fence-gate": { url: glb("fence-gate"), build: buildFenceGate, source: "blender", shadow: false },
  planter: { url: glb("planter"), build: buildPlanter, source: "blender", shadow: false },
  car: { url: glb("car"), build: buildCar, variant: carVariant },
  "post-box": { url: glb("post-box"), build: buildPostBox, source: "blender" },
  "cafe-table": { url: glb("cafe-table"), build: buildCafeTable, source: "blender", shadow: false },
  "cafe-chair": { url: glb("cafe-chair"), build: buildCafeChair, source: "blender", shadow: false },
  "ivy-card": { url: glb("ivy-card"), build: buildIvyCard, shadow: false },
  barrel: { url: glb("barrel"), build: buildBarrel, source: "blender" },
  crate: { url: glb("crate"), build: buildCrate, source: "blender" },
  "cottage-1s": { url: glb("cottage-1s"), preload: false },
  "cottage-2s": { url: glb("cottage-2s"), preload: false },
  cafe: { url: glb("cafe"), preload: false },
  // Blender heroes (tools/blender/assets/architecture). Fallback = the nearest
  // procedural kit preset (smaller footprint) so the key always renders.
  "cottage-hero-a": { url: glb("cottage-hero-a"), build: (ctx: HeroCtx) => buildCottageHero(ctx.scene, "1s"), source: "blender", footprint: [4, 3], door: { x: 0.3, z: -1.3 } },
  "cottage-hero-b": { url: glb("cottage-hero-b"), build: (ctx: HeroCtx) => buildCottageHero(ctx.scene, "2s"), source: "blender", footprint: [5, 3], door: { x: -0.6, z: -1.42 } },
  "cafe-hero": { url: glb("cafe-hero"), build: (ctx: HeroCtx) => buildCafeHero(ctx.scene), source: "blender", footprint: [5, 3], door: { x: 1.3, z: -1.4 } },
  // Blender flower clusters (E2, tools/blender/assets/nature); fallback registered by kit/foliage.ts
  "flower-cluster-a": { url: glb("flower-cluster-a"), shadow: false, source: "blender" },
  "flower-cluster-b": { url: glb("flower-cluster-b"), shadow: false, source: "blender" },
  "flower-cluster-c": { url: glb("flower-cluster-c"), shadow: false, source: "blender" },
} satisfies Record<string, HeroEntry>;

export type HeroKey = keyof typeof HERO_ASSETS;
export const HERO_KEYS = Object.keys(HERO_ASSETS) as HeroKey[];
/** Keys the game fetches at boot (everything except the export-only architecture heroes). */
export const HERO_PRELOAD_KEYS = HERO_KEYS.filter((k) => (HERO_ASSETS[k] as HeroEntry).preload !== false);

/** Legacy kit keys still used by dressing/propMap, mapped onto hero keys. */
export const HERO_ALIASES: Record<string, HeroKey> = {
  "tree-a": "tree-oak-a",
  "tree-b": "tree-pine",
  bush: "bush-a",
  "wooden-fence": "fence",
};
